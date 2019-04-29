var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var User = mongoose.model('User');
var VisboGroup = mongoose.model('VisboGroup');
var VisboCenter = mongoose.model('VisboCenter');
var VCSetting = mongoose.model('VCSetting');

var logging = require('./logging');
var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var errorHandler = require('./../components/errorhandler').handler;

var visboRedis = require('./../components/visboRedis');

var vcSystem = undefined;

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
	var redisClient = visboRedis.VisboRedisInit();
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
			redisClient.set('vcSystem', vcSystem._id.toString())

			// Get the Default Log Level from DB
			var query = {};
			var listSetting;
			query.vcid = vcSystem._id;
			query.name = 'DEBUG';
			var queryVCSetting = VCSetting.findOne(query);
			queryVCSetting.exec(function (err, item) {
				if (err) {
					errorHandler(err, undefined, `DB: Get System Setting Select `, undefined)
				} else if (item) {
					logger4js.debug("Setting found for System VC %O", item);
					logging.setLogLevelConfig(item.value);
				} else {
					logger4js.debug("Setting not found for System VC", query.name);
					// insert a default Config Value for Debug
					var vcSetting = new VCSetting();
					vcSetting.name = 'DEBUG';
					vcSetting.vcid = vcSystem._id;
					vcSetting.timestamp = new Date();
					vcSetting.type = 'Internal';
					vcSetting.value = {"VC": "info", "VP": "info", "VPV": "info", "USER":"info", "OTHER": "info", "MAIL": "info", "All": "info"};
					vcSetting.save(function(err, oneVcSetting) {
						if (err) {
							errorHandler(err, undefined, `DB: Initial Logging save `, undefined)
						} else {
							logger4js.info("Update System Log Setting");
							logging.setLogLevelConfig(oneVcSetting.value)
						}
					});
				}
			});
			logger4js.info("Update System Log Setting");
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

module.exports = {
	createSystemVC: createSystemVC
};
