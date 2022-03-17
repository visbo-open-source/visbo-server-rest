var mongoose = require('mongoose');
var ConstPerm = require('../models/constPerm');
var constPermSystem = ConstPerm.constPermSystem;
var constPermVC = ConstPerm.constPermVC;

var systemVC = require('./../components/systemVC');

var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var VisboGroup = mongoose.model('VisboGroup');
var VCSetting = mongoose.model('VCSetting');
var VCCapacity = mongoose.model('VCCapacity');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var logModule = 'VC';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var VisboPermission = ConstPerm.VisboPermission;

// Generate the Groups where the user is member of System / VC depending on the case
function getAllGroups(req, res, next) {
	var userId = req.decoded._id;
	var baseUrl = req.url.split('?')[0];
	var urlComponent = baseUrl.split('/');
	var isSysAdmin = req.query.sysadmin ? true : false;
	var vcid = undefined;

	// get the VC Groups the user is member of
	// handle sysadmin and systemvc case
	logger4js.debug('Generate VC Groups for user %s for url %s', req.decoded.email, req.url);

	if (req.method == 'GET' && req.query.vcid) {
		vcid = req.query.vcid;
	} else if (urlComponent.length >= 2) {
		vcid = urlComponent[1];
	} else if (req.method == 'POST' && req.body.vcid) {
		vcid = req.body.vcid;
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

	if (!isSysAdmin && vcid) {
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
	queryVG.lean();
	queryVG.exec(function (err, listVG) {
		if (err) {
			errorHandler(err, res, 'DB: VC Groups get all', 'Error getting VISBO Centers');
			return;
		}
		logger4js.debug('Found VGs %d', listVG.length);
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
	logger4js.debug('Find VC for vcid %s user %s for url %s isSysAdmin %s', vcid, req.decoded.email, req.url, isSysAdmin);
	var query = {};
	if (!validate.validateObjectId(vcid, false)) {
		logger4js.warn('getVC Bad Parameter vcid %s', vcid);
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

function checkSettingId(req, res, next, settingID) {
	logger4js.debug('Check settingID %s for url %s ', settingID, req.url);
	if (!validate.validateObjectId(settingID, false)) {
		logger4js.warn('settingID Bad Parameter %s', settingID);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Setting'
		});
	}
	var query = {};
	var vcid;
	if (req.oneVC) vcid = req.oneVC._id;
	if (!vcid) {
		logger4js.warn('No vcid found for settingID', settingID);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid VISBO Center'
		});
	}
	query._id = settingID;
	query.vcid = vcid;
	logger4js.trace('Search VC Settings %O', query);

	var queryVCSetting = VCSetting.findOne(query);
	queryVCSetting.exec(function (err, oneVCSetting) {
		if (err) {
			errorHandler(err, res, 'DB: Setting Find', 'Error getting Settings ');
			return;
		}
		logger4js.trace('Found Settings %s', oneVCSetting != undefined);
		// Convert the result to request
		if (!oneVCSetting) {
			logger4js.warn('SettingId %s for VC %s not found', settingID, vcid);
			// do not accept requests without a group assignement especially to System Group
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Setting'
			});
		}
		req.oneVCSetting = oneVCSetting;
		if (oneVCSetting.type == 'organisation') {
			// get also the other organisations to verify that only newest can be deleted
			getVCOrganisation(vcid, false, req, res, next);
		} else {
			return next();
		}
	});
}

function getVCSetting(req, res, next) {
	var checkSetting = false;
	if (req.method == 'GET' && req.url.indexOf('keyMetrics=2') >= 0) {
		checkSetting = true;
	} else if (req.method == 'POST') {
		checkSetting = true;
	} else if (req.method == 'PUT') {
		checkSetting = true;
	}
	var vcid;
	if (req.oneVP) {
		vcid = req.oneVP.vcid;
	} else if (req.oneVC)  {
		vcid = req.oneVC._id;
	} else if (req.query.vcid) {
		vcid = req.query.vcid;
	}
	if (checkSetting && vcid) {
		logger4js.trace('GET VC Settings for VC %s and URL', vcid, req.url);
		var query = {};
		query.vcid = vcid;
		query.type = '_VCConfig';
		var queryVCSetting = VCSetting.find(query);
		queryVCSetting.exec(function (err, listVCSetting) {
			if (err) {
				errorHandler(err, undefined, 'DB: Get VC Setting Select ', undefined);
			}
			logger4js.debug('Setting for VC %s Length %d', vcid, listVCSetting ? listVCSetting.length : undefined);
			req.listVCSetting = listVCSetting;
			return next();
		});
	} else {
		return next();
	}
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

function checkVCOrgs(req, res, next) {
	logger4js.trace('Check if we need Orga');
	var baseUrl = req.originalUrl.split('?')[0];
	var urlComponent = baseUrl.split('/');

	if (!req.oneVC) {
		logger4js.debug('No VC Defined');
		return next();
	}
	// MS TODO: Add additional check to include PUT if required
	if ((req.method == 'POST')
	&& urlComponent.length == 4 && urlComponent[3] == 'setting') {
		// User does a POST of a setting, check if it is an organisation
		if (req.body.type == 'organisation') {
			logger4js.debug('Check old Organisation without Capacity');
			getVCOrganisation(req.oneVC._id, false, req, res, next);
		} else {
			logger4js.debug('No POST Setting', req.method, 'urlComponent', urlComponent);
			return next();
		}
	} else if (req.method == 'GET') {
		var withCapa = false;
		if (urlComponent.length == 4 && urlComponent[3] == 'setting'
		&& req.originalUrl.indexOf('type=organisation') >= 0) {
			withCapa = true;
		}
		if (urlComponent.length == 4 && urlComponent[3] == 'organisation'
		&& req.originalUrl.indexOf('withCapa=') >= 0) {
			withCapa = true;
		}
		if (withCapa) {
			logger4js.debug('Get Organisation with Capacity');
			getVCOrganisation(req.oneVC._id, true, req, res, next);
		} else {
			logger4js.debug('No GET Setting of organisation', req.method, 'urlComponent', urlComponent);
			return next();
		}
	} else {
		logger4js.debug('Other Request', req.method, 'urlComponent', urlComponent);
		return next();
	}
}

// Get the organisations for calculation
function getVCOrgs(req, res, next) {
	var baseUrl = req.originalUrl.split('?')[0];
	var urlComponent = baseUrl.split('/');
	// fetch the organization in case of POST VPV to calculate keyMetrics
	// or in case of capacity calculation

	let skip = true;
	let withCapa = false;
	if ((req.method == 'POST' && baseUrl == '/vpv') || req.method == 'PUT') {
		skip = false;
	}
	if (urlComponent.findIndex(comp => (comp == 'capacity' || comp == 'capa')) >= 0) {
		if ( req.oneVC ) {
			req.oneVCID = req.oneVC._id;
		} else if (req.oneVP) {
			req.oneVCID = req.oneVP.vcid;
		}
		skip = false;
		withCapa = true;
	}
	if (urlComponent.findIndex(comp => comp == 'organisation') >= 0) {
		skip = false;
		withCapa = (req.method == 'GET' && req.originalUrl.indexOf('withCapa=') >= 0);
	}
	if (skip) {
		return next();
	}

	let vcid = req.oneVC?._id || req.oneVCID;
	logger4js.warn('VPV getVCOrgs organization for VCID %s with capa %s', vcid, withCapa);
	if (!vcid) {
		logger4js.warn('No VISBO Center identified');
		return res.status(400).send({
			state: 'failure',
			message: 'No VISBO Center'
		});
	}
	getVCOrganisation(vcid, withCapa, req, res, next);
}

function getVCOrganisation(vcid, withCapa, req, res, next) {
	logger4js.debug('VPV getVCOrgs organization for VCID %s', vcid);
	var startCalc = new Date();
	var query = {};
	query.vcid = vcid;
	query.type = 'organisation';

	logger4js.debug('getVCOrgs: Find VC Settings with query %O', query);
	var queryVCSetting = VCSetting.find(query);
	queryVCSetting.lean();
	queryVCSetting.exec(function (err, listVCSetting) {
		if (err) {
			errorHandler(err, res, `DB: GET VC Settings ${req.oneVC._id} Find`, `Error getting Setting for VISBO Center ${req.oneVC.name}`);
			return;
		}
		logger4js.debug('getVCOrgs: Organisations(%d) found in vcid: %s', listVCSetting.length, vcid);
		listVCSetting.sort(function(a, b) { return validate.compareDate(b.timestamp, a.timestamp); });
		req.visboOrganisation = listVCSetting;
		logger4js.warn('getVCOrganisation for VCID %s orga %d', vcid, req.visboOrganisation?.length);
		if (withCapa) {
			var query = {};
			query.vcid = vcid;
			var queryVCCapacity = VCCapacity.find(query);
			queryVCCapacity.sort('vcid roleID startOfYear');
			queryVCCapacity.lean();
			queryVCCapacity.exec(function (err, listVCCapacity) {
				if (err) {
					errorHandler(err, res, `DB: GET VC Capacity ${req.oneVC._id} Find`, `Error getting Capacity for VISBO Center ${req.oneVC.name}`);
					return;
				}
				logger4js.debug('GetVCOrgs: Capacities(%d) found in vcid: %s', listVCCapacity.length, vcid);
				req.visboVCCapacity = listVCCapacity;
				var endCalc = new Date();
				logger4js.debug('Calculate GetVCOrganisation %s ms', endCalc.getTime() - startCalc.getTime());
				logger4js.warn('getVCOrganisation Capa for VCID %s capa %d', vcid, req.visboVCCapacity?.length);
				return next();
			});
		} else {
			var endCalc = new Date();
			logger4js.debug('Calculate GetVCOrganisation %s ms', endCalc.getTime() - startCalc.getTime());
			return next();
		}
	});
}

function isVCEnabled(req, name, level) {
	var setting;
	var result = false;
	if (req.listVCSetting) {
		setting = req.listVCSetting.find(item => item.name == name);
		if (setting && setting.value) {
			if (level == 0) {
				result = setting.value.systemEnabled;
			} else if (level == 1) {
				result = setting.value.systemLimit ? setting.value.systemEnabled : setting.value.sysVCEnabled;
			} else if (level == 2) {
				result = setting.value.systemLimit ? setting.value.systemEnabled : setting.value.sysVCEnabled;
				if (!setting.value.systemLimit && !setting.value.sysVCLimit && setting.value.VCEnabled != undefined) {
					result = setting.value.VCEnabled != false;
				}
			}
		}
	}
	return result;
}

module.exports = {
	getAllGroups: getAllGroups,
	getVC: getVC,
	getVCVP: getVCVP,
	getSystemGroups: getSystemGroups,
	checkVCOrgs: checkVCOrgs,
	getVCOrgs: getVCOrgs,
	getVCOrganisation: getVCOrganisation,
	checkSettingId: checkSettingId,
	getVCSetting: getVCSetting,
	isVCEnabled: isVCEnabled
};
