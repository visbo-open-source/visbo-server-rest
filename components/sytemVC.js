var mongoose = require('mongoose');
var User = mongoose.model('User');
var VisboGroup = mongoose.model('VisboGroup');
var VisboCenter = mongoose.model('VisboCenter');

var logging = require('./../components/logging');
var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var findUser = function(currentUser) {
		return currentUser == this;
}

var findUserList = function(currentUser) {
		//console.log("compare %s %s", currentUser.email, this);
		return currentUser.email == this;
}

// Verify Visbo Center and the role of the user
var createSystemVC = function (body) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	logger4js.info("Create System Visbo Center if not existent");
	if (!body && !body.users) {
		logger4js.fatal("No Body or no users System VisboCenter %s", body);
		return undefined;
	}
	var users = body.users;
	var nameSystemVC = "Visbo-System";
	// check that VC name is unique
	var query = {system: true};
	VisboCenter.findOne(query, function(err, vc) {
		if (err) {
			logger4js.fatal("Could not find System VisboCenter");
			return undefined;
		}
		if (vc) {
			logger4js.debug("System VisboCenter already exists");
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
				logger4js.fatal("DB error during Creating System Visbo Center %s", err);
				return undefined
			}
			var newUser = new User();
			newUser.email = body.users[0].email;
			newUser.save(function(err, user) {
				if (err) {
					logger4js.fatal("DB error during Creating System Visbo Center User: %s", err);
					return undefined
				}
				var newGroup = new VisboGroup();
				newGroup.groupType = 'System'
				newGroup.global = false;
				newGroup.name = 'SysAdmin';
				newGroup.vcid = vc._id;
				newGroup.permission = {system: {permView: true, permViewAudit: true, permViewLog: true, permViewVC: true, permCreateVC: true, permManageVC: true, permDeleteVC: true, permManagePerm: true}}
				newGroup.users.push({userId: user._id, email: user.email});
				newGroup.save(function(err, group) {
					if (err) {
						logger4js.warn("System VisboCenter Group Created failed: %O", err);
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
