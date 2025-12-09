var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
require('../models/users');
require('../models/visbogroup');
require('../models/visbocenter');
require('../models/vcsetting');

var User = mongoose.model('User');
var VisboGroup = mongoose.model('VisboGroup');
var VisboCenter = mongoose.model('VisboCenter');
var VCSetting = mongoose.model('VCSetting');

const fs = require('fs');
var logging = require('./logging');
var logModule = 'VC';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var errorHandler = require('./../components/errorhandler').handler;

var visboRedis = require('./../components/visboRedis');
var crypt = require('./../components/encrypt');
var path = require('path');

var vcSystem = undefined;
var vcSystemSetting = undefined;
var lastUpdatedAt = new Date('2000-01-01');
var redisClient = null;
// var predictConfigured = undefined;
// var fsModell = undefined;

// Verify/Create VISBO Center with an initial user
/* The createSystemVC function is responsible for initializing the System VISBO Center (VC) if it does not already exist. 
It creates a default system VC, a default user, and a SysAdmin group with administrative permissions.
 */
var createSystemVC = async function (body, launchServer) {
	logger4js.debug('Create System VISBO Center if not existent');
	if (!body && !body.users) {
		logger4js.warn('No Body or no users System VISBO Center %s', body);
		return undefined;
	}
	
	// Initialize Redis client (async in v4)
	redisClient = await visboRedis.VisboRedisInit();
	
	var nameSystemVC = 'Visbo-System';
	var query = {system: true};
	
	try {
		var vc = await VisboCenter.findOne(query);
		
		if (vc) {
			logger4js.debug('System VISBO Center already exists');
			vcSystem = vc;
			await redisClient.set('vcSystem', vcSystem._id.toString());
			crypt.initIV(vcSystem._id.toString());
			await initSystemSettings(launchServer);
			return vc;
		}
		
		// System VC does not exist create systemVC, default user, default sysadmin group
		logger4js.warn('No System VISBO Center, Create a new one');
		var newVC = new VisboCenter();
		newVC.name = nameSystemVC;
		newVC.system = true;
		newVC.vpCount = 0;
		
		vc = await newVC.save();
		vcSystem = vc;
		await redisClient.set('vcSystem', vcSystem._id.toString());
		crypt.initIV(vcSystem._id.toString());
		
		// Initialize system settings and launch server even if creating the default group fails
		await initSystemSettings(launchServer);

		// Create default user and group (non-blocking, errors logged but don't stop server)
		try {
			var newUser = new User();
			newUser.email = body.users[0].email;
			var user = await newUser.save();
			
			var newGroup = new VisboGroup();
			newGroup.groupType = 'System';
			newGroup.global = false;
			newGroup.name = 'SysAdmin';
			newGroup.vcid = vc._id;
			newGroup.permission = {system: {permView: true, permViewAudit: true, permViewLog: true, permViewVC: true, permCreateVC: true, permDeleteVC: true, permManagePerm: true}};
			newGroup.users.push({userId: user._id, email: user.email});
			var group = await newGroup.save();
			logger4js.warn('System VISBO Center Group Created, group: %O', group);
		} catch (err) {
			logger4js.warn('System VISBO Center Group Created failed: %s', err.message);
		}
		
		return vc;
	} catch (err) {
		errorHandler(err, undefined, 'DB: System VC error', undefined);
		return undefined;
	}
};

var getSystemVC = function () {
	logger4js.info('Get System VISBO Center');
	return vcSystem;
};


/* The initSystemSettings function initializes system-wide settings for the Visbo System VC by fetching configurations from the database. 
It decrypts stored credentials (e.g., SMTP passwords), initializes Redis if necessary, and updates system settings in cache.
 */
/* Returns
	Nothing (void) 						– The function modifies system-wide configurations in place and updates Redis.
	If vcSystem is not initialized, 	- the function logs a warning and exits.
 */
var initSystemSettings = async function(launchServer) {
	// Get the Default Log Level from DB
	logger4js.info('Check System VC during init setting');
	if (!vcSystem) {
		logger4js.warn('No System VC during init setting');
		return;
	}
	
	try {
		var query = {};
		query.vcid = vcSystem._id;
		query.type = {$in: ['SysConfig', '_VCConfig']};
		
		var listVCSetting = await VCSetting.find(query);
		
		logger4js.info('Setting %d found for System VC', listVCSetting ? listVCSetting.length : undefined);
		vcSystemSetting = listVCSetting;
		lastUpdatedAt = new Date('2000-01-01');
		
		for (var i = 0; i < vcSystemSetting.length; i++) {
			if (vcSystemSetting[i].name == 'SMTP') {
				vcSystemSetting[i].value.auth.pass = crypt.decrypt(vcSystemSetting[i].value.auth.pass);
				logger4js.debug('Setting SMTP found Decrypt Password');
			}
			if (vcSystemSetting[i].name == 'REDIS') {
				logger4js.info('Setting REDIS found init Client');
				redisClient = await visboRedis.VisboRedisInit(vcSystemSetting[i].value.host, vcSystemSetting[i].value.port);
				await redisClient.set('vcSystem', vcSystem._id.toString());
			}
			if (vcSystemSetting[i].updatedAt > lastUpdatedAt) {
				lastUpdatedAt = vcSystemSetting[i].updatedAt;
			}
		}
		
		// Redis v4: set with expiry uses { EX: seconds } option
		await redisClient.set('vcSystemConfigUpdatedAt', lastUpdatedAt.toISOString(), { EX: 3600 * 4 });
		
		var debugSetting = getSystemVCSetting('DEBUG');
		if (debugSetting && debugSetting.value) {
			logging.setLogLevelConfig(debugSetting.value);
		}
		
		if (launchServer) {
			launchServer();
		}
		logger4js.info('Cache System Setting last Updated %s', lastUpdatedAt.toISOString());
	} catch (err) {
		errorHandler(err, undefined, 'DB: Get System Setting Select ', undefined);
	}
};

/* The refreshSystemSetting function checks whether system settings need to be refreshed by comparing the last updated timestamp stored in Redis (vcSystemConfigUpdatedAt).
If the settings are outdated, it re-initializes system settings using initSystemSettings().
This function will be called from a VISBO system task.
 */
/* Returns
		Nothing (void) 						– The function updates system settings if necessary and marks the task as complete.
		If task or task.value is missing,  	- the function immediately returns. 
*/
var refreshSystemSetting = async function(task, finishedTask) {
	if (!task || !task.value) {
		finishedTask(task, false);
		return;
	}
	logger4js.debug('Task(%s) refreshSystemSetting Execute Value %O', task._id, task.value);
	
	try {
		// Redis v4: get returns promise
		var newUpdatedAt = await redisClient.get('vcSystemConfigUpdatedAt');
		
		var result = {};
		if (!newUpdatedAt || lastUpdatedAt < new Date(newUpdatedAt)) {
			logger4js.trace('Task(%s) refreshSystemSetting Init Settings %s %s', task._id, newUpdatedAt, lastUpdatedAt.toISOString());
			await initSystemSettings();
			result = {result: 1, resultDescription: 'Init System Settings'};
		} else {
			logger4js.trace('Task(%s) refreshSystemSetting Settings Still UpToDate %s %s', task._id, newUpdatedAt, lastUpdatedAt.toISOString());
			result = {result: 0, resultDescription: 'System Settings Still up to date'};
		}
		task.value.taskSpecific = result;
		finishedTask(task, task.value.taskSpecific.result == 0);
		logger4js.trace('Task(%s) refreshSystemSetting Done UpdatedAt %s', task._id, newUpdatedAt);
	} catch (err) {
		errorHandler(err, undefined, 'REDIS: Get System Setting vcSystemConfigUpdatedAt Error ', undefined);
		task.value.taskSpecific = {result: -1, resultDescription: 'Err: Redis Setting vcSystemConfigUpdatedAt'};
		finishedTask(task, false);
	}
};

/* The reloadSystemSetting function forces a reload of system settings by deleting the vcSystemConfigUpdatedAt key from Redis 
and then reinitializing system settings using initSystemSettings().
This function will be called after changes in the systemSetting. After the reloadSystemSetting is done, the system will use this setting.
*/
/* Returns
		Nothing (void) 										– The function deletes the Redis key and calls initSystemSettings() 
															to reload system settings from the database.
		If an error occurs while deleting the Redis key,	- logs the error and does not reload settings.
 */

var reloadSystemSetting = async function() {
	logger4js.info('reloadSystemSetting from DB');
	
	try {
		// Redis v4: del returns promise
		var response = await redisClient.del('vcSystemConfigUpdatedAt');
		
		if (response) {
			logger4js.info('REDIS: vcSystemConfigUpdatedAt Deleted Successfully');
		} else {
			logger4js.warn('REDIS: vcSystemConfigUpdatedAt Deletion Problem');
		}
		await initSystemSettings();
	} catch (err) {
		errorHandler(err, undefined, 'REDIS: Del System Setting vcSystemConfigUpdatedAt Error ', undefined);
	}
};

/* The getSystemVCSetting function retrieves a specific system setting of the VISBO Center. 
If the requested setting does not exist, it provides a default value, creates a new setting in the database, and stores it in the database
 */
/* Returns
		the setting								- If the setting exists in vcSystemSetting
		the setting								- creates a new setting with a default value (if applicable), 
												- stores it in the database, and returns it.
		logs a message and returns undefined 	- If no default value is available,  
*/
var getSystemVCSetting = function (name) {
	logger4js.trace('Get System VISBO Center Setting: %s', name);
	if (!vcSystemSetting) return undefined;

	var setting = vcSystemSetting.find(item => item.name == name);
	if (setting) return setting;

	var value = undefined;
	if (name == 'DEBUG') {
		// Set Default Values
		value = {'VC': 'info', 'VP': 'info', 'VPV': 'info', 'USER':'info', 'OTHER': 'info', 'MAIL': 'info', 'All': 'info'};
	} else if (name == 'PW Policy') {
		// value = {PWPolicy: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^a-zA-Z\\d\\s])(?!.*[\\\"\\'\\\\]).{8,}$", Description: "At least 8 characters, at least one character of each type: alpha, capital alpha, number, special. No Quotes and backslash."};
		value = {PWPolicy: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^a-zA-Z\\d\\s])(?!.*[\\\'\\"\\\\]).{8,}$', Description: 'At least 8 characters, at least one character of each type: alpha, capital alpha, number, special. No Quotes and backslash.'};
	} else if (name == 'UI URL') {
		// Check Environment and update DB
		value = {UIUrl: process.env.UI_URL || 'http://localhost:4200'};
	} else if (name == 'SMTP') {
		// Check Environment and update DB
		if (process.env.SMTP != undefined) {
			value = JSON.parse(process.env.SMTP);
			logger4js.info('MAIL Evaluate SMTP Config from Env %O', value);
		}
	}
	if (value) {
		var vcSetting = new VCSetting();
		vcSetting.name = name;
		vcSetting.vcid = vcSystem._id;
		vcSetting.value = value;
		vcSetting.type = 'SysConfig';
		var vcSettingCopy = JSON.parse(JSON.stringify(vcSetting));
		if (vcSetting.name == 'SMTP') {
			if (vcSetting.value && vcSetting.value.auth && vcSetting.value.auth.pass) {
				logger4js.info('MAIL Encrypt Password');
				vcSetting.value.auth.pass = crypt.encrypt(vcSetting.value.auth.pass);
			}
		}
		vcSystemSetting.push(vcSettingCopy);
		vcSetting.save(function(err) {
			if (err) {
				errorHandler(err, undefined, 'DB: POST System VC Setting', undefined);
				return;
			}
		});
		return vcSetting;
	}
	logger4js.info('Get System VISBO Center Setting: %s not found', name);
	return undefined;
};
/* The getSystemSettingList function retrieves a filtered list of system settings from vcSystemSetting based on a specific name or type. 
It returns an array of matching system settings.
 */
/* Returns			
		resultList (Array) 			– An array of matching system settings in the format:
									[
									{ name: "DEBUG", vcid: "vc-001", value: { VC: "info", VP: "info" }, type: "SysConfig" },
									{ name: "SMTP", vcid: "vc-001", value: { host: "smtp.example.com" }, type: "SysConfig" }
									]
		empty array. 				- If no settings match the filters.
		undefined           		- If vcSystemSetting is not initialized
*/
var getSystemSettingList = function (name, type) {
	logger4js.trace('Get System VISBO Center Enable Setting: %s', name);
	if (!vcSystemSetting) return undefined;

	var list = vcSystemSetting.filter(item => (name && item.name == name) || (type && item.type == type));
	var resultList = [];
	list.forEach(item => resultList.push({
		name: item.name,
		vcid: item.vcid,
		value: item.value,
		type: item.type
	}));
	return resultList;
};

// var checkSystemEnabled = function(name) {
// 	var vcSetting = getSystemVCSetting(name);
// 	if (!vcSetting || !vcSetting.value) {
// 		logger4js.info('Check System VISBO Center Setting: %s not found', name);
// 		return undefined;
// 	} else if (vcSetting.value.systemLimit == true && vcSetting.value.systemEnabled != true) {
// 		logger4js.info('Check System VISBO Center Setting: %s Limit Off', name);
// 		return undefined;
// 	} else {
// 		return vcSetting;
// 	}
// };

var getSystemUrl = function () {
	var vcSetting = getSystemVCSetting('UI URL');
	var result = vcSetting ? vcSetting.value && vcSetting.value.UIUrl : false;
	logger4js.debug('Get VISBO System Url: %s', result);

	return result;
};

var getReSTUrl = function () {
	var vcSetting = getSystemVCSetting('UI URL');
	var result = vcSetting && vcSetting.value && vcSetting.value.UIUrl;
	if (!result || result.indexOf('http://localhost') == 0) {
		result = 'http://localhost:3484';
	} else {
		result = result.concat('/api');
	}
	logger4js.info('Get VISBO ReST Url: %s', result);

	return result;
};

// var checkPredictConfigured = function () {
// 	return predictConfigured;
// };

// var getPredictModel = function () {
// 	return predictConfigured ? fsModell : undefined;
// };

module.exports = {
	createSystemVC: createSystemVC,
	getSystemVC: getSystemVC,
	getSystemVCSetting: getSystemVCSetting,
	getSystemUrl: getSystemUrl,
	getReSTUrl: getReSTUrl,
	refreshSystemSetting: refreshSystemSetting,
	reloadSystemSetting: reloadSystemSetting,
	//checkSystemEnabled: checkSystemEnabled,
	getSystemSettingList: getSystemSettingList
	// checkPredictConfigured: checkPredictConfigured,
	// getPredictModel: getPredictModel
};
