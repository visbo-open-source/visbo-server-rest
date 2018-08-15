var mongoose = require('mongoose');
var User = mongoose.model('User');
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
	// MS TODO check if another system VC
	var query = {name: nameSystemVC};
	VisboCenter.findOne(query, function(err, vc) {
		if (err) {
			logger4js.fatal("Could not find System VisboCenter");
			return undefined;
		}
		if (vc) {
			logger4js.warn("System VisboCenter already exists");
			return vc;
		}
		logger4js.debug("Create System Visbo Center (name is already unique) check users");
		var newVC = new VisboCenter();
		newVC.name = nameSystemVC;
		newVC.system = true;
		newVC.vpCount = 0;
		// Check for Valid User eMail remove non existing eMails

		// check the users that they exist already, if not ignore the non existing users
		var vcUsers = new Array();
		if (!users) {
			logger4js.error("No users defined for System VisboCenter");
			return undefined;
		}
		for (var i = 0; i < users.length; i++) {
			// build up unique user list vcUsers to check that they exist
			if (!vcUsers.find(findUser, users[i].email)){
				vcUsers.push(users[i].email)
			}
		}
		logger4js.debug("Check users if they exist %s", JSON.stringify(vcUsers));
		var queryUsers = User.find({'email': {'$in': vcUsers}});
		queryUsers.select('email');
		queryUsers.exec(function (err, listUsers) {
			if (err) {
				logger4js.fatal("Could not get Users for System VisboCenter");
				return undefined;
			}
			if (listUsers.length != vcUsers.length) {
				logger4js.warn("Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vcUsers.length);
			}
			// copy all existing users to newVC and set the userId correct.
			for (var i = 0; i < users.length; i++) {
				// build up user list for newVC and a unique list of vcUsers
				vcUser = listUsers.find(findUserList, users[i].email);
				// if user does not exist, ignore the user
				if (vcUser){
					users[i].userId = vcUser._id;
					delete users[i]._id;
					newVC.users.push(users[i]);
				}
			}
			// check that there is an Admin available, if not add the current user as Admin
			if (newVC.users.filter(users => users.role == 'Admin').length == 0) {
				logger4js.error("No Admin User found for System Visbo Center");
				return undefined;
			};

			logger4js.warn("System Visbo Center does not exist, created now %s with %d Users", newVC.name, newVC.users.length);
			newVC.save(function(err, vc) {
				if (err) {
					logger4js.fatal("DB error during Creating System Visbo Center %s", err);
					return undefined
				}
				return vc;
			});
		});
	})
}

module.exports = {
	createSystemVC: createSystemVC
};
