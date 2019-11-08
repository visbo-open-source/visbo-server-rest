var mongoose = require('mongoose');
var Const = require('../models/constants')
var constPermSystem = Const.constPermSystem
var constPermVC = Const.constPermVC
var constPermVP = Const.constPermVP

var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var VisboGroup = mongoose.model('VisboGroup');
var VisboPortfolio = mongoose.model('VisboPortfolio');
var VCSetting = mongoose.model('VCSetting');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var logModule = "VPV";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Generate the Groups where the user is member of and has VP Permission
function getAllVPVGroups(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
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
		queryVG.lean();
		queryVG.exec(function (err, listVG) {
			if (err) {
				errorHandler(err, res, `DB: VPV Group all find`, `Error getting Visbo Project Versions `)
				return;
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
	var baseUrl = req.url.split("?")[0]
	var urlComponent = baseUrl.split("/")
	var sysAdmin = req.query.sysadmin ? true : false;
	var checkDeleted = req.query.deleted == true;

	if (!validate.validateObjectId(vpvid, false)) {
		logger4js.warn("VPV Bad Parameter vpvid %s", vpvid);
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
			errorHandler(err, res, `DB: VPV specific find`, `Error getting Visbo Project Version `)
			return;
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
		queryVG.select('name permission vcid vpid')
		queryVG.lean();
		queryVG.exec(function (err, listVG) {
			if (err) {
				logger4js.warn("VP Groups Get DB Connection VisboGroup.find(%s) %s", query, err.message);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenters',
					error: err
				});
			}
			logger4js.trace("Found VGs %d groups %O", listVG.length, listVG);
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
					errorHandler(err, res, `DB: GET VP specific from VPV find`, `Error getting Visbo Project Version `)
					return;
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

// Generate the Groups where the user is member of and has VP Permission
function getPortfolioVPs(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	var baseUrl = req.url.split("?")[0]
	if (baseUrl == '/' && req.method == "GET" && req.query.vpfid) {
		// get the VP List of a VPF
		logger4js.debug("Generate Project List of Portfolio for user %s for url %s", req.decoded.email, req.url);
		if (!validate.validateObjectId(req.query.vpfid, false)) {
			logger4js.warn("VC Bad Query Parameter vpfid %s ", req.query.vpfid);
			return res.status(400).send({
				state: 'failure',
				message: 'No valid Parameter for Visbo Portfolio Version'
			});
		}

		var query = {};
		var acceptEmpty = true;
		query._id = req.query.vpfid;

		logger4js.debug("Query VPF %s", JSON.stringify(query));
		// get the Project List from VPF
		var queryVPF = VisboPortfolio.find(query);
		queryVPF.select('_id vpid variantName allItems')
		queryVPF.exec(function (err, listVPF) {
			if (err) {
				errorHandler(err, res, `DB: listVPF find`, `Error getting Visbo Project Versions `)
				return;
			}
			if (listVPF.length == 0) {
				// do not accept requests without an existing VPF ID
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Portfolio Project'
				});
			}
			if (!listVPF[0].allItems) {
				return res.status(400).send({
					state: 'failure',
					message: 'No valid Portfolio'
				});
			}
			logger4js.debug("Found VPF with Projects %d", listVPF[0].allItems.length);
			// check if VP of Portfolio list is in the list of projects, to verify that the user has permission to View the Portfolio
			var vpid = listVPF[0].vpid;
			var found = false;
			for (var i=0; i < req.permGroups.length; i++) {
				logger4js.debug("Check Group %s", req.permGroups[i].name);
				for (var j=0; j < req.permGroups[i].vpids.length; j++) {
					logger4js.debug("Find VPID %s vs %s", vpid, req.permGroups[i].vpids[j]);
					if (vpid.toString() == req.permGroups[i].vpids[j].toString()) {
						logger4js.debug("Found VPID %s", req.permGroups[i].vpids[j]);
						found = true;
						break;
					}
				}
			}
			if (!found) {
				logger4js.info("No Access to Portfolio VPID", vpid);
				// do not accept requests without an existing VPF ID
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Portfolio Project'
				});
			}
			// MS TODO: Add the Projects to a list, and filter on these projects later
			var listVP = [], listVPVariant = [];
			for (var i=0; i<listVPF[0].allItems.length; i++) {
				listVP.push(listVPF[0].allItems[i].vpid);
				listVPVariant.push({vpid: listVPF[0].allItems[i].vpid, variantName: listVPF[0].allItems[i].variantName});
			}
			req.listPortfolioVP = listVP;
			req.listPortfolioVPVariant = listVPVariant
			return next();
		});
	} else {
		// not the baseUrl "/" do nothing
		return next();
	}
}

// Get the organisations for this VPV for Cost calculation
function getVpvidOrgs(req, res, next, vpvid) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	var baseUrl = req.url.split("?")[0]
	var urlComponent = baseUrl.split("/")
	var sysAdmin = req.query.sysadmin ? true : false;
	var checkDeleted = req.query.deleted == true;
	var calcCost = req.query.calcCost == true;
	var vcid = undefined;

	logger4js.debug("VPV getVpvidOrgs Middleware for %s calc %s", vpvid, calcCost);
	// do not calculate if not requested by GET (calcCost)
	if (!(req.method == "GET" && calcCost)) return next();

	if (!req.oneVPV || !req.permGroups) {
		logger4js.warn("VPV not available for cost calculation %s", vpvid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Visbo Project Version'
		});
	}
	for (var i = 0; i < req.permGroups.length; i++) {
		if (req.permGroups[i].vcid) {
			vcid = req.permGroups[i].vcid;
			break;
		}
	}
	if (!vcid) {
		logger4js.warn("VCID not available for VPV cost calculation %s", vpvid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Visbo Center'
		});
	}
	logger4js.debug("VPV calcCost VPV EXISTS VCID %s", vcid);
	var query = {};
	query.vcid = vcid;
	query.name = 'organisation';
	query.type = 'organisation';

	logger4js.debug("calcCost: Find VC Settings with query %O", query);
	var queryVCSetting = VCSetting.find(query);
	// do not get the big capa array, to reduce load, it is not nnecessary to get in case of cost calculation
	queryVCSetting.select('-value.allRoles.kapazitaet');
	queryVCSetting.sort('type name userId -timestamp')
	queryVCSetting.lean();
	queryVCSetting.exec(function (err, listVCSetting) {
		if (err) {
			errorHandler(err, res, `DB: GET VC Settings ${req.oneVC._id} Find`, `Error getting Setting for VisboCenter ${req.oneVC.name}`)
			return;
		}
		req.visboOrganisations = listVCSetting;
		for (var i = 0; i < listVCSetting.length; i++) {
			logger4js.debug("calcCost: Organisation(%d) found: id: %s, name %s, type %s vcid: %s", i, listVCSetting[i]._id, listVCSetting[i].name, listVCSetting[i].type, listVCSetting[i].vcid);
		}
		return next();
	});
}

// Get the organisations for keyMetrics calculation
function getVCOrgs(req, res, next) {
	var baseUrl = req.url.split("?")[0]
	var vcid = undefined;

	logger4js.debug("VPV getVCOrgs Information");
	// fetch the organization in case of POST VPV to calculate keyMetrics
	if (!(req.method == "POST" && baseUrl == '/' )) return next();

	if (!req.permGroups) {
		logger4js.warn("No Permission Group available");
		return res.status(403).send({
			state: 'failure',
			message: 'No Permission to Create Project Version'
		});
	}
	for (var i = 0; i < req.permGroups.length; i++) {
		if (req.permGroups[i].vcid) {
			vcid = req.permGroups[i].vcid;
			break;
		}
	}
	if (!vcid) {
		logger4js.warn("VCID not available for VPV");
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Visbo Center'
		});
	}
	logger4js.debug("VPV getVCOrgs organization for VCID %s", vcid);
	var query = {};
	query.vcid = vcid;
	query.name = 'organisation';
	query.type = 'organisation';

	logger4js.debug("getVCOrgs: Find VC Settings with query %O", query);
	var queryVCSetting = VCSetting.find(query);
	// do not get the big capa array, to reduce load, it is not nnecessary to get in case of keyMetrics calculation
	queryVCSetting.select('-value.allRoles.kapazitaet');
	queryVCSetting.sort('type name userId -timestamp')
	queryVCSetting.lean();
	queryVCSetting.exec(function (err, listVCSetting) {
		if (err) {
			errorHandler(err, res, `DB: GET VC Settings ${req.oneVC._id} Find`, `Error getting Setting for VisboCenter ${req.oneVC.name}`)
			return;
		}
		req.visboOrganisations = listVCSetting;
		for (var i = 0; i < listVCSetting.length; i++) {
			logger4js.debug("getVCOrgs: Organisations(%d) found: id: %s, name %s, type %s vcid: %s", i, listVCSetting[i]._id, listVCSetting[i].name, listVCSetting[i].type, listVCSetting[i].vcid);
		}
		return next();
	});
}

// Get the base line (pfv) for keyMetrics calculation
function getVPVpfv(req, res, next) {
	var baseUrl = req.url.split("?")[0]
	var vpid = req.body.vpid;
	var timestamp = req.body.timestamp;

	logger4js.trace("VPV getVPVpfv Information");
	// fetch the base line in case of POST VPV to calculate keyMetrics
	if (!(req.method == "POST" && baseUrl == '/' )) return next();

	// MS TODO: check that vpid is present and is a valid ObjectID
	if (!validate.validateObjectId(vpid, false)
	|| !validate.validateDate(timestamp, true)) {
		logger4js.warn("Get VPV mal formed or missing vpid %s or timestamp %s", vpid, timestamp);
		return res.status(400).send({
			state: "failure",
			message: "Visbo Project ID missing"
		})
	}
	if (!timestamp) {
		timestamp = new Date();
	}
	logger4js.debug("VPV getVPVpfv base line for VPID %s TimeStamp %s", vpid, timestamp);

	var queryvpv = {};
	queryvpv.deletedAt = {$exists: false};
	queryvpv.deletedByParent = {$exists: false}; // do not show any versions of deleted VPs
	queryvpv.timestamp =  {$lt: timestamp};
	queryvpv.vpid = vpid;
	queryvpv.variantName = 'pfv';

	var queryVPV = VisboProjectVersion.findOne(queryvpv);
	queryVPV.sort('vpid variantName -timestamp');
	// queryVPV.select('_id vpid variantName timestamp');
	queryVPV.lean();
	queryVPV.exec(function (err, pfvVPV) {
		if (err) {
			errorHandler(err, res, `DB: GET VPV pfv`, `Error getting Visbo Project Versions `)
			return;
		};
		logger4js.debug("VPV getVPVpfv: Found a pfv Version? %s ", pfvVPV && pfvVPV._id);
		req.visboPFV = pfvVPV;
		return next();
	});
}

module.exports = {
	getAllVPVGroups: getAllVPVGroups,
	getVpvidGroups: getVpvidGroups,
	getPortfolioVPs: getPortfolioVPs,
	getVpvidOrgs: getVpvidOrgs,
	getVCOrgs: getVCOrgs,
	getVPVpfv: getVPVpfv
};
