var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
require('../models/users');
require('../models/visbogroup');

var User = mongoose.model('User');
var VisboGroup = mongoose.model('VisboGroup');
var VisboCenter = mongoose.model('VisboCenter');
var VCSetting = mongoose.model('VCSetting');

var logging = require('./logging');
var logModule = "VC";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var errorHandler = require('./../components/errorhandler').handler;

var visboRedis = require('./../components/visboRedis');
var crypt = require('./../components/encrypt');

var vcSystem = undefined;
var vcSystemSetting = undefined;
var lastUpdatedAt = new Date('2000-01-01');
var redisClient = undefined;

var findUser = function(currentUser) {
		return currentUser == this;
}

var findUserList = function(currentUser) {
		//console.log("compare %s %s", currentUser.email, this);
		return currentUser.email == this;
}

// Verify/Create Visbo Center with an initial user
var createSystemVC = function (body) {
	logger4js.info("Create System Visbo Center if not existent");
	if (!body && !body.users) {
		logger4js.warn("No Body or no users System VisboCenter %s", body);
		return undefined;
	}
	redisClient = visboRedis.VisboRedisInit();
	var users = body.users;
	var nameSystemVC = "Visbo-System";
	// check that VC name is unique
	var query = {system: true};
	VisboCenter.findOne(query, function(err, vc) {
		if (err) {
			errorHandler(err, undefined, `DB: System VC Find error`, undefined)
			return undefined;
		}
		if (vc) {
			logger4js.debug("System VisboCenter already exists");
			vcSystem = vc;
			redisClient.set('vcSystem', vcSystem._id.toString());
			crypt.initIV(vcSystem._id.toString());
			initSystemSettings(vcSystem._id.toString());
			return vc;
		}
		// System VC does not exist create systemVC, default user, default sysadmin group
		logger4js.debug("Create System Visbo Center ");
		var newVC = new VisboCenter();
		newVC.name = nameSystemVC;
		newVC.system = true;
		newVC.vpCount = 0;
		newVC.save(function(err, vc) {
			if (err) {
				errorHandler(err, undefined, `DB: System VC save error`, undefined)
				return undefined
			}
			vcSystem = vc;
			redisClient.set('vcSystem', vcSystem._id.toString())
			crypt.initIV(vcSystem._id.toString());

			var newUser = new User();
			newUser.email = body.users[0].email;
			newUser.save(function(err, user) {
				if (err) {
					errorHandler(err, undefined, `DB: System VC User Create error`, undefined)
					return undefined
				}
				var newGroup = new VisboGroup();
				newGroup.groupType = 'System'
				newGroup.global = false;
				newGroup.name = 'SysAdmin';
				newGroup.vcid = vc._id;
				newGroup.permission = {system: {permView: true, permViewAudit: true, permViewLog: true, permViewVC: true, permCreateVC: true, permDeleteVC: true, permManagePerm: true}}
				newGroup.users.push({userId: user._id, email: user.email});
				newGroup.save(function(err, group) {
					if (err) {
						logger4js.warn("System VisboCenter Group Created failed: %s", err.message);
						return undefined;
					}
					logger4js.warn("System VisboCenter Group Created, group: %O", group);
					return vc;
				})
			});
		});
	});
}

var getSystemVC = function () {
	logger4js.info("Get System Visbo Center");
	return vcSystem;
}

var initSystemSettings = function() {
	// Get the Default Log Level from DB
	if (!vcSystem) return;
	var query = {};
	var listSetting;
	query.vcid = vcSystem._id;
	query.type = 'SysConfig';
	var queryVCSetting = VCSetting.find(query);
	queryVCSetting.exec(function (err, listVCSetting) {
		if (err) {
			errorHandler(err, undefined, `DB: Get System Setting Select `, undefined)
		}
		logger4js.info("Setting %d found for System VC", listVCSetting ? listVCSetting.length : undefined);
		vcSystemSetting = listVCSetting;
		lastUpdatedAt = new Date('2000-01-01');
		for (var i=0; i<vcSystemSetting.length; i++) {
			if (vcSystemSetting[i].name == "SMTP") {
				vcSystemSetting[i].value.auth.pass = crypt.decrypt(vcSystemSetting[i].value.auth.pass);
				logger4js.debug("Setting SMTP found Decrypt Password");
			}
			if (vcSystemSetting[i].updatedAt > lastUpdatedAt) {
				lastUpdatedAt = vcSystemSetting[i].updatedAt
			}
		}
		redisClient.set('vcSystemConfigUpdatedAt', lastUpdatedAt.toISOString(), 'EX', 3600*4)
		logging.setLogLevelConfig(getSystemVCSetting("DEBUG").value)

		logger4js.info("Cache System Setting last Updated %s", lastUpdatedAt.toISOString());
	});
}

var refreshSystemSetting = function(task, finishedTask) {
	if (!task || !task.value) finishedTask(task);
	logger4js.debug("Task(%s) refreshSystemSetting Execute Value %O", task._id, task.value);
	// Check Redis if a new Date is set and if get all System Settings and init
	redisClient.get('vcSystemConfigUpdatedAt', function(err, newUpdatedAt) {
		if (err) {
			errorHandler(err, undefined, `REDIS: Get System Setting vcSystemConfigUpdatedAt Error `, undefined)
			task.value.taskSpecific = {result: -1, resultDescription: 'Err: Redis Setting vcSystemConfigUpdatedAt'};
			finishedTask(task);
			return;
		}
		var result = {};
		if (!newUpdatedAt || lastUpdatedAt < new Date(newUpdatedAt)) {
			logger4js.trace("Task(%s) refreshSystemSetting Init Settings %s %s", task._id, newUpdatedAt, lastUpdatedAt.toISOString());
			initSystemSettings()
			result = {result: 1, resultDescription: 'Init System Settings'}
		} else {
			logger4js.trace("Task(%s) refreshSystemSetting Settings Still UpToDate %s %s", task._id, newUpdatedAt, lastUpdatedAt.toISOString());
			result = {result: 0, resultDescription: 'System Settings Still up to date'}
		}
		task.value.taskSpecific = result;
		finishedTask(task);
	  logger4js.trace("Task(%s) refreshSystemSetting Done UpdatedAt %s", task._id, newUpdatedAt);
	})
}

var reloadSystemSetting = function() {
	logger4js.info("reloadSystemSetting from DB");
	// MS TODO: Check Redis if a new Date is set and if get all System Settings and init
	redisClient.del('vcSystemConfigUpdatedAt', function(err, response) {
		if (err) {
			errorHandler(err, undefined, `REDIS: Del System Setting vcSystemConfigUpdatedAt Error `, undefined)
			return;
		}
		if (response) {
			logger4js.info("REDIS: vcSystemConfigUpdatedAt Deleted Successfully");
		} else  {
			logger4js.warn("REDIS: vcSystemConfigUpdatedAt Deletion Problem");
		}
		initSystemSettings()
	})
}

var getSystemVCSetting = function (name) {
	logger4js.trace("Get System Visbo Center Setting: %s", name);
	if (!vcSystemSetting) return undefined;
	for (var i = 0; i < vcSystemSetting.length; i++) {
		if (vcSystemSetting[i].name == name) {
			logger4js.debug("Get System Visbo Center Setting: %s found", name);
			return vcSystemSetting[i]
		}
	}
	var value = undefined;

	if (name == "DEBUG") {
		// Set Default Values
		value = {"VC": "info", "VP": "info", "VPV": "info", "USER":"info", "OTHER": "info", "MAIL": "info", "All": "info"}
	} else if (name == "PW Policy") {
		value = {PWPolicy: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^a-zA-Z\\d\\s])(?!.*[\\\"\\'\\\\]).{8,}$", Description: "At least 8 characters, at least one character of each type: alpha, capital alpha, number, special. No Quotes and backslash."}
	} else if (name == "UI URL") {
		// Check Environment and update DB
		value = {UIUrl: process.env.UI_URL || 'http://localhost:4200'}
	} else if (name == "SMTP") {
		// Check Environment and update DB
		if (process.env.SMTP != undefined) {
			value = JSON.parse(process.env.SMTP);
			logger4js.info("MAIL Evaluate SMTP Config from Env %O", value);
		}
	}
	if (value) {
		var vcSetting = new VCSetting();
		vcSetting.name = name;
		vcSetting.vcid = vcSystem._id;
		vcSetting.value = value;
		vcSetting.type = 'SysConfig';
		var vcSettingCopy = JSON.parse(JSON.stringify(vcSetting))
		if (vcSetting.name == "SMTP") {
			if (vcSetting.value && vcSetting.value.auth && vcSetting.value.auth.pass) {
				logger4js.info("MAIL Encrypt Password");
				vcSetting.value.auth.pass = crypt.encrypt(vcSetting.value.auth.pass);
			}
		}
		vcSystemSetting.push(vcSettingCopy);
		vcSetting.save(function(err, oneVCSetting) {
			if (err) {
				errorHandler(err, undefined, `DB: POST VC Setting UI URl ${req.params.vcid} save`, undefined)
				return;
			}
		});
		return vcSetting
	}
	logger4js.info("Get System Visbo Center Setting: %s not found", name);
	return undefined;
}

var getSystemUrl = function () {
	var vcSetting = getSystemVCSetting("UI URL")
	var result = vcSetting.value && vcSetting.value.UIUrl;
	logger4js.debug("Get Visbo System Url: %s", result);

	return result
}

module.exports = {
	createSystemVC: createSystemVC,
	getSystemVC: getSystemVC,
	getSystemVCSetting: getSystemVCSetting,
	getSystemUrl: getSystemUrl,
	refreshSystemSetting: refreshSystemSetting,
	reloadSystemSetting: reloadSystemSetting
};
