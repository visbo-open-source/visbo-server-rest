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
router.use('/:vpvid/copy', verifyVpv.getCurrentVPVpfv);
router.use('/:vpvid/calc', verifyVpv.getCurrentVPVpfv);

// updates the VPV Count in the VP after create/delete/undelete Visbo Project
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

/////////////////
// Visbo Project Versions API
// /vpv
/////////////////

router.route('/')

/**
	* @api {get} /vpv Get Versions
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Version
	* @apiName GetVisboProjectVersions
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get versions returns for all VisboProjects, the user has access permission to, the latest VisboProjectVersion
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
	* @apiParam {String} vcid Deliver only versions for projects inside a specific VisboCenter
	* @apiParam {String} vpid Deliver only versions for the specified project
	* @apiParam {String} vpfid Deliver only versions for the specified project portfolio version
	* @apiParam {String} variantName Deliver only versions for the specified variant, the parameter can contain a list of variantNames separated by colon. If client wants to have only versions from the main branch, use variantName=
	* @apiParam {String} status Deliver only versions with the specified status
	* @apiParam {String} longList if set deliver all details instead of a short version info for the project version
	* @apiParam {String} keyMetrics if set deliver deliver the keyMetrics for the project version
	*
	* @apiPermission Permission: Authenticated, View Visbo Project.
	* @apiError {number} 400 Bad Values in paramter in URL
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vpv
	*   url: http://localhost:3484/vpv?vcid=vc5c754feaa&refDate=2018-01-01
	*   url: http://localhost:3484/vpv?vpid=vp5c754feaa&refDate=2018-01-01&variantName=Variant1&longList
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Returned Visbo Project Versions',
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
// Get Visbo Project Versions
	.get(function(req, res) {
		var userId = req.decoded._id;
		var sysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Visbo Project Versions (Read)';
		req.auditSysAdmin = sysAdmin;
		if (!req.query.longList) req.auditTTLMode = 1;
		var checkDeleted = req.query.deleted == true;

		logger4js.info('Get Project Versions for user %s with query params %O ', userId, req.query);
		var queryvpv = {};
		var queryvpvids = {};
		var latestOnly = false; 	// as default show all project version of all projects
		var longList = false;		// show only specific columns instead of all
		var keyMetrics = false;
		var nowDate = new Date();

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
			if (req.query.deleted) {
				var perm = req.listVPPerm.getPerm(req.query.vpid);
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
		} else {
			var requiredPerm = constPermVP.View;
			if (req.query.keyMetrics) requiredPerm += constPermVP.ViewAudit;
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
			if (req.query.variantName != undefined){
				logger4js.debug('Variant Query String :%s:', req.query.variantName);
				queryvpv.variantName = {$in: req.query.variantName.split(',')};
			}
			if (req.query.longList != undefined){
				logger4js.debug('longList Query String :%s:', req.query.longList);
				longList = true;
			}
			if (req.query.keyMetrics != undefined){
				logger4js.debug('keyMetrics Query String :%s:', req.query.keyMetrics);
				keyMetrics = true;
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
				errorHandler(err, res, 'DB: GET VPV Find Short', 'Error getting Visbo Project Versions ');
				return;
			}
			var timeMongoEnd = new Date();
			logger4js.debug('Found %d Project Versions in %s ms ', listVPV.length, timeMongoEnd.getTime()-timeMongoStart.getTime());
			// if latestonly, reduce the list and deliver only the latest version of each project and variant
			var vpvidsList = [];
			if (!latestOnly) {
				// push all vpvids to search for more details
				for (let i = 0; i < listVPV.length; i++){
					vpvidsList.push(listVPV[i]._id);
				}
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

				queryVPV.select('_id vpid name timestamp keyMetrics status startDate ampelStatus ampelErlaeuterung variantName businessUnit VorlagenName leadPerson description updatedAt createdAt deletedAt');
			} else if (!longList) {
				// deliver only the short info about project versions
				queryVPV.select('_id vpid name timestamp startDate endDate status ampelStatus variantName businessUnit VorlagenName leadPerson description updatedAt createdAt deletedAt');
			} else {
				req.auditTTLMode = 0;	// Real Download of Visbo Project Versions
			}
			queryVPV.lean();
			queryVPV.exec(function (err, listVPV) {
				if (err) {
					errorHandler(err, res, 'DB: GET VPV Find Full', 'Error getting Visbo Project Versions ');
					return;
				}
				req.auditInfo = listVPV.length;
				req.listVPV = listVPV;
				for (var i = 0; i < listVPV.length; i++) {
					perm = req.listVPPerm.getPerm(sysAdmin ? 0 : listVPV[i].vpid);
					if ((perm.vp & constPermVP.ViewAudit) == 0) {
						listVPV[i].keyMetrics = undefined;
					}
					if ((perm.vp & constPermVP.View) === 0) {
						// only restricted View
						var restriction = [];
						if (req.oneVP) {
							req.oneVP.restrict.forEach(function(item, index) {
								if (req.listVPPerm.checkGroupMemberShip(item.groupid)) {
									restriction.push(item);
								}
							})
						}
						visboBusiness.cleanupRestrictedVersion(listVPV[i], restriction);
					}
				}

				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Project Versions',
					count: listVPV.length,
					vpv: listVPV
				});
			});
		});
	})

/**
	* @api {post} /vpv Create a Version
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Version
	* @apiName CreateVisboProjectVersions
	* @apiDescription Post creates a new Visbo Project Version.
	* The user needs to have Modify permission in the Referenced Project or is the owner of the Variant.
	* Visbo Project Version Properties like _id, name and timestamp are overwritten by the system
	* @apiHeader {String} access-key User authentication token.
	*
	* @apiPermission Authenticated and Permission: View Visbo Project, Modify Visbo Project or Create Variant.
	* @apiError {number} 400 missing name or ID of Visbo Project during Creation, or other bad content in body
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Create Visbo Project Version
	* @apiError {number} 409 Visbo Project Variant does not exists
	* @apiError {number} 409 Visbo Project (Portfolio) Version was alreaddy updated in between (Checked updatedAt Flag)
	* @apiError {number} 423 Visbo Project (Portfolio) is locked by another user
	*
  * @apiExample Example usage:
	*   url: http://localhost:3484/vpv
	* {
	*  'vpid': 'vp5c754feaa'
	*  'allOthers': 'all properties of visbo project version'
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'Successfully created new VisboProjectVersion',
	*  'vpv':[{
	*   '__v':0,
	*   'updatedAt':'2018-03-19T11:04:12.094Z',
	*   'createdAt':'2018-03-19T11:04:12.094Z',
	*   '_id':'vpv5c754feaa',
	*   'name':'My first Visbo Project Version',
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
// POST/Create a Visbo Project Version
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail  = req.decoded.email;

		req.auditDescription = 'Visbo Project Versions (Create)';
		var queryvpv = {};

		var vpid = (req.body.vpid && validate.validateObjectId(req.body.vpid, false)) ? req.body.vpid : 0;
		var variantName = (req.body.variantName  || '').trim();
		var variantIndex = -1;

		logger4js.info('Post a new Visbo Project Version for user %s with name %s variant :%s: in VisboProject %s updatedAt %s with Perm %O', userId, req.body.name, variantName, vpid, req.body.updatedAt, req.listVPPerm.getPerm(vpid));
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
				errorHandler(err, res, 'DB: POST VPV Find VP', 'Error creating Visbo Project Versions ');
				return;
			}
			if (!oneVP) {
				return res.status(403).send({
					state: 'failure',
					message: 'Visbo Project not found or no Permission'
				});
			}
			req.oneVP = oneVP;

			if (variantName != '') {
				// check that the Variant exists
				variantIndex = req.oneVP.variant.findIndex(variant => variant.variantName == variantName)
				if (variantIndex < 0) {
					logger4js.warn('VPV Post Variant does not exist %s %s', vpid, variantName);
					return res.status(409).send({
						state: 'failure',
						message: 'Visbo Project variant does not exist',
						vp: [req.oneVP]
					});
				}
			}
			// check if the version is locked
			if (lockVP.lockStatus(oneVP, useremail, req.body.variantName).locked) {
				logger4js.warn('VPV Post VP locked %s %s', vpid, variantName);
				return res.status(423).send({
					state: 'failure',
					message: 'Visbo Project locked',
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
					errorHandler(err, res, 'DB: POST VPV Find VPV', 'Error creating Visbo Project Versions ');
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
					logger4js.info('POST Visbo Project Version contains illegal strings body %O', req.body);
					return res.status(400).send({
						state: 'failure',
						message: 'Visbo Project Version Body contains invalid strings'
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
				// MS TODO: Remove use of keyMetrics from body after keyMetrics calc works
				newVPV.keyMetrics = req.body.keyMetrics;
				if (newVPV.variantName == 'pfv') {
					newVPV.keyMetrics = undefined;
					req.visboPFV = newVPV;	// use current version as PFV
				}
				var obj = visboBusiness.calcKeyMetrics(newVPV, req.visboPFV, req.visboOrganisations ? req.visboOrganisations[0] : undefined);
				if (!obj || Object.keys(obj).length < 1) {
					// no valid key Metrics delivered
					if (req.body.keyMetrics && newVPV.variantName != 'pfv') {
						newVPV.keyMetrics = req.body.keyMetrics;
					}
				} else {
					newVPV.keyMetrics = obj;
				}

				logger4js.debug('Create VisboProjectVersion in Project %s with Name %s and timestamp %s', newVPV.vpid, newVPV.name, newVPV.timestamp);
				newVPV.save(function(err, oneVPV) {
					if (err) {
						errorHandler(err, res, 'DB: POST VPV Save', 'Error creating Visbo Project Versions ');
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
 	* @apiGroup Visbo Project Version
 	* @apiName GetVisboProjectVersion
 	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get returns a specific VisboProjectVersion the user has access permission to the VisboProject
	* In case of success it delivers an array of VPVs, the array contains 0 or 1 element with a VPV
	*
	* @apiPermission Permission: Authenticated, View Visbo Project.
	* @apiError {number} 400 Bad Values in paramter in URL
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Visbo Project Version
	*
 	* @apiExample Example usage:
 	*   url: http://localhost:3484/vpv/vpv5aada025
 	* @apiSuccessExample {json} Success-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   'state':'success',
 	*   'message':'Returned Visbo Project Versions',
 	*   'vpv': [{
 	*     '_id':'vpv5c754feaa',
	*     'name':'My new Visbo Project Version',
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
// Get a specific Visbo Project Version
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Visbo Project Version (Read)';
		req.auditSysAdmin = sysAdmin;
		req.auditTTLMode = 0;	// Real Download of Visbo Project Version

		logger4js.info('Get Visbo Project Version for userid %s email %s and vpv %s :%O ', userId, useremail, req.params.vpvid);

		var perm = req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid);
		if ((perm.vp & constPermVP.ViewAudit) == 0) {
			req.oneVPV.keyMetrics = undefined;
		}
		if ((perm.vp & constPermVP.View) === 0) {
			// only restricted View
			var restriction = [];
			req.oneVP.restrict.forEach(function(item, index) {
				if (req.listVPPerm.checkGroupMemberShip(item.groupid)) {
					restriction.push(item);
				}
			})
			visboBusiness.cleanupRestrictedVersion(req.oneVPV, restriction);
		}

		return res.status(200).send({
			state: 'success',
			message: 'Returned Visbo Project Version',
			vpv: [req.oneVPV],
			perm: req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid)
		});
	})

/**
	* @api {put} /vpv/:vpvid Update Project Version
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Version
	* @apiName UpdateVisboProjectVersion
	* @apiDescription Put updates a specific Visbo Project Version used for undelete
	* the system checks if the user has Delete permission to the Visbo Project.
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and Permission: View Visbo Project, Delete Visbo Project.
	* @apiError {number} 400 not allowed to change Visbo Project Version or bad values in body
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Modify Visbo Project
	* @apiExample Example usage:
	*   url: http://localhost:3484/vpv/vpv5cf3da025?deleted=1
	* {
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'Successfully updated VisboProject Renamed',
	*  'vpv':[{
	*     '_id':'vpv5c754feaa',
	*     'name':'My new Visbo Project Version',
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
// Update Visbo Project Version (Undelete)
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Visbo Project Version (Update)';

		logger4js.info('PUT/Save Visbo Project Version for userid %s email %s and vpv %s perm %O', userId, useremail, req.params.vpvid, req.listVPPerm);

		var vpUndelete = false;
		// undelete the VP in case of change
		if (req.oneVPV.deletedAt) {
			req.auditDescription = 'Visbo Project Version (Undelete)';
			req.oneVPV.deletedAt = undefined;
			vpUndelete = true;
			logger4js.debug('Undelete VPV %s', req.oneVPV._id);
		}
		if (!vpUndelete) {
			return res.status(400).send({
				state: 'failure',
				message: 'not possible to change Visbo Project Version'
			});
		}

		var perm = req.listVPPerm.getPerm(req.oneVPV.vpid);
		if (!(perm.vp & constPermVP.Delete)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Undelete Visbo Project Version',
				perm: perm
			});
		}
		logger4js.debug('PUT VPV: save now %s unDelete %s', req.oneVPV._id, vpUndelete);
		req.oneVPV.save(function(err, oneVPV) {
			if (err) {
				errorHandler(err, res, 'DB: PUT VPV Save', 'Error updating Visbo Project Versions ');
				return;
			}
			req.oneVPV = oneVPV;
			updateVPVCount(req.oneVPV.vpid, req.oneVPV.variantName, 1);
			return res.status(200).send({
				state: 'success',
				message: 'Updated Visbo Project Version',
				vpv: [ oneVPV ]
			});
		});
	})

/**
	* @api {delete} /vpv/:vpvid Delete specific Version
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Version
	* @apiName DeleteVisboProjectVersion
	* @apiDescription Deletes a specific Visbo Project Version.
	* @apiHeader {String} access-key User authentication token.
	*
	* @apiPermission Permission: Authenticated, View Visbo Project, Delete Visbo Project.
	* @apiError {number} 400 Bad Parameter in URL
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Delete Visbo Project Version or Project Version does not exists
	* @apiError {number} 423 Visbo Project locked by another user
	*
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vpv/vpv5c754feaa
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Deleted Visbo Project Version'
	* }
	*/
// delete a Visbo Project Version
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Visbo Project Version (Delete)';

		logger4js.info('DELETE Visbo Project Version for userid %s email %s and vc %s ', userId, useremail, req.params.vpvid);
		logger4js.debug('DELETE Visbo Project Version DETAILS ', req.oneVPV._id, req.oneVP.name, req.oneVPV.variantName);

		var variantIndex;
		var variantName = req.oneVPV.variantName;
		if (variantName != '') {
			// check that the Variant exists
			variantIndex = req.oneVP.variant.findIndex(variant => variant.variantName == variantName)
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
				message: 'Visbo Project Version no permission to delete Version',
				perm: perm
			});
		}
		// check if the project is locked
		if (lockVP.lockStatus(req.oneVP, useremail, variantName).locked) {
			return res.status(423).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [req.oneVP]
			});
		}
		var destroyVPV = req.oneVPV.deletedAt;

		if (!destroyVPV) {
			logger4js.debug('Delete Visbo Project Version %s %s', req.params.vpvid, req.oneVPV._id);
			variantName = req.oneVPV.variantName;

			req.oneVPV.deletedAt = new Date();
			req.oneVPV.save(function(err, oneVPV) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VPV Save', 'Error deleting Visbo Project Versions ');
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
			req.auditDescription = 'Visbo Project Version (Destroy)';
			logger4js.info('Destroy Visbo Project Version %s %s', req.params.vpvid, req.oneVPV._id);
			var queryVPV = {};
			queryVPV._id = req.oneVPV._id;
			VisboProjectVersion.deleteOne(queryVPV, function(err) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VPV Destroy', 'Error deleting Visbo Project Versions ');
					return;
				}
				// no need to update vpvCount in VP
				return res.status(200).send({
					state: 'success',
					message: 'Destroyed Visbo Project Version'
				});
			});

		}
	});

	router.route('/:vpvid/copy')

	/**
		* @api {post} /vpv/:vpvid/copy Create a Copy of a Version
		* @apiVersion 1.0.0
		* @apiGroup Visbo Project Version
		* @apiName VisboProjectVersionCopy
		* @apiDescription Post copies an existing version to a new Version with new timestamp and new calculated keyMetrics.
		* The user needs to have Modify permission in the Referenced Project or is the owner of the Variant.
		* Visbo Project Version Properties like _id, name and timestamp are overwritten by the system
		* @apiHeader {String} access-key User authentication token.
		*
		* @apiPermission Authenticated and Permission: View Visbo Project, Modify Visbo Project or Create Variant.
		* @apiError {number} 400 missing name or ID of Visbo Project during Creation, or other bad content in body
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create Visbo Project Version
		*
	  * @apiExample Example usage:
		*   url: http://localhost:3484/vpv/vpv5c754feaa/copy
		* {
		*  'timestamp': '2019-03-19T11:04:12.094Z'
		* }
		* @apiSuccessExample {json} Success-Response:
		*     HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'Successfully created new VisboProjectVersion',
		*  'vpv':[{
		*   '__v':0,
		*   'updatedAt':'2019-03-19T11:04:12.094Z',
		*   'createdAt':'2019-03-19T11:04:12.094Z',
		*   '_id':'vpv5c754feaa',
		*   'name':'My first Visbo Project Version',
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
	// POST/Copy a Visbo Project Version with a new TimeStamp and a new calculation for keyMetrics
		.post(function(req, res) {
			var userId = req.decoded._id;

			req.auditDescription = 'Visbo Project Versions (Copy)';

			var vpid = req.oneVPV.vpid;
			var variantName = req.oneVPV.variantName;

			logger4js.info('Post a copy Visbo Project Version for user %s with name %s variant :%s: in VisboProject %s updatedAt %s with Perm %O', userId, req.body.name, variantName, vpid, req.body.updatedAt, req.listVPPerm.getPerm(vpid));
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
			// MS TODO: ignore keyMetrics from body
			newVPV.keyMetrics = visboBusiness.calcKeyMetrics(newVPV, req.visboPFV, req.visboOrganisations ? req.visboOrganisations[0] : undefined);
			if (!newVPV.keyMetrics && req.body.keyMetrics) {
				newVPV.keyMetrics = req.body.keyMetrics;
			}

			logger4js.debug('Create VisboProjectVersion in Project %s with Name %s and timestamp %s', newVPV.vpid, newVPV.name, newVPV.timestamp);
			newVPV.save(function(err, oneVPV) {
				if (err) {
					errorHandler(err, res, 'DB: POST VPV Save', 'Error creating Visbo Project Versions ');
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

	router.route('/:vpvid/calc')

	/**
	 	* @api {get} /vpv/:vpvid/calc Get calculation for specific Version
		* @apiVersion 1.0.0
	 	* @apiGroup Visbo Project Version
	 	* @apiName GetVisboProjectVersionCalc
	 	* @apiHeader {String} access-key User authentication token.
		* @apiDescription Get returns the calculation for a specific VisboProjectVersion the user has access permission to the VisboProject
		* In case of success it delivers an array of VPVPropertiesList, the array contains 0 or 1 element of the VPV including a list with the special properties for the calculation
		*
		* @apiParam {String='Costs','Deliveries','Deadlines', 'KeyMetrics'} type Specifies the type of calculation for the VPV
		* Costs: delivers the monthly costs (default)
		* Deliveries: delivers the list of Deliveries with Phase, Name, endDates and %Done
		* Deadlines: delivers the list of Milesones & Phases with PhaseName, Name, endDates, %Done
		* @apiPermission Permission: Authenticated, View Visbo Project.
		* @apiError {number} 400 Bad Values in paramter in URL
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View Visbo Project Version
		*
	 	* @apiExample Example usage:
	 	*   url: http://localhost:3484/vpv/vpv5aada025/calc?type=Costs
	 	* @apiSuccessExample {json} Cost-Response:
	 	* HTTP/1.1 200 OK
	 	* {
	 	*   'state':'success',
	 	*   'message':'Returned Visbo Project Versions',
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
		*   url: http://localhost:3484/vpv/vpv5aada025/calc?type=Costs
	 	* @apiSuccessExample {json} Delivery-Response:
	 	* HTTP/1.1 200 OK
	 	* {
	 	*   'state':'success',
	 	*   'message':'Returned Visbo Project Versions',
	 	*   'vpv': [{
	 	*     '_id':'vpv5c754feaa',
		*     'timestamp': '2019-03-19T11:04:12.094Z',
		*     'actualDataUntil': '2019-01-31T00:00:00.000Z',
		* 		'deliveries': [{
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
		*   url: http://localhost:3484/vpv/vpv5aada025/calc?type=Deadlines
		* @apiSuccessExample {json} Deadline-Response:
	 	* HTTP/1.1 200 OK
	 	* {
	 	*   'state':'success',
	 	*   'message':'Returned Visbo Project Versions',
	 	*   'vpv': [{
	 	*     '_id':'vpv5c754feaa',
		*     'timestamp': '2019-03-19T11:04:12.094Z',
		*     'actualDataUntil': '2019-01-31T00:00:00.000Z',
		* 		'deadlines': [{
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
		*   url: http://localhost:3484/vpv/vpv5aada025/calc?type=Deliveries
		*/
	// Get keyMetrics calculation for a specific Visbo Project Version
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var sysAdmin = req.query.sysadmin ? true : false;
			var perm = req.listVPPerm.getPerm(sysAdmin ? 0 : req.oneVPV.vpid);
			var calcVPV;

			req.auditDescription = 'Visbo Project Version Calc (Read)';
			req.auditSysAdmin = sysAdmin;
			req.auditTTLMode = 1;

			if ((perm.vp & constPermVP.ViewAudit) == 0) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to Calculate KeyMetrics for Visbo Project Version',
					perm: perm
				});
			}

			logger4js.info('Get Visbo Project Version Calc for userid %s email %s and vpv %s/%s pfv %s/%s', userId, useremail, req.oneVPV._id, req.oneVPV.timestamp.toISOString(), req.visboPFV && req.visboPFV._id, req.visboPFV && req.visboPFV.timestamp.toISOString());
			var getAll = req.query.all == true;
			if (req.query.type == 'Deliveries') {
				calcVPV = visboBusiness.calcDeliverables(req.oneVPV, req.visboPFV, getAll);
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Project Version',
					count: calcVPV.length,
					vpv: [ {
						_id: req.oneVPV._id,
						timestamp: req.oneVPV.timestamp,
						actualDataUntil: req.oneVPV.actualDataUntil,
						vpid: req.oneVPV.vpid,
						name: req.oneVPV.name,
						deliveries: calcVPV
					} ],
					perm: perm
				});
			} else if (req.query.type == 'Deadlines') {
				calcVPV = visboBusiness.calcDeadlines(req.oneVPV, req.visboPFV, getAll);
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Project Version',
					count: calcVPV.length,
					vpv: [ {
						_id: req.oneVPV._id,
						timestamp: req.oneVPV.timestamp,
						actualDataUntil: req.oneVPV.actualDataUntil,
						vpid: req.oneVPV.vpid,
						name: req.oneVPV.name,
						deadlines: calcVPV
					} ],
					perm: perm
				});
			} else if (req.query.type == 'Costs') {
				calcVPV = visboBusiness.calcCosts(req.oneVPV, req.visboPFV, req.visboOrganisations ? req.visboOrganisations[0] : undefined);
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Project Version',
					count: calcVPV.length,
					vpv: [ {
						_id: req.oneVPV._id,
						timestamp: req.oneVPV.timestamp,
						actualDataUntil: req.oneVPV.actualDataUntil,
						vpid: req.oneVPV.vpid,
						name: req.oneVPV.name,
						cost: calcVPV
					} ],
					perm: perm
				});
			} else if (req.query.type == 'KeyMetrics') {
				calcVPV = visboBusiness.calcKeyMetrics(req.oneVPV, req.visboPFV, req.visboOrganisations ? req.visboOrganisations[0] : undefined);
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Project Version',
					vpv: [ {
						_id: req.oneVPV._id,
						timestamp: req.oneVPV.timestamp,
						actualDataUntil: req.oneVPV.actualDataUntil,
						vpid: req.oneVPV.vpid,
						name: req.oneVPV.name,
						keyMetrics: calcVPV
					} ],
					perm: perm
				});
			}
		});


module.exports = router;
