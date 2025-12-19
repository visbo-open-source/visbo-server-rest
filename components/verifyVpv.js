var mongoose = require('mongoose');
var ConstPerm = require('../models/constPerm');
var constPermVP = ConstPerm.constPermVP;
var constPermVC = ConstPerm.constPermVC;

var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var VisboGroup = mongoose.model('VisboGroup');
var VisboPortfolio = mongoose.model('VisboPortfolio');

var verifyVc = require('./../components/verifyVc');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var logModule = 'VPV';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var VisboPermission = ConstPerm.VisboPermission;

// Calculate the oneVP if a vpid is specified
/* The getOneVP function is an Express.js middleware that retrieves a single Visbo Project (VP) based on the request method and parameters. 
   It identifies the vpid (VP ID) from either the query parameters (GET requests) or request body (POST requests) 
   and then queries the database to retrieve the corresponding VP. 
   If found, it attaches the retrieved project to req.oneVP for further processing.
*/
function getOneVP(req, res, next) {
	var baseUrl = req.url.split('?')[0];

	// get the VP that is specified in the URL
	logger4js.debug('Generate oneVP for user %s for url %s', req.decoded.email, req.url);
	var skip = true;
	var vpid;
	if (req.method == 'GET' && baseUrl == '/' && validate.validateObjectId(req.query.vpid, false)) {
		skip = false;
		vpid = req.query.vpid;
	} else if (req.method == 'POST' && baseUrl == '/') {
		skip = false;
		vpid = req.body.vpid;
	} else if (req.method == 'POST' && req.oneVPV) {
		skip = false;
		vpid = req.oneVPV.vpid;
	}
	if (skip) {
		return next();
	}

	var query = {};
	query._id = vpid;
	var queryVP = VisboProject.findOne(query);
	// queryVP.select('name users updatedAt createdAt');
	queryVP.exec(function (err, oneVP) {
		if (err) {
			errorHandler(err, res, 'DB: VPV Group Get VP', 'Error getting Project Version');
			return;
		}
		req.oneVP = oneVP;

		logger4js.debug('Found Project %s', req.query.vpid);
		return next();
	});
}

// Generate the Groups where the user is member of and has VP Permission
/* The getAllVPVGroups function is an Express.js middleware that retrieves Visbo Project Version (VPV) groups for the authenticated user. 
   It ensures that the user is a member of at least one VP group and checks permissions for accessing specific projects (vpid) or system-level permissions (sysadmin).

   The function constructs a query based on request parameters (e.g., vcid, vpid, sysadmin) 
   and fetches the relevant groups from the VisboGroup collection. 
   The retrieved groups are then processed into a permission list (req.listVPPerm) for further middleware execution.
*/
function getAllVPVGroups(req, res, next) {
	var userId = req.decoded._id;
	var baseUrl = req.url.split('?')[0];
	var startCalc = new Date();

	// get the VP Groups where the user is member of
	// handle sysadmin case
	logger4js.debug('Generate VPV Groups for user %s for url %s', req.decoded.email, req.url);
	var query = {};
	var specificVPID = undefined;
	var specificSystem = undefined;
	var checkPerm = constPermVP.View;

	query = {'users.userId': userId};	// search for VP groups where user is member
	// independent of the delete Flag the VP (or the related groups) must be undeleted
	query.deletedByParent = {$exists: false};
	if (!validate.validateObjectId(req.query.vcid, true) || !validate.validateObjectId(req.query.vpid, true)) {
		logger4js.info('VC Bad Query Parameter vcid %s vpid %s', req.query.vcid, req.query.vpid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Parameter for VISBO Center / Project'
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
	if (req.method == 'GET') {
		if (req.query.sysadmin) {
			query.groupType = 'System';						 	// search for System Groups only
			specificSystem = true;
		} else {
			checkPerm = checkPerm | constPermVP.ViewRestricted;
			query.groupType = {$in: ['VC', 'VP']};				// search for VP and VC Groups only
		}
	} else if (req.method == 'POST' && baseUrl == '/') {
		// Only Create VP Request, check vpid from Body
		if (!validate.validateObjectId(req.body.vpid, false)) {
			return res.status(400).send({
				state: 'failure',
				message: 'No valid Project ID defined'
			});
		}
		query.groupType = {$in: ['VC', 'VP']};					// search for VP and VC Groups only
		query.vpids = req.body.vpid;
		specificVPID = req.body.vpid;
	} else {
		query.groupType = {$in: ['VC', 'VP']};					// search for VP and VC Groups only
	}

	logger4js.debug('Query VGs %s', JSON.stringify(query));
	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid vpids groupType');
	queryVG.lean();
	queryVG.exec(function (err, listVG) {
		if (err) {
			errorHandler(err, res, 'DB: VPV Group all find', 'Error getting Project Versions ');
			return;
		}
		logger4js.debug('Found VGs %d', listVG.length);
		// Convert the permission to request
		var listVPPerm = new VisboPermission();
		for (var i=0; i < listVG.length; i++) {
			// Check all VPIDs in Group
			var permGroup = listVG[i];
			req.oneVCID = permGroup.vcid;	// store VCID in case of POST VPV the same VCID is defined in every group
			if (permGroup.groupType == 'System') {
				listVPPerm.addPerm(0, permGroup.permission);
			} else if (permGroup.vpids) {
				for (var j=0; j < permGroup.vpids.length; j++) {
          listVPPerm.addPerm(permGroup.vpids[j], permGroup.permission, permGroup._id);
				}
			}
		}
		logger4js.trace('VPV Combined Perm List %s Len %s', JSON.stringify(listVPPerm), listVPPerm.length);
		req.listVPPerm = listVPPerm;

		logger4js.trace('Found VPGroups %s', JSON.stringify(listVG));
		if ( specificVPID) {
				if ((listVPPerm.getPerm(specificVPID).vp & checkPerm) == 0) {
					return res.status(403).send({
						state: 'failure',
						message: 'No valid Project or no Permission'
					});
				}
		} else if (specificSystem) {
			if ((listVPPerm.getPerm(0).vp & constPermVP.View) == 0 ) {
				// do not accept requests without a permission assignement to System Group
				return res.status(403).send({
					state: 'failure',
					message: 'No valid Project or no Permission'
				});
			}
		}
		var endCalc = new Date();
		logger4js.debug('Calculate getAllVPVGroups Perm All Groups %s ms', endCalc.getTime() - startCalc.getTime());
		return next();
	});
}

// Add the VC Groups to check Permission for Organisation
/* The getVCGroups function is an Express.js middleware that retrieves Visbo Center (VC) groups for an authenticated user 
   when querying specific cost-related or capacity-related endpoints. It ensures that the user has view permissions for the corresponding VC before proceeding.

   The function:
		- Extracts the vcid (Visbo Center ID) from req.oneVP.
		- Checks if the user already has global VC view permission.
		- Queries the database to fetch VC groups for local permissions.
		- Validates permissions and restricts access if necessary. 
*/
function getVCGroups(req, res, next) {
	var userId = req.decoded._id;
	var baseUrl = req.url.split('?')[0];
	var urlComponent = baseUrl.split('/');
	var startCalc = new Date();

	if (req.method !== 'GET' || urlComponent.findIndex(comp => comp == 'cost' || comp == 'capacity'|| comp == 'costtypes') < 0) {
		return next();
	}
	logger4js.debug('Generate VC Groups for user %s for url %s', req.decoded.email, req.url);
	var query = {};
	var checkPerm = constPermVC.View;

	query = {'users.userId': userId};	// search for VC groups where user is member
	query.deletedByParent = {$exists: false};
	logger4js.debug('Search for VC Groups vcid %s vpid %s', req.oneVP.vcid, req.oneVP._id);

	if ((req.listVPPerm.getPerm(req.oneVP._id).vc & checkPerm) > 0) {
		// user has already view permission by a global VC Group for this project
		return next();
	}
	query.vcid = req.oneVP.vcid;
	query.global = false;										// check only local VC Groups
	query.groupType = {$in: ['VC']};				// search for VC Groups only the other we have already

	logger4js.debug('Query VGs %s', JSON.stringify(query));
	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid vpids groupType');
	queryVG.lean();
	queryVG.exec(function (err, listVG) {
		if (err) {
			errorHandler(err, res, 'DB: VC Group all find', 'Error getting VISBO Center Groups ');
			return;
		}
		logger4js.debug('Found VGs %d', listVG.length);
		// Convert the permission to request
		var listVCPerm = new VisboPermission();
		for (var i=0; i < listVG.length; i++) {
			// Check all VPIDs in Group
			var permGroup = listVG[i];
			if (permGroup.groupType == 'VC') {
				listVCPerm.addPerm(permGroup.vcid, permGroup.permission);
			}
		}
		logger4js.trace('VPV Combined Perm List %s Len %s', JSON.stringify(listVCPerm), listVCPerm.length);
		req.listVCPerm = listVCPerm;

		if ((req.listVCPerm.getPerm(req.oneVP.vcid).vc & checkPerm) == 0) {
			// user does not have View Permission for the VC
			logger4js.debug('Can not access the organisation beacause of missing VC View Perm', req.oneVP.vcid);
			return res.status(403).send({
				state: 'failure',
				message: 'No access to Organization'
			});
		}
		var endCalc = new Date();
		logger4js.debug('Calculate getVCGroups Perm All Groups %s ms', endCalc.getTime() - startCalc.getTime());
		return next();
	});
}


// Get the VPV for the specific vpvid
/* The getVPV function is an Express.js middleware that retrieves a specific Visbo Project Version (VPV) based on the provided vpvid. 
   It ensures that:
		- The vpvid is valid.
		- The user has permission to access the requested VPV.
		- The associated Visbo Project (VP) and Visbo Center (VC) are not deleted.
		- Permissions for system administrators (sysadmin) are enforced.
   Once the VPV is retrieved, it is attached to req.oneVPV. 
   If the URL specifies keyMetrics, cost, capacity, or costtypes, the function fetches additional organization details using 
   verifyVc.getVCOrganisation().
*/
function getVPV(req, res, next, vpvid) {
	var baseUrl = req.url.split('?')[0];
	var urlComponent = baseUrl.split('/');
	var sysAdmin = req.query.sysadmin ? true : false;
	var checkDeleted = req.query.deleted == true;
	var startCalc = new Date();

	if (!validate.validateObjectId(vpvid, false)) {
		logger4js.info('VPV Bad Parameter vpvid %s', vpvid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Project Version'
		});
	}
	var query = {};
	query._id = vpvid;
	query.deletedAt = {$exists: checkDeleted};
	// Check sysadmin permission as vpid is unknown it could not be checked here
	if (sysAdmin && (req.listVPPerm.getPerm(0) & constPermVP.View) == 0) {
		logger4js.info('No Permission to get VPV as sysadmin %s', query);
		return res.status(403).send({
			state: 'failure',
			message: 'No valid Project or no Permission'
		});
	} else {
		var vpList = req.listVPPerm.getVPIDs(constPermVP.View, true);
		// if a vpvid was specified we have the short VPV already and can check the vpid access direct
		if (req.oneVPV) {
			if (vpList.findIndex(item => item.toString() == req.oneVPV.vpid.toString()) < 0) {
				return res.status(403).send({
					state: 'failure',
					message: 'No valid Project Version or no Permission'
				});
			}
		} else {
			query.vpid = {$in: vpList};
		}
	}
	var queryVPV = VisboProjectVersion.findOne(query);

	// we dont need it to save back to DB
	if (req.method == 'GET') {
		queryVPV.lean();
	} else if (req.method == 'DELETE') {
		// we don't need the full VPV for DELETE
		queryVPV.select('-hierarchy -AllPhases');
	}
	queryVPV.exec(function (err, oneVPV) {
		if (err) {
			errorHandler(err, res, 'DB: VPV specific find', 'Error getting Project Version ');
			return;
		}
		if (!oneVPV) {
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Project Version or no Permission'
			});
		}
		req.oneVPV = oneVPV;
		var endCalc = new Date();
		logger4js.debug('Calculate getVPV %s ms ', endCalc.getTime() - startCalc.getTime());

		var query = {};
		query._id = oneVPV.vpid;
		// prevent that the user gets access to Versions of Deleted VPs or Deleted VCs
		query.deletedAt =  {$exists: false};
		query['vc.deletedAt'] = {$exists: false};
		logger4js.trace('Get Project Query %O', query);
		var queryVP = VisboProject.findOne(query);
		queryVP.lean();
		queryVP.exec(function (err, oneVP) {
			if (err) {
				errorHandler(err, res, 'DB: GET VP specific from VPV find', 'Error getting Project Version ');
				return;
			}
			if (!oneVP) {
				return res.status(403).send({
					state: 'failure',
					message: 'No valid Project Version or no Permission'
				});
			}
			if ((req.listVPPerm.getPerm(oneVPV.vpid).vp & constPermVP.View) == 0 && oneVPV.variantName != '') {
				// View Restricted but variantName not ""
				return res.status(403).send({
					state: 'failure',
					message: 'No valid Project Version or no Permission'
				});
			}
			req.oneVP = oneVP;

			logger4js.debug('Found Project %s Access', oneVPV.vpid);
			var endCalc = new Date();
			logger4js.debug('Calculate getVPV with VP %s ms ', endCalc.getTime() - startCalc.getTime());
			if (urlComponent.length == 3 && (urlComponent[2] == 'keyMetrics' || urlComponent[2] == 'cost' || urlComponent[2] == 'copy' || urlComponent[2] == 'capacity'|| urlComponent[2] == 'costtypes') ) {
				var withCapa = urlComponent[2] == 'capacity';
				verifyVc.getVCOrganisation(oneVP.vcid, withCapa, req, res, next);
			} else {
				return next();
			}
		});
	});
}


// Get the organisations for calculation

/* The getVPVOrgs function is an Express.js middleware that retrieves the organization (VC) associated with a Visbo Project Version (VPV). 
   It executes only for POST or PUT requests targeting vpv, ensuring that key metrics can be calculated.

   If the VC (vcid) cannot be identified, 		the function returns a HTTP 400 Bad Request error. 
   Otherwise, 									it calls verifyVc.getVCOrganisation() to fetch the VC organization details.
*/
function getVPVOrgs(req, res, next) {
	var baseUrl = req.originalUrl.split('?')[0];
	var urlComponent = baseUrl.split('/');
	// fetch the organization in case of POST/PUT VPV to calculate keyMetrics

	let skip = true;
	if (urlComponent[1] == 'vpv' && (req.method == 'POST' || req.method == 'PUT')) {
		skip = false;
	}
	if (skip) {
		return next();
	}

	let vcid = req.oneVP?.vcid;
	if (!vcid) {
		logger4js.warn('No VISBO Center identified');
		return res.status(400).send({
			state: 'failure',
			message: 'No VISBO Center'
		});
	}
	verifyVc.getVCOrganisation(vcid, false, req, res, next);
}

// Generate the Portfolio List of VPs and the List of VPs including the Variant
/* The getPortfolioVPs function is an Express.js middleware that retrieves the list of Visbo Projects (VPs) associated with a Visbo Portfolio (VPF).
   It ensures that:
		- The request targets valid portfolio-related routes (/vpv or /vp/:vpid/...).
		- The provided vpfid (Portfolio ID) is valid.
		- The user has permission to access the portfolio.
		- The portfolio contains valid projects.
   Once the VPs are retrieved, they are attached to req.listPortfolioVP (a list of project IDs) and req.listPortfolioVPVariant (a list of project IDs with variant names).
*/
function getPortfolioVPs(req, res, next) {
	var startCalc = new Date();
	var baseUrl = req.originalUrl.split('?')[0];
	var urlComponent = baseUrl.split('/');
	var vpfid = undefined;

	if (baseUrl == '/vpv' && req.method == 'GET' && req.query.vpfid) {
		vpfid = req.query.vpfid;
	} else if (req.method == 'GET' && urlComponent.length == 6 && urlComponent[1] == 'vp' && (urlComponent[5] == 'capacity' || urlComponent[5] == 'costtypes')) {
		vpfid = urlComponent[4];
	}
	if (!vpfid) {
		return next();
	}
	// get the VP List of a VPF
	logger4js.debug('Generate Project List of Portfolio for user %s for url %s', req.decoded.email, req.url);
	if (!validate.validateObjectId(vpfid, false)) {
		logger4js.info('VC Bad Query Parameter vpfid %s ', vpfid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Parameter for Portfolio Version'
		});
	}

	var query = {};
	query._id = vpfid;

	logger4js.debug('Query VPF %s', JSON.stringify(query));
	// get the Project List from VPF
	var queryVPF = VisboPortfolio.findOne(query);
	queryVPF.select('_id vpid variantName allItems');
	queryVPF.lean();
	queryVPF.exec(function (err, oneVPF) {
		if (err) {
			errorHandler(err, res, 'DB: listVPF find', 'Error getting Project Versions ');
			return;
		}
		if (!oneVPF) {
			// do not accept requests without an existing VPF ID
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Portfolio Project'
			});
		}
		if (!oneVPF.allItems) {
			return res.status(400).send({
				state: 'failure',
				message: 'No valid Portfolio'
			});
		}
		logger4js.debug('Found VPF with Projects %d', oneVPF.allItems.length);
		// check if VP of Portfolio list is in the list of projects, to verify that the user has permission to View the Portfolio
		if ((req.listVPPerm.getPerm(oneVPF.vpid).vp & constPermVP.View) == 0) {
			logger4js.info('No Access to Portfolio VPID', oneVPF.vpid);
			// do not accept requests without access to VPF ID
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Portfolio Project'
			});
		}
		// Add the Projects to a list, and filter on these projects later
		var listVP = [], listVPVariant = [];
		for (var i=0; i < oneVPF.allItems.length; i++) {
			listVP.push(oneVPF.allItems[i].vpid.toString());
			listVPVariant.push({vpid: oneVPF.allItems[i].vpid.toString(), variantName: oneVPF.allItems[i].variantName});
		}
		req.listPortfolioVP = listVP;
		req.listPortfolioVPVariant = listVPVariant;
		var endCalc = new Date();
		logger4js.debug('Calculate getPortfolioVPs %s ms', endCalc.getTime() - startCalc.getTime());
		return next();
	});
}

// Get the base line (pfv) for keyMetrics calculation
/* The getVPVpfv function is an Express.js middleware that retrieves the "pfv" (Portfolio Forecast Version) of a Visbo Project Version (VPV). 
   This function is executed only during POST requests when creating a new VPV to fetch a baseline version (pfv) for key metric calculations.

   It ensures that:
		- The request is a POST request and does not include "pfv" as a variant name.
		- The vpid (Visbo Project ID) is valid.
		- A valid timestamp (timestamp) is provided (or uses the current time).
		- The most recent pfv version is retrieved from the database.
If a matching baseline version (pfvVPV) exists, it is attached to req.visboPFV for further processing.
*/
function getVPVpfv(req, res, next) {
	var startCalc = new Date();
	var baseUrl = req.url.split('?')[0];

	logger4js.trace('VPV getVPVpfv Information');
	// fetch the base line in case of POST VPV to calculate keyMetrics
	if (req.method != 'POST' || baseUrl != '/') {
		return next();
	}

	var body = req.body || {};
	if (body.variantName == 'pfv') {
		return next();
	}
	var vpid = body.vpid;
	var timestamp = body.timestamp;
	// check that vpid is present and is a valid ObjectID
	if (!validate.validateObjectId(vpid, false)
	|| !validate.validateDate(timestamp, true)) {
		logger4js.info('Get VPV mal formed or missing vpid %s or timestamp %s', vpid, timestamp);
		return res.status(400).send({
			state: 'failure',
			message: 'Project ID missing'
		});
	}
	if (!timestamp) {
		timestamp = new Date();
	}
	logger4js.debug('VPV getVPVpfv base line for VPID %s TimeStamp %s', vpid, timestamp);

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
			errorHandler(err, res, 'DB: GET VPV pfv', 'Error getting Project Versions ');
			return;
		}
		logger4js.debug('VPV getVPVpfv: Found a pfv Version %s ', pfvVPV && pfvVPV._id);
		req.visboPFV = pfvVPV;
		var endCalc = new Date();
		logger4js.debug('Calculate getVPVpfv %s ms', endCalc.getTime() - startCalc.getTime());
		return next();
	});
}


/* The getVPVwoPerm function is an Express.js middleware that retrieves a Visbo Project Version (VPV) without checking user permissions. 
   This function is designed to fetch basic metadata about a specific VPV before performing further permission checks or additional processing.

   Key Features
		- Extracts vpvid (Project Version ID) from the URL.
		- Validates vpvid to ensure it's a valid ObjectID.
		- Queries the database to fetch the corresponding VPV.
		- Attaches the retrieved VPV to req.oneVPV for later use.
		- Sets req.query.vpid if it's not already provided (to speed up permission checks). 
*/
function getVPVwoPerm(req, res, next) {
	var baseUrl = req.url.split('?')[0];
	var urlComponent = baseUrl.split('/');

	logger4js.trace('GET getVPVwoPerm baseUrl', baseUrl, urlComponent);
	var vpvid = urlComponent.length >= 2 ? urlComponent[1] : undefined;
	if (!vpvid) {
		return next();
	}
	if (!validate.validateObjectId(vpvid, true)) {
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Project Version ID:' + vpvid
		});
	}
	logger4js.trace('GET getVPVwoPerm vpvid', vpvid);
	var queryvpv = {};
	queryvpv.deletedAt = {$exists: false};
	queryvpv.deletedByParent = {$exists: false};
	queryvpv._id = vpvid;
	var queryVPV = VisboProjectVersion.find(queryvpv);
	queryVPV.select('_id vpid variantName timestamp');
	queryVPV.lean();
	queryVPV.exec(function (err, listVPV) {
		if (err) {
			errorHandler(err, res, 'DB: GET VPV during getVPVwoPerm', 'Error getting Project Versions ');
			return;
		}
		logger4js.debug('VPV getVPVwoPerm: Found VPVs %s ', listVPV && listVPV.length);
		// set the vpid if not set before to speed up the query for permissions
		if (!req.query.vpid && listVPV[0]) {
			req.query.vpid = listVPV[0].vpid;
		}
		req.oneVPV = listVPV[0];
		return next();
	});
}


/* The getAllVPVsShort function is an Express.js middleware that retrieves all short versions of a Visbo Project Version (VPV) when performing a DELETE or PUT request. 
   This function ensures data consistency by fetching all versions of a Visbo Project (VP) before modifying or deleting a specific VPV.

   Key Features
		- Executes only for DELETE or PUT requests.
		- Retrieves all VP versions (VPVs) related to req.oneVPV.vpid (if available).
		- Ensures deleted versions are excluded from the query.
		- Attaches the retrieved VPVs to req.visboAllVPVs for further processing.
 */
function getAllVPVsShort(req, res, next) {
	if (req.method == 'DELETE' || req.method == 'PUT') {
		logger4js.trace('GET AllVPVsShort');
		// get all versions of VP short to check consistency
		if (req.oneVPV && req.oneVPV.vpid) {
			var queryvpv = {};
			queryvpv.deletedAt = {$exists: false};
			queryvpv.deletedByParent = {$exists: false};
			queryvpv.vpid = req.oneVPV.vpid;
			var queryVPV = VisboProjectVersion.find(queryvpv);
			queryVPV.sort('-timestamp');
			queryVPV.select('_id vpid variantName timestamp');
			queryVPV.lean();
			queryVPV.exec(function (err, listVPV) {
				if (err) {
					errorHandler(err, res, 'DB: GET VPV during Delete/Undelete', 'Error getting Project Versions ');
					return;
				}
				logger4js.debug('VPV getAllVPVsShort: Found VPVs %s ', listVPV && listVPV.length);
				req.visboAllVPVs = listVPV;
				return next();
			});
		} else {
			return next();
		}
	} else {
		return next();
	}
}

// Get the current base line (pfv) for keyMetrics calculation
/* The getCurrentVPVpfv function is an Express.js middleware that retrieves the "pfv" (Portfolio Forecast Version) of a Visbo Project Version (VPV). 
   This function is executed when an authorized user requests the latest "pfv" version of a VPV before a given timestamp.

   Key Features
		- Extracts timestamp from the request body (POST) or req.oneVPV.timestamp.
		- Validates the timestamp to ensure it is correctly formatted.
		- Checks if the user has View permissions for the Visbo Project (VP).
		- Fetches the latest pfv version before the given timestamp.
		- Attaches the retrieved pfv version to req.visboPFV for further processing. 
*/
function getCurrentVPVpfv(req, res, next) {
	var startCalc = new Date();
	var timestamp = req.method == 'POST' ? req.body.timestamp : req.oneVPV.timestamp;
	timestamp = timestamp || new Date();

	if (!validate.validateDate(timestamp, false)) {
		logger4js.info('GET VPF for VPV mal formed timestamp %s', timestamp);
		return res.status(400).send({
			state: 'failure',
			message: 'Timestamp not recognised'
		});
	}
	if ((req.listVPPerm.getPerm(req.oneVP._id).vp & constPermVP.View) == 0) {
		// only restricted View
		return next();
	}
	logger4js.debug('GET VPF for VPV for VPID %s TimeStamp %s', req.oneVPV.vpid, timestamp);

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
			errorHandler(err, res, 'DB: GET VPV pfv', 'Error getting Project Versions ');
			return;
		}
		logger4js.debug('VPV getVPVpfv: Found a pfv Version %s ', pfvVPV && pfvVPV._id);
		req.visboPFV = pfvVPV;
		var endCalc = new Date();
		logger4js.debug('Calculate getCurrentVPVpfv %s ms', endCalc.getTime() - startCalc.getTime());
		return next();
	});
}

// Get vpvs of the Portfolio Version related to refDate for capacity calculation
/* The getVPFVPVs function is an Express.js middleware that retrieves Visbo Project Versions (VPVs) associated with a Virtual Portfolio (VPF). 
   It ensures that:
		- The user has permission to view the project versions.
		- The latest versions of VPVs are retrieved up to a specified reference date (refDate).
		- If filtering by portfolio (req.listPortfolioVPVariant) is enabled, only VPVs belonging to the portfolio are considered.
		- The most recent unique VPVs per project variant are selected.
   The retrieved filtered VPVs are stored in req.listVPV for further processing. 
*/
function getVPFVPVs(req, res, next) {
	var userId = req.decoded._id;

	logger4js.info('Get Project Versions of VPF for user %s ', userId);
	var queryvpv = {};
	var queryvpvids = {};
	var nowDate = new Date();

	if ((req.query.refDate && !validate.validateDate(req.query.refDate))) {
		logger4js.info('Get VC Capacity/Costtypes mal formed query parameter %O ', req.query);
		return res.status(400).send({
			state: 'failure',
			message: 'Bad Content in Query Parameters'
		});
	}
	queryvpv.deletedAt = {$exists: false};
	queryvpv.deletedByParent = {$exists: false}; // do not show any versions of deleted VPs
	// collect the VPIDs where the user has View permission to
	var vpidList = [];
	var requiredPerm = constPermVP.View;
	vpidList = req.listVPPerm.getVPIDs(requiredPerm);

	if (req.query.refDate){
		var refDate = new Date(req.query.refDate);
		queryvpv.timestamp =  {$lt: refDate};
	} else if (!req.query.refDate) {
		queryvpv.timestamp = {$lt: nowDate};
	}
	queryvpv.vpid = {$in: vpidList};

	logger4js.debug('VPV query string %s', JSON.stringify(queryvpv));
	var timeMongoStart = new Date();
	var queryVPV = VisboProjectVersion.find(queryvpv);
	queryVPV.sort('vpid variantName -timestamp');
	queryVPV.select('_id vpid variantName timestamp');
	queryVPV.lean();
	queryVPV.exec(function (err, listVPV) {
		if (err) {
			errorHandler(err, res, 'DB: GET VC Calc getVPFVPVs', 'Error getting VISBO Project Versions ');
			return;
		}
		var timeMongoEnd = new Date();
		logger4js.debug('Found %d Project Versions in %s ms ', listVPV.length, timeMongoEnd.getTime()-timeMongoStart.getTime());
		// if latestonly, reduce the list and deliver only the latest version of each project and variant
		var vpvidsList = [];
		if (req.listPortfolioVPVariant) {
			// filter versions not part of portfolio
			logger4js.debug('Splice short Versions not belonging to Portfolio List %d \n%O', req.listPortfolioVPVariant.length, req.listPortfolioVPVariant);
			var filterVPV = [];
			for (let i = 0; i < listVPV.length; i++){
				//check if vpid & variant are member of portfolio
				logger4js.trace('check: Index %d :%s: Variant :%s: ', i, listVPV[i].vpid, listVPV[i].variantName);
				var itemSearch = {vpid: listVPV[i].vpid, variantName: listVPV[i].variantName};
				if (req.listPortfolioVPVariant.find(findVPVariantList, itemSearch)) {
					logger4js.debug('found: Index %d :%s: Variant :%s: ', i, listVPV[i].vpid, listVPV[i].variantName);
					filterVPV.push(listVPV[i]);
				}
			}
			listVPV = filterVPV;
		}

		// MS TODO: Check if the element 0 should be pushed might be it does not belong to the list because of variantName
		if (listVPV.length > 0) {
			vpvidsList.push(listVPV[0]._id);
		}
		for (let i = 1; i < listVPV.length; i++){
			//compare current item with previous and ignore if it is the same vpid & variantname
			logger4js.trace('compare: Index %d :%s: vs. :%s: Variant :%s: vs. :%s: TS %s vs. %s', i, listVPV[i].vpid, listVPV[i-1].vpid, listVPV[i].variantName, listVPV[i-1].variantName, listVPV[i].timestamp, listVPV[i-1].timestamp);
			if (listVPV[i].vpid.toString() != listVPV[i-1].vpid.toString()
				|| listVPV[i].variantName != listVPV[i-1].variantName
			) {
				vpvidsList.push(listVPV[i]._id);
				logger4js.trace('compare unequal: Index %d VPIDs equal %s timestamp %s %s ', i, listVPV[i].vpid != listVPV[i-1].vpid, listVPV[i].timestamp, listVPV[i-1].timestamp);
			}
		}
		logger4js.debug('Found %d Project Version IDs', vpvidsList.length);

		queryvpvids._id = {$in: vpvidsList};
		var queryVPV = VisboProjectVersion.find(queryvpvids);
		req.auditTTLMode = 1;	// Capacity/CostInformation Calculation of VISBO Project Versions

		queryVPV.lean();
		queryVPV.exec(function (err, listVPV) {
			if (err) {
				errorHandler(err, res, 'DB: GET VC Capacity/CostInformation Calc Find Full', 'Error getting VISBO Project Versions ');
				return;
			}
			req.auditInfo = listVPV.length;
			req.listVPV = listVPV;
			logger4js.debug('Found %d Project Version for Portfolio Calculation ', vpvidsList.length);
			return next();
		});
	});
}

// Get pfv-vpvs of the Portfolio Version related to refDate for capacity/costInformation calculation
/* The getVPFPFVs function is an Express.js middleware that retrieves Portfolio Forecast Versions (pfv) of Visbo Project Versions (VPV) for a given Visbo Portfolio (VPF). 
   It ensures that:
		- The request includes a pfv parameter to trigger Portfolio Forecast Version calculations.
		- The reference date (refDate) is valid if provided.
		- Only projects the user has permission to view are included.
		- Only projects belonging to the requested portfolio are included.
		- The most recent unique pfv VPVs per project variant are selected.
   The retrieved filtered Portfolio Forecast VPVs are stored in req.listVPVPFV for further processing. 
*/
function getVPFPFVs(req, res, next) {
	var userId = req.decoded._id;

	logger4js.info('Get Project pfv-Versions of VPF for user %s with query params %O ', userId, req.query);
	var queryvpv = {};
	var queryvpvids = {};
	var nowDate = new Date();

	if (!req.query.pfv) {
		logger4js.debug('No PFV Calculation ');
		return next();
	}
	if ((req.query.refDate && !validate.validateDate(req.query.refDate))) {
		logger4js.info('Get VPF Capacity mal formed query parameter %O ', req.query);
		return res.status(400).send({
			state: 'failure',
			message: 'Bad Content in Query Parameters'
		});
	}
	queryvpv.deletedAt = {$exists: false};
	queryvpv.deletedByParent = {$exists: false}; // do not show any versions of deleted VPs

	var vpCondition = [];
	vpCondition.push({'vpid': {$in: req.listVPPerm.getVPIDs(constPermVP.View)}});	// View Permission to the Project
	vpCondition.push({'vpid': {$in: req.listPortfolioVP}});		// Project of the Portfolio
	queryvpv['$and'] = vpCondition;

	queryvpv.variantName = 'pfv';
	if (req.query.refDate){
		var refDate = new Date(req.query.refDate);
		queryvpv.timestamp =  {$lt: refDate};
	} else if (!req.query.refDate) {
		queryvpv.timestamp = {$lt: nowDate};
	}

	logger4js.trace('VPV query string %s', JSON.stringify(queryvpv));
	var timeMongoStart = new Date();
	var queryVPV = VisboProjectVersion.find(queryvpv);
	queryVPV.sort('vpid variantName -timestamp');
	queryVPV.select('_id vpid variantName timestamp');
	queryVPV.lean();
	queryVPV.exec(function (err, listVPV) {
		if (err) {
			errorHandler(err, res, 'DB: GET VC Calc getVPFPFVs Find', 'Error getting VISBO Project Versions ');
			return;
		}
		var timeMongoEnd = new Date();
		logger4js.debug('Found %d Project Versions in %s ms ', listVPV.length, timeMongoEnd.getTime()-timeMongoStart.getTime());
		// if latestonly, reduce the list and deliver only the latest version of each project and variant
		var vpvidsList = [];

		if (listVPV.length > 0) {
			vpvidsList.push(listVPV[0]._id);
		}
		for (let i = 1; i < listVPV.length; i++){
			//compare current item with previous and ignore if it is the same vpid & variantname
			logger4js.trace('compare: Index %d :%s: vs. :%s: Variant :%s: vs. :%s: TS %s vs. %s', i, listVPV[i].vpid, listVPV[i-1].vpid, listVPV[i].variantName, listVPV[i-1].variantName, listVPV[i].timestamp, listVPV[i-1].timestamp);
			if (listVPV[i].vpid.toString() != listVPV[i-1].vpid.toString()
				|| listVPV[i].variantName != listVPV[i-1].variantName
			) {
				vpvidsList.push(listVPV[i]._id);
				logger4js.trace('compare unequal: Index %d VPIDs equal %s timestamp %s %s ', i, listVPV[i].vpid != listVPV[i-1].vpid, listVPV[i].timestamp, listVPV[i-1].timestamp);
			}
		}
		logger4js.debug('Found %d Project Version IDs', vpvidsList.length);

		queryvpvids._id = {$in: vpvidsList};
		var queryVPV = VisboProjectVersion.find(queryvpvids);

		queryVPV.lean();
		queryVPV.exec(function (err, listVPV) {
			if (err) {
				errorHandler(err, res, 'DB: GET VC Capacity Calc Find Full', 'Error getting VISBO Project Versions ');
				return;
			}
			req.listVPVPFV = listVPV;
			logger4js.debug('Found %d Project PFV-Version for Calculation ', vpvidsList.length);
			return next();
		});
	});
}

// find a project in an array of a structured projects (name, id)
var findVPVariantList = function(arrayItem) {
		// console.log('compare %s %s result %s', JSON.stringify(arrayItem), JSON.stringify(this), arrayItem.vpid.toString() == this.vpid.toString() && arrayItem.variantName == this.variantName);
		return arrayItem.vpid.toString() == this.vpid.toString() && arrayItem.variantName == this.variantName;
};

// Get vpvs of the VC related to refDate for capacity calculation
/* The getVCVPVs function is an Express.js middleware that retrieves Visbo Project Versions (VPVs) associated with a Visbo Company (VC). 
   This function ensures that:
		- The reference date (refDate) is valid if provided.
		- Only projects the user has permission to view are included.
		- Only projects belonging to the requested VC (req.listVCVP) are considered.
		- Both standard ('') and Portfolio Forecast Versions ('pfv') are retrieved.
		- The most recent unique VPVs per project variant are selected.
  The retrieved filtered VPVs are stored in req.listVPV (for standard VPVs) and req.listVPVPFV (for pfv versions) for further processing. 
*/
function getVCVPVs(req, res, next) {
	var userId = req.decoded._id;

	logger4js.info('Get Project Versions of VC for user %s with query params %O ', userId, req.query);
	var queryvpv = {};
	var queryvpvids = {};
	var nowDate = new Date();
	var vcvpids = [];

	if ((req.query.refDate && !validate.validateDate(req.query.refDate))) {
		logger4js.info('Get VC Capacity mal formed query parameter %O ', req.query);
		return res.status(400).send({
			state: 'failure',
			message: 'Bad Content in Query Parameters'
		});
	}
	if (req.listVCVP) {
		req.listVCVP.forEach(function(item) { vcvpids.push(item._id); });
	}
	queryvpv.deletedAt = {$exists: false};
	queryvpv.deletedByParent = {$exists: false}; // do not show any versions of deleted VPs
	// collect the VPIDs where the user has View permission to
	var vpidList = [];
	var requiredPerm = constPermVP.View;
	vpidList = req.listVPPerm.getVPIDs(requiredPerm);

	if (req.query.refDate && Date.parse(req.query.refDate)){
		var refDate = new Date(req.query.refDate);
		queryvpv.timestamp =  {$lt: refDate};
	} else if (!req.query.refDate) {
		queryvpv.timestamp = {$lt: nowDate};
	}
	queryvpv.variantName = {$in: ['', 'pfv']};
	vpidList = vpidList.filter(vpid => vcvpids.findIndex(item => item.toString() == vpid.toString()) >= 0);
	queryvpv.vpid = {$in: vpidList};

	logger4js.trace('VPV query string %s', JSON.stringify(queryvpv));
	var timeMongoStart = new Date();
	var queryVPV = VisboProjectVersion.find(queryvpv);
	queryVPV.sort('vpid variantName -timestamp');
	queryVPV.select('_id vpid variantName timestamp');
	queryVPV.lean();
	queryVPV.exec(function (err, listVPV) {
		if (err) {
			errorHandler(err, res, 'DB: GET VC Calc getVCVPVs Find', 'Error getting VISBO Project Versions:');
			return;
		}
		var timeMongoEnd = new Date();
		logger4js.debug('Found %d Project Versions in %s ms ', listVPV.length, timeMongoEnd.getTime()-timeMongoStart.getTime());
		// if latestonly, reduce the list and deliver only the latest version of each project and variant
		var vpvidsList = [];
		if (listVPV.length > 0) {
			vpvidsList.push(listVPV[0]._id);
		}
		for (let i = 1; i < listVPV.length; i++){
			//compare current item with previous and ignore if it is the same vpid & variantname
			logger4js.trace('compare: Index %d :%s: vs. :%s: Variant :%s: vs. :%s: TS %s vs. %s', i, listVPV[i].vpid, listVPV[i-1].vpid, listVPV[i].variantName, listVPV[i-1].variantName, listVPV[i].timestamp, listVPV[i-1].timestamp);
			if (listVPV[i].vpid.toString() != listVPV[i-1].vpid.toString()
				|| listVPV[i].variantName != listVPV[i-1].variantName
			) {
				vpvidsList.push(listVPV[i]._id);
				logger4js.trace('compare unequal: Index %d VPIDs equal %s timestamp %s %s ', i, listVPV[i].vpid != listVPV[i-1].vpid, listVPV[i].timestamp, listVPV[i-1].timestamp);
			}
		}
		logger4js.debug('Found %d Project Version IDs', vpvidsList.length);

		queryvpvids._id = {$in: vpvidsList};
		var queryVPV = VisboProjectVersion.find(queryvpvids);
		req.auditTTLMode = 1;	// Capacity Calculation of VISBO Project Versions

		queryVPV.lean();
		queryVPV.exec(function (err, listVPV) {
			if (err) {
				errorHandler(err, res, 'DB: GET VC Capacity Calc Find Full', 'Error getting VISBO Project Versions ');
				return;
			}
			req.auditInfo = listVPV.length;
			req.listVPV = listVPV.filter(vpv => vpv.variantName == '');
			req.listVPVPFV = listVPV.filter(vpv => vpv.variantName == 'pfv');
			logger4js.debug('Found %d Project Version for VC Calculation ', vpvidsList.length);
			return next();
		});
	});
}

module.exports = {
	getAllVPVGroups: getAllVPVGroups,
	getVCGroups: getVCGroups,
	getVPV: getVPV,
	getPortfolioVPs: getPortfolioVPs,
	getVPVpfv: getVPVpfv,
	getCurrentVPVpfv: getCurrentVPVpfv,
	getVPFVPVs: getVPFVPVs,
	getVPFPFVs: getVPFPFVs,
	getOneVP: getOneVP,
	getVCVPVs: getVCVPVs,
	getAllVPVsShort: getAllVPVsShort,
	getVPVwoPerm: getVPVwoPerm,
	getVPVOrgs: getVPVOrgs
};
