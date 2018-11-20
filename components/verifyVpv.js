var mongoose = require('mongoose');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');

var logModule = "VPV";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Generate VP List for permission check of public VPs
function generateVcList(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	// check if user request sysAdmin View in URL
	var sysAdmin = req.query && req.query.sysadmin ? true : false;
	logger4js.debug("VPV Generate VC List: sysAdmin %s Method: %s", sysAdmin, req.method);

	var query = {};
	// if not sysAdmin generate VC List read Access or for Creating VP with Admin access.
	if (!sysAdmin) {
			// GET the VC List Read Access to check for public VP access
			query = {'users.email': useremail};				// Any Access for read operation
			query.deleted =  {$exists: false};				// Not deleted
			var queryVC = VisboCenter.find(query);
			queryVC.select('_id');
			queryVC.exec(function (err, listVC) {
				if (err) {
					logger4js.fatal("VP Verify Access Permission DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Internal Server Error with DB Connection',
						error: err
					});
				};
				logger4js.debug("VPV Generate VC List: Found %d Visbo Centers", listVC.length);
				req.listVC = [];
				for (var i=0; i<listVC.length; i++) req.listVC.push(listVC[i]._id)

				logger4js.debug("VPV Generate VC List: continue next");
				return next();
			});
	} else {
		logger4js.debug("VPV Generate VC List: skip VP List Generation");
		return next();
	}
}

// Verify Visbo Project and the role of the user
function verifyVpv(req, res, next) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	// get the url and ignore the query parameters
	if (req.url.split("?")[0] == '/') {
		// no common check here for GET & POST, special check done in code afterwards
		return next();
	}
	var urlComponent = req.url.split("/")
	var vpvid = urlComponent[1];
	var userId = req.decoded._id;
	var useremail = req.decoded.email;

	// check only read access as Delete & Post depending on conditions (Variants, Locks) of the project
	logger4js.debug("Verify access permission for VisboProjectVersion %s to User %s readAccess Only", vpvid, useremail);
	var query = {};
	query._id = vpvid;
	query.deleted =  {$exists: false};				// Not deleted

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

		var query = { $or: [ {'users.email': useremail}, { vpPublic: true, vcid: {$in: req.listVC } } ] }		// Permission for User
		query._id = oneVPV.vpid;									//restricted to the specific project
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
			logger4js.debug("Found VisboProjectVersion %s Admin Access %s", vpvid, req.oneVPisAdmin);
			return next();
		});
	});
}

module.exports = {
	verifyVpv: verifyVpv,
	generateVcList: generateVcList
};
