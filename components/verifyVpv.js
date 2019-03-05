var mongoose = require('mongoose');
var Const = require('../models/constants')
var constPermSystem = Const.constPermSystem
var constPermVC = Const.constPermVC
var constPermVP = Const.constPermVP

var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var VisboGroup = mongoose.model('VisboGroup');

var validate = require('./../components/validate');

var logModule = "VPV";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Generate the Groups where the user is member of and has VP Permission
function getAllVPVGroups(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	var baseUrl = req.url.split("?")[0]
	if (baseUrl == '/') {
		// get the VP Groups the user is member of
		// handle sysadmin case
		logger4js.debug("Generate VPV Groups for user %s for url %s", req.decoded.email, req.url);
		var query = {};
		var acceptEmpty = true;
		var combinedPermStatus = req.query.sysadmin == true; // deliver combined Permission if focus on one Object System VC or one VC
		query = {'users.userId': userId};	// search for VP groups where user is member
		// independent of the delete Flag the VP (or the related groups) must be undeleted
		query.deletedByParent = {$exists: false};
		// Permission check for GET & POST
		if (req.method == "GET") {
			if (req.query.sysadmin) {
				query.groupType = 'System';						// search for System Groups only
				query['permission.vp'] = { $bitsAllSet: constPermVP.View }
				acceptEmpty = false;
			} else {
				if (!validate.validateObjectId(req.query.vcid, true) || !validate.validateObjectId(req.query.vpid, true)) {
					logger4js.warn("VC Bad Query Parameter vcid %s vpid %s", req.query.vcid, req.query.vpid);
					return res.status(400).send({
						state: 'failure',
						message: 'No valid Parameter for Visbo Center / Visbo Project'
					});
				}
				if (req.query.vcid) {
					query.vcid = req.query.vcid;
				}
				if (req.query.vpid) {
					query.vpids = req.query.vpid;
					combinedPermStatus = true;
				}
				query.groupType = {$in: ['VC', 'VP']};				// search for VP Groups only
				query['permission.vp'] = { $bitsAllSet: constPermVP.View }
			}
		} else if (req.method == "POST") {
			// Only Create VP Request, check vpid from Body
			if (!validate.validateObjectId(req.body.vpid, false)) {
				return res.status(400).send({
					state: 'failure',
					message: 'No Visbo Project ID defined'
				});
			}
			combinedPermStatus = true;
			query.groupType = {$in: ['VC', 'VP']};				// search for VP Groups only
			query.vpids = req.body.vpid
			acceptEmpty = false;
			query['permission.vp'] = { $bitsAnySet: constPermVP.View + constPermVP.Modify + constPermVP.CreateVariant }
		}

		logger4js.debug("Query VGs %s", JSON.stringify(query));
		var queryVG = VisboGroup.find(query);
		queryVG.select('name permission vcid vpids')
		queryVG.exec(function (err, listVG) {
			if (err) {
				logger4js.fatal("VP Groups Get DB Connection \nVisboGroup.find(%s) %s", query, err.message);
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
function getVpvidGroups(req, res, next, vpvid) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	var baseUrl = req.url.split("?")[0]
	var urlComponent = baseUrl.split("/")
	var sysAdmin = req.query.sysadmin ? true : false;
	var checkDeleted = req.query.deleted == true;

	if (!validate.validateObjectId(vpvid, false)) {
		logger4js.fatal("VPV Bad Parameter vpvid %s", vpvid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Visbo Project Version'
		});
	}
	// get the VPV without checks to find the corresponding VP
	var queryVPV = VisboProjectVersion.findOne({_id: vpvid, deletedAt: {$exists: checkDeleted}});

	// queryVPV.select('_id vpid name timestamp Erloes startDate endDate status ampelStatus variantName deletedAt');
	queryVPV.exec(function (err, oneVPV) {
		if (err) {
			logger4js.fatal("VPV Get with ID DB Connection \nVisboProjectVersion.findOne() %s", err.message);
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting Visbo Project Versions',
				error: err
			});
		}
		if (!oneVPV) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Project or no Permission'
			});
		}
		req.oneVPV = oneVPV;

		// get the VP Groups of this VP if the user is member of
		// handle sysadmin case by getting the system groups
		logger4js.debug("Generate VPV Groups for vpid %s user %s for url %s sysAdmin %s", oneVPV.vpid, useremail, req.url, sysAdmin);
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
			query.vpids = oneVPV.vpid;
		}
		logger4js.trace("Search VGs %O", query);

		var queryVG = VisboGroup.find(query);
		queryVG.select('name permission vpid')
		queryVG.exec(function (err, listVG) {
			if (err) {
				logger4js.fatal("VP Groups Get DB Connection \nVisboGroup.find(%s) %s", query, err.message);
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
					message: 'No Visbo Project or no Permission'
				});
			}
			// check against the groups
			var combinedPerm = {system: 0, vc: 0, vp: 0};
			for (var i=0; i < req.permGroups.length; i++) {
				combinedPerm.system = combinedPerm.system | (req.permGroups[i].permission.system || 0);
				combinedPerm.vc = combinedPerm.vc | (req.permGroups[i].permission.vc || 0);
				combinedPerm.vp = combinedPerm.vp | (req.permGroups[i].permission.vp || 0);
			}
			logger4js.debug("Get %d groups combinedPerm %O", req.permGroups.length, combinedPerm);
			if (!sysAdmin) delete combinedPerm.system
			logger4js.debug("Get Visbo Project with id %s, %d Group(s) Perm %O", oneVPV.vpid, req.permGroups.length, combinedPerm);
			var query = {};
			query._id = oneVPV.vpid;
			// prevent that the user gets access to Versions of Deleted VPs or Deleted VCs
			query.deletedAt =  {$exists: false};
			query['vc.deletedAt'] = {$exists: false}
			logger4js.trace("Get Visbo Project Query %O", query);
			var queryVP = VisboProject.findOne(query);
			// queryVP.select('name users updatedAt createdAt');
			queryVP.exec(function (err, oneVP) {
				if (err) {
					logger4js.fatal("VP Get with ID DB Connection \nVisboProject.findOne(%s) %s", query, err.message);
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
				req.combinedPerm = combinedPerm;

				logger4js.debug("Found Visbo Project %s Access Permission %O", oneVPV.vpid, req.combinedPerm);
				return next();
			});
		});
	});
}

module.exports = {
	getAllVPVGroups: getAllVPVGroups,
	getVpvidGroups: getVpvidGroups
};
