var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var exec = require('child_process').exec;
var auth = require('./../components/auth');
var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var systemVC = require('./../components/systemVC');
var lockVP = require('./../components/lock');
var verifyVc = require('./../components/verifyVc');
var verifyVpv = require('./../components/verifyVpv');
var helperVpv = require('./../components/helperVpv');
var visboBusiness = require('./../components/visboBusiness');
var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');

var ConstPerm = require('../models/constPerm');
var constPermVP = ConstPerm.constPermVP;
var constPermVC = ConstPerm.constPermVC;

var logModule = 'VPV';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// register the VPV middleware to get the latest VPV without Permission Check
router.use('/', verifyVpv.getVPVwoPerm);
// register the VPV middleware to generate the Group List to check permission
router.use('/', verifyVpv.getAllVPVGroups);
// register the VPV middleware to check that the user has access to the VPV
router.param('vpvid', verifyVpv.getVPV);
router.use('/:vpvid', verifyVpv.getAllVPVsShort);
// register the middleware to collect get the related VP if required
router.use('/', verifyVpv.getOneVP);
// register the organisation middleware to get the related organisation
router.use('/', verifyVc.getVCOrgs);
// register the base line middleware to get the related base line version
router.use('/', verifyVpv.getVPVpfv);

// register the VPF middleware to generate the Project List that is assigned to the portfolio
router.use('/', verifyVpv.getPortfolioVPs);
// register the base line middleware to get the VC Settings if necessary
router.use('/', verifyVc.getVCSetting);

// register the get VPF middleware for calls for a specific VPV, like /cost, /capacity, /copy, /deliveries, /deadlines
router.use('/:vpvid/*', verifyVpv.getCurrentVPVpfv);
router.use('/:vpvid', verifyVpv.getVCGroups);


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

function saveRecalcKM(req, res, message) {
	if (!req.oneVPV) {
		errorHandler(undefined, res, 'saveReaclcKM: No VPV found', 'Error creating Project Versions ');
		return;
	}
	if (req.oneVPV.variantName != 'pfv' && req.visboPFV) {
		var obj = visboBusiness.calcKeyMetrics(req.oneVPV, req.visboPFV, req.visboOrganisation);
		if (!obj || Object.keys(obj).length < 1) {
			// no valid key Metrics delivered
			if (req.body.keyMetrics && req.oneVPV.variantName != 'pfv' && helperVpv.checkValidKeyMetrics(req.body.keyMetrics)) {
				req.oneVPV.keyMetrics = req.body.keyMetrics;
			}
		} else {
			req.oneVPV.keyMetrics = obj;
			if (req.visboPFV) {
				req.oneVPV.keyMetrics.baselineDate = req.visboPFV.timestamp;
				req.oneVPV.keyMetrics.baselineVPVID = req.visboPFV._id;
			}
		}
	} else if (req.oneVPV.variantName != 'pfv') {
		// restore a vpv and no visboPFV exists, delete keyMetrics as there is no related baseline
		req.oneVPV.keyMetrics = undefined;
	}
	logger4js.debug('Create ProjectVersion in Project %s with Name %s and timestamp %s', req.oneVPV.vpid, req.oneVPV.name, req.oneVPV.timestamp);

	// check if newVPV is a valid VPV
	if (!req.query.noValidate) {
		if (!visboBusiness.ensureValidVPV(req.oneVPV)) {
			logger4js.info('POST Project Version - inconsistent VPV - %s', JSON.stringify(req.oneVPV));
			return res.status(400).send({
				state: 'failure',
				message: 'Project Version is an inconsistent VPV'
			});
		}
	}
	// check if prediction is enabled and needed
	var fsModell = systemVC.getPredictModel();
	logger4js.info(`Recalc Predict? VPV ${req.oneVPV._id} VP: ${req.oneVPV.vpid} Enabled: ${verifyVc.isVCEnabled(req, 'EnablePredict', 2)} PredictModel: ${fsModell}`);
	if (req.oneVPV.keyMetrics && verifyVc.isVCEnabled(req, 'EnablePredict', 2) && fsModell) {
		var cmd = './PredictKM';
		var reducedKM = [];
		if (req.oneVPV.keyMetrics && req.oneVPV.keyMetrics.costBaseLastTotal && req.oneVPV.keyMetrics.endDateBaseLast) {
			var tmpVPV = {};
			tmpVPV._id = req.oneVPV._id;
			tmpVPV.vpid = req.oneVPV.vpid;
			tmpVPV.timestamp = req.oneVPV.timestamp;
			tmpVPV.costCurrentActual = req.oneVPV.keyMetrics.costCurrentActual || 0;
			tmpVPV.costCurrentTotal = req.oneVPV.keyMetrics.costCurrentTotal || 0;
			tmpVPV.costBaseLastActual = req.oneVPV.keyMetrics.costBaseLastActual || 0;
			tmpVPV.costBaseLastTotal = req.oneVPV.keyMetrics.costBaseLastTotal || 0;
			tmpVPV.endDateCurrent = req.oneVPV.keyMetrics.endDateCurrent || req.oneVPV.endDate;
			tmpVPV.endDateBaseLast = req.oneVPV.keyMetrics.endDateBaseLast;
			reducedKM.push(tmpVPV);
		}
		cmd = cmd.concat(' \'', JSON.stringify(reducedKM), '\' ', fsModell);
		if (reducedKM.length) {
			logger4js.warn('POST VPV calculate Prediction for Version', req.oneVPV._id, req.oneVPV.variantName || 'Standard');
			exec(cmd, function callback(error, stdout, stderr) {
				if (error) {
					errorHandler(undefined, res, 'predictKM:'.concat(stderr), 'Error getting Prediction ');
					return;
				}
				var predictVPV = JSON.parse(stdout);
				if (!predictVPV || predictVPV.length != 1) {
					errorHandler(undefined, res, 'predictKM no JSON:'.concat(stdout), 'Error getting Prediction ');
					return;
				}
				// update the original keyMetric with predictedKM
				req.oneVPV.keyMetrics.costCurrentTotalPredict = predictVPV[0].costCurrentTotal;
				req.oneVPV.save(function(err, oneVPV) {
					if (err) {
						errorHandler(err, res, 'DB: POST VPV Save', 'Error creating Project Versions ');
						return;
					}
					req.oneVPV = oneVPV;
					// update the version count of the base version or the variant
					helperVpv.updateVPVCount(req.oneVPV.vpid, req.oneVPV.variantName, 1);

					// cleanup cost keyMetrics in case of missing audit permission
					var perm = req.listVPPerm.getPerm(req.oneVPV.vpid);
					if ((perm.vp & constPermVP.ViewAudit) == 0 && req.oneVPV.keyMetrics) {
						helperVpv.cleanupKM(req.oneVPV.keyMetrics);
					}

					return res.status(200).send({
						state: 'success',
						message: message,
						vpv: [ oneVPV ]
					});
				});
			});
		} else {
			logger4js.info('No Versions for Prediction');
			req.oneVPV.save(function(err, oneVPV) {
				if (err) {
					errorHandler(err, res, 'DB: POST VPV Save', 'Error creating Project Versions ');
					return;
				}
				req.oneVPV = oneVPV;
				// update the version count of the base version or the variant
				helperVpv.updateVPVCount(req.oneVPV.vpid, req.oneVPV.variantName, 1);

				// cleanup cost keyMetrics in case of missing audit permission
				var perm = req.listVPPerm.getPerm(req.oneVPV.vpid);
				if ((perm.vp & constPermVP.ViewAudit) == 0 && req.oneVPV.keyMetrics) {
					helperVpv.cleanupKM(req.oneVPV.keyMetrics);
				}

				return res.status(200).send({
					state: 'success',
					message: message,
					vpv: [ oneVPV ]
				});
			});
		}
	} else {
		req.oneVPV.save(function(err, oneVPV) {
			if (err) {
				errorHandler(err, res, 'DB: POST VPV Save', 'Error creating Project Versions ');
				return;
			}
			req.oneVPV = oneVPV;
			// update the version count of the base version or the variant
			helperVpv.updateVPVCount(req.oneVPV.vpid, req.oneVPV.variantName, 1);

			// cleanup cost keyMetrics in case of missing audit permission
			var perm = req.listVPPerm.getPerm(req.oneVPV.vpid);
			if ((perm.vp & constPermVP.ViewAudit) == 0 && req.oneVPV.keyMetrics) {
				helperVpv.cleanupKM(req.oneVPV.keyMetrics);
			}

			return res.status(200).send({
				state: 'success',
				message: message,
				vpv: [ oneVPV ]
			});
		});
	}
}

function getRecalcKM(req, res, message) {
	if (!req.listVPV) {
		errorHandler(undefined, res, 'fetchRecalcKM: No VPV list found', 'Error getting Project Versions ');
		return;
	}
	// check if prediction is enabled and needed
	var fsModell = systemVC.getPredictModel();
	if (verifyVc.isVCEnabled(req, 'EnablePredict', 2) && fsModell) {
		var cmd = './PredictKM';
		var reducedKM = [];
		req.listVPV.forEach(vpv => {
			if (vpv.keyMetrics && vpv.keyMetrics.costBaseLastTotal && vpv.keyMetrics.endDateBaseLast) {
				var newVPV = {};
				newVPV._id = vpv._id;
				newVPV.vpid = vpv.vpid;
				newVPV.timestamp = vpv.timestamp;
				newVPV.costCurrentActual = vpv.keyMetrics.costCurrentActual || 0;
				newVPV.costCurrentTotal = vpv.keyMetrics.costCurrentTotal || 0;
				newVPV.costBaseLastActual = vpv.keyMetrics.costBaseLastActual || 0;
				newVPV.costBaseLastTotal = vpv.keyMetrics.costBaseLastTotal || 0;
				newVPV.endDateCurrent = vpv.keyMetrics.endDateCurrent || vpv.keyMetrics.endDateBaseLast;
				newVPV.endDateBaseLast = vpv.keyMetrics.endDateBaseLast;
				reducedKM.push(newVPV);
			}
		});
		cmd = cmd.concat(' \'', JSON.stringify(reducedKM), '\' ', fsModell);
		if (reducedKM.length) {
			logger4js.warn('Recalc %d Versions for Prediction', reducedKM.length, cmd.length);
			exec(cmd, function callback(error, stdout, stderr) {
				if (error) {
					errorHandler(undefined, res, 'predictKM:'.concat(stderr), 'Error getting Prediction ');
					return;
				}
				var predictVPV = JSON.parse(stdout);
				if (!predictVPV) {
					errorHandler(undefined, res, 'predictKM no JSON:'.concat(stdout), 'Error getting Prediction ');
					return;
				}
				// update the original keyMetric with predicted BAC
				predictVPV.forEach(vpv => {
					if (vpv._id && vpv.costCurrentTotal) {
						var origVPV = req.listVPV.find(item => item._id.toString() == vpv._id.toString());
						if (origVPV) {
							origVPV.keyMetrics.costCurrentTotalPredict = vpv.costCurrentTotal;
						}
					}
				});
				return res.status(200).send({
					state: 'success',
					message: message,
					count: req.listVPV.length,
					vpv: req.listVPV
				});
			});
		} else {
			logger4js.info('No Versions for Prediction');
			return res.status(200).send({
				state: 'success',
				message: message,
				count: req.listVPV.length,
				vpv: req.listVPV
			});
		}
	} else {
		return res.status(200).send({
			state: 'success',
			message: message,
			count: req.listVPV.length,
			vpv: req.listVPV
		});
	}
}

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
	* @apiParam {String} longList if set deliver all details instead of a short version info for the project version
	* @apiParam {String} keyMetrics if set to 1 deliver the keyMetrics for the project version if 2 recalculate prediction and deliver the keyMetrics
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
		var keyMetrics = validate.validateNumber(req.query.keyMetrics, true);
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
				keyMetrics = 0;
				reducedPerm = true;
			}
		} else {
			var requiredPerm = constPermVP.View;
			vpidList = req.listVPPerm.getVPIDs(requiredPerm);
		}

		logger4js.trace('Get VPV vpid List %O ', vpidList);

		if (req.query) {
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

		logger4js.debug('Get Project Versions for user %s for %d VPs Variant %s, timestamp %O latestOnly %s', userId, vpidList.length, queryvpv.variantName, queryvpv.timestamp, latestOnly);

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
				queryVPV.select('_id vpid name timestamp keyMetrics status startDate endDate actualDataUntil ampelStatus ampelErlaeuterung variantName businessUnit VorlagenName leadPerson description updatedAt createdAt deletedAt');
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
						helperVpv.cleanupKM(listVPV[i].keyMetrics);
					}
				}
				if (keyMetrics == 2) {
					getRecalcKM(req, res, 'Returned VISBO Project Versions');
				} else {
					return res.status(200).send({
						state: 'success',
						message: 'Returned VISBO Project Versions',
						count: listVPV.length,
						vpv: listVPV
					});
				}
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
	* @apiError {number} 412 Project status does not allow any new version
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

		req.auditDescription = 'Project Version Create';
		var queryvpv = {};

		var vpid = (req.body.vpid && validate.validateObjectId(req.body.vpid, false)) ? req.body.vpid : 0;
		var variantName = (req.body.variantName  || '').trim();
		var variantIndex = -1;

		logger4js.info('Post a new Project Version for user %s with name %s variant :%s: TS: %s in Project %s updatedAt %s with Perm %O', userId, req.body.name, variantName, req.body.timestamp, vpid, req.body.updatedAt, req.listVPPerm.getPerm(vpid));
		var permCreateVersion = false;
		var perm = req.listVPPerm.getPerm(vpid);
		if (variantName == 'pfv') {
			if ((perm.vp & constPermVP.Modify) && (perm.vc & constPermVC.Modify)) {
				permCreateVersion = true;
			}
		} else if (perm.vp & constPermVP.Modify) {
			permCreateVersion = true;
		} else if ((perm.vp & constPermVP.CreateVariant) && variantName != '' && variantName != 'pfv') {
			permCreateVersion = true;
		}
		if (!permCreateVersion) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Create the specific Variant',
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
				} else if (!(perm.vp & constPermVP.Modify)) {
					// check if the user owns the variant
					var variant = req.oneVP.variant[variantIndex];
					if (useremail != variant.email) {
						return res.status(409).send({
							state: 'failure',
							message: 'Project variant does not belong to user',
							vp: [req.oneVP]
						});
					}
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
			// check if the VP has the vpStatus  'paused' or 'finished' or 'stopped'
			if (req.oneVP.vpStatus == 'paused' || req.oneVP.vpStatus == 'finished' || req.oneVP.vpStatus == 'stopped') {
				logger4js.warn('VPV Post VP status %s %s %s', vpid, req.oneVP.name, req.oneVP.vpStatus);
				return res.status(412).send({
					state: 'failure',
					message: 'Project status does not allow any new version',
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

				var newVPV = helperVpv.initVPV(req.body);
				helperVpv.cleanupVPV(newVPV);
				if (!newVPV) {
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
				if (req.visboPFV) {
					newVPV.Erloes = req.visboPFV.Erloes;
				}
				var customField;
				if (req.oneVP && req.oneVP.customFieldString) {
					customField = req.oneVP.customFieldString.find(item => item.name == '_businessUnit');
					if (customField) { newVPV.businessUnit = customField.value; }
				}
				if (req.oneVP && req.oneVP.customFieldDouble) {
					customField = req.oneVP.customFieldDouble.find(item => item.name == '_risk');
					if (customField) { newVPV.Risiko = customField.value; }
					customField = req.oneVP.customFieldDouble.find(item => item.name == '_strategicFit');
					if (customField) { newVPV.StrategicFit = customField.value; }
				}
				// if (req.oneVP && req.oneVP.customFieldDate) {
				// 	customField = req.oneVP.customFieldDate.find(item => item.name == '_PMCommit');
				// 	if (customField) { newVPV.pmCommit = customField.value; }
				// }
				newVPV.status = undefined;
				if (req.oneVP && req.oneVP.vpStatus) {
					newVPV.vpStatus = req.oneVP.vpStatus;
				}

				req.oneVPV = newVPV;
				saveRecalcKM(req, res, 'Successfully created new Project Version');
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
			helperVpv.cleanupKM(req.oneVPV.keyMetrics);
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

		logger4js.info('PUT/Save Project Version for userid %s email %s and vpv %s', userId, useremail, req.params.vpvid);

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
		if (req.oneVPV.variantName != 'pfv') {
			// fetch the pfv Version and calculate the keyMetrics
			var queryvpv = {};
			queryvpv.deletedAt = {$exists: false};
			queryvpv.deletedByParent = {$exists: false};
			queryvpv.vpid = req.oneVPV.vpid;
			queryvpv.variantName = 'pfv';
			queryvpv.timestamp = {$lt: req.oneVPV.timestamp};
			var queryVPV = VisboProjectVersion.find(queryvpv);
			queryVPV.sort('-timestamp');
			queryVPV.lean();
			queryVPV.exec(function (err, listPFV) {
				if (err) {
					errorHandler(err, res, 'DB: GET VPV during Undelete', 'Error getting Project Versions ');
					return;
				}
				if (listPFV && listPFV.length > 0) {
					req.onePFV = listPFV[0];
				}
				saveRecalcKM(req, res, 'Successfully updated Project Version');
			});
		} else {
			logger4js.debug('PUT VPV: save now %s unDelete %s', req.oneVPV._id, vpUndelete);
			if (req.visboAllVPVs && req.visboAllVPVs.length > 0) {
				var ts = new Date(req.visboAllVPVs[0].timestamp);
				var tsUndelete = new Date(req.oneVPV.timestamp);
				if (ts.getTime() > tsUndelete.getTime()) {
					return res.status(409).send({
						state: 'failure',
						message: 'Newer Project Version exists, Baseline could not be restored',
						vpv: [ req.oneVPV ]
					});
				}
			}
			req.oneVPV.save(function(err, oneVPV) {
				if (err) {
					errorHandler(err, res, 'DB: PUT VPV Save', 'Error updating Project Versions ');
					return;
				}
				req.oneVPV = oneVPV;
				helperVpv.updateVPVCount(req.oneVPV.vpid, req.oneVPV.variantName, 1);
				return res.status(200).send({
					state: 'success',
					message: 'Updated Project Version',
					vpv: [ oneVPV ]
				});
			});
		}
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

		// check if the VP has the vpStatus  'paused' or 'finished' or 'stopped'
		if (req.oneVP.vpStatus == 'paused' || req.oneVP.vpStatus == 'finished' || req.oneVP.vpStatus == 'stopped') {
			logger4js.warn('VPV Post VP status %s %s', req.oneVPV.vpid, req.oneVP.vpStatus);
			return res.status(412).send({
				state: 'failure',
				message: 'Project status does not allow to delete a version',
				vp: [req.oneVP]
			});
		}

		var destroyVPV = req.oneVPV.deletedAt;

		if (!destroyVPV) {
			logger4js.debug('Delete Project Version %s %s', req.params.vpvid, req.oneVPV._id);
			variantName = req.oneVPV.variantName;
			if (req.oneVPV.variantName == 'pfv' && req.visboAllVPVs && req.visboAllVPVs.length > 0) {
				// check if a newer VPV exists and if so, forbid to delete the baseline as long as a newer version exists
				var refDate = new Date(req.oneVPV.timestamp);
				var newVPV = req.visboAllVPVs.find(vpv => (new Date(vpv.timestamp)).getTime() > refDate.getTime());
				if (newVPV) {
					logger4js.warn('PFV Delete not possible as a newer VPV exists', req.oneVPV._id, newVPV._id);
					return res.status(409).send({
						state: 'failure',
						message: 'Could not delete Baseline because a newer VPV exists',
						perm: perm
					});
				}
			}

			req.oneVPV.deletedAt = new Date();
			req.oneVPV.save(function(err, oneVPV) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VPV Save', 'Error deleting Project Versions ');
					return;
				}
				req.oneVPV = oneVPV;

				helperVpv.updateVPVCount(req.oneVPV.vpid, variantName, -1);
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
		* In case the new Variant is an PFV, the version gets squeezed regarding Organisation (no individual user roles) and regarding Phases/Deadlines/Deliveries that is reduced to the previous PFV
		*
 		* @apiHeader {String} access-key User authentication token.
		*
		* @apiParam {number} scaleFactor scale planned ressources with the scaleFactor, but only values after actualDataUntil in the original version and actualDataUntil from the new Version if set
		* @apiParam {number} level in case the vpv is copied to a pfv, the level specifies on what level the hierarchy of the pfv should be reduced (0: no reduction, 1: reduce to the project only, 2: reduce to all Phases directly below project, etc.)
		*
		* @apiPermission Authenticated and VP.View and VP.Modify or VP.CreateVariant Permission for the Project.
		* @apiError {number} 400 missing name or ID of Project during Creation, or other bad content in body
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create Project Version
		* @apiError {number} 412 Project status does not allow any new version
		*
	  * @apiExample Example usage:
		*   url: https://my.visbo.net/api/vpv/vpv5c754feaa/copy
		* {
		*  'timestamp': '2019-03-19T11:04:12.094Z',
		*  'variantName': 'pfv',
		*  'startDate': '2021-03-01T00:00:00.000Z',
		*  'endDate': '2022-03-01T00:00:00.000Z',
		*  'actualDataUntil': '2021-04-01T00:00:00.000Z',
		*  'Erloes': 750.500
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
		var useremail = req.decoded.email;
		var customField;

		req.auditDescription = 'Project Version Copy';

		var vpid = req.oneVPV.vpid;
		var variantName = req.oneVPV.variantName;
		if (req.body.variantName || req.body.variantName == '') {
			variantName = req.body.variantName;
		}
		var timestamp, level;
		if (!validate.validateDate(req.body.timestamp, true)
		|| !validate.validateDate(req.body.startDate, true)
		|| !validate.validateDate(req.body.endDate, true)
		|| !validate.validateDate(req.body.actualDataUntil, true)) {
			return res.status(400).send({
				state: 'failure',
				message: 'Illegal Dates in body'
			});
		}
		if (req.body.timestamp) {
			timestamp = validate.validateDate(req.body.timestamp, true, true);
		} else {
			timestamp = new Date();
		}
		level = validate.validateNumber(req.query.level, true);

		if (variantName != '') {
			// check that the Variant exists
			if (req.oneVP.variant.findIndex(variant => variant.variantName == variantName) < 0) {
				logger4js.warn('VPV Post Copy: Variant does not exist %s %s', vpid, variantName);
				return res.status(409).send({
					state: 'failure',
					message: 'Project variant does not exist: ' + variantName,
					vp: [req.oneVP]
				});
			}
		}
		// check if the version is locked
		if (lockVP.lockStatus(req.oneVP, useremail, variantName).locked) {
			logger4js.warn('VPV Post Copy VP locked %s %s', vpid, variantName);
			return res.status(423).send({
				state: 'failure',
				message: 'Project locked',
				vp: [req.oneVP]
			});
		}

		// check if the VP has the vpStatus  'paused' or 'finished' or 'stopped'
		if (req.oneVP.vpStatus == 'paused' || req.oneVP.vpStatus == 'finished' || req.oneVP.vpStatus == 'stopped') {
			logger4js.warn('VPV Post Copy: VP status %s %s %s', vpid, req.oneVP.name, req.oneVP.vpStatus);
			return res.status(412).send({
				state: 'failure',
				message: 'Project status does not allow any new project version',
				vp: [req.oneVP]
			});
		}

		logger4js.info('Post a copy Project Version for user %s with name %s variant :%s: in Project %s updatedAt %s with Perm %O', userId, req.body.name, variantName, vpid, req.body.updatedAt, req.listVPPerm.getPerm(vpid));
		var permCreateVersion = false;
		var perm = req.listVPPerm.getPerm(vpid);
		if (variantName == 'pfv') {
			if ((perm.vp & constPermVP.Modify) && (perm.vc & constPermVC.Modify)) {
				permCreateVersion = true;
			}
		} else if (perm.vp & constPermVP.Modify) {
			permCreateVersion = true;
		} else if ((perm.vp & constPermVP.CreateVariant) && variantName != '' && variantName != 'pfv') {
			var variant = req.oneVP && req.oneVP.variant.find(item => item.variantName == variantName);
			if (variant && variant.email == useremail) {
				permCreateVersion = true;
			}
		}
		if (!permCreateVersion) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Create the specific Version',
				perm: perm
			});
		}

		var newVPV = helperVpv.initVPV(req.oneVPV);
		if (!newVPV) {
			errorHandler(undefined, res, 'DB: POST VPV Copy of ${req.oneVPV._id}', 'Error creating Project Versions during copy ');
			return;
		}
		// change variantName if defined in body
		newVPV.variantName = variantName;
		newVPV.timestamp = timestamp;
		newVPV.status = undefined;
		if (req.oneVP && req.oneVP.vpStatus) {
			newVPV.vpStatus = req.oneVP.vpStatus;
		}
		if (req.visboPFV) {
			newVPV.Erloes = req.visboPFV.Erloes;
			newVPV.Risiko = req.visboPFV.Risiko;
			newVPV.StrategicFit = req.visboPFV.StrategicFit;
		}
		if (req.oneVP && req.oneVP.customFieldString) {
			customField = req.oneVP.customFieldString.find(item => item.name == '_businessUnit');
			if (customField) { newVPV.businessUnit = customField.value; }
		}
		if (req.oneVP && req.oneVP.customFieldDouble) {
			customField = req.oneVP.customFieldDouble.find(item => item.name == '_risk');
			if (customField) { newVPV.Risiko = customField.value; }
			customField = req.oneVP.customFieldDouble.find(item => item.name == '_strategicFit');
			if (customField) { newVPV.StrategicFit = customField.value; }
		}
		if (req.oneVP && req.oneVP.customFieldDate) {
			customField = req.oneVP.customFieldDate.find(item => item.name == '_PMCommit');
			//if (customField) { newVPV.pmCommit = customField.value; }
		}
		var keyVPV = helperVpv.getKeyAttributes(newVPV);
		if (variantName == 'pfv') {
			var tmpVPV = visboBusiness.convertVPV(newVPV, req.visboPFV, req.visboOrganisation, level);
			if (!tmpVPV) {
				logger4js.warn('Post a copy Project Version for user %s for Project %s failed to convertVPV PFV %s Orgas %d', userId, newVPV.vpid, req.visboPFV != undefined, req.visboOrganisation?.length || 0);
				return res.status(400).send({
					state: 'failure',
					message: 'Visbo Project Version inconsistent after conversion',
					perm: perm
				});
			} else {
				newVPV = tmpVPV;
			}
			delete newVPV.keyMetrics;
		}
		// check if we have to do scaling
		var scale = 0;
		var scaleVPV = helperVpv.initVPV(newVPV);
		if (req.body.startDate) {
			scale = 1;
			scaleVPV.startDate = validate.validateDate(req.body.startDate, false, true);
		} else {
			scaleVPV.startDate = newVPV.startDate;
		}
		if (req.body.endDate) {
			scale = 1;
			scaleVPV.endDate = validate.validateDate(req.body.endDate, false, true);
		} else {
			scaleVPV.endDate = newVPV.endDate;
		}
		if (req.body.actualDataUntil) {
			scale = 1;
			scaleVPV.actualDataUntil = validate.validateDate(req.body.actualDataUntil, false, true);
		}
		if (req.query.scaleFactor) {
			scale = validate.validateNumber(req.query.scaleFactor) || 1;
		}

		// first version just move start & end Date without scaling
		if (scale) {
			newVPV = visboBusiness.scaleVPV(newVPV, scaleVPV, scale);
			if (!newVPV) {
				return res.status(400).send({
					state: 'failure',
					message: 'Visbo Project Version inconsistent',
					perm: perm
				});
			}
		}
		helperVpv.setKeyAttributes(newVPV, keyVPV);
		req.oneVPV = newVPV;

		saveRecalcKM(req, res, 'Successfully copied new Project Version');
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
		* @apiParam {String} roleID Deliver the capacity planning for the specified organisation, default is complete organisation
		* @apiParam {Boolean} hierarchy Deliver the capacity planning including all direct childs of roleID
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
		var parentID = req.query.parentID;

		req.auditDescription = 'Project Version Capacity Read';
		req.auditSysAdmin = sysAdmin;
		req.auditTTLMode = 1;

		if ((perm.vc & constPermVC.View) == 0 || !req.visboOrganisation) {
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
		if (!validate.validateDate(req.query.startDate, true)
		|| !validate.validateDate(req.query.endDate, true)) {
			logger4js.warn('Get VPF mal formed query parameter %O ', req.query);
			return res.status(400).send({
				state: 'failure',
				message: 'Bad Content in Query Parameters'
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

		var capacity = visboBusiness.calcCapacities([req.oneVPV], req.visboPFV ? [req.visboPFV] : undefined, roleID, parentID, req.query.startDate, req.query.endDate, req.visboOrganisation, req.visboVCCapacity, req.query.hierarchy == true, onlyPT);
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
	* @apiDescription Get returns the VPV and recalculates the keyMetrics including prediction if configured for this specific Project Version the user has access permission to the Project
	* In case of success it delivers an array of VPVs, the array contains 0 or 1 element of the VPV including a list with the special properties for the calculation
	*
	* @apiPermission Authenticated and VP.View and VP.ViewAudit Permission for the Project.
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
	*     'allVPV attributes': 'any',
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

		var keyMetrics = visboBusiness.calcKeyMetrics(req.oneVPV, req.visboPFV, req.visboOrganisation);
		if (keyMetrics && req.visboPFV) {
			keyMetrics.baselineDate = req.visboPFV.timestamp;
			keyMetrics.baselineVPVID = req.visboPFV._id;
		}
		req.listVPV = [req.oneVPV];
		getRecalcKM(req, res, 'Returned VISBO Project Version');
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

		if ((perm.vc & constPermVC.View) == 0 || !req.visboOrganisation) {
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

		var costVPV = visboBusiness.calcCosts(req.oneVPV, req.visboPFV, req.visboOrganisation);
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
