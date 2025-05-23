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

/* The getAllGroups function retrieves all user-related groups from the VisboGroup collection,
   determining which VC (Visbo Center) groups a user belongs to. 
   It supports:
		System administrators (sysadmin) 	retrieving system-level groups.
		Regular users 						retrieving VC-specific groups.
		Filtering by vcid (VC ID) from query parameters, URL, or request body.
	Once retrieved, the permissions are aggregated into req.listVCPerm, and the request proceeds to the next middleware.
*/
/* Returns
		Calls next() after setting req.listVCPerm.
		Responds with HTTP 400 (Bad Request) 				if vcid is invalid.
		Responds with HTTP 500 (Internal Server Error) 		if database retrieval fails.
 */
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

/* The getVC function retrieves a specific VISBO Center (VC) from the database, 
   ensuring the user has the necessary permissions to access it. 
   If the request is from a system administrator, 
   it validates against system-level permissions.
*/
/* Returns
		Calls next() if the VC is found and permissions are valid.
		Responds with HTTP 400 (Bad Request) 				if vcid is invalid.
		Responds with HTTP 403 (Forbidden) 					if the user lacks permission.
		Responds with HTTP 500 (Internal Server Error) 		if a database error occurs.
 */
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

/* The checkSettingId function validates and retrieves a specific VC (Visbo Center) setting from the database. 
   It ensures that:
		The settingID is a valid ObjectId.
		A corresponding vcid (VC ID) exists in the request.
		The setting belongs to the current VC (vcid).
		If the setting is of type "organisation", it retrieves additional organisational settings.
		If the setting is found and valid, it is stored in req.oneVCSetting, and request processing continues (next()). Otherwise, an error response is sent. 
*/
/* Returns
	Calls next() if the setting is valid and found.
	Responds with HTTP 400 (Bad Request) 			if settingID or vcid is invalid.
	Responds with HTTP 403 (Forbidden) 				if the setting does not exist or access is not permitted.
	Responds with HTTP 500 (Internal Server Error) 	if a database error occurs. 
*/
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

/* The getVCSetting function retrieves VISBO Center (VC) settings from the database based on certain request conditions. 
   It:
		Extracts the vcid (VC ID) from the request.
		Determines whether settings should be fetched based on HTTP methods (GET, POST, PUT) or query parameters (keyMetrics=2).
		Queries the database for _VCConfig type settings.
	Stores the settings in req.listVCSetting and proceeds to the next middleware.
*/
/* Returns
		Calls next() after retrieving settings or if settings are not required.
		Logs database errors but does not send an error response (relies on errorHandler for logging). 
*/
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

/* The getVCSettingCustomization function retrieves customization settings for a specific VISBO Center (VC) based on certain conditions. 
   It:
		Checks if settings should be fetched, based on the request method (GET, POST, PUT) or query parameters (keyMetrics=2).
		Extracts the vcid (VC ID) from the request.
		Queries the database for customization settings (name: "customization", type: "customization").
	Stores the retrieved settings in req.listVCSetting and proceeds to the next middleware.
*/
/* Returns
		Calls next() after retrieving settings or if no settings need to be fetched.
		Logs database errors but does not send an error response (relies on errorHandler for logging). 
*/
function getVCSettingCustomization(req, res, next) {
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
		logger4js.trace('GET VC Settings Customization for VC %s and URL', vcid, req.url);
		var query = {};
		query.vcid = vcid;
		query.name = 'customization';
		query.type = 'customization';
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

/* The getVCVP function retrieves all projects (vpType = 0) for a given VISBO Center (VC). 
   It:
		Extracts vcid from req.oneVC (ensuring a VC exists).
		Queries the database for projects (vpType = 0, excluding deleted projects).
	Stores the retrieved projects in req.listVCVP and proceeds to the next middleware.
*/
/* Returns
		Calls next() after retrieving projects or if no VC is found.
		Stores retrieved projects in req.listVCVP.
		Responds with 500 Internal Server Error if a database error occurs. 
*/
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

/* The getVCAllVP function retrieves all projects (vpType = 0) for a specific VISBO Center (VC) while excluding deleted projects. 
		It:
		Extracts vcid from req.oneVC (ensuring a valid VC exists).
		Queries the database for projects (vpType = 0, excluding deleted projects).
		Stores the retrieved projects in req.listVCAllVP and proceeds to the next middleware. 
*/
/* Returns:
		Calls next() after retrieving projects or if no VC is found.
		Stores retrieved projects in req.listVCAllVP.
		Responds with 500 Internal Server Error if a database error occurs.
*/
function getVCAllVP(req, res, next) {
	var query = {};
	if (!req.oneVC) {
		return next();
	}
	query = {};
	query.vcid = req.oneVC._id;
	query.vpType = 0; // only projects no templates or portfolios
	query.deletedAt =  {$exists: false};
	var queryVP = VisboProject.find(query);
	//queryVP.select('_id, vpStatus');
	queryVP.lean();
	queryVP.exec(function (err, listVCAllVP) {
		if (err) {
			errorHandler(err, res, 'DB: Get all of VP of specific VC', 'Error getting VISBO Projects');
			return;
		}
		req.listVCAllVP = listVCAllVP;

		logger4js.debug('Found %d VISBO Center Projects', listVCAllVP.length);
		return next();
	});
}

// Generate the Groups where the user is member of System / VC depending on the case
/* The getSystemGroups function retrieves all system groups that a user belongs to. 
   It:
		Extracts the user's ID (userId) from req.decoded.
		Assigns systemVC to req.oneVC (ensuring the request is scoped to the system VISBO Center).
		Queries the database for system groups where the user is a member.
		If no system groups are found, denies access (403 Forbidden).
		Stores retrieved system groups in req.listVCPerm and proceeds to the next middleware.
*/
/* Returns
		Calls next() if the user has at least one system group.
		Stores retrieved system groups in req.listVCPerm.
		Responds with 403 Forbidden 				if the user is not in any system groups.
		Responds with 500 Internal Server Error 	if a database error occurs.
*/
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

/* The checkVCOrgs function is a middleware function for an Express.js application. 
   It intercepts incoming HTTP requests and determines whether they pertain to an organisation (organisation). 
   If necessary, it retrieves organisation data and its capacity information before allowing the request to proceed.
*/
/* 
   res (Object): 			The HTTP response object.
   next (Function): 		The callback function to proceed to the next middleware.
*/

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
/* The getVCOrgs function is an Express.js middleware designed to determine whether an incoming request requires fetching organisation-related data, 
   particularly when capacity or cost information is needed. 
   If necessary, it retrieves the Visbo Center (VC) organisation data with or without capacity information.
*/
function getVCOrgs(req, res, next) {
	var baseUrl = req.originalUrl.split('?')[0];
	var urlComponent = baseUrl.split('/');
	// fetch organisation in case of capacity  or cost info calculation

	let skip = true;
	let withCapa = false;
	if (urlComponent.findIndex(comp => (comp == 'capacity' || comp == 'capa' )) >= 0) {
		if ( req.oneVC ) {
			req.oneVCID = req.oneVC._id;
		} else if (req.oneVP) {
			req.oneVCID = req.oneVP.vcid;
		}
		skip = false;
		withCapa = true;
	}
	
	if (urlComponent.findIndex(comp => comp == 'organisation' || comp == 'timetracking' || comp == 'costtypes') >= 0) {
		skip = false;
		withCapa = (req.method == 'GET' && req.originalUrl.indexOf('withCapa=') >= 0);
	}
	if (skip) {
		return next();
	}

	let vcid = req.oneVC?._id || req.oneVCID;
	if (!vcid && req.oneVP) {
		vcid = req.oneVP.vcid;
	}
	if (!vcid) {
		logger4js.warn('No VISBO Center identified');
		return res.status(400).send({
			state: 'failure',
			message: 'No VISBO Center'
		});
	}
	getVCOrganisation(vcid, withCapa, req, res, next);
}

/* The getVCOrganisation function is responsible for retrieving organisation-related settings from a database based on the provided Visbo Center ID (vcid). 
   If required, it also retrieves capacity data for the organisation.
   It is typically called within middleware to attach retrieved organisation data to the request object (req), making it available for subsequent request handlers. 
*/
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
				return next();
			});
		} else {
			var endCalc = new Date();
			logger4js.debug('Calculate GetVCOrganisation %s ms', endCalc.getTime() - startCalc.getTime());
			return next();
		}
	});
}
/* The isVCEnabled function checks whether a Visbo Center (VC) feature or setting is enabled based on the provided name and level. 
   It searches for a matching setting in req.listVCSetting and determines the enabled status based on various logical conditions.
   This function is useful for feature toggles, permissions, or system configurations in a VC-based application. 
*/
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
	getVCAllVP: getVCAllVP,
	getSystemGroups: getSystemGroups,
	checkVCOrgs: checkVCOrgs,
	getVCOrgs: getVCOrgs,
	getVCOrganisation: getVCOrganisation,
	checkSettingId: checkSettingId,
	getVCSetting: getVCSetting,
	getVCSettingCustomization: getVCSettingCustomization,
	isVCEnabled: isVCEnabled
};
