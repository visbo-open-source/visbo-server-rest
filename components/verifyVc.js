var mongoose = require('mongoose');
var VisboCenter = mongoose.model('VisboCenter');

var logModule = "VC";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Verify Visbo Center and the role of the user
function verifyVc(req, res, next) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	var baseUrl = req.url.split("?")[0]
	if (baseUrl == '/') {
		// no common check here, special check done in code afterwards
		return next();
	}

	var urlComponent = baseUrl.split("/")
	var vcid = urlComponent[1];

	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	var sysAdmin = (req.query && req.query.sysadmin) ? true : false;
	if (sysAdmin && req.decoded.status && req.decoded.status.sysAdminRole) {
		sysAdmin = true;
	} else {
		sysAdmin = false;
	}

	logger4js.debug("Verify access permission for VisboCenter %s to User %s ", vcid, useremail);
	var checkDeletedVC = false;

	// allow access to GET, PUT & DELETE for VC of deleted VCs if user is sysadmin
	if ((req.method == "GET" || req.method == "DELETE" || req.method == "PUT") &&  urlComponent.length == 2) {
		if (sysAdmin && req.query.deleted != undefined) checkDeletedVC = true;
	}
	logger4js.debug("Verify access permission for VisboCenter %s to User %s checkDeleted %s", vcid, useremail, checkDeletedVC);
	var query = {};
	if (!sysAdmin) query = {'users.email': useremail};		// Permission for User
	query._id = vcid;
	query['deleted.deletedAt'] =  {$exists: checkDeletedVC};
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
