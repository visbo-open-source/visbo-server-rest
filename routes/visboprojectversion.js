var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var auth = require('./../components/auth');
var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;
var lockVP = require('./../components/lock');
var verifyVpv = require('./../components/verifyVpv');
var visboBusiness = require('./../components/visboBusiness');
var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');

var Const = require('../models/constants');
var constPermVP = Const.constPermVP;
var constPermVC = Const.constPermVC;

var logModule = 'VPV';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// register the VPV middleware to generate the Group List to check permission
router.use('/', verifyVpv.getAllVPVGroups);
router.use('/', verifyVpv.getOneVP);
// register the organisation middleware to get the related organisation
router.use('/', verifyVpv.getVCOrgs);
// register the base line middleware to get the related base line version
router.use('/', verifyVpv.getVPVpfv);

// register the VPF middleware to generate the Project List that is assigned to the portfolio
router.use('/', verifyVpv.getPortfolioVPs);

// register the VPV middleware to check that the user has access to the VPV
router.param('vpvid', verifyVpv.getVPV);
// register the get VPF middleware for calls for a specific VPV, like /cost, /capacity, /copy, /deliveries, /deadlines
router.use('/:vpvid/*', verifyVpv.getCurrentVPVpfv);
router.use('/:vpvid', verifyVpv.getVCGroups);


// check if keyMetrics from Client is valid
function checkValidKeyMetrics(km) {
	var countKM = 0;
	if (km) {
		if (km.costCurrentTotal > 0 && km.costBaseLastTotal > 0) {
			countKM += 1;
		}
		if (km.timeCompletionCurrentTotal > 0 && km.timeCompletionBaseLastTotal > 0) {
			countKM += 1;
		}
		if (km.deliverableCompletionCurrentTotal > 0 && km.deliverableCompletionBaseLastTotal > 0) {
			countKM += 1;
		}
	}
	return countKM > 0;
}

// updates the VPV Count in the VP after create/delete/undelete VISBO Project
var updateVPVCount = function(vpid, variantName, increment){
	var updateQuery = {_id: vpid};
	var updateOption = {upsert: false};
	var updateUpdate;

	if (!variantName) {
		updateUpdate = {$inc: {vpvCount: increment}};
	} else {
		// update a variant and increment the version counter
		updateQuery['variant.variantName'] = variantName;
		updateUpdate = {$inc : {'variant.$.vpvCount' : increment} };
	}
	logger4js.debug('Update VP %s with vpvCount inc %d update: %O with %O', vpid, increment, updateQuery, updateUpdate);
	VisboProject.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error('Problem updating VP %s vpvCount: %s', vpid, err.message);
		}
		logger4js.trace('Updated VP %s vpvCount inc %d changed %d %d', vpid, increment, result.n, result.nModified);
	});
};

// find a project in an array of a structured projects (name, id)
var findVPVariantList = function(arrayItem) {
		// console.log('compare %s %s result %s', JSON.stringify(arrayItem), JSON.stringify(this), arrayItem.vpid.toString() == this.vpid.toString() && arrayItem.variantName == this.variantName);
		return arrayItem.vpid.toString() == this.vpid.toString() && arrayItem.variantName == this.variantName;
};

var convertVariantList = function(idList, vp) {
	var result = [];
	if (idList && vp && vp.variant) {
		for (var i=0; i < idList.length; i++) {
			if (idList[i] == '') {
				result.push('');
			} else {
				var variant = vp.variant.find(item => item._id.toString() == idList[i]);
				if (variant) {
					result.push(variant.variantName);
				}
			}
		}
	}
	return result;
};

/////////////////
// VISBO Project Versions API
// /vpv
/////////////////

router.route('/')

/**
	* @api {get} /vpv Get Versions
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Version
	* @apiName GetVISBOProjectVersions
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get versions returns for all VISBOProjects, the user has access permission to, the latest VISBOProjectVersion.
	* In case the User has only VP.ViewRestricted view, he gets only short information (_id, timestamp, name, ...) about the versions without a specific variant.
	*
	* In case of success it delivers an array of VPVs, the array contains in each element a VPV.
	* Instead of delivering the whole VPV document a reduced document is delivered, to get the full document the client
	* has to specify the query parameter longList.
	*
	* With additional query paramteters the amount of versions can be restricted. Available Restirctions are: vcid, vpid, vpfid, refDate, refNext, varianName, status.
	* With an additional paramter keyMetrics the result is a short VPV that includes the keyMetrics values. In this only Project Versions from Projects with Audit Permissions are delivered.
	* to query only the main version of a project, use variantName= in the query string, to query specific variantNames concatenate them separated with comma, to include the main variant use an empty string after/before the comma. i.e. get the main plus the pfv Version use 'variantName=pfv,'
	*
	* @apiParam {Date} refDate only the latest version before the reference date for each selected project  and variant is delivered
	* Date Format is in the form: 2018-10-30T10:00:00Z
	* @apiParam {String} refNext If refNext is not empty the system delivers not the version before refDate instead it delivers the version after refDate
	* @apiParam {String} vcid Deliver only versions for projects inside a specific VISBOCenter
	* @apiParam {String} vpid Deliver only versions for the specified project
	* @apiParam {String} vpfid Deliver only versions for the specified project portfolio version
	* @apiParam {String} variantID Deliver only versions for the specified variant, the parameter can contain a list of variantIDs separated by colon. If client wants to have only versions from the main branch, use variantID=
	* @apiParam {String} variantName Deliver only versions for the specified variant, the parameter can contain a list of variantNames separated by colon. (outdated)
	* @apiParam {String} status Deliver only versions with the specified status
	* @apiParam {String} longList if set deliver all details instead of a short version info for the project version
	* @apiParam {String} keyMetrics if set deliver deliver the keyMetrics for the project version
	*
	* @apiPermission Authenticated and in case a vcid/vpid/vpfid is specified the VP.View or VP.ViewRestricted Permission for the specified object.
	* @apiError {number} 400 Bad Values in paramter in URL
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vpv
	*   url: https://my.visbo.net/api/vpv?vcid=vc5c754feaa&refDate=2018-01-01
	*   url: https://my.visbo.net/api/vpv?vpid=vp5c754feaa&refDate=2018-01-01&variantID=variant5c754fea9&longList
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Returned VISBO Project Versions',
	*   'vpv':[{
	*     '_id':'vpv5c754feaa',
	*     'name':'Project Name',
	*     'vpid': 'vp5c754feaa',
	*     'timestamp': '2018-01-01',
	*     'startDate': '2018-01-01',
	*     'endDate': '2018-12-31',
	*     'status': 'beauftragt',
	*     'ampelStatus': '2',
	*     'variantName': ''
	*   }]
	* }
	*/
// Get VISBO Project Versions
	.get(function(req, res) {
		var userId = req.decoded._id;
		var sysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Project Versions Read';
		req.auditTTLMode = req.query.longList ? 0 : 1;
		req.auditSysAdmin = sysAdmin;
		var checkDeleted = req.query.deleted == true;

		logger4js.info('Get Project Versions for user %s with query params %O ', userId, req.query);
		var queryvpv = {};
		var queryvpvids = {};
		var latestOnly = false; 	// as default show all project version of all projects
		var longList = req.query.longList != undefined;		// show only specific columns instead of all
		var keyMetrics = req.query.keyMetrics != undefined;
		var nowDate = new Date();
		var reducedPerm = false;
		var variantName = req.query.variantName;
		if (variantName) variantName = variantName.trim();
		var variantID = req.query.variantID;

		if ((req.query.vpid && !validate.validateObjectId(req.query.vpid, false))
		|| (req.query.vcid && !validate.validateObjectId(req.query.vcid, false))
		|| (req.query.vpfid && !validate.validateObjectId(req.query.vpfid, false))
		|| (req.query.refDate && !validate.validateDate(req.query.refDate))) {
			logger4js.warn('Get VPV mal formed query parameter %O ', req.query);
			return res.status(400).send({
				state: 'failure',
				message: 'Bad Content in Query Parameters'
			});
		}
		queryvpv.deletedAt = {$exists: checkDeleted};
		queryvpv.deletedByParent = {$exists: false}; // do not show any versions of deleted VPs
		// collect the VPIDs where the user has View permission to
		var vpidList = [];
		if (req.query.vpid) {
			vpidList.push(req.query.vpid);
			var perm = req.listVPPerm.getPerm(req.query.vpid);
			if (req.query.deleted) {
				logger4js.info('Get Deleted Project Versions vpid %s listVPPerm %O', req.query.vpid, perm);
				if (!(perm.vp & constPermVP.Delete)) {
					return res.status(403).send({
						state: 'failure',
						message: 'No Permission to see deleted Versions',
						perm: perm
					});
				} else {
					queryvpv.deletedAt = {$exists: true};
				}
			}
			if (!(perm.vp & constPermVP.View)) {
				// only restricted View Permission, restrict the Result to main variant only
				variantName = '';
				longList = false;
				keyMetrics = false;
				reducedPerm = true;
			}
		} else {
			var requiredPerm = constPermVP.View;
			vpidList = req.listVPPerm.getVPIDs(requiredPerm);
		}

		logger4js.trace('Get VPV vpid List %O ', vpidList);

		if (req.query) {
			if (req.query.status) {
				queryvpv.status = req.query.status;
			}
			if (req.query.refDate && Date.parse(req.query.refDate)){
				var refDate = new Date(req.query.refDate);
				queryvpv.timestamp =  req.query.refNext ? {$gt: refDate} : {$lt: refDate};
				latestOnly = true;
			} else if (req.query.refDate == '') {
				queryvpv.timestamp =  req.query.refNext ? {$gt: nowDate} : {$lt: nowDate};
				latestOnly = true;
			}
			if (variantID != undefined) {
				logger4js.debug('GET VPV VariantID String :%s:', variantID);
				if (req.oneVP) {
					var variantList = convertVariantList(variantID.split(','), req.oneVP);
					logger4js.debug('VariantList for VP %s: %s', req.oneVP.name, variantList);
					queryvpv.variantName = {$in: variantList};
					logger4js.debug('VariantName %s for VP %s', queryvpv.variantName, req.oneVP.name);
				} else {
					// only option to get all variants or the main variant if several projects were requested
					queryvpv.variantName = '';
				}
			} else if (variantName != undefined){
				logger4js.debug('Variant Query String :%s:', variantName);
				queryvpv.variantName = {$in: variantName.split(',')};
			}
			if (keyMetrics){
				longList = false;
			}
		}

		logger4js.info('Get Project Versions for user %s for %d VPs Variant %s, timestamp %O latestOnly %s', userId, vpidList.length, queryvpv.variantName, queryvpv.timestamp, latestOnly);

		if (req.listPortfolioVP) {
			// restrict query to VPs with Permission and VPs part of Portfolio
			var vpCondition = [];
			vpCondition.push({'vpid': {$in: vpidList}});							// VPs where the user has View Permission
			vpCondition.push({'vpid': {$in: req.listPortfolioVP}});		// VPs from the Portfolio List
			queryvpv['$and'] = vpCondition;
			logger4js.trace('Get Project Versions for Portfolio user %s for Query %s', userId, JSON.stringify(queryvpv));
		} else {
			// restrict query to VPs with permission
			queryvpv.vpid = {$in: vpidList};
		}


		logger4js.trace('VPV query string %s', JSON.stringify(queryvpv));
		var timeMongoStart = new Date();
		var queryVPV = VisboProjectVersion.find(queryvpv);
		if (latestOnly) {
			queryVPV.sort('vpid variantName -timestamp');
		}
		queryVPV.select('_id vpid variantName timestamp');
		queryVPV.lean();
		queryVPV.exec(function (err, listVPV) {
			if (err) {
				errorHandler(err, res, 'DB: GET VPV Find Short', 'Error getting VISBO Project Versions ');
				return;
			}
			var timeMongoEnd = new Date();
			logger4js.debug('Found %d Project Versions in %s ms ', listVPV.length, timeMongoEnd.getTime()-timeMongoStart.getTime());
			// if latestonly, reduce the list and deliver only the latest version of each project and variant
			var vpvidsList = [];
			if (!latestOnly) {
				listVPV.forEach(function(item) { vpvidsList.push(item._id); });
			} else {
				if (req.listPortfolioVPVariant) {
					// filter versions not part of portfolio
					logger4js.debug('Splice short Versions not belonging to Portfolio List %d \n%O', req.listPortfolioVPVariant.length, req.listPortfolioVPVariant);
					var filterVPV = [];
					for (let i = 0; i < listVPV.length; i++){
						//check if vpid & variant are member of portfolio
						logger4js.debug('check: Index %d :%s: Variant :%s: ', i, listVPV[i].vpid, listVPV[i].variantName);
						var itemSearch = {vpid: listVPV[i].vpid, variantName: listVPV[i].variantName};
						if (req.listPortfolioVPVariant.find(findVPVariantList, itemSearch)) {
							logger4js.debug('found: Index %d :%s: Variant :%s: ', i, listVPV[i].vpid, listVPV[i].variantName);
							filterVPV.push(listVPV[i]);
						}
					}
					listVPV = filterVPV;
				}

				if (req.query.refNext != true) {
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
				} else {
					if (listVPV.length == 1) {
						vpvidsList.push(listVPV[0]._id);
					}
					for (let i = 0; i < listVPV.length - 1; i++){
						//compare current item with previous and ignore if it is the same vpid & variantname
						logger4js.trace('compare: Index %d :%s: vs. :%s: Variant :%s: vs. :%s: TS %s vs. %s', i, listVPV[i].vpid, listVPV[i+1].vpid, listVPV[i].variantName, listVPV[i+1].variantName, listVPV[i].timestamp, listVPV[i+1].timestamp);
						if (listVPV[i].vpid.toString() != listVPV[i+1].vpid.toString()
							|| listVPV[i].variantName != listVPV[i+1].variantName
						) {
							vpvidsList.push(listVPV[i]._id);
							logger4js.trace('compare unequal: Index %d VPIDs equal %s timestamp %s %s ', i, listVPV[i].vpid != listVPV[i+1].vpid, listVPV[i].timestamp, listVPV[i+1].timestamp);
						}
					}
					if (listVPV.length > 0) {
						vpvidsList.push(listVPV[listVPV.length-1]._id);
					}
				}
			}
			// if (listVPV.length > 1 && latestOnly){
			logger4js.debug('Found %d Project Version IDs', vpvidsList.length);

			queryvpvids._id = {$in: vpvidsList};
			var queryVPV = VisboProjectVersion.find(queryvpvids);
			if (keyMetrics) {
				// deliver only the short info about project versions

				queryVPV.select('_id vpid name timestamp keyMetrics status startDate endDate ampelStatus ampelErlaeuterung variantName businessUnit VorlagenName leadPerson description updatedAt createdAt deletedAt');
			} else if (!longList) {
				// deliver only the short info about project versions
				if (reducedPerm) {
					queryVPV.select('_id vpid name timestamp variantName businessUnit VorlagenName leadPerson description updatedAt createdAt deletedAt');
				} else {
					queryVPV.select('_id vpid name timestamp startDate endDate status ampelStatus variantName businessUnit VorlagenName leadPerson description updatedAt createdAt deletedAt');
				}
			}
			queryVPV.lean();
			queryVPV.exec(function (err, listVPV) {
				if (err) {
					errorHandler(err, res, 'DB: GET VPV Find Full', 'Error getting VISBO Project Versions ');
					return;
				}
				req.auditInfo = listVPV.length;
				req.listVPV = listVPV;
				for (var i = 0; i < listVPV.length; i++) {
					perm = req.listVPPerm.getPerm(sysAdmin ? 0 : listVPV[i].vpid);
					if ((perm.vp & constPermVP.ViewAudit) == 0
					&& listVPV[i].keyMetrics) {
						// cleanup Cost Information
						// listVPV[i].keyMetrics = undefined;
						listVPV[i].keyMetrics.costCurrentActual = undefined;
						listVPV[i].keyMetrics.costCurrentTotal = undefined;
						listVPV[i].keyMetrics.costBaseLastActual = undefined;
						listVPV[i].keyMetrics.costBaseLastTotal = undefined;
					}
				}

				return res.status(200).send({
					state: 'success',
					message: 'Returned VISBO Project Versions',
					count: listVPV.length,
					vpv: listVPV
				});
			});
		});
	})

/**
	* @api {post} /vpv Create a Version
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Version
	* @apiName CreateVISBOProjectVersions
	* @apiDescription Post creates a new VISBO Project Version.
	* The user needs to have Modify permission in the referenced Project or has CreateVariant permission and is the owner of the Variant, where he wants to store the Version.
	* VISBO Project Version Properties like _id, name and timestamp are overwritten by the system
	* @apiHeader {String} access-key User authentication token.
	*
	* @apiPermission Authenticated and VP.View and VP.Modify or VP.CreateVariant Permission for the Project.
	* @apiError {number} 400 missing name or ID of Project during Creation, or other bad content in body
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Create Project Version
	* @apiError {number} 409 Project Variant does not exists
	* @apiError {number} 409 Project (Portfolio) Version was alreaddy updated in between (Checked updatedAt Flag)
	* @apiError {number} 423 Project (Portfolio) is locked by another user
	*
  * @apiExample Example usage:
	*   url: https://my.visbo.net/api/vpv
	* {
	*  'vpid': 'vp5c754feaa'
	*  'allOthers': 'all properties of visbo project version'
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'Successfully created new ProjectVersion',
	*  'vpv':[{
	*   '__v':0,
	*   'updatedAt':'2018-03-19T11:04:12.094Z',
	*   'createdAt':'2018-03-19T11:04:12.094Z',
	*   '_id':'vpv5c754feaa',
	*   'name':'My first Project Version',
	*   'vpid': 'vp5c754feaa'
	*   'allOthers': 'all properties of visbo project version',
	* 		'keyMetrics': {
	* 		   'costCurrentActual': 125,
	* 		   'costCurrentTotal': 125,
	* 		   'costBaseLastActual': 115,
	* 		   'costBaseLastTotal': 115,
	* 		   'timeCompletionCurrentActual': 12,
	* 		   'timeCompletionBaseLastActual': 14,
	* 		   'timeCompletionCurrentTotal': 20,
	* 		   'timeCompletionBaseLastTotal': 20,
	* 		   'endDateCurrent': '2020-12-31',
	* 		   'endDateBaseLast': '2020-12-31',
	* 		   'deliverableCompletionCurrentActual': 9.3,
	* 		   'deliverableCompletionCurrentTotal': 20,
	* 		   'deliverableCompletionBaseLastActual': 10,
	* 		   'deliverableCompletionBaseLastTotal': 20,
	* 		   'timeDelayCurrentActual': 10,
	* 		   'timeDelayCurrentTotal':1,
	* 		   'deliverableDelayCurrentActual': 1,
	* 		   'deliverableDelayCurrentTotal':10
	* 		 }
	*  }]
	* }
	*/
// POST/Create a Project Version
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail  = req.decoded.email;

		req.auditDescription = 'Project Versions Create';
		var queryvpv = {};

		var vpid = (req.body.vpid && validate.validateObjectId(req.body.vpid, false)) ? req.body.vpid : 0;
		var variantName = (req.body.variantName  || '').trim();
		var variantIndex = -1;

		logger4js.info('Post a new Project Version for user %s with name %s variant :%s: in Project %s updatedAt %s with Perm %O', userId, req.body.name, variantName, vpid, req.body.updatedAt, req.listVPPerm.getPerm(vpid));
		var newVPV = new VisboProjectVersion();
		var permCreateVersion = false;
		var perm = req.listVPPerm.getPerm(vpid);
		if (perm.vp & constPermVP.Modify) permCreateVersion = true;
		if ((perm.vp & constPermVP.CreateVariant) && variantName != '' && variantName != 'pfv') permCreateVersion = true;
		if (!permCreateVersion) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Create the specific Version',
				perm: perm
			});
		}
		var queryVp = {};
		queryVp._id = vpid;
		queryVp.deletedAt = {$exists: false};				// Not deleted
		VisboProject.findOne(queryVp, function (err, oneVP) {
			if (err) {
				errorHandler(err, res, 'DB: POST VPV Find VP', 'Error creating Project Versions ');
				return;
			}
			if (!oneVP) {
				return res.status(403).send({
					state: 'failure',
					message: 'Project not found or no Permission'
				});
			}
			req.oneVP = oneVP;

			if (variantName != '') {
				// check that the Variant exists
				variantIndex = req.oneVP.variant.findIndex(variant => variant.variantName == variantName);
				if (variantIndex < 0) {
					logger4js.warn('VPV Post Variant does not exist %s %s', vpid, variantName);
					return res.status(409).send({
						state: 'failure',
						message: 'Project variant does not exist',
						vp: [req.oneVP]
					});
				}
			}
			// check if the version is locked
			if (lockVP.lockStatus(oneVP, useremail, req.body.variantName).locked) {
				logger4js.warn('VPV Post VP locked %s %s', vpid, variantName);
				return res.status(423).send({
					state: 'failure',
					message: 'Project locked',
					vp: [req.oneVP]
				});
			}

			logger4js.debug('User has permission to create a new Version in %s Variant :%s:', oneVP.name, variantName);
			// get the latest VPV to check if it has changed in case the client delivers an updatedAt Date
			queryvpv.deletedAt = {$exists: false};
			queryvpv.vpid = vpid;
			queryvpv.variantName = req.body.variantName || '';
			var queryVPV = VisboProjectVersion.findOne(queryvpv);
			queryVPV.sort('-timestamp');
			queryVPV.select('_id vpid name timestamp variantName updatedAt createdAt');
			queryVPV.lean();
			queryVPV.exec(function (err, lastVPV) {
				if (err) {
					errorHandler(err, res, 'DB: POST VPV Find VPV', 'Error creating Project Versions ');
					return;
				}
				if (req.body.updatedAt && Date.parse(req.body.updatedAt)) {
					// check that the last VPV has the same date
					var updatedAt = new Date(req.body.updatedAt);
					if (lastVPV) {
						logger4js.debug('last VPV: updatedAt Body %s last Version %s', updatedAt.getTime(), lastVPV.updatedAt.getTime());
						if (lastVPV.updatedAt.getTime() != updatedAt.getTime()) {
							return res.status(409).send({
								state: 'failure',
								message: 'Conflict with update Dates',
								vpv: [lastVPV]
							});
						}
					}
				}

				if (!validate.validateName(req.body.status, true)
				|| !validate.validateName(req.body.leadPerson, true)
				|| !validate.validateName(req.body.variantDescription, true)
				|| !validate.validateName(req.body.ampelErlaeuterung, true)
				|| !validate.validateName(req.body.VorlagenName, true)
				|| !validate.validateName(req.body.description, true)
				|| !validate.validateName(req.body.businessUnit, true)
				) {
					logger4js.info('POST Project Version contains illegal strings body %O', req.body);
					return res.status(400).send({
						state: 'failure',
						message: 'Project Version Body contains invalid strings'
					});
				}

				// keep unchangable attributes
				newVPV.name = oneVP.name;
				newVPV.vpid = oneVP._id;
				newVPV.variantName = variantName;
				if (req.body.timestamp && Date.parse(req.body.timestamp)) {
					newVPV.timestamp = new Date(req.body.timestamp);
				} else {
					newVPV.timestamp = new Date();
				}

				// copy all attributes
				newVPV.variantDescription = req.body.variantDescription;
				newVPV.Risiko = req.body.Risiko;
				newVPV.StrategicFit = req.body.StrategicFit;
				newVPV.customDblFields = req.body.customDblFields;
				newVPV.customStringFields = req.body.customStringFields;
				newVPV.customBoolFields = req.body.customBoolFields;
				newVPV.actualDataUntil = req.body.actualDataUntil;
				newVPV.Erloes = req.body.Erloes;
				newVPV.leadPerson = req.body.leadPerson;
				newVPV.startDate = req.body.startDate;
				newVPV.endDate = req.body.endDate;
				newVPV.earliestStart = req.body.earliestStart;
				newVPV.earliestStartDate = req.body.earliestStartDate;
				newVPV.latestStart = req.body.latestStart;
				newVPV.latestStartDate = req.body.latestStartDate;
				newVPV.status = req.body.status;
				newVPV.ampelStatus = req.body.ampelStatus;
				newVPV.ampelErlaeuterung = req.body.ampelErlaeuterung;
				newVPV.farbe = req.body.farbe;
				newVPV.Schrift = req.body.Schrift;
				newVPV.Schriftfarbe = req.body.Schriftfarbe;
				newVPV.VorlagenName = req.body.VorlagenName;
				newVPV.Dauer = req.body.Dauer;
				newVPV.AllPhases = req.body.AllPhases;
				newVPV.hierarchy = req.body.hierarchy;
				newVPV.volumen = req.body.volumen;
				newVPV.complexity = req.body.complexity;
				newVPV.description = req.body.description;
				newVPV.businessUnit = req.body.businessUnit;
				var obj = visboBusiness.calcKeyMetrics(newVPV, req.visboPFV, req.visboOrganisations);
				if (!obj || Object.keys(obj).length < 1) {
					// no valid key Metrics delivered
					if (req.body.keyMetrics && newVPV.variantName != 'pfv' && checkValidKeyMetrics(req.body.keyMetrics)) {
						newVPV.keyMetrics = req.body.keyMetrics;
					}
				} else {
					newVPV.keyMetrics = obj;
				}

				logger4js.debug('Create ProjectVersion in Project %s with Name %s and timestamp %s', newVPV.vpid, newVPV.name, newVPV.timestamp);
				newVPV.save(function(err, oneVPV) {
					if (err) {
						errorHandler(err, res, 'DB: POST VPV Save', 'Error creating Project Versions ');
						return;
					}
					req.oneVPV = oneVPV;
					// update the version count of the base version or the variant
					updateVPVCount(req.oneVPV.vpid, variantName, 1);
					return res.status(200).send({
						state: 'success',
						message: 'Successfully created new Project Version',
						vpv: [ oneVPV ]
					});
				});
			});
		});
	});

router.route('/:vpvid')

/**
 	* @api {get} /vpv/:vpvid Get specific Version
	* @apiVersion 1.0.0
 	* @apiGroup VISBO Project Version
 	* @apiName GetVISBOProjectVersion
 	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get returns a specific Project Version the user has access permission to the Project.
	* If the user has only VP.ViewRestricted Permission the Version is cleaned up to contain only information about the Deadlines & Deliveries the User is allowed to see.
	* In case of success it delivers an array of VPVs, the array contains 0 or 1 element with a VPV
	*
	* @apiPermission Authenticated and VP.View or VP.ViewRestricted Permission for the Project.
	* @apiError {number} 400 Bad Values in paramter in URL
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Project Version
	*
 	* @apiExample Example usage:
 	*   url: https://my.visbo.net/api/vpv/vpv5aada025
 	* @apiSuccessExample {json} Success-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   'state':'success',
 	*   'message':'Returned Project Versions',
 	*   'vpv': [{
 	*     '_id':'vpv5c754feaa',
	*     'name':'My new Project Version',
	*     'updatedAt':'2018-03-19T11:04:12.094Z',
	*     'createdAt':'2018-03-19T11:04:12.094Z',
	*     'vpid': 'vp5c754feaa'
	*     'allOthers': 'all properties of visbo project version',
	* 		'keyMetrics': {
	* 		   'costCurrentActual': 125,
	* 		   'costCurrentTotal': 125,
	* 		   'costBaseLastActual': 115,
	* 		   'costBaseLastTotal': 115,
	* 		   'timeCompletionCurrentActual': 12,
	* 		   'timeCompletionBaseLastActual': 14,
	* 		   'timeCompletionCurrentTotal': 20,
	* 		   'timeCompletionBaseLastTotal': 20,
	* 		   'endDateCurrent': '2020-12-31',
	* 		   'endDateBaseLast': '2020-12-31',
	* 		   'deliverableCompletionCurrentActual': 9.3,
	* 		   'deliverableCompletionCurrentTotal': 20,
	* 		   'deliverableCompletionBaseLastActual': 10,
	* 		   'deliverableCompletionBaseLastTotal': 20,
	* 		   'timeDelayCurrentActual': 10,
	* 		   'timeDelayCurrentTotal':1,
	* 		   'deliverableDelayCurrentActual': 1,
	* 		   'deliverableDelayCurrentTotal':10
	* 		 }
 	*   }]
 	* }
	*/
// Get a specific Project Version
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Project Version Read';
		req.auditSysAdmin = sysAdmin;
		req.auditTTLMode = 0;	// Real Download of Project Version

		logger4js.info('Get Project Version for userid %s email %s and vpv %s :%O ', userId, useremail, req.params.vpvid);

		var perm = req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid);
		if ((perm.vp & constPermVP.ViewAudit) == 0
		&& req.oneVPV.keyMetrics) {
			// cleanup Cost Information
			req.oneVPV.keyMetrics.costCurrentActual = undefined;
			req.oneVPV.keyMetrics.costCurrentTotal = undefined;
			req.oneVPV.keyMetrics.costBaseLastActual = undefined;
			req.oneVPV.keyMetrics.costBaseLastTotal = undefined;
		}
		if ((perm.vp & constPermVP.View) === 0) {
			// only restricted View
			var restriction = [];
			req.oneVP.restrict.forEach(function(item) {
				if (req.listVPPerm.checkGroupMemberShip(item.groupid)) {
					restriction.push(item);
				}
			});
			visboBusiness.cleanupRestrictedVersion(req.oneVPV);
		}

		return res.status(200).send({
			state: 'success',
			message: 'Returned Project Version',
			vpv: [req.oneVPV],
			perm: req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid)
		});
	})

/**
	* @api {put} /vpv/:vpvid Update Project Version
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Version
	* @apiName UpdateVISBOProjectVersion
	* @apiDescription Put updates a specific Project Version used for undelete
	* the system checks if the user has Delete permission to the Project.
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and VP.View and VP.Delete Permission for the Project.
	* @apiError {number} 400 not allowed to change Project Version or bad values in body
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Modify Project
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vpv/vpv5cf3da025?deleted=1
	* {
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'Successfully updated Project Renamed',
	*  'vpv':[{
	*     '_id':'vpv5c754feaa',
	*     'name':'My new Project Version',
	*     'updatedAt':'2018-03-19T11:04:12.094Z',
	*     'createdAt':'2018-03-19T11:04:12.094Z',
	*     'vpid': 'vp5c754feaa'
	*     'allOthers': 'all properties of visbo project version',
	* 		'keyMetrics': {
	* 		   'costCurrentActual': 125,
	* 		   'costCurrentTotal': 125,
	* 		   'costBaseLastActual': 115,
	* 		   'costBaseLastTotal': 115,
	* 		   'timeCompletionCurrentActual': 12,
	* 		   'timeCompletionBaseLastActual': 14,
	* 		   'timeCompletionCurrentTotal': 20,
	* 		   'timeCompletionBaseLastTotal': 20,
	* 		   'endDateCurrent': '2020-12-31',
	* 		   'endDateBaseLast': '2020-12-31',
	* 		   'deliverableCompletionCurrentActual': 9.3,
	* 		   'deliverableCompletionCurrentTotal': 20,
	* 		   'deliverableCompletionBaseLastActual': 10,
	* 		   'deliverableCompletionBaseLastTotal': 20,
	* 		   'timeDelayCurrentActual': 10,
	* 		   'timeDelayCurrentTotal':1,
	* 		   'deliverableDelayCurrentActual': 1,
	* 		   'deliverableDelayCurrentTotal':10
	* 		 }
	*  }]
	* }
	*/
// Update Project Version (Undelete)
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Project Version Update';

		logger4js.info('PUT/Save Project Version for userid %s email %s and vpv %s perm %O', userId, useremail, req.params.vpvid, req.listVPPerm);

		var vpUndelete = false;
		// undelete the VP in case of change
		if (req.oneVPV.deletedAt) {
			req.auditDescription = 'Project Version Undelete';
			req.oneVPV.deletedAt = undefined;
			vpUndelete = true;
			logger4js.debug('Undelete VPV %s', req.oneVPV._id);
		}
		if (!vpUndelete) {
			return res.status(400).send({
				state: 'failure',
				message: 'not possible to change Project Version'
			});
		}

		var perm = req.listVPPerm.getPerm(req.oneVPV.vpid);
		if (!(perm.vp & constPermVP.Delete)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Undelete Project Version',
				perm: perm
			});
		}
		logger4js.debug('PUT VPV: save now %s unDelete %s', req.oneVPV._id, vpUndelete);
		req.oneVPV.save(function(err, oneVPV) {
			if (err) {
				errorHandler(err, res, 'DB: PUT VPV Save', 'Error updating Project Versions ');
				return;
			}
			req.oneVPV = oneVPV;
			updateVPVCount(req.oneVPV.vpid, req.oneVPV.variantName, 1);
			return res.status(200).send({
				state: 'success',
				message: 'Updated Project Version',
				vpv: [ oneVPV ]
			});
		});
	})

/**
	* @api {delete} /vpv/:vpvid Delete specific Version
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Version
	* @apiName DeleteVISBOProjectVersion
	* @apiDescription Deletes a specific Project Version.
	* @apiHeader {String} access-key User authentication token.
	*
	* @apiPermission Authenticated and VP.View and VP.Delete Permission for the Project.
	* @apiError {number} 400 Bad Parameter in URL
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Delete Project Version or Project Version does not exists
	* @apiError {number} 423 Project locked by another user
	*
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vpv/vpv5c754feaa
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Deleted Project Version'
	* }
	*/
// delete a Project Version
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Project Version Delete';

		logger4js.info('DELETE Project Version for userid %s email %s and vc %s ', userId, useremail, req.params.vpvid);
		logger4js.debug('DELETE Project Version DETAILS ', req.oneVPV._id, req.oneVP.name, req.oneVPV.variantName);

		var variantIndex;
		var variantName = req.oneVPV.variantName;
		if (variantName != '') {
			// check that the Variant exists
			variantIndex = req.oneVP.variant.findIndex(variant => variant.variantName == variantName);
			if (variantIndex < 0) {
				logger4js.warn('VPV Delete Variant does not exist %s %s', req.params.vpvid, variantName);
				// Allow Deleting of a version where Variant does not exists for Admins
				variantName = '';
			}
		}
		// user does not have admin permission and does not own the variant
		var hasPerm = false;
		var perm = req.listVPPerm.getPerm(req.oneVPV.vpid);
		logger4js.debug('VPV Delete Permission %O', req.listVPPerm);
		if (perm.vp & constPermVP.Delete) {
			hasPerm = true;
		} else if (variantName != '' && req.oneVP.variant[variantIndex].email == useremail) {
			hasPerm = true;
		}
		if (!hasPerm) {
			logger4js.warn('VPV Delete no Permission %s %s', req.params.vpvid, variantName);
			return res.status(403).send({
				state: 'failure',
				message: 'Project Version no permission to delete Version',
				perm: perm
			});
		}
		// check if the project is locked
		if (lockVP.lockStatus(req.oneVP, useremail, variantName).locked) {
			return res.status(423).send({
				state: 'failure',
				message: 'Project locked',
				vp: [req.oneVP]
			});
		}
		var destroyVPV = req.oneVPV.deletedAt;

		if (!destroyVPV) {
			logger4js.debug('Delete Project Version %s %s', req.params.vpvid, req.oneVPV._id);
			variantName = req.oneVPV.variantName;

			req.oneVPV.deletedAt = new Date();
			req.oneVPV.save(function(err, oneVPV) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VPV Save', 'Error deleting Project Versions ');
					return;
				}
				req.oneVPV = oneVPV;

				updateVPVCount(req.oneVPV.vpid, variantName, -1);
				return res.status(200).send({
					state: 'success',
					message: 'Successfully deleted Project Version'
				});
			});
		} else {
			// Destroy the Deleted Version
			req.auditDescription = 'Project Version Destroy';
			logger4js.info('Destroy Project Version %s %s', req.params.vpvid, req.oneVPV._id);
			var queryVPV = {};
			queryVPV._id = req.oneVPV._id;
			VisboProjectVersion.deleteOne(queryVPV, function(err) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VPV Destroy', 'Error deleting Project Versions ');
					return;
				}
				// no need to update vpvCount in VP
				return res.status(200).send({
					state: 'success',
					message: 'Destroyed Project Version'
				});
			});

		}
	});

router.route('/:vpvid/copy')

	/**
		* @api {post} /vpv/:vpvid/copy Create a Copy of a Version
		* @apiVersion 1.0.0
		* @apiGroup VISBO Project Version
		* @apiName VISBOProjectVersionCopy
		* @apiDescription Post copies an existing version to a new Version with new timestamp and new calculated keyMetrics.
		* The user needs to have Modify permission in the referenced Project or Create Variant Permission and is the owner of the Variant, where he wants to store the VPV.
		* Project Version Properties like _id, name and timestamp are overwritten by the system
		*
		* @apiParam {Boolean} squeezeOrga If true, squeezes the role assignments to a group role instead of having assignments to individuals
		* @apiParam {Boolean} squeezeToPFV If true, squeezes Phases/Deadlines/Deliveries to the ones that were defined in the related pfv version
		*
 		* @apiHeader {String} access-key User authentication token.
		*
		* @apiPermission Authenticated and VP.View and VP.Modify or VP.CreateVariant Permission for the Project.
		* @apiError {number} 400 missing name or ID of Project during Creation, or other bad content in body
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create Project Version
		*
	  * @apiExample Example usage:
		*   url: https://my.visbo.net/api/vpv/vpv5c754feaa/copy
		* {
		*  'timestamp': '2019-03-19T11:04:12.094Z'
		* }
		* @apiSuccessExample {json} Success-Response:
		*     HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'Successfully created new Project Version',
		*  'vpv':[{
		*   '__v':0,
		*   'updatedAt':'2019-03-19T11:04:12.094Z',
		*   'createdAt':'2019-03-19T11:04:12.094Z',
		*   '_id':'vpv5c754feaa',
		*   'name':'My first Project Version',
		*   'timestamp': '2019-03-19T11:04:12.094Z'
		*   'vpid': 'vp5c754feaa'
		*   'basicOthers': 'only key basic properties',
		*   'keyMetrics': {
		*     'costCurrentActual': 125,
		*     'costCurrentTotal': 125,
		*     'costBaseLastActual': 115,
		*     'costBaseLastTotal': 115,
		*     'timeCompletionCurrentActual': 12,
		*     'timeCompletionBaseLastActual': 14,
		*     'timeCompletionCurrentTotal': 20,
		*     'timeCompletionBaseLastTotal': 20,
		*     'endDateCurrent': '2020-12-31',
		*     'endDateBaseLast': '2020-12-31',
		*     'deliverableCompletionCurrentActual': 9.3,
		*     'deliverableCompletionCurrentTotal': 20,
		*     'deliverableCompletionBaseLastActual': 10,
		*     'deliverableCompletionBaseLastTotal': 20,
		*     'timeDelayCurrentActual': 10,
		*     'timeDelayCurrentTotal':1,
		*     'deliverableDelayCurrentActual': 1,
		*     'deliverableDelayCurrentTotal':10
		*   }
		*  }]
		* }
		*/
// POST/Copy a Project Version with a new TimeStamp and a new calculation for keyMetrics
	.post(function(req, res) {
		var userId = req.decoded._id;

		req.auditDescription = 'Project Versions Copy';

		var vpid = req.oneVPV.vpid;
		var variantName = req.oneVPV.variantName;

		logger4js.info('Post a copy Project Version for user %s with name %s variant :%s: in Project %s updatedAt %s with Perm %O', userId, req.body.name, variantName, vpid, req.body.updatedAt, req.listVPPerm.getPerm(vpid));
		var newVPV = new VisboProjectVersion();
		var permCreateVersion = false;
		var perm = req.listVPPerm.getPerm(vpid);
		if (perm.vp & constPermVP.Modify) permCreateVersion = true;
		if ((perm.vp & constPermVP.CreateVariant) && variantName != '' && variantName != 'pfv') permCreateVersion = true;
		if (!permCreateVersion) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Create the specific Version',
				perm: perm
			});
		}
		// keep unchangable attributes
		newVPV.name = req.oneVPV.name;
		newVPV.vpid = req.oneVPV.vpid;
		newVPV.variantName = req.oneVPV.variantName;
		if (req.body.timestamp && Date.parse(req.body.timestamp)) {
			newVPV.timestamp = new Date(req.body.timestamp);
		} else {
			newVPV.timestamp = new Date();
		}
		newVPV.variantDescription = req.oneVPV.variantDescription;
		newVPV.Risiko = req.oneVPV.Risiko;
		newVPV.StrategicFit = req.oneVPV.StrategicFit;
		newVPV.customDblFields = req.oneVPV.customDblFields;
		newVPV.customStringFields = req.oneVPV.customStringFields;
		newVPV.customBoolFields = req.oneVPV.customBoolFields;
		newVPV.actualDataUntil = req.oneVPV.actualDataUntil;
		newVPV.Erloes = req.oneVPV.Erloes;
		newVPV.leadPerson = req.oneVPV.leadPerson;
		newVPV.startDate = req.oneVPV.startDate;
		newVPV.endDate = req.oneVPV.endDate;
		newVPV.earliestStart = req.oneVPV.earliestStart;
		newVPV.earliestStartDate = req.oneVPV.earliestStartDate;
		newVPV.latestStart = req.oneVPV.latestStart;
		newVPV.latestStartDate = req.oneVPV.latestStartDate;
		newVPV.status = req.oneVPV.status;
		newVPV.ampelStatus = req.oneVPV.ampelStatus;
		newVPV.ampelErlaeuterung = req.oneVPV.ampelErlaeuterung;
		newVPV.farbe = req.oneVPV.farbe;
		newVPV.Schrift = req.oneVPV.Schrift;
		newVPV.Schriftfarbe = req.oneVPV.Schriftfarbe;
		newVPV.VorlagenName = req.oneVPV.VorlagenName;
		newVPV.Dauer = req.oneVPV.Dauer;
		newVPV.AllPhases = req.oneVPV.AllPhases;
		newVPV.hierarchy = req.oneVPV.hierarchy;
		newVPV.volumen = req.oneVPV.volumen;
		newVPV.complexity = req.oneVPV.complexity;
		newVPV.description = req.oneVPV.description;
		newVPV.businessUnit = req.oneVPV.businessUnit;

		var orga = req.query.squeezeOrga ? req.visboOrganisations : undefined;
		var pfv = req.query.squeezeToPFV ? req.visboPFV : undefined;
		if (orga || pfv) {
			newVPV = visboBusiness.convertVPV(newVPV, pfv, orga);
		}

		if (newVPV.variantName != 'pfv') {
			newVPV.keyMetrics = visboBusiness.calcKeyMetrics(newVPV, req.visboPFV, req.visboOrganisations);
		}
		if (!newVPV.keyMetrics && req.body.keyMetrics) {
			newVPV.keyMetrics = req.body.keyMetrics;
		}

		logger4js.debug('Create ProjectVersion in Project %s with Name %s and timestamp %s', newVPV.vpid, newVPV.name, newVPV.timestamp);
		newVPV.save(function(err, oneVPV) {
			if (err) {
				errorHandler(err, res, 'DB: POST VPV Save', 'Error creating Project Versions ');
				return;
			}
			req.oneVPV = oneVPV;
			// update the version count of the base version or the variant
			updateVPVCount(req.oneVPV.vpid, variantName, 1);
			let reducedVPV = {};
			reducedVPV._id = oneVPV._id;
			reducedVPV.name = oneVPV.name;
			reducedVPV.vpid = oneVPV.vpid;
			reducedVPV.variantName = oneVPV.variantName;
			reducedVPV.timestamp = oneVPV.timestamp;
			reducedVPV.Risiko = oneVPV.Risiko;
			reducedVPV.StrategicFit = oneVPV.StrategicFit;
			reducedVPV.actualDataUntil = oneVPV.actualDataUntil;
			reducedVPV.Erloes = oneVPV.Erloes;
			reducedVPV.leadPerson = oneVPV.leadPerson;
			reducedVPV.startDate = oneVPV.startDate;
			reducedVPV.endDate = oneVPV.endDate;

			reducedVPV.earliestStart = oneVPV.earliestStart;
			reducedVPV.earliestStartDate = oneVPV.earliestStartDate;
			reducedVPV.latestStart = oneVPV.latestStart;
			reducedVPV.latestStartDate = oneVPV.latestStartDate;
			reducedVPV.status = oneVPV.status;
			reducedVPV.ampelStatus = oneVPV.ampelStatus;
			reducedVPV.ampelErlaeuterung = oneVPV.ampelErlaeuterung;
			reducedVPV.VorlagenName = oneVPV.VorlagenName;
			reducedVPV.Dauer = oneVPV.Dauer;
			reducedVPV.volumen = oneVPV.volumen;
			reducedVPV.complexity = oneVPV.complexity;
			reducedVPV.description = oneVPV.description;
			reducedVPV.businessUnit = oneVPV.businessUnit;
			reducedVPV.keyMetrics = oneVPV.keyMetrics;

			return res.status(200).send({
				state: 'success',
				message: 'Successfully created new Project Version',
				vpv: [ reducedVPV ]
			});
		});
	});

router.route('/:vpvid/capacity')

	/**
	 	* @api {get} /vpv/:vpvid/capacity Get Capacity for VISBO Project
		* @apiVersion 1.0.0
	 	* @apiGroup VISBO Project Version
	 	* @apiName GetVISBOProjectCapacity
	 	* @apiHeader {String} access-key User authentication token.
		* @apiDescription Get returns the capacity for a specific Project Version of the Project
		* With additional query paramteters the list could be configured. Available Parameters are: refDate, startDate & endDate, roleID and hierarchy
		* A roleID must be specified. If hierarchy is true, the capacity for the first level of subroles are delivered in addition to the main role.
		*
		* @apiParam {Date} startDate Deliver only capacity values beginning with month of startDate, default is today
		* @apiParam {Date} endDate Deliver only capacity values ending with month of endDate, default is today + 6 months
		* @apiParam {String} roleID Deliver the capacity planning for the specified organisaion, default is complete organisation
		* @apiParam {Boolean} hierarchy Deliver the capacity planning including all dircect childs of roleID
		*
		* @apiPermission Authenticated and VP.View and VP.ViewAudit or VP.Modify Permission for the Project, and VC.View Permission for the VISBO Center.
		* If the user has VP.ViewAduit Permission, he gets in addition to the PD Values also the money values for the capa.
		* @apiError {number} 400 Bad Values in paramter in URL
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View Project Version, or View Visbo Center to get the organisation.
		* @apiError {number} 409 No Organisation configured in the VISBO Center
		*
	 	* @apiExample Example usage:
	 	*   url: https://my.visbo.net/api/vpv/vpv5aada025/capacity?roleID=1
	 	* @apiSuccessExample {json} Response:
	 	* HTTP/1.1 200 OK
	 	* {
	 	*   'state':'success',
	 	*   'message':'Returned Project Versions',
	 	*   'vpv': [{
	 	*     '_id':'vpv5c754feaa',
		*     'timestamp': '2019-03-19T11:04:12.094Z',
		*     'actualDataUntil': '2019-01-31T00:00:00.000Z',
		*     ...
	 	*   }]
	 	* }
		*/
	// Get Capacity calculation for a specific Project Version
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;
		var perm = req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid);
		if (req.listVCPerm && req.oneVP) {
			var permVC = req.listVCPerm.getPerm(sysAdmin ? 0 : req.oneVP.vcid);
			perm.vc = perm.vc | permVC.vc;
		}
		var roleID = req.query.roleID;

		req.auditDescription = 'Project Version Capacity Read';
		req.auditSysAdmin = sysAdmin;
		req.auditTTLMode = 1;

		if ((perm.vc & constPermVC.View) == 0 || !req.visboOrganisations) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Organisation or no Permission to get Organisation from VISBO Center',
				perm: perm
			});
		}

		if ((perm.vp & (constPermVP.ViewAudit + constPermVP.Modify)) == 0 ) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to get Capacity of Project',
				perm: perm
			});
		}
		var onlyPT = true;
		if (perm.vp & constPermVP.ViewAudit ) {
			onlyPT = false;
		}
		if (roleID == undefined ) {
			return res.status(400).send({
				state: 'failure',
				message: 'No roleID given to Calculate Capacities',
				perm: perm
			});
		}
		logger4js.info('Get Project Version capacity for userid %s email %s and vpv %s role %s', userId, useremail, req.oneVPV._id, roleID);

		var capacity = visboBusiness.calcCapacities([req.oneVPV], [req.visboPFV], roleID, req.visboOrganisations, req.query.hierarchy == true, onlyPT);
		return res.status(200).send({
			state: 'success',
			message: 'Returned Project Version',
			count: capacity.length,
			vpv: [ {
				_id: req.oneVPV._id,
				timestamp: req.oneVPV.timestamp,
				actualDataUntil: req.oneVPV.actualDataUntil,
				vpid: req.oneVPV.vpid,
				name: req.oneVPV.name,
				roleID: roleID,
				capacity: capacity
			} ],
			perm: perm
		});
	});

router.route('/:vpvid/keyMetrics')

/**
 	* @api {get} /vpv/:vpvid/keyMetrics Get KeyMetrics for specific Version
	* @apiVersion 1.0.0
 	* @apiGroup VISBO Project Version
 	* @apiName GetVISBOProjectVersionKeyMetrics
 	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get returns the keyMetrics for a specific Project Version the user has access permission to the Project
	* In case of success it delivers an array of VPVs, the array contains 0 or 1 element of the VPV including a list with the special properties for the calculation
	* Without Audit Permission the Cost Part of keyMetrics will not be delivered
	*
	* @apiPermission Authenticated and VP.View and otional VP.ViewAudit Permission for the Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Project Version
	*
 	* @apiExample Example usage:
 	*   url: https://my.visbo.net/api/vpv/vpv5aada025/keyMetrics
 	* @apiSuccessExample {json} Delivery-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   'state':'success',
 	*   'message':'Returned Project Versions',
 	*   'vpv': [{
 	*     '_id':'vpv5c754feaa',
	*     'timestamp': '2019-03-19T11:04:12.094Z',
	*     'actualDataUntil': '2019-01-31T00:00:00.000Z',
	* 		'keyMetrics': {
	* 		   'costBaseLastActual':  220,
	* 		   'costBaseLastTotal':  440,
	* 		   'costCurrentTotal':  440,
	* 		   'costCurrentActual':  220,
	* 		   ...
	*     }
 	*   }]
 	* }
	*/
	// Get KeyMetrics calculated for a specific Project Version
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;
		var perm = req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid);

		req.auditDescription = 'Project Version KeyMetrics Read';
		req.auditTTLMode = 1;
		req.auditSysAdmin = sysAdmin;

		if ((perm.vp & (constPermVP.View + constPermVP.ViewAudit)) != (constPermVP.View + constPermVP.ViewAudit)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to get Project Version KeyMetrics',
				perm: perm
			});
		}
		logger4js.info('Get Project Version KeyMetrics for userid %s email %s and vpv %s/%s pfv %s/%s', userId, useremail, req.oneVPV._id, req.oneVPV.timestamp.toISOString(), req.visboPFV && req.visboPFV._id, req.visboPFV && req.visboPFV.timestamp.toISOString());

		var keyMetricsVPV = visboBusiness.calcKeyMetrics(req.oneVPV, req.visboPFV, req.visboOrganisations);
		return res.status(200).send({
			state: 'success',
			message: 'Returned Project Version',
			count: keyMetricsVPV.length,
			vpv: [ {
				_id: req.oneVPV._id,
				timestamp: req.oneVPV.timestamp,
				actualDataUntil: req.oneVPV.actualDataUntil,
				vpid: req.oneVPV.vpid,
				name: req.oneVPV.name,
				keyMetrics: keyMetricsVPV
			} ],
			perm: perm
		});
	});


router.route('/:vpvid/cost')

/**
 	* @api {get} /vpv/:vpvid/cost Get Costs for specific Version
	* @apiVersion 1.0.0
 	* @apiGroup VISBO Project Version
 	* @apiName GetVISBOProjectVersionCost
 	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get returns the costs for a specific Project Version the user has access permission to the Project
	* In case of success it delivers an array of VPVPropertiesList, the array contains 0 or 1 element of the VPV including a list with the special properties for the calculation
	* With Permission Restricted View, the deliveries were filtered to the restricted View
	*
	* @apiPermission Authenticated and VP.View and VP.ViewAudit Permission for the Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Project Version
	*
 	* @apiExample Example usage:
 	*   url: https://my.visbo.net/api/vpv/vpv5aada025/cost
 	* @apiSuccessExample {json} Delivery-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   'state':'success',
 	*   'message':'Returned Project Versions',
 	*   'vpv': [{
 	*     '_id':'vpv5c754feaa',
	*     'timestamp': '2019-03-19T11:04:12.094Z',
	*     'actualDataUntil': '2019-01-31T00:00:00.000Z',
	* 		'cost': [{
	* 		   'currentDate':  '2018-03-01T00:00:00.000Z',
	* 		   'baseLineCost': 125,
	* 		   'currentCost': 115
	*     }]
 	*   }]
 	* }
	*/
// Get Cost for a specific Project Version
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;
		var perm = req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid);
		if (req.listVCPerm && req.oneVP) {
			var permVC = req.listVCPerm.getPerm(sysAdmin ? 0 : req.oneVP.vcid);
			perm.vc = perm.vc | permVC.vc;
		}

		req.auditDescription = 'Project Version Cost Read';
		req.auditTTLMode = 1;
		req.auditSysAdmin = sysAdmin;

		if ((perm.vc & constPermVC.View) == 0 || !req.visboOrganisations) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Organisation or no Permission to get Organisation from VISBO Center',
				perm: perm
			});
		}
		if ((perm.vp & (constPermVP.View + constPermVP.ViewAudit)) != (constPermVP.View + constPermVP.ViewAudit)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to get Project Version Cost',
				perm: perm
			});
		}
		logger4js.info('Get Project Version Cost for userid %s email %s and vpv %s/%s pfv %s/%s', userId, useremail, req.oneVPV._id, req.oneVPV.timestamp.toISOString(), req.visboPFV && req.visboPFV._id, req.visboPFV && req.visboPFV.timestamp.toISOString());

		var costVPV = visboBusiness.calcCosts(req.oneVPV, req.visboPFV, req.visboOrganisations);
		return res.status(200).send({
			state: 'success',
			message: 'Returned Project Version',
			count: costVPV.length,
			vpv: [ {
				_id: req.oneVPV._id,
				variantName: req.oneVPV.variantName,
				timestamp: req.oneVPV.timestamp,
				actualDataUntil: req.oneVPV.actualDataUntil,
				vpid: req.oneVPV.vpid,
				name: req.oneVPV.name,
				cost: costVPV
			} ],
			perm: perm
		});
	});

router.route('/:vpvid/delivery')

/**
 	* @api {get} /vpv/:vpvid/delivery Get Deliveries for specific Version
	* @apiVersion 1.0.0
 	* @apiGroup VISBO Project Version
 	* @apiName GetVISBOProjectVersionDelivery
 	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get returns the deliveries for a specific Project Version the user has view permission to the Project
	* In case of success it delivers an array of VPVs, the array contains 0 or 1 element of the VPV including a list with the special properties for the calculation
	* With Permission VP.ViewRestriced, the deliveries were filtered to the restricted View
	*
	* @apiParam {String='pfv','vpv'} ref specifies if only values from pfv or vpv should be delivered but in both cases compared between pfv and vpv.
	* if nothing specified all vpv items were delivered without a reference to pfv
	* @apiPermission Authenticated and VP.View or VP.ViewRestriced Permission for the Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Project Version
	*
 	* @apiExample Example usage:
 	*   url: https://my.visbo.net/api/vpv/vpv5aada025/delivery?ref=pfv
 	* @apiSuccessExample {json} Delivery-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   'state':'success',
 	*   'message':'Returned Project Versions',
 	*   'vpv': [{
 	*     '_id':'vpv5c754feaa',
	*     'timestamp': '2019-03-19T11:04:12.094Z',
	*     'actualDataUntil': '2019-01-31T00:00:00.000Z',
	* 		'delivery': [{
	* 		   'name':  Name,
	* 		   'phasePFV':  'Name of Phase in PFV',
	* 		   'phaseVPV':  'Name of Phase in VPV',
	* 		   'description':  'Long Description of the delivery',
	* 		   'datePFV': '2019-05-01T00:00:00.000Z',
	* 		   'dateVPV': '2019-05-02T00:00:00.000Z',
	* 		   'changeDays': 1,
	* 		   'percentDone': 1,
	*     }]
 	*   }]
 	* }
	*/
// Get Deliveries for a specific Project Version
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;
		var perm = req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid);
		var restrictedView = (perm.vp & constPermVP.View) == 0;

		var getAll = req.query.ref != 'pfv';
		var pfv = req.query.ref != 'vpv' ? req.visboPFV : undefined;
		if (!req.visboPFV) {
			// no PFV found, return all vpv
			getAll = true;
		}

		req.auditDescription = 'Project Version Deliveries Read';
		req.auditSysAdmin = sysAdmin;

		var restriction;
		if (restrictedView) {
			getAll = true; // get all from vpv
			restriction = [];
			if (req.oneVP) {
				req.oneVP.restrict.forEach(function(item) {
					if (req.listVPPerm.checkGroupMemberShip(item.groupid)) {
						restriction.push(item);
					}
				});
			}
		}
		logger4js.info('Get Project Version Deliveries for userid %s email %s and vpv %s/%s pfv %s/%s', userId, useremail, req.oneVPV._id, req.oneVPV.timestamp.toISOString(), req.visboPFV && req.visboPFV._id, req.visboPFV && req.visboPFV.timestamp.toISOString());

		var deliveryVPV = visboBusiness.calcDeliverables(req.oneVPV, pfv, getAll, restriction);
		return res.status(200).send({
			state: 'success',
			message: 'Returned Project Version',
			count: deliveryVPV.length,
			vpv: [ {
				_id: req.oneVPV._id,
				variantName: req.oneVPV.variantName,
				timestamp: req.oneVPV.timestamp,
				actualDataUntil: req.oneVPV.actualDataUntil,
				vpid: req.oneVPV.vpid,
				name: req.oneVPV.name,
				delivery: deliveryVPV
			} ],
			perm: perm
		});
	});

router.route('/:vpvid/deadline')

/**
 	* @api {get} /vpv/:vpvid/deadline Get Deadlines for specific Version
	* @apiVersion 1.0.0
 	* @apiGroup VISBO Project Version
 	* @apiName GetVISBOProjectVersionDeadline
 	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get returns the deadlines for a specific Project Version where the user has View permission to the Project
	* In case of success it delivers an array of VPVs, the array contains 0 or 1 element of the VPV including a list with the special properties for the calculation
	* With Permission VP.ViewRestriced, the deadlines were filtered to the restricted View
	*
	* @apiParam {String='pfv','vpv'} ref specifies if only values from pfv or vpv should be delivered but in both cases compared between pfv and vpv.
	* if nothing specified all vpv items were delivered without a reference to pfv
	* @apiPermission Authenticated and VP.View or VP.ViewRestriced Permission for the Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Project Version
	*
 	* @apiExample Example usage:
 	*   url: https://my.visbo.net/api/vpv/vpv5aada025/deadline?ref=pfv
 	* @apiSuccessExample {json} Deadline-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   'state':'success',
 	*   'message':'Returned Project Versions',
 	*   'vpv': [{
 	*     '_id':'vpv5c754feaa',
	*     'timestamp': '2019-03-19T11:04:12.094Z',
	*     'actualDataUntil': '2019-01-31T00:00:00.000Z',
	* 		'deadline': [{
		* 		   'name':  Name,
		* 		   'phasePFV':  'Name of Phase in PFV',
		* 		   'type':  'Phase or Milestone',
		* 		   'datePFV': '2019-05-01T00:00:00.000Z',
		* 		   'dateVPV': '2019-05-02T00:00:00.000Z',
		* 		   'changeDays': 1,
		* 		   'percentDone': 1,
	*     }]
 	*   }]
 	* }
	*/
// Get Deadlines for a specific Project Version
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;
		var perm = req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid);
		var restrictedView = (perm.vp & constPermVP.View) == 0;
		var getAll = req.query.ref != 'pfv';
		var pfv = req.query.ref != 'vpv' ? req.visboPFV : undefined;
		if (!req.visboPFV) {
			// no PFV found, return all vpv
			getAll = true;
		}

		req.auditDescription = 'Project Version Deadlines Read';
		req.auditSysAdmin = sysAdmin;

		var restriction;
		if (restrictedView) {
			getAll = true; // get all from vpv
			restriction = [];
			if (req.oneVP) {
				req.oneVP.restrict.forEach(function(item) {
					if (req.listVPPerm.checkGroupMemberShip(item.groupid)) {
						restriction.push(item);
					}
				});
			}
			pfv = undefined;
		}
		logger4js.info('Get Project Version Deadlines for userid %s email %s and vpv %s/%s pfv %s/%s', userId, useremail, req.oneVPV._id, req.oneVPV.timestamp.toISOString(), req.visboPFV && req.visboPFV._id, req.visboPFV && req.visboPFV.timestamp.toISOString());

		var deadlineVPV = visboBusiness.calcDeadlines(req.oneVPV, pfv, getAll, restriction);
		return res.status(200).send({
			state: 'success',
			message: 'Returned Project Version',
			count: deadlineVPV.length,
			vpv: [ {
				_id: req.oneVPV._id,
				variantName: req.oneVPV.variantName,
				timestamp: req.oneVPV.timestamp,
				actualDataUntil: req.oneVPV.actualDataUntil,
				vpid: req.oneVPV.vpid,
				name: req.oneVPV.name,
				deadline: deadlineVPV
			} ],
			perm: perm
		});
	});

module.exports = router;
