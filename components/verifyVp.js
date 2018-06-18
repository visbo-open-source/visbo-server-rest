var mongoose = require('mongoose');
var VisboProject = mongoose.model('VisboProject');
var VisboCenter = mongoose.model('VisboCenter');
var logging = require('./../components/logging');
var debuglevel = 8;

// Verify Visbo Project and the role of the user
function verifyVp(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	// check for GET & POST and ignore the query parameters
	if (req.url.split("?")[0] == '/') {
		// collect the VCs the user has access to, to evaluate the publ VP Access
		var query;
		if (req.method == 'GET') {
			query = {'users.email': useremail};								// Permission for User
		} else {
			query = {'users':{ $elemMatch: {'email': useremail, 'role': 'Admin'}}};								// Permission for Admin
		}
		query.deleted =  {$exists: false};				// Not deleted
		debuglog(debuglevel, 9, "Verify VP: %O ", query);

		var queryVC = VisboCenter.find(query);
		queryVC.select('_id');
		queryVC.exec(function (err, listVC) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			debuglog(debuglevel,  5, "Found %d Visbo Centers", listVC.length);
			req.listVC = [];
			for (var i=0; i<listVC.length; i++) req.listVC.push(listVC[i]._id)
			return next();
		});
	} else {
		// Check for URLs with a :vpid
		var vpid = req.url.split('/')[1];

		debuglog(debuglevel, 7, "Verify access permission for VisboProject %s to User %s ", vpid, useremail);
		var query = {'users.email': useremail}		// Permission for User
		// var query = { $or: [ {'users.email': useremail}, { vpPublic: true } ] }		// Permission for User
		query._id = vpid;
		query.deleted =  {$exists: false};				// Not deleted

		var queryVP = VisboProject.findOne(query);
		queryVP.exec(function (err, oneVP) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Visbo Projects',
					error: err
				});
			}
			if (oneVP) {
				req.oneVP = oneVP
				req.oneVPisAdmin = false
				for (var i = 0; i < oneVP.users.length; i++){
					if (oneVP.users[i].email == useremail && oneVP.users[i].role == 'Admin' ) {
						req.oneVPisAdmin = true;
					}
				}
				debuglog(debuglevel, 5, "Found VisboProject %s Admin Access %s", vpid, req.oneVPisAdmin);
				return next();
			} else {
				// Check for Public VP Access in case of GET only, because other operations reuqire admin Access
				query = {}		// No Permission for User
				query.vpPublic = true;
				query._id = vpid;
				query.deleted =  {$exists: false};				// Not deleted
				var queryVP = VisboProject.findOne(query);
				queryVP.exec(function (err, oneVP) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Error getting Visbo Projects',
							error: err
						});
					}
					debuglog(debuglevel, 7, "Verify public Access to VP %s %s ", vpid, useremail);
					if (!oneVP) {
						return res.status(403).send({
							state: 'failure',
							message: 'No Visbo Project or no Permission'
						});
					}
					req.oneVP = oneVP;
					req.oneVPisAdmin = false;
					return next();
				});
			}
		});
	}
}

module.exports = {
	verifyVp: verifyVp
};
