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
var VisboPermission = Const.VisboPermission;

// Generate the Groups where the user is member of and has VP Permission
function getAllVPVGroups(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	var baseUrl = req.url.split("?")[0];
	var startCalc = new Date();

	// get the VP Groups where the user is member of
	// handle sysadmin case
	logger4js.debug("Generate VPV Groups for user %s for url %s", req.decoded.email, req.url);
	var query = {};
	var specificVPID = undefined;
	var specificSystem = undefined;

	query = {'users.userId': userId};	// search for VP groups where user is member
	// independent of the delete Flag the VP (or the related groups) must be undeleted
	query.deletedByParent = {$exists: false};
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
		specificVPID = req.query.vpid;
	}

	// Permission check for GET & POST
	if (req.method == "GET") {
		if (req.query.sysadmin) {
			query.groupType = 'System';						// search for System Groups only
			specificSystem = true;
		} else {
			query.groupType = {$in: ['VC', 'VP']};				// search for VP and VC Groups only
		}
	} else if (req.method == "POST" && baseUrl == "/") {
		// Only Create VP Request, check vpid from Body
		if (!validate.validateObjectId(req.body.vpid, false)) {
			return res.status(400).send({
				state: 'failure',
				message: 'No Visbo Project ID defined'
			});
		}
		query.groupType = {$in: ['VC', 'VP']};				// search for VP and VC Groups only
		query.vpids = req.body.vpid;
		specificVPID = req.body.vpid;
	} else {
		query.groupType = {$in: ['VC', 'VP']};				// search for VP and VC Groups only
	}

	logger4js.debug("Query VGs %s", JSON.stringify(query));
	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid vpids groupType')
	queryVG.lean();
	queryVG.exec(function (err, listVG) {
		if (err) {
			errorHandler(err, res, `DB: VPV Group all find`, `Error getting Visbo Project Versions `)
			return;
		}
		logger4js.debug("Found VGs %d", listVG.length);
		// Convert the permission to request
		var listVPPerm = new VisboPermission();
		for (var i=0; i < listVG.length; i++) {
			// Check all VPIDs in Group
			var permGroup = listVG[i];
			req.oneVCID = permGroup.vcid;	// store VCID in case of POST VPV the same VCID is defined in every group
			if (permGroup.groupType == "System") {
				listVPPerm.addPerm(0, permGroup.permission)
			} else if (permGroup.vpids) {
				for (var j=0; j < permGroup.vpids.length; j++) {
          listVPPerm.addPerm(permGroup.vpids[j], permGroup.permission)
				}
			}
		}
		logger4js.trace("VPV Combined Perm List %s Len %s", JSON.stringify(listVPPerm), listVPPerm.length);
		req.listVPPerm = listVPPerm;

		logger4js.trace("Found VPGroups %s", JSON.stringify(listVG));
		if ( specificVPID) {
				if ((listVPPerm.getPerm(specificVPID).vp & constPermVP.View) == 0) {
					return res.status(403).send({
						state: 'failure',
						message: 'No Visbo Project or no Permission'
					});
				}
		} else if (specificSystem) {
			if ((listVPPerm.getPerm(0).vp & constPermVP.View) == 0 ) {
				// do not accept requests without a permission assignement to System Group
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Project or no Permission'
				});
			}
		}
		var endCalc = new Date();
		logger4js.debug("Calculate verifyVPV Perm All Groups %s ms", endCalc.getTime() - startCalc.getTime());
		return next();
	});
}

// Get the VPV for the specific vpvid
function getVPV(req, res, next, vpvid) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	var baseUrl = req.url.split("?")[0]
	var urlComponent = baseUrl.split("/")
	var sysAdmin = req.query.sysadmin ? true : false;
	var checkDeleted = req.query.deleted == true;
	var specificVPID = undefined;
	var specificSystem = undefined;
	var startCalc = new Date();

	if (!validate.validateObjectId(vpvid, false)) {
		logger4js.warn("VPV Bad Parameter vpvid %s", vpvid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Visbo Project Version'
		});
	}
	var query = {};
	query._id = vpvid;
	query.deletedAt = {$exists: checkDeleted};
	// Check sysadmin permission as vpid is unknown it could not be checked here
	if (req.query.sysadmin && (req.listVPPerm.getPerm(0) & constPermVP.View) == 0) {
		logger4js.info("No Permission to get VPV as sysadmin %s", query);
		return res.status(403).send({
			state: 'failure',
			message: 'No Visbo Project or no Permission'
		});
	} else {
		query.vpid = {$in: req.listVPPerm.getVPIDs(constPermVP.View)}
	}
	var queryVPV = VisboProjectVersion.findOne(query);

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
		var query = {};
		query._id = oneVPV.vpid;
		// prevent that the user gets access to Versions of Deleted VPs or Deleted VCs
		query.deletedAt =  {$exists: false};
		query['vc.deletedAt'] = {$exists: false}
		logger4js.trace("Get Visbo Project Query %O", query);
		var queryVP = VisboProject.findOne(query);
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

			logger4js.debug("Found Visbo Project %s Access", oneVPV.vpid);
			var endCalc = new Date();
			logger4js.debug("Calculate verifyVPV getVPV %s ms ", endCalc.getTime() - startCalc.getTime());
			if (urlComponent.length == 3 && (urlComponent[2] == "calc" || urlComponent[2] == "copy") ) {
				getVCOrganisation(oneVP.vcid, req, res, next);
			} else {
				return next();
			}
		});
	});
}

// Generate the Groups where the user is member of and has VP Permission
function getPortfolioVPs(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	var startCalc = new Date();
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
		query._id = req.query.vpfid;

		logger4js.debug("Query VPF %s", JSON.stringify(query));
		// get the Project List from VPF
		var queryVPF = VisboPortfolio.findOne(query);
		queryVPF.select('_id vpid variantName allItems')
		queryVPF.exec(function (err, oneVPF) {
			if (err) {
				errorHandler(err, res, `DB: listVPF find`, `Error getting Visbo Project Versions `)
				return;
			}
			if (!oneVPF) {
				// do not accept requests without an existing VPF ID
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Portfolio Project'
				});
			}
			if (!oneVPF.allItems) {
				return res.status(400).send({
					state: 'failure',
					message: 'No valid Portfolio'
				});
			}
			logger4js.debug("Found VPF with Projects %d", oneVPF.allItems.length);
			// check if VP of Portfolio list is in the list of projects, to verify that the user has permission to View the Portfolio
			if ((req.listVPPerm.getPerm(oneVPF.vpid).vp & constPermVP.View) == 0) {
				logger4js.info("No Access to Portfolio VPID", oneVPF.vpid);
				// do not accept requests without access to VPF ID
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Portfolio Project'
				});
			}
			// Add the Projects to a list, and filter on these projects later
			var listVP = [], listVPVariant = [];
			for (var i=0; i < oneVPF.allItems.length; i++) {
				listVP.push(oneVPF.allItems[i].vpid);
				listVPVariant.push({vpid: oneVPF.allItems[i].vpid, variantName: oneVPF.allItems[i].variantName});
			}
			req.listPortfolioVP = listVP;
			req.listPortfolioVPVariant = listVPVariant
			var endCalc = new Date();
			logger4js.debug("Calculate verifyVPV getPortfolioVPs %s ms", endCalc.getTime() - startCalc.getTime());
			return next();
		});
	} else {
		// not the baseUrl "/" do nothing
		return next();
	}
}

// Get the organisations for keyMetrics calculation
function getVCOrgs(req, res, next) {
	var baseUrl = req.url.split("?")[0]
	logger4js.debug("VPV getVCOrgs Information");
	// fetch the organization in case of POST VPV to calculate keyMetrics

	if (req.method != "POST" && baseUrl != '/') return next();

	if (!req.oneVCID) {
		logger4js.warn("No Visbo Center identified");
		return res.status(400).send({
			state: 'failure',
			message: 'No Visbo Center or Organization'
		});
	}
	getVCOrganisation(req.oneVCID, req, res, next);
}

function getVCOrganisation(vcid, req, res, next) {
	logger4js.debug("VPV getVCOrgs organization for VCID %s", vcid);
	var startCalc = new Date();
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
		var endCalc = new Date();
		logger4js.debug("Calculate verifyVPV getVCOrganisation %s ms", endCalc.getTime() - startCalc.getTime());
		return next();
	});
}

// Get the base line (pfv) for keyMetrics calculation
function getVPVpfv(req, res, next) {
	var startCalc = new Date();
	var baseUrl = req.url.split("?")[0];
	var vpid = req.body.vpid;
	var timestamp = req.body.timestamp;

	logger4js.trace("VPV getVPVpfv Information");
	// fetch the base line in case of POST VPV to calculate keyMetrics
	if (req.method != "POST" || baseUrl != '/' || req.body.variantName == 'pfv') {
		return next();
	}
	// check that vpid is present and is a valid ObjectID
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
		logger4js.debug("VPV getVPVpfv: Found a pfv Version %s ", pfvVPV && pfvVPV._id);
		req.visboPFV = pfvVPV;
		var endCalc = new Date();
		logger4js.debug("Calculate verifyVPV getVPVpfv %s ms", endCalc.getTime() - startCalc.getTime());
		return next();
	});
}

// Get the current base line (pfv) for keyMetrics calculation
function getCurrentVPVpfv(req, res, next) {
	var startCalc = new Date();
	var timestamp = req.method == "POST" ? req.body.timestamp : req.oneVPV.timestamp;
	timestamp = timestamp || new Date();

	if (!validate.validateDate(timestamp, false)) {
		logger4js.warn("Copy VPV mal formed timestamp %s", vpid, timestamp);
		return res.status(400).send({
			state: "failure",
			message: "Timestamp not recognised"
		})
	}
	logger4js.debug("VPV copyVPV pfv base line for VPID %s TimeStamp %s", req.oneVPV.vpid, timestamp);

	var queryvpv = {};
	queryvpv.deletedAt = {$exists: false};
	queryvpv.deletedByParent = {$exists: false}; // do not show any versions of deleted VPs
	queryvpv.timestamp =  {$lt: timestamp};
	queryvpv.vpid = req.oneVPV.vpid;
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
		logger4js.debug("VPV getVPVpfv: Found a pfv Version %s ", pfvVPV && pfvVPV._id);
		req.visboPFV = pfvVPV;
		var endCalc = new Date();
		logger4js.debug("Calculate verifyVPV getCurrentVPVpfv %s ms", endCalc.getTime() - startCalc.getTime());
		return next();
	});
}

module.exports = {
	getAllVPVGroups: getAllVPVGroups,
	getVPV: getVPV,
	getPortfolioVPs: getPortfolioVPs,
	getVCOrgs: getVCOrgs,
	getVPVpfv: getVPVpfv,
	getCurrentVPVpfv: getCurrentVPVpfv
};
