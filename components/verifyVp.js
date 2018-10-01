var mongoose = require('mongoose');
var VisboProject = mongoose.model('VisboProject');
var VisboCenter = mongoose.model('VisboCenter');

var logModule = "VP";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Generate VC List for permission check of public VPs
function generateVcList(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	// check if user request sysAdmin View in URL
	var sysAdmin = req.query && req.query.sysadmin ? true : false;
	// if SysAdmin View in URL, check if the User has sysAdminRole in token
	if (sysAdmin && req.decoded.status && req.decoded.status.sysAdminRole) {
		sysAdmin = true;
	} else {
		sysAdmin = false;
	}
	logger4js.debug("Generate VC List: sysAdminRole %s Method: %s", sysAdmin, req.method);

	var query = {};
	// if not sysAdmin generate VC List read Access or for Creating VP with Admin access.
	if (!sysAdmin) {
		var readAccess = true;
		if (req.method == 'POST' && req.url.split("?")[0] == '/') readAccess = false;
			// GET the VC List to check for public VP access
			if (readAccess)
				query = {'users.email': useremail};				// Any Access for read operation
			else
				query = {'users':{ $elemMatch: {'email': useremail, 'role': 'Admin'}}};	 // Admin access for Modification

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
				logger4js.debug("Generate VC List: Found %d Visbo Centers", listVC.length);
				req.listVC = [];
				for (var i=0; i<listVC.length; i++) req.listVC.push(listVC[i]._id)
				logger4js.debug("Generate VC List: continue next");
				return next();
			});
	} else {
		logger4js.debug("Generate VC List: skip VC List Generation");
		return next();
	}
}

// Verify Visbo Project and the role of the user
function verifyVp(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	// check if user request sysAdmin View in URL
	var sysAdmin = req.query && req.query.sysadmin ? true : false;
	// if SysAdmin View in URL check if the User has sysAdminRole in token
	if (sysAdmin && req.decoded.status && req.decoded.status.sysAdminRole) {
		sysAdmin = true;
	} else {
		sysAdmin = false;
	}

	// no special check for get VP && create VP
	if (req.url.split("?")[0] == '/')
		return next();

	var urlComponent = req.url.split("/")
	if (sysAdmin) {
		if (req.method == "GET") return next();
		if (req.method == "DELETE" && req.url.split("?")[0] == '/') return next();
		if (req.method == "POST" && urlComponent.length >= 3 && urlComponent[2]== 'user') return next();
	}

	var readAccess = false;
	// read access for all GET Operations
	if (req.method == "GET") readAccess = true;
	if (urlComponent.length >= 3) {
		// special checks done inside the functions so read access is enough
		if ((req.method == "DELETE" || req.method == "POST") && urlComponent[2]== 'variant') readAccess = true;
		if ((req.method == "DELETE" || req.method == "POST") && urlComponent[2]== 'lock') readAccess = true;
	}
	logger4js.debug("Verify VP: %s %s readAccess %s sysAdminRole %s VCList %s", req.url, req.method, readAccess, sysAdmin, req.listVC && req.listVC.length);

	var query = {};
	// Check for URLs with a :vpid
	var vpid = req.url.split('/')[1];

	logger4js.debug("Verify access permission for VisboProject %s to User %s with VC %O ", vpid, useremail, req.listVC);
	var query = {};
	if (!sysAdmin) {
		if (readAccess)
			query = { $or: [ {'users.email': useremail}, { vpPublic: true, vcid: {$in: req.listVC } } ] }		// Permission for User
		else
			query = {'users':{ $elemMatch: {'email': useremail, 'role': 'Admin'}}};	 // Admin access for Modification
	}
	query._id = vpid;
	query.deleted =  {$exists: false};				// Not deleted
	logger4js.debug("VP Verify Access Permission Query: %O", query);

	var queryVP = VisboProject.findOne(query);
	queryVP.exec(function (err, oneVP) {
		if (err) {
			logger4js.fatal("VP Verify Access Permission DB Connection ", err);
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
			logger4js.debug("Found VisboProject %s Admin Access %s", vpid, req.oneVPisAdmin);
			return next();
		} else {
			logger4js.debug("No Permission for %s", req.url);
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Project or no Permission'
			});
		}
	});
}

module.exports = {
	verifyVp: verifyVp,
	generateVcList: generateVcList
};
