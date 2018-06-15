var mongoose = require('mongoose');
var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var logging = require('./../components/logging');
var debuglevel = 9;

// Verify Visbo Project and the role of the user
function verifyVpv(req, res, next) {
	// get the url and ignore the query parameters
	if (req.url.split("?")[0] == '/') {
		// no common check here for GET & POST, special check done in code afterwards
		return next();
	}
	var vpvid = req.url.split('/')[1];
	var userId = req.decoded._id;
	var useremail = req.decoded.email;

	debuglog(debuglevel, 8, "Verify access permission for VisboProjectVersion %s to User %s ", vpvid, useremail);
	var query = {};
	query._id = vpvid;
	query.deleted =  {$exists: false}};				// Not deleted

	var queryVPV = VisboProjectVersion.findOne(query);
	queryVPV.exec(function (err, oneVPV) {
		if (err) {
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting Visbo Project Versions',
				error: err
			});
		}
		if (!oneVPV) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Project Version or no Permission'
			});
		}
		req.oneVPV = oneVPV

		var query = {'users.email': useremail}		// Permission for User
		query._id = oneVPV.vpid;									//restricted to the specific project
		query.deleted =  {$exists: false}};				// Not deleted
		var queryVP = VisboProject.findOne(query);
		queryVP.exec(function (err, oneVP) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Visbo Projects',
					error: err
				});
			}
			if (!oneVP) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Project or no Permission'
				});
			}
			req.oneVP = oneVP
			req.oneVPisAdmin = false
			for (var i = 0; i < oneVP.users.length; i++){
				if (oneVP.users[i].email == useremail && oneVP.users[i].role == 'Admin' ) {
					req.oneVPisAdmin = true;
				}
			}
			debuglog(debuglevel, 1, "Found VisboProjectVersion %s Admin Access %s", vpvid, req.oneVPisAdmin);
			return next();
		});
	});
}

module.exports = {
	verifyVpv: verifyVpv
};
