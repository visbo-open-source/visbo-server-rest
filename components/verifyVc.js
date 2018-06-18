var mongoose = require('mongoose');
var VisboCenter = mongoose.model('VisboCenter');

var logging = require('./../components/logging');
var logModule = "VC";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Verify Visbo Center and the role of the user
function verifyVc(req, res, next) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	if (req.url == '/') {
		// no common check here, special check done in code afterwards
		return next();
	}
	var vcid = req.url.split('/')[1];
	var userId = req.decoded._id;
	var useremail = req.decoded.email;

	logger4js.debug("Verify access permission for VisboCenter %s to User %s ", vcid, useremail);
	// return next();
	var query = {'users.email': useremail};		// Permission for User
	query._id = vcid;
	query.deleted =  {$exists: false};				// Not deleted
	var queryVC = VisboCenter.findOne(query);
	// queryVC.select('name users updatedAt createdAt');
	queryVC.exec(function (err, oneVC) {
		if (err) {
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting Visbo Centers',
				error: err
			});
		}
		if (!oneVC) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		req.oneVC = oneVC
		req.oneVCisAdmin = false
		for (var i = 0; i < oneVC.users.length; i++){
			if (oneVC.users[i].email == useremail && oneVC.users[i].role == 'Admin' ) {
				req.oneVCisAdmin = true;
			}
		}
		logger4js.debug("Found VisboCenter %s Admin Access %s", vcid, req.oneVCisAdmin);
		return next();
	});
}

module.exports = {
	verifyVc: verifyVc
};
