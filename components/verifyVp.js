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
		var checkDeleted = req.query.deleted == true;
		var combinedPermStatus = req.query.sysadmin == true; // deliver combined Permission if focus on one Object System VC or one VC
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
				query.deletedByParent = {$exists: checkDeleted};
			}
		}
		if (req.method == "POST") {
			// Only Create VP Request, check vcid from Body
			// Check VC Permission insead of system
			combinedPermStatus = true;
			query.groupType = 'VC';						// search for VC permission to create a VP
			query.vcid = req.body && req.body.vcid
			query.deletedByParent = {$exists: false};		// do not allow to create a VP in a deleted VC
			acceptEmpty = false;
			query['permission.vc'] = { $bitsAnySet: constPermVC.View + constPermVC.CreateVP }
		}

		logger4js.debug("Query VGs %s", JSON.stringify(query));
		var queryVG = VisboGroup.find(query);
		queryVG.select('name permission vcid vpids')
		queryVG.exec(function (err, listVG) {
			if (err) {
				logger4js.fatal("VP Groups Get DB Connection \nVisboGroup.find(%s)\n%O", query, err);
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
					message: 'No Visbo Project or no Permission'
				});
			}

			if (combinedPermStatus) {
				// combined permission only applicable if it does not combine diffeent VCIDs
				var combinedPerm = {system: 0, vc: 0, vp: 0};
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
	var checkDeleted = req.query.deleted == true;

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
		query.deletedByParent = {$exists: checkDeleted};
	}
	logger4js.trace("Search VGs %O", query);

	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vpid')
	queryVG.exec(function (err, listVG) {
		if (err) {
			logger4js.fatal("VP Groups Get DB Connection \nVisboGroup.find(%s)\n%O", query, err);
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting VisboCenters',
				error: err
			});
		}
		logger4js.debug("Found VGs %d groups %O", listVG.length, listVG);
		// Convert the result to request
		req.permGroups = listVG;
		req.auditDescription = 'Visbo Project (Read)';
		req.auditSysAdmin = sysAdmin;
		if (listVG.length == 0) {
			// do not accept requests without a group assignement especially to System Group
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Project or no Permission'
			});
		}
		var checkDeletedVP = req.query.deleted == true;
		// check against the groups
		var combinedPerm = {system: 0, vc: 0, vp: 0};
		for (var i=0; i < req.permGroups.length; i++) {
			combinedPerm.system = combinedPerm.system | (req.permGroups[i].permission.system || 0);
			combinedPerm.vc = combinedPerm.vc | (req.permGroups[i].permission.vc || 0);
			combinedPerm.vp = combinedPerm.vp | (req.permGroups[i].permission.vp || 0);
		}
		logger4js.debug("Get %d groups combinedPerm %O", req.permGroups.length, combinedPerm);
		if (!sysAdmin) delete combinedPerm.system
		logger4js.debug("Get Visbo Project with id %s, %d Group(s) Perm %O", vpid, req.permGroups.length, combinedPerm);
		var query = {};
		query._id = vpid;
		query.deletedAt =  {$exists: checkDeletedVP};
		// prevent that the user gets access to VPs in a later deleted VC. Do not deliver groups from deleted VCs/VPs
		query['vc.deletedAt'] = {$exists: false}; // Do not deliver any VP from a deleted VC
		logger4js.trace("Get Visbo Project Query %O", query);
		var queryVP = VisboProject.findOne(query);
		// queryVP.select('name users updatedAt createdAt');
		queryVP.exec(function (err, oneVP) {
			if (err) {
				logger4js.fatal("VP Get with ID DB Connection \nVisboProject.findOne(%s)\n%O", query, err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Visbo Project',
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
			req.combinedPerm = combinedPerm;

			logger4js.debug("Found Visbo Project %s Access Permission %O", vpid, req.combinedPerm);
			return next();
		});
	});
}

module.exports = {
	getAllVPGroups: getAllVPGroups,
	getVpidGroups: getVpidGroups
};
