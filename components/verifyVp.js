var mongoose = require('mongoose');
var Const = require('../models/constants')
var constPermSystem = Const.constPermSystem
var constPermVC = Const.constPermVC
var constPermVP = Const.constPermVP

var VisboProject = mongoose.model('VisboProject');
var VisboCenter = mongoose.model('VisboCenter');
var VisboGroup = mongoose.model('VisboGroup');

var logModule = "VP";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Verify Visbo Project and the role of the user
function verifyVp(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	logger4js.debug("Verify VP: %s %s %O", req.url, req.method, req.query);
	// check if user request sysAdmin View in URL
	var sysAdmin = req.query && req.query.sysadmin ? true : false;

	// no special check for get VP && create VP
	var baseUrl = req.url.split("?")[0];
	if (baseUrl == '/'){
		logger4js.debug("Verify VP: skip GET & POST for /");
		return next();
	}

	var urlComponent = baseUrl.split("/")
	var userAccess = false;
	var checkDeletedVP = false;
	// read access for all GET Operations
	if (req.method == "GET") userAccess = true;
	if (urlComponent.length >= 3) {
		// special checks done inside the functions so read access is enough
		if ((req.method == "DELETE" || req.method == "POST") && urlComponent[2]== 'variant') userAccess = true;
		if ((req.method == "DELETE" || req.method == "POST") && urlComponent[2]== 'lock') userAccess = true;
	}
	if ((req.method == "GET" || req.method == "DELETE" || req.method == "PUT") &&  urlComponent.length == 2) {
		// ignore deleted flag to allow destroy (DELETE) and undelete (PUT)
		checkDeletedVP = req.query.deleted != undefined;
	}
	logger4js.debug("Verify VP: %s %s userAccess %s sysAdmin %s VCList %s reqQuery %s", req.url, req.method, userAccess, sysAdmin, req.listVC ? req.listVC.length : 0, req.query);

	var query = {};
	// Check for URLs with a :vpid
	var vpid = urlComponent[1];

	// logger4js.debug("Verify access permission for VisboProject %s to User %s with VC %O ", vpid, useremail, req.listVC);
	var query = {};
	if (!sysAdmin) {
		if (userAccess)
			query = { $or: [ {'users.email': useremail}, { vpPublic: true, vpid: {$in: req.listVC } } ] }		// Permission for User
		else
			query = {'users':{ $elemMatch: {'email': useremail, 'role': 'Admin'}}};	 // Admin access for Modification
	}
	query._id = vpid;
	// object['property']
	// query['deleted.deletedAt'] =  {$exists: checkDeletedVP};
	query.deleted =  {$exists: checkDeletedVP};
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
			if (sysAdmin) {
				var validSysAdminOperation = false;
				if (req.method == "GET") validSysAdminOperation = true;
				if (req.method == "DELETE" && baseUrl == '/') validSysAdminOperation = true;
				if (req.method == "POST" && urlComponent.length >= 3 && urlComponent[2]== 'user') validSysAdminOperation = true;
				if (!validSysAdminOperation) {
					logger4js.debug("SysAdmin: No Permission or VP does not exists for url %s", req.url);
					return res.status(403).send({
						state: 'failure',
						message: 'No Visbo Project or no Permission'
					});
				}
			}
			return next();
		} else {
			logger4js.debug("No Permission or VP does not exists for url %s", req.url);
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Project or no Permission'
			});
		}
	});
}

// Generate the Groups where the user is member of and has VP Permission
function getAllVPGroups(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	var baseUrl = req.url.split("?")[0]
	if (baseUrl == '/') {
		// get the VP Groups the user is member of
		// handle sysadmin case
		logger4js.debug("Generate VP Groups for user %s for url %s", req.decoded.email, req.url);
		var query = {};
		var acceptEmpty = true;
		query = {'users.userId': userId};	// search for VP groups where user is member
		// Permission check for GET & POST
		if (req.method == "GET") {
			if (req.query.sysadmin) {
				query.groupType = 'System';						// search for System Groups only
				query['permission.vp'] = { $bitsAllSet: constPermVP.View }
				acceptEmpty = false;
			} else {
				if (req.query.vcid) query.vcid = req.query.vcid;
				query.groupType = {$in: ['VC', 'VP']};				// search for VP Groups only
				query['permission.vp'] = { $bitsAllSet: constPermVP.View }
			}
		}
		if (req.method == "POST") {
			// Only Create VP Request, check vcid from Body
			// Check VC Permission insead of system
			query.groupType = 'VC';						// search for VC permission to create a VP
			query.vcid = req.body && req.body.vcid
			acceptEmpty = false;
			query['permission.vc'] = { $bitsAnySet: constPermVC.View + constPermVC.CreateVP }
		}

		logger4js.debug("Query VGs %s", JSON.stringify(query));
		var queryVG = VisboGroup.find(query);
		queryVG.select('name permission vcid vpids')
		queryVG.exec(function (err, listVG) {
			if (err) {
				logger4js.fatal("VP Groups Get DB Connection %O", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenters',
					error: err
				});
			}
			logger4js.debug("Found VGs %d", listVG.length);
			// Convert the result to request
			req.permGroups = listVG;
			logger4js.trace("Found VPGroups %s", JSON.stringify(listVG));
			if (!acceptEmpty && listVG.length == 0) {
				// do not accept requests without a group assignement especially to System Group
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}

			if (req.query.sysadmin) {
				// combined permission only applicable if it does not combine diffeent VCIDs
				for (var i=0; i < req.permGroups.length; i++) {
					combinedPerm.system = combinedPerm.system | (req.permGroups[i].permission.system || 0);
					combinedPerm.vc = combinedPerm.vc | (req.permGroups[i].permission.vc || 0);
					combinedPerm.vp = combinedPerm.vp | (req.permGroups[i].permission.vp || 0);
				}
				req.combinedPerm = combinedPerm;
			}
			return next();
		});
	} else {
		// not the baseUrl "/" do nothing
		return next();
	}
}

// Generate the Groups where the user is member of System / VP depending on the case
function getVpidGroups(req, res, next, vpid) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	var baseUrl = req.url.split("?")[0]
	var urlComponent = baseUrl.split("/")
	var sysAdmin = req.query.sysadmin ? true : false;

	// get the VP Groups of this VP if the user is member of
	// handle sysadmin case by getting the system groups
	logger4js.debug("Generate VP Groups for vpid %s user %s for url %s sysAdmin %s", vpid, req.decoded.email, req.url, sysAdmin);
	var query = {};
	query = {'users.userId': userId};	// search for VP groups where user is member
	if (sysAdmin) {
		query.groupType = 'System';						// search for System Groups only
		query['permission.vp'] = { $bitsAllSet: constPermVP.View }
		acceptEmpty = false;
	} else {
		query.groupType = {$in: ['VC', 'VP']};				// search for VC/VP Groups only
		query['permission.vp'] = { $bitsAllSet: constPermVP.View }
		// check that vpid is in the group list
		query.vpids = vpid;
	}
	logger4js.debug("Search VGs %O", query);

	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vpid')
	queryVG.exec(function (err, listVG) {
		if (err) {
			logger4js.fatal("VP Groups Get DB Connection %O", err);
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting VisboCenters',
				error: err
			});
		}
		logger4js.debug("Found VGs %d groups %O", listVG.length, listVG);
		// Convert the result to request
		req.permGroups = listVG;
		if (listVG.length == 0) {
			// do not accept requests without a group assignement especially to System Group
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		var checkDeletedVP = req.query.deleted;
		// allow access to GET, PUT & DELETE for VP of deleted VPs if user is sysadmin
		// if ((req.method == "GET" || req.method == "DELETE" || req.method == "PUT") &&  urlComponent.length == 2) {
		// 	if (sysAdmin && req.query.deleted) checkDeletedVP = true;
		// }
		// check against the groups
		var vpidList = [];
		var combinedPerm = {system: 0, vc: 0, vp: 0};
		for (var i=0; i < req.permGroups.length; i++) {
			// TODO build the correct vpid list from vpids
			// vpidList.push(req.permGroups[i].vpid);
			combinedPerm.system = combinedPerm.system | (req.permGroups[i].permission.system || 0);
			combinedPerm.vc = combinedPerm.vc | (req.permGroups[i].permission.vc || 0);
			combinedPerm.vp = combinedPerm.vp | (req.permGroups[i].permission.vp || 0);
		}
		if (!sysAdmin) delete combinedPerm.system
		logger4js.debug("Get Visbo Project with id %s, %d Group(s) Perm %O", vpid, req.permGroups.length, combinedPerm);
		var query = {};
		query._id = vpid;
		query.deleted =  {$exists: checkDeletedVP};
		if (checkDeletedVP) {
			query['deleted.byParent'] = false;			// to guarantee that the user can not see a vp that is deleted by VC
		}
		// TODO prevent that the user gets access to VPs in a later deleted VC. Do not deliver groups from deleted VCs/VPs
		logger4js.debug("Get Visbo Project Query %O", query);
		var queryVP = VisboProject.findOne(query);
		// queryVP.select('name users updatedAt createdAt');
		queryVP.exec(function (err, oneVP) {
			if (err) {
				logger4js.fatal("VP Get with ID DB Connection %O", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Visbo Centers',
					error: err
				});
			}
			if (!oneVP) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			req.oneVP = oneVP
			req.combinedPerm = combinedPerm;

			logger4js.debug("Found Visbo Project %s Access Permission %O", vpid, req.combinedPerm);
			return next();
		});
	});
}

module.exports = {
	verifyVp: verifyVp,
	getAllVPGroups: getAllVPGroups,
	getVpidGroups: getVpidGroups
};
