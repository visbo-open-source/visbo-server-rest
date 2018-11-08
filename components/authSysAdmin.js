var mongoose = require('mongoose');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');

var logging = require('./../components/logging');
var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// var findUser = function(currentUser) {
// 		return currentUser == this;
// }
//
// var findUserList = function(currentUser) {
// 		//console.log("compare %s %s", currentUser.email, this);
// 		return currentUser.email == this;
// }

// Verify Visbo Center and the role of the user
function calculateSysAdmin(req, res, next) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	var useremail = undefined;
	if (req.body && req.body.email) useremail = req.body.email.toLowerCase();
	logger4js.info("Check Permission in System Visbo Center for user %s", useremail);

	var query = {'users.email': useremail};		// Permission for User
	query.system = true;
	query.deleted =  {$exists: false};				// Not deleted
	var queryVC = VisboCenter.findOne(query);
	// queryVC.select('name users updatedAt createdAt');
	req.sysAdminRole = undefined;

	queryVC.exec(function (err, oneVC) {
		if (err) {
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting System Visbo Centers',
				error: err
			});
		}
		if (!oneVC) {
			logger4js.info("User %s is not member of System Visbo Center", useremail);
			return next();
		}
		for (var i = 0; i < oneVC.users.length; i++){
			if (oneVC.users[i].email == useremail) {
				req.sysAdminRole = oneVC.users[i].role
				if (req.sysAdminRole == 'Admin') break;
			}
		}
		logger4js.info("User %s is member of System Visbo Center as %s", useremail, req.sysAdminRole);
		return next();
	})
}

module.exports = {
	calculateSysAdmin: calculateSysAdmin
};
