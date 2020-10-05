var mongoose = require('mongoose');
var Const = require('../models/constants');
var constPermSystem = Const.constPermSystem;
var constPermVC = Const.constPermVC;

var systemVC = require('./../components/systemVC');

var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var VisboGroup = mongoose.model('VisboGroup');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var logModule = 'VC';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var VisboPermission = Const.VisboPermission;

// Generate the Groups where the user is member of System / VC depending on the case
function getAllGroups(req, res, next) {
	var userId = req.decoded._id;
	var baseUrl = req.url.split('?')[0];
	var urlComponent = baseUrl.split('/');
	var isSysAdmin = req.query.sysadmin ? true : false;
	var vcid = undefined;

	// get the VC Groups the user is member of
	// handle sysadmin and systemvc case
	logger4js.trace('Generate VC Groups for user %s for url %s', req.decoded.email, req.url);

	if (req.method == 'GET' && req.query.vcid) {
		vcid = req.query.vcid;
	} else if (req.method == 'POST' && req.body.vcid) {
		vcid = req.body.vcid;
	} else if (req.method == 'GET' && urlComponent.length == 3 && urlComponent[2] == 'capacity') {
		vcid = urlComponent[1];
	}
	if (!validate.validateObjectId(vcid, true)) {
		logger4js.warn('VC Get all Groups Bad Parameter vcid %s', vcid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid VISBO Center'
		});
	}

	var query = {};
	query = {'users.userId': userId};	// search for VC groups where user is member

	if (vcid) {
		query.vcid = vcid;
	}
	if (req.query.systemvc || isSysAdmin) {
		query.groupType = 'System';						// search for System Groups only
		// MS TODO: how to restrict for deleted?
		// query.deletedByParent = {$exists: checkDeleted};
	} else {
		query.groupType = 'VC';				// search for VC Groups only
		query.deletedByParent = {$exists: false};
	}

	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid groupType');
	queryVG.exec(function (err, listVG) {
		if (err) {
			errorHandler(err, res, 'DB: VC Groups get all', 'Error getting VISBO Centers');
			return;
		}
		logger4js.trace('Found VGs %d', listVG.length);
		var listVCPerm = new VisboPermission();
		for (var i=0; i < listVG.length; i++) {
			var permGroup = listVG[i];
			if (permGroup.groupType == 'System') {
				listVCPerm.addPerm(0, permGroup.permission);
			} else if (permGroup.groupType == 'VC') {
				listVCPerm.addPerm(permGroup.vcid, permGroup.permission);
			}
		}
		req.listVCPerm = listVCPerm;
		return next();
	});
}

// Get VC with vcid including View permission check and others depending on parameters
function getVC(req, res, next, vcid) {
	var isSysAdmin = req.query.sysadmin ? true : false;
	var checkDeleted = req.query.deleted == true;

	req.auditDescription = 'VISBO Center Read';
	req.auditSysAdmin = isSysAdmin;
	// get the VC Groups of this VC where the user is member of
	// handle sysadmin case by getting the system groups
	logger4js.debug('Generate VC Groups for vcid %s user %s for url %s isSysAdmin %s', vcid, req.decoded.email, req.url, isSysAdmin);
	var query = {};
	if (!validate.validateObjectId(vcid, false)) {
		logger4js.warn('VC Groups Bad Parameter vcid %s', vcid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid VISBO Center'
		});
	}
	if ((isSysAdmin && (req.listVCPerm.getPerm(0).system & constPermSystem.View) == 0)
	|| (!isSysAdmin && (req.listVCPerm.getPerm(vcid).vc & constPermVC.View) == 0)) {
		// do not accept requests without a group assignement
		return res.status(403).send({
			state: 'failure',
			message: 'No valid VISBO Center or no Permission'
		});
	}

	query = {};
	query._id = vcid;
	query.deletedAt =  {$exists: checkDeleted};
	var queryVC = VisboCenter.findOne(query);
	// queryVC.select('name users updatedAt createdAt');
	queryVC.exec(function (err, oneVC) {
		if (err) {
			errorHandler(err, res, 'DB: VC Groups get specific VC', 'Error getting VISBO Center');
			return;
		}
		if (!oneVC) {
			return res.status(403).send({
				state: 'failure',
				message: 'No valid VISBO Center or no Permission'
			});
		}
		req.oneVC = oneVC;

		logger4js.debug('Found VISBO Center %s Access Permission %O', vcid, req.listVCPerm.getPerm(isSysAdmin ? 0 : vcid));
		return next();
	});
}

function getVCVP(req, res, next) {
	var query = {};
	if (!req.oneVC) {
		return next();
	}
	query = {};
	query.vcid = req.oneVC._id;
	query.vpType = 0; // only projects no templates or portfolios
	query.deletedAt =  {$exists: false};
	var queryVP = VisboProject.find(query);
	queryVP.select('_id, name');
	queryVP.lean();
	queryVP.exec(function (err, listVCVP) {
		if (err) {
			errorHandler(err, res, 'DB: Get VP of specific VC', 'Error getting VISBO Projects');
			return;
		}
		req.listVCVP = listVCVP;

		logger4js.debug('Found %d VISBO Center Projects', listVCVP.length);
		return next();
	});
}

// Generate the Groups where the user is member of System / VC depending on the case
function getSystemGroups(req, res, next) {
	var userId = req.decoded._id;
	req.oneVC = systemVC.getSystemVC();

	// get the System Groups the user is member of
	logger4js.trace('Generate System Groups for user %s for url %s', req.decoded.email, req.url);
	var query = {};

	query = {'users.userId': userId};	// search for VC groups where user is member
	query.groupType = 'System';						// search for System Groups only

	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid groupType');
	queryVG.exec(function (err, listVG) {
		if (err) {
			errorHandler(err, res, 'DB: System Groups get all', 'Error getting VISBO Centers');
			return;
		}
		logger4js.trace('Found VGs %d', listVG.length);
		if (listVG.length == 0) {
			// do not accept requests without a group assignement especially to System Group
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Access System Admin'
			});
		}
		var listVCPerm = new VisboPermission();
		listVG.forEach(function(item) { listVCPerm.addPerm(0, item.permission); });
		req.listVCPerm = listVCPerm;
		return next();
	});
}

module.exports = {
	// verifyVc: verifyVc,
	getAllGroups: getAllGroups,
	getVC: getVC,
	getVCVP: getVCVP,
	getSystemGroups: getSystemGroups
};
