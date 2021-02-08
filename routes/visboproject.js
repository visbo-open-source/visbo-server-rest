var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');

var auth = require('./../components/auth');
var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;
var lockVP = require('./../components/lock');
var verifyVp = require('./../components/verifyVp');
var verifyVg = require('./../components/verifyVg');
var verifyVpv = require('./../components/verifyVpv');
var helperVpv = require('./../components/helperVpv');

var visboBusiness = require('./../components/visboBusiness');
var getSystemUrl = require('./../components/systemVC').getSystemUrl;

var User = mongoose.model('User');
var VisboGroup = mongoose.model('VisboGroup');
var VisboGroupUser = mongoose.model('VisboGroupUser');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var Lock = mongoose.model('Lock');
var Variant = mongoose.model('Variant');
var Restrict = mongoose.model('Restrict');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var VisboPortfolio = mongoose.model('VisboPortfolio');
var VisboAudit = mongoose.model('VisboAudit');

var Const = require('../models/constants');
var constPermVC = Const.constPermVC;
var constPermVP = Const.constPermVP;

var mail = require('./../components/mail');
var eMailTemplates = '/../emailTemplates/';
var ejs = require('ejs');
var sanitizeHtml = require('sanitize-html');

var logModule = 'VP';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var validateName = validate.validateName;

var constVPTypes = Object.freeze({'project':0, 'portfolio':1, 'projecttemplate':2});

// find a user in an array of users by userId
function findUserById(currentUser) {
	// logger4js.info('FIND User by ID %s with %s result %s', this, currentUser.userId, currentUser.userId.toString() == this.toString());
	return currentUser.userId.toString() == this.toString();
}

// find a project in a simple array of project ids
function findVP(vpid) {
		return vpid == this;
}

// find a project in an array of a structured projects (name, id)
function findVPList(vp) {
		//console.log('compare %s %s result %s', vp._id.toString(), this.toString(), vp._id.toString() == this.toString());
		return vp._id.toString() == this.toString();
}

// Generates hash using bCrypt
function createHash(secret){
	return bCrypt.hashSync(secret, bCrypt.genSaltSync(10), null);
}

// updates the VP Count in the VC after create/delete/undelete Project
var updateVPCount = function(vcid, increment){
	var updateQuery = {_id: vcid};
	var updateUpdate = {$inc: {vpCount: increment}};
	var updateOption = {upsert: false};

	VisboCenter.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err) {
			errorHandler(err, undefined, `DB: Problem updating VC ${vcid} set vpCount`, undefined);
		}
		logger4js.trace('Updated VC %s vpCount inc %d changed %d %d', vcid, increment, result.n, result.nModified);
	});
};

// updates the VPV Count in the VP after create/delete/undelete VISBO Project
var updateVPFCount = function(vpid, variantName, increment){
	var updateQuery = {_id: vpid};
	var updateOption = {upsert: false};
	var updateUpdate;

	if (!variantName) {
		updateUpdate = {$inc: {vpfCount: increment}};
	} else {
		// update a variant and increment the version counter
		updateQuery['variant.variantName'] = variantName;
		updateUpdate = {$inc : {'variant.$.vpfCount' : increment} };
	}
	logger4js.debug('Update VP %s with vpfCount inc %d update: %O with %O', vpid, increment, updateQuery, updateUpdate);
	VisboProject.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error('Problem updating VP %s vpfCount: %s', vpid, err.message);
		}
		logger4js.trace('Updated VP %s vpfCount inc %d changed %d %d', vpid, increment, result.n, result.nModified);
	});
};

// updates the VC Name in the VP after undelete as the name could have changed in between
var updateVCName = function(vp){
	logger4js.trace('Start Update VP%s with correct VC Name ', vp._id);
	var query = {_id: vp.vcid};
	var queryVC = VisboCenter.findOne(query);
	queryVC.lean();
	queryVC.exec(function (err, vc) {
		if (err) {
			errorHandler(err, undefined, 'DB: Update VC Name', undefined);
			return;
		}
		if (vc) {
			logger4js.debug('Found VC %s/%s VP info %s', vc._id, vc.name, vp.vc.name);
			if (vc.name == vp.vc.name) {
				// nothing to do
				return;
			}
			var updateQuery = {_id: vp._id};
			var updateOption = {upsert: false};
			var updateUpdate = {$set: {'vc': { 'name': vc.name}}};
			logger4js.debug('Update VP %s for correct VC Name %s ', vp._id, vc.name);
			VisboProject.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
				if (err){
					errorHandler(err, undefined, `DB: Problem updating VC name in VP ${vp._id}`, undefined);
				}
				logger4js.trace('Updated VP %s for VC Name changed %d %d', vp._id, result.n, result.nModified);
			});
		}
	});
};

// updates the VP Name in the VPV after name change of Project
var updateVPName = function(vpid, name, type){
	logger4js.trace('Start Update VP %s New Name %s ', vpid, name);
	var updateQuery = {vpid: vpid, deletedAt: {$exists: false}};
	var updateUpdate = {$set: {name: name}};
	var updateOption = {upsert: false};

	VisboProjectVersion.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating Names in Versions of VP ${vpid}`, undefined);
		}
		logger4js.trace('Updated VP %s New Name %s changed %d %d', vpid, name, result.n, result.nModified);
	});

	// update Portfolio Links to new name
	var updatePFQuery = { allItems: {$elemMatch: {vpid: vpid }}};
	var updatePFUpdate = { $set: { 'allItems.$[elem].name' : name } };
	var updatePFOption = {arrayFilters: [ { 'elem.vpid': vpid } ], upsert: false, multi: 'true'};
	VisboPortfolio.updateMany(updatePFQuery, updatePFUpdate, updatePFOption, function (err, result) {
		if (err){
			errorHandler(err, result, `DB: Problem updating Portfolio References of VP ${vpid}`, 'Error updating Project');
			return;
		}
		logger4js.trace('Updated VP %s New Name %s in Portfolio Lists changed %d %d', vpid, name, result.n, result.nModified);
		if (type == constVPTypes.portfolio) {
			var updateQuery = {};
			updateQuery.vpid = vpid;
			updateQuery.deleted = {$exists: false};

			var updateUpdate = {$set: {'name': name}};
			var updateOption = {upsert: false, multi: 'true'};

			VisboPortfolio.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
				if (err){
					errorHandler(err, result, `DB: Problem updating Portfolio Name for  VP ${vpid}`, 'Error updating Project');
					return;
				}
				logger4js.debug('Update Portfolio %s Name found %d updated %d', vpid, result.n, result.nModified);
			});
		}
	});
};

// updates the Global VC Groups to add the VPID to the list
var updatePermAddVP = function(vcid, vpid){
	var updateQuery = {vcid: vcid, global: true};
	var updateUpdate = {$push: {vpids: vpid}};
	var updateOption = {upsert: false};

	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating global Groups add VP for VC ${vcid}`, undefined);
		}
		logger4js.debug('Updated VC %s Groups with VP %s changed %d %d', vcid, vpid, result.n, result.nModified);
	});
};

// updates the Global VC Groups to remove the VPID from the list
var updatePermRemoveVP = function(vcid, vpid){
	var updateQuery = {vcid: vcid, global: true};
	var updateUpdate = {$pull: {vpids: vpid}};
	var updateOption = {upsert: false};

	logger4js.debug('Updated VC %s Groups removed VP %s changed', vcid, vpid);
	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err) {
			errorHandler(err, undefined, `DB: Problem updating global Groups remove VP for VC ${vcid}`, undefined);
		}
		logger4js.debug('Updated VC %s Groups removed VP %s changed %d %d', vcid, vpid, result.n, result.nModified);
	});
};

// undelete the Groups after undelete Vp
var unDeleteGroup = function(vpid){
	var updateQuery = {groupType: 'VP', vpids: vpid, 'deletedByParent': 'VP'};
	var updateOption = {upsert: false};
	var updateUpdate = {$unset: {'deletedByParent': ''}};

	logger4js.debug('Update Groups for VP %s', vpid);
	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating global Groups undelete Group for VP ${vpid}`, undefined);
		}
		logger4js.trace('Updated Groups for VP %s set undelete changed %d %d', vpid, result.n, result.nModified);
	});
};

// mark the Groups as deleted after delete Vp
var markDeleteGroup = function(vpid){
	var updateQuery = {groupType: 'VP', vpids: vpid};
	var updateOption = {upsert: false};
	var updateUpdate = {$set: {'deletedByParent': 'VP'}};

	logger4js.debug('Update Groups for VP %s', vpid);
	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating global Groups delete Group for VP ${vpid}`, undefined);
		}
		logger4js.trace('Updated Groups for VP %s set undelete changed %d %d', vpid, result.n, result.nModified);
	});
};

// undelete the Versions after undelete Vp
var unDeleteVersion = function(vpid){
	var updateQuery = {vpid: vpid, 'deletedByParent': 'VP'};
	var updateOption = {upsert: false};
	var updateUpdate = {$unset: {'deletedByParent': ''}};

	logger4js.debug('Update Versions for VP %s', vpid);
	VisboProjectVersion.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating unDelete Versions for VP ${vpid}`, undefined);
		}
		logger4js.trace('Updated Versions for VP %s unset deletedByParent changed %d %d', vpid, result.n, result.nModified);
	});
};

// mark the Versions as deleted after delete Vp
var markDeleteVersion = function(vpid){
	var updateQuery = {vpid: vpid};
	var updateOption = {upsert: false};
	var updateUpdate = {$set: {'deletedByParent': 'VP'}};

	logger4js.debug('Update Versions for VP %s', vpid);
	VisboProjectVersion.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating mark Versions as deleted for VP ${vpid}`, undefined);
		}
		logger4js.debug('Updated Versions for VP %s set deletedByParent changed %d %d', vpid, result.n, result.nModified);
	});
};

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// register the VP middleware to get all Groups with VP Permissions for the user
router.use('/', verifyVp.getAllGroups);
// register the VP middleware to get all Groups of the VP
router.use('/', verifyVg.getVPGroups);
// register the VP middleware to get VP Organisations during creation of VP
router.use('/', verifyVp.getVPOrgs);
// register the VP middleware to get VP Template during creation of VP
router.use('/', verifyVp.getVPTemplate);
// register the VP middleware to check that the user has access to the VP
router.param('vpid', verifyVp.getVP);
// register the VP middleware to check that the vpfid is valid
router.param('vpfid', verifyVp.checkVpfid);
// Register the Group middleware to check the groupid param
router.param('groupid', verifyVg.getGroupId);
// Register the UserId middleware to check the userid param
router.param('userid', verifyVg.checkUserId);
// get details for capacity calculation
router.use('/:vpid/portfolio', verifyVp.getVPGroupsOfVC);
router.use('/:vpid/portfolio/:vpfid/capacity', verifyVpv.getVCOrgs);
router.use('/:vpid/portfolio/:vpfid/capacity', verifyVpv.getPortfolioVPs);
router.use('/:vpid/portfolio/:vpfid/capacity', verifyVpv.getVPFVPVs);
router.use('/:vpid/portfolio/:vpfid/capacity', verifyVpv.getVPFPFVs);

/////////////////
// VISBO Project API
// /project
/////////////////


router.route('/')

/**
	* @api {get} /vp Get Projects
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project
	* @apiName GetVISBOProjects
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp retruns all Projects the user has either VP.View or VP.ViewRestricted permission to
	* In case of success it delivers an array of VPs, the array contains in each element a Project
	* The lock section is empty if no lock is set, otherwise it delivers the list of locks that were set for the Project and the respective Variant.
	* The variant section is empty if there are no variants for this Project, otherwise it contains a list of variants that exists for this project.
	* the Project Type 0 means it is a project template, type 1 is a project and type 2 is a portfolio
	* @apiParam (Parameter) {String} [vcid] Deliver only projects for a specific VISBO Center
	* @apiParam (Parameter) {Number=0,1,2} [vpType] Deliver only projects of the specified Type, if not defined, deliver all types
	* @apiParam (Parameter) {Boolean} [deleted=false]  Request Deleted VPs, only allowed for users with DeleteVP Permission.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false]  if true, request VPs for Appl. Admin User
	*
	* @apiPermission Authenticated.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp
	*   url: https://my.visbo.net/api/vp?vcid=vc5aaf992&vpType=0
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Returned Projects',
	*   'vp':[{
	*       '_id':'vp541c754feaa',
	*      'updatedAt':'2018-03-16T12:39:54.042Z',
	*      'createdAt':'2018-03-12T09:54:56.411Z',
	*      'name':'My new Project',
	*      'vcid': 'vc5aaf992',
	*      'vpvCount': '0',
	*      'vpType': '0',
	*      'lock': [{
	*        'variantName': '',
	*        'email': 'someone@visbo.de',
	*        'createdAt': '2018-04-26T11:04:12.094Z',
	*        'expiresAt': '2018-04-26T12:04:12.094Z'
	*      }],
	*      'variant': [{
	*        'variantName': 'V1',
	*        'email': 'someone@visbo.de',
	*        'createdAt': '2018-04-26T11:04:12.094Z',
	*        'vpvCount': '1'
	*      }]
	*   }]
	* }
	*/
// Get projects
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		var userId = req.decoded._id;
		var isSysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Project Read';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		logger4js.info('Get Project for user %s check sysadmin %s', userId, isSysAdmin);

		var query = {};
		// Get all VPs there the user Group is assigned to
		var requiredPerm = constPermVP.View;
		if (!isSysAdmin && req.query.deleted) {
			requiredPerm += constPermVP.Delete;
		}
		if (!isSysAdmin) {
			query._id = {$in: req.listVPPerm.getVPIDs(requiredPerm, true)};
		}
		query.deletedAt = {$exists: req.query.deleted ? true : false};				// Not deleted
		query['vc.deletedAt'] = {$exists: false}; // Do not deliver any VP from a deleted VC
		// check if query string is used to restrict to a specific VC
		if (req.query.vcid) {
			query.vcid = req.query.vcid;
		}
		// check if query string is used to restrict projects to a certain type (project, portfolio, template)
		if (req.query.vpType) query.vpType = req.query.vpType;

		logger4js.info('Get Projects for user %s', userId);
		logger4js.trace('Get Project for user %s with query parameters %O', userId, query);

		var queryVP = VisboProject.find(query);
		queryVP.select('-restrict');
		// queryVP.select('-restrict -lock -variant');
		queryVP.lean();
		queryVP.exec(function (err, listVP) {
			if (err) {
				errorHandler(err, res, `DB: GET VP find ${query}`, 'Error getting VISBO Centers');
				return;
			}
			logger4js.trace('Found Projects\n%O', listVP);
			logger4js.debug('Found %d Projects', listVP.length);
			// MS TODO: do we need to cleanup /restrict the results if the user has only restricted permission?
			for (var i = 0; i < listVP.length; i++) {
				var perm = req.listVPPerm.getPerm(isSysAdmin ? 0 : listVP[i]._id);
				if ((perm.vp & constPermVP.View) == 0) {		//reduced View permission
					listVP[i].variant = [];
					listVP[i].lock = [];
				}
			}
			req.auditInfo = listVP.length;
			return res.status(200).send({
				state: 'success',
				message: 'Returned Projects',
				count: listVP.length,
				vp: listVP
			});
		});
	})

/**
	* @api {post} /vp Create a Project
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project
	* @apiName CreateVISBOProjects
	* @apiDescription Post creates a new VP
	* with a unique name inside VC and the admins as defined in the body.
	* If no admin is specified for the project the current user is added as Admin.
	* if no vpType is specified a normal Project (0) is created, for Portfolio use vpType = 1 and for Project Template vpType=2
	* In case of success it delivers an array of VPs to be uniform to GET, the array contains as one element the created VP.
	* @apiHeader {String} access-key User authentication token.
  *
	* @apiPermission Authenticated and VP.View and VP.Create Permission for the Project.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 400 missing name or VISBO Center ID of Project during Creation
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Create Project
	* @apiError {number} 409 Project with same name exists already
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp
	* {
	*  'name':'My first Project',
	*  'description':'Project Description',
	*  'vcid': 'vc5aaf992',
	*  'vpType': 0,
	*  'kundennummer': 'customer project identifier'
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'Successfully created new Project',
	*  'vp':[{
	*   '__v':0,
	*   'updatedAt':'2018-03-19T11:04:12.094Z',
	*   'createdAt':'2018-03-19T11:04:12.094Z',
	*   'name':'My first Project',
	*   '_id':'vp5aaf882',
	*   'vcid': 'vc5aaf992',
	*   'vpvCount': '0',
	*   'vpType': '0',
	*   'kundennummer': 'customer project identifier'
	*   'lock': []
	*  }]
	* }
	*/
// Post a Project or Portfolio Project
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail  = req.decoded.email;

		req.auditDescription = 'Project Create';

		if (req.body.vcid == undefined || !validate.validateObjectId(req.body.vcid, false) || req.body.name == undefined) {
			logger4js.warn('No VCID or Name in Body');
			return res.status(400).send({
				state: 'failure',
				message: 'No valid VISBO Center'
			});
		}
		var vcid = req.body.vcid;
		var vpname = (req.body.name || '').trim();
		var vpdescription = (req.body.description || '').trim();
		var kundennummer;
		logger4js.info('Post a new Project for user %s with name %s in VISBO Center %s. Perm: %O', useremail, req.body.name, vcid, req.listVPPerm.getPerm(req.params.vpid));
		logger4js.trace('Post a new Project body %O', req.body);

		if (!validateName(vpname, false)
		|| !validateName(vpdescription, true)
		|| !validateName(kundennummer, true)) {
			logger4js.info('POST Project contains illegal strings body %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'Project Body contains invalid strings'
			});
		}
		if (req.body.kundennummer) req.body.kundennummer = req.body.kundennummer.trim();

		logger4js.debug('Check VC Permission %O', req.listVCPerm.getPerm(vcid));
		var requiredPerm = constPermVC.View + constPermVC.CreateVP;
		if ((req.listVCPerm.getPerm(vcid).vc & requiredPerm) != requiredPerm) {
				return res.status(403).send({
				state: 'failure',
				message: 'No Permission to create Project'
			});
		}
		var query = {'_id': vcid};
		VisboCenter.findOne(query, function (err, vc) {
			if (err) {
				errorHandler(err, res, `DB: POST VP find one VC ${vcid} `, 'Error creating Project');
				return;
			}
			if (!vc) {
				return res.status(403).send({
					state: 'failure',
					message: 'VISBO Centers not found or no Admin'
				});
			}
			req.oneVC = vc;
			logger4js.debug('User has permission to create Project %s in  %s', vpname, req.oneVC.name);
			// check duplicate Name
			var query = {};
			query.vcid = vcid;
			query.name = vpname;
			query.deletedAt = {$exists: false};

			VisboProject.findOne(query, function (err, vp) {
				if (err) {
					errorHandler(err, res, `DB: POST VP find one VP ${vpname} `, 'Error creating Project');
					return;
				}
				logger4js.debug('Duplicate Name check returned %s', vp != undefined);
				if (vp) {
					return res.status(409).send({
						state: 'failure',
						message: 'Project with same name exists'
					});
				}
				var newVP = new VisboProject;
				newVP.name = vpname;
				newVP.vcid = req.oneVC._id;
				newVP.description = vpdescription;
				if (req.body.kundennummer) newVP.kundennummer = req.body.kundennummer;
				if (req.body.vpType == undefined || req.body.vpType < 0 || req.body.vpType > 2) {
					newVP.vpType = 0;
				} else {
					newVP.vpType = req.body.vpType;
				}
				newVP.vpvCount = 0;
				if (newVP.vpType == 1) {
					newVP.vpfCount = 0;
				}
				if (req.oneVPTemplate && req.oneVPTemplate.variant) {
					newVP.variant = [];
					req.oneVPTemplate.variant.forEach(item => newVP.variant.push({variantName: item.variantName, vpvCount: 0, email: useremail}));
				}
				// Create new VP Group
				var newVG = new VisboGroup();
				newVG.name = 'VISBO Project Admin';
				newVG.groupType = 'VP';
				newVG.internal = true;
				newVG.permission = {vp: Const.constPermVPFull };
				newVG.vcid = req.oneVC._id;
				newVG.global = false;
				newVG.vpids.push(newVP._id);
				newVG.users = [{email: useremail, userId: userId}];

				logger4js.debug('VP Post Create 1. Group for vp %s group %O ', newVP._id, newVG);
				newVG.save(function(err) {
					if (err) {
						errorHandler(err, undefined, `DB: POST VP Create Group for VP ${newVP._id}`, undefined);
					}
				});
				// set the VP Name
				newVP.vc.name = vc.name;
				logger4js.trace('VP Create add VP Name %s %O', vc.name, newVP);
				logger4js.debug('Save Project %s %s from Template %s VPV %s', newVP.name, newVP._id, req.oneVPTemplate && req.oneVPTemplate._id, req.oneVPVTemplate && req.oneVPVTemplate.timestamp);

				newVP.save(function(err, vp) {
					if (err) {
						errorHandler(err, res, `DB: POST VP ${req.body.name} Save`, `Failed to create Project ${req.body.name}`);
						return;
					}
					req.oneVP = vp;
					logger4js.debug('Update VC %s with %d Projects ', req.oneVC.name, req.oneVC.vpCount);
					updatePermAddVP(req.oneVP.vcid, req.oneVP._id); // async
					updateVPCount(req.oneVP.vcid, 1); // async
					if (req.oneVPVTemplate) {
						// Transform the VPV
						var newVPV = helperVpv.initVPV(req.oneVPVTemplate);
						if (!newVPV) {
							errorHandler(err, res, `DB: POST VP ${req.body.name} Problems with VPV Template {req.oneVPVTemplate._id}`, `Failed to create Project ${req.body.name}`);
							return;
						}
						newVPV.VorlagenName = req.oneVPVTemplate.name;
						newVPV.name = req.oneVP.name;
						newVPV.vpid = req.oneVP._id;
						newVPV.variantName = 'pfv'; // first Version is the pfv
						newVPV.status = undefined;
						// Transform Start & End Date & Budget
						var startDate = new Date();
						if (req.body.startDate && validate.validateDate(req.body.startDate)) {
							startDate = new Date(req.body.startDate);
						} else {
							startDate.setDate(1);
							startDate.setHours(0, 0, 0, 0);
							startDate.setMonth(startDate.getMonth() + 1);
						}
						var endDate;
						if (req.body.endDate && validate.validateDate(req.body.endDate)) {
							endDate = new Date(req.body.endDate);
						} else if (req.oneVPVTemplate.startDate && req.oneVPVTemplate.endDate) {
							var diff = req.oneVPVTemplate.endDate.getTime() - req.oneVPVTemplate.startDate.getTime();
							endDate = new Date();
							endDate.setTime(startDate.getTime() + diff);
						}
						newVPV.startDate = startDate;
						newVPV.endDate = endDate;
						helperVpv.createInitialVersions(req, res, newVPV);
					} else {
						return res.status(200).send({
							state: 'success',
							message: 'Successfully created new Project',
							vp: [ vp ]
						});
					}
				});
			});
		});
	});

router.route('/:vpid')
/**
 	* @api {get} /vp/:vpid Get a Project
	* @apiVersion 1.0.0
 	* @apiGroup VISBO Project
 	* @apiName GetVISBOProject
 	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get a specific Project
	* the system checks if the user has access permission to it.
	* In case of success, the system delivers an array of VPs, with one element in the array that is the info about the VP
	* @apiPermission Authenticated and  VP.View or VP.ViewRestricted Permission for the Project.
	* @apiParam (Parameter) {Boolean} [deleted=false]  Request Deleted VPs only with additional Permission DeleteVP
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false]  Optional Request VCs for Appl. Admin User
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Project
 	* @apiExample Example usage:
 	*   url: https://my.visbo.net/api/vp/5aada025
 	* @apiSuccessExample {json} Success-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   'state':'success',
 	*   'message':'Returned Projects',
 	*   'vp': [{
 	*    '_id':'vp5c754feaa',
 	*    'updatedAt':'2018-03-16T12:39:54.042Z',
 	*    'createdAt':'2018-03-12T09:54:56.411Z',
 	*    'name':'My new Project',
	*		 'vcid': 'vc5aaf992',
	*    'vpvCount': '0',
	*    'vpType': '0',
	*    'lock': [{
	*      'variantName': '',
	*      'email': 'someone@visbo.de',
	*      'createdAt': '2018-04-26T11:04:12.094Z',
	*      'expiresAt': '2018-04-26T12:04:12.094Z'
	*    }],
	*    'perm': {'vc': 307, 'vp': 1331}
	* }]
 	*}
	*/
// Get a specific visbo project
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;
		var perm = req.listVPPerm.getPerm(isSysAdmin ? 0 : req.oneVP._id);
		var permVC = req.listVCPerm.getPerm(isSysAdmin ? 0 : req.oneVP.vcid);
		perm.vc = perm.vc | permVC.vc;

		req.auditDescription = 'Project Read';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		logger4js.info('Get Project for userid %s email %s and vp %s oneVC %s', userId, useremail, req.params.vpid, req.oneVP.name);

		if (!isSysAdmin && req.query.deleted && !(perm.vp & constPermVP.Delete)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to deleted Projects'
			});
		}
		// we have found the VP already in middleware

		req.oneVP.lock = lockVP.lockCleanup(req.oneVP.lock);
		if ((perm.vp & constPermVP.View) == 0) {
			req.oneVP.restrict = undefined;
			req.oneVP.lock = undefined;
		}
		return res.status(200).send({
			state: 'success',
			message: 'Returned Projects',
			vp: [req.oneVP],
			perm: perm
		});
	})

/**
	* @api {put} /vp/:vpid Update Project
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project
	* @apiName UpdateVISBOProjects
	* @apiDescription Put updates a specific Project
	* the system checks if the user has Modify permission to the Project.
	* If an updatedAt Info is delivered in the body, the system checks that the updatedAt flag from the body equals the updatedAt in the system.
	* If not equal, the system delivers an error because the VP was updated between the read and write of the user and therefore it might lead to inconsitency.
	* If the Project Name has changed, the Name will be populated to the Project Versions.
	* In case of success, the system delivers an array of VPs, with one element in the array that is the info about the VP
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and VP.View and VP.Modify Permission for the Project.
	* In case of undelete a Project the user needs to have VP.Delete Permission in addition.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 400 no Data provided in Body for updating the Visbp Project
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Modify Project
	* @apiError {number} 423 Project is locked by another user
	* @apiError {number} 409 Project with same name exists already or Project was updatd in between
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5cf3da025
	* {
	*  'name':'My first Project Renamed',
	*  'description': 'New Description for VP',
	*  'kundennummer': 'Customer Project Identifier'
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'Successfully updated Project Renamed',
	*  'vp':[{
	*   '__v':0,
	*   'updatedAt':'2018-03-19T11:04:12.094Z',
	*   'createdAt':'2018-03-19T11:04:12.094Z',
	*   'name':'My first Project Renamed',
	*   '_id':'vp5cf3da025',
	*   'kundennummer': 'Customer Project Identifier'
	*   'vcid': 'vc5aaf992',
	*   'vpvCount': '0',
	*   'vpType': '0'
	*  }]
	* }
	*/
// Update Project
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Project Update';

		logger4js.info('PUT/Save Project for userid %s email %s and vp %s perm %O', userId, useremail, req.params.vpid, req.listVPPerm.getPerm(req.params.vpid));

		if (!req.body) {
			return res.status(400).send({
				state: 'failure',
				message: 'No Body provided for update'
			});
		}
		var name = (req.body.name || '').trim();
		var vpdescription = (req.body.description || '').trim();
		var kundennummer = (req.body.kundennummer || '').trim();
		if (!validateName(name, true)
		|| !validateName(vpdescription, true)
		|| !validateName(kundennummer, true)) {
			logger4js.info('PUT Project contains illegal strings body %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'Project Body contains invalid strings'
			});
		}

		var vpUndelete = false;
		// undelete the VP in case of change
		if (req.oneVP.deletedAt) {
			req.auditDescription = 'Project Undelete';
			req.oneVP.deletedAt = undefined;
			vpUndelete = true;
			logger4js.debug('Undelete VP %s flag %O', req.oneVP._id, req.oneVP);
		}

		if ((vpUndelete && !(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Delete))
		|| (!vpUndelete && !(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Modify))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Project or no Permission'
			});
		}
		if (lockVP.lockStatus(req.oneVP, useremail, undefined).locked) {
			return res.status(423).send({
				state: 'failure',
				message: 'Project locked',
				vp: [req.oneVP]
			});
		}

		if (name == '') name = req.oneVP.name;
		var vpPopulate = req.oneVP.name != name ? true : false;
		req.auditInfo = vpPopulate ? req.oneVP.name.concat(' / ', name) : req.oneVP.name;
		req.oneVP.name = name;

		if (req.body.description != undefined) {
			req.oneVP.description = req.body.description.trim();
		}
		if (req.body.kundennummer != undefined) {
			req.oneVP.kundennummer = req.body.kundennummer.trim();
		}
		// check duplicate Name
		var query = {};
		query.vcid = req.oneVP.vcid;
		query._id = {$ne: req.oneVP._id};
		query.name = name;
		query.deletedAt = {$exists: false};

		VisboProject.findOne(query, function (err, vp) {
			if (err) {
				errorHandler(err, res, `DB: PUT VP find ${query}`, 'Error updating Project');
				return;
			}
			if (vp) {
				logger4js.debug('Duplicate Name check returned duplicate VP %s', vp._id);
				return res.status(409).send({
					state: 'failure',
					message: 'Project with same name exists'
				});
			}
			logger4js.debug('PUT VP: save now %O populate %s unDelete %s', req.oneVP, vpPopulate, vpUndelete);
			req.oneVP.save(function(err, oneVP) {
				if (err) {
					errorHandler(err, res, 'DB: PUT VP Save', 'Error updating Project');
					return;
				}
				req.oneVP = oneVP;

				// Update project versions and portfolios
				if (vpPopulate) {
					logger4js.trace('VP PUT %s: Update Project Versions to %s', oneVP._id, oneVP.name);
					updateVPName(oneVP._id, oneVP.name, oneVP.vpType);
				}
				if (vpUndelete) {
					logger4js.trace('VP PUT %s: UnDelete Update vpCount in VC %s', oneVP._id, oneVP.vcid);
					updateVPCount(req.oneVP.vcid, 1); // async
					unDeleteGroup(req.oneVP._id); // async
					unDeleteVersion(req.oneVP._id); // async
					// updatePermAddVP(req.oneVP.vcid, req.oneVP._id); // async
					updateVCName(req.oneVP); //async
				}
				return res.status(200).send({
					state: 'success',
					message: 'Updated Project',
					vp: [ oneVP ]
				});
			});
		});
	})

/**
	* @api {delete} /vp/:vpid Delete a Project
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project
	* @apiName DeleteVISBOProject
	* @apiDescription Deletes a specific Project.
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and VP.View and VP.Delete Permission for the Project.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Delete Project
	* @apiError {number} 423 Project is locked by another user
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5aada025
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Deleted Projects'
	* }
	*/
// Delete Project
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Project Delete';

		logger4js.info('DELETE Project for userid %s email %s and vp %s oneVP %s  ', userId, useremail, req.params.vpid, req.oneVP.name);

		if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Delete)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No permission to delete Project'
			});
		}
		if (lockVP.lockStatus(req.oneVP, useremail, undefined).locked) {
			return res.status(423).send({
				state: 'failure',
				message: 'Project locked',
				vp: [req.oneVP]
			});
		}
		var destroyVP = req.oneVP.deletedAt;
		logger4js.debug('Delete Project %s %s after permission check deletedAt %s', req.params.vpid, req.oneVP.name, destroyVP);

		if (!destroyVP) {
			req.oneVP.deletedAt = new Date();
			req.oneVP.save(function(err, oneVP) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VP', 'Error deleting Project');
					return;
				}
				req.oneVP = oneVP;
				updateVPCount(req.oneVP.vcid, -1); // async
				markDeleteGroup(req.oneVP._id); // async
				markDeleteVersion(req.oneVP._id); // async
				// updatePermRemoveVP(req.oneVP.vcid, req.oneVP._id); //async
				return res.status(200).send({
					state: 'success',
					message: 'Deleted Project'
				});
			});
		} else {
			req.auditDescription = 'Project Destroy';
			logger4js.warn('VP DESTROY VP %s %s ', req.oneVP._id, req.oneVP.name);
			// Delete VPID from global Groups
			updatePermRemoveVP(req.oneVP.vcid, req.oneVP._id); //async
			// DELETE Versions of VP
			var queryVPV = {};
			queryVPV.vpid = req.oneVP._id;
			VisboProjectVersion.deleteMany(queryVPV, function(err) {
				if (err) {
					errorHandler(err, undefined, 'DB: DELETE(Destory) VP VPVs', undefined);
				}
				logger4js.debug('VP Destroy: Destroyed VP Versions');
			});
			// Delete all VP Portfolios relating to this ProjectID
			var queryvpf = {vpid: req.oneVP._id};
			VisboPortfolio.deleteMany(queryvpf, function (err) {
				if (err){
					errorHandler(err, undefined, 'DB: DELETE(Destory) VP Portfolios', undefined);
				}
				logger4js.trace('VP Destroy: %s VP Portfolios Deleted', req.oneVP._id);
			});

			// Delete all VP Groups
			var queryvpgroup = {vcid: req.oneVP.vcid, vpids: req.oneVP._id, groupType: 'VP'};
			VisboGroup.deleteMany(queryvpgroup, function (err) {
				if (err){
					errorHandler(err, undefined, 'DB: DELETE(Destory) VP Groups', undefined);
				}
				logger4js.trace('VP Destroy: %s VP Groups Deleted', req.oneVP._id);
			});
			// Delete Audit Trail of VPs & VPVs
			var queryaudit = {'vp.vpid': req.oneVP._id};
			VisboAudit.deleteMany(queryaudit, function (err) {
				if (err){
					errorHandler(err, undefined, 'DB: DELETE(Destory) VP Audit', undefined);
				}
				logger4js.trace('VP Destroy: %s VP Audit Deleted', req.oneVP._id);
			});

			// DESTROY VP itself
			var queryVP = {};
			queryVP._id = req.oneVP._id;
			VisboProject.deleteOne(queryVP, function(err) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE(Destory) VP', 'Error deleting Project');
					return;
				}
				// no need to update vpCount in VC
				return res.status(200).send({
					state: 'success',
					message: 'Destroyed Project'
				});
			});
		}
	});

router.route('/:vpid/audit')
 /**
 	* @api {get} /vp/:vpid/audit Get Project Audit Trail
 	* @apiVersion 1.0.0
 	* @apiGroup VISBO Project
 	* @apiName GetVISBOProjectAudit
	* @apiDescription Get Audit Trail for a specific Project
	* the system checks if the user has access permission to it.
	* In case of success, the system delivers an array of Audit Trail Activities
 	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and VP.View and VP.ViewAudit Permission for the Project
	* @apiParam (Parameter) {Date} [from] Request Audit Trail starting with from date. Default 01.01.1970.
	* @apiParam (Parameter) {Date} [to] Request Audit Trail ending with to date. Default Today.
	* @apiParam (Parameter) {text} [text] Request Audit Trail containing text in Detail.
	* @apiParam (Parameter) {text} [action] Request Audit Trail only for specific ReST Command (GET, POST, PUT DELETE).
	* @apiParam (Parameter) {number} [maxcount] Request Audit Trail maximum entries.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Project Audit
 	* @apiExample Example usage:
 	* url: https://my.visbo.net/api/vp/vp5aada025/audit
 	* @apiSuccessExample {json} Success-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   'state':'success',
 	*   'message':'Audit Trail delivered',
 	*   'audit': [{
 	*     '_id':'vp541c754feaa',
 	*     'updatedAt':'2018-03-16T12:39:54.042Z',
 	*     'createdAt':'2018-03-12T09:54:56.411Z',
	*			'XXXXXXXX': 'XXXXXXXX'
 	*   }]
 	* }
	*/
// Get audit trail for a specific VP
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;
		var perm = req.listVPPerm.getPerm(isSysAdmin ? 0 : req.params.vpid);

		req.auditDescription = 'Project Audit Read';
		req.auditSysAdmin = isSysAdmin;

		logger4js.info('Get Project Audit Trail for userid %s email %s and vp %s oneVP %s Perm %O', userId, useremail, req.params.vpid, req.oneVP.name, req.listVPPerm.getPerm(req.params.vpid));
		if (!(perm.vp & constPermVP.ViewAudit)) {
			return res.status(403).send({
					state: 'failure',
					message: 'No Permission to see Audit Trail'
				});
		}

		var from, to, maxcount = 1000, action;
		logger4js.debug('Get Audit Trail DateFilter from %s to %s', req.query.from, req.query.to);
		if (req.query.from && Date.parse(req.query.from)) from = new Date(req.query.from);
		if (req.query.to && Date.parse(req.query.to)) to = new Date(req.query.to);
		if (req.query.maxcount) maxcount = Number(req.query.maxcount) || 10;
		if (req.query.action) action = req.query.action.trim();
		// no date is set to set to to current Date and recalculate from afterwards
		if (!to) to = new Date();
		logger4js.trace('Get Audit Trail at least one value is set %s %s', from, to);
		if (!from) {
			from = new Date(to);
			from.setTime(0);
		}
		logger4js.trace('Get Audit Trail DateFilter after recalc from %s to %s', from, to);

		var query = {'vp.vpid': req.oneVP._id, 'createdAt': {'$gte': from, '$lt': to}};
		if (action) {
			query.action = action;
		}
		if (!isSysAdmin) {
			query.sysAdmin = {$exists: false};
		}
		var queryListCondition = [];
		if (req.query.text) {
			var textCondition = [];
			var text = req.query.text;
			var expr;
			try {
				expr = new RegExp(text, 'i');
			} catch(e) {
				logger4js.info('System Audit RegEx corrupt: %s ', text);
				return res.status(400).send({
					state: 'failure',
					message: 'No Valid Regular Expression'
				});
			}
			if (mongoose.Types.ObjectId.isValid(req.query.text)) {
				logger4js.debug('Get Audit Search for ObjectID %s', text);
				textCondition.push({'vpv.vpvid': text});
				textCondition.push({'user.userId': text});
			} else {
				textCondition.push({'user.email': expr});
				textCondition.push({'vp.name': expr});
				textCondition.push({'vpv.name': expr});
				textCondition.push({'action': expr});
				textCondition.push({'actionDescription': expr});
				textCondition.push({'actionInfo': expr});
				textCondition.push({'result.statusText': expr});
				textCondition.push({'userAgent': expr});
			}
			// textCondition.push({'vp.vpjson': expr});
			textCondition.push({'url': expr});
			queryListCondition.push({'$or': textCondition});
		}
		var ttlCondition = [];
		ttlCondition.push({'ttl': {$exists: false}});
		ttlCondition.push({'ttl': {$gt: new Date()}});
		queryListCondition.push({'$or': ttlCondition});

		query['$and'] = queryListCondition;
		logger4js.debug('Prepared Audit Query: %s', JSON.stringify(query));

		// now fetch all entries related to this vc
		VisboAudit.find(query)
		.limit(maxcount)
		.sort({createdAt: -1})
		.lean()
		.exec(function (err, listVPAudit) {
			if (err) {
				errorHandler(err, res, `DB: GET VP Audit find ${query}`, 'Error getting Project Audit');
				return;
			}
			logger4js.debug('Found VP Audit Logs %d', listVPAudit.length);
			return res.status(200).send({
				state: 'success',
				message: 'Returned Project Audit',
				count: listVPAudit.length,
				audit: listVPAudit
			});
		});
	});

	router.route('/:vpid/group')

	/**
		* @api {get} /vp/:vpid/group Get Groups
		* @apiVersion 1.0.0
		* @apiGroup VISBO Project Permission
		* @apiName GetVISBOProjectGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets all groups of the specified Project
		*
		* @apiPermission Authenticated and VP.View Permission for the Project.
		* @apiParam (Parameter) {Boolean} [userlist=false]  Request User List with Group IDs in addition to the group list.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View Project, or Project does not exists
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vp/:vpid/group
		*   url: https://my.visbo.net/api/vp/:vpid/group?userlist=true
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned Project Groups',
		*   'count': 1,
		*   'groups':[{
		*     '_id':'vpgroup5c754feaa',
		*     'name':'Group Name',
		*     'vcid': 'vc5c754feaa',
		*     'global': true,
		*     'vpids': ['vp5c754feaa','vp5c754febb'],
		*     'permission': {vc: 307, vp: 1 },
		*     'users':[
		*      {'userId':'us5aaf992', 'email':'example@visbo.de'},
		*      {'userId':'us5aaf993', 'email':'example2@visbo.de'}
		*     ]
		*   }]
		* }
		*/

	// Get VP Groups
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var isSysAdmin = req.query.sysadmin ? true : false;

			req.auditDescription = 'Project Group Read';
			req.auditSysAdmin = isSysAdmin;
			req.auditTTLMode = 1;

			logger4js.info('Get Project Group for userid %s email %s and vp %s VP %s Perm %O', userId, useremail, req.params.vpid, req.oneVP.name, req.listVPPerm.getPerm(req.params.vpid));

			var query = {};
			query.vpids = req.oneVP._id;
			query.groupType = {$in: ['VC', 'VP']};
			// VC Groups without global Permission are excluded, but deliver VP Groups without permission
			query['permission.vp'] = { $exists: true };		// any permission set for VP Groups
			logger4js.trace('Get Project Group Query %O', query);
			var queryVCGroup = VisboGroup.find(query);
			queryVCGroup.select('-vpids');
			queryVCGroup.lean();
			queryVCGroup.exec(function (err, listVPGroup) {
				if (err) {
					errorHandler(err, res, `DB: GET VP Groups find ${query}`, 'Error getting Project Groups');
					return;
				}
				logger4js.info('Found %d Groups for VP', listVPGroup.length);
				if (req.query.userlist) {
					var listVPUsers = [];
					for (var i = 0; i < listVPGroup.length; i++) {
						for (var j = 0; j < listVPGroup[i].users.length; j++) {
							listVPUsers.push({
								userId: listVPGroup[i].users[j].userId,
								email: listVPGroup[i].users[j].email,
								groupId: listVPGroup[i]._id,
								groupName: listVPGroup[i].name,
								groupType: listVPGroup[i].groupType,
								internal: listVPGroup[i].internal
							});
						}
					}
					return res.status(200).send({
						state: 'success',
						message: 'Returned Project Groups',
						count: listVPGroup.length,
						groups: listVPGroup,
						users: listVPUsers
					});
				} else {
					return res.status(200).send({
						state: 'success',
						message: 'Returned Project Groups',
						count: listVPGroup.length,
						groups: listVPGroup
					});
				}
			});
		})

	/**
		* @api {post} /vp/:vpid/group Create a Group
		* @apiVersion 1.0.0
		* @apiGroup VISBO Project Permission
		* @apiName PostVISBOProjectGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Post creates a new group inside the Project
		*
		* @apiPermission Authenticated and VP.View and VP.ManagePerm Permission for the Project.
		* @apiError {number} 400 missing name of Project Group during Creation
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a Project Group
		* @apiError {number} 409 Project Group with same name exists already
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vp/:vpid/groups
		*  {
		*     'name':'Group Name',
		*     'global': true,
		*     'permission': {vp: 307 }
		*  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned Project Group',
		*   'groups':[{
		*     '_id':'vpgroup5c754feaa',
		*     'name':'My first Group',
		*     'vpid': 'vc5c754feaa',
		*     'global': true
		*   }]
		* }
		*/

	// Create a Project Group
		.post(function(req, res) {
			// User is authenticated already
			var userId = req.decoded._id;
			// var isSysAdmin = req.query && req.query.sysadmin ? true : false;
			var groupType = 'VP';

			var vgName = (req.body.name || '').trim();
			if (!validateName(vgName, false)) {
				logger4js.info('POST Project Group contains illegal strings body %O', req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'Project Group Body contains invalid strings'
				});
			}

			var newPerm = {};
			var vgGlobal = false;

			if ( req.body.permission ) {
				newPerm.vp = (parseInt(req.body.permission.vp) || 0) & Const.constPermVPAll;
			}
			if (newPerm.vp & constPermVP.View) {
				// remove View Restricted if View is set
				newPerm.vp = newPerm.vp & Const.constPermVPFull;
			}

			req.auditDescription = 'Project Group Create';
			req.auditInfo = req.body.name;

			logger4js.info('Post a new Project Group with name %s executed by user %s ', req.body.name, userId);
			logger4js.debug('Post a new Project Group Req Body: %O Name %s Perm %O', req.body, vgName, req.listVPPerm.getPerm(req.params.vpid));

			if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to change Permission of Project'
				});
			}
			if (!req.body.name) {
				logger4js.info('Body is inconsistent VP %s Body %O', req.oneVP._id, req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'No valid Group Definition'
				});
			}
			logger4js.debug('Post Group to VP %s/%s Permission is ok, check unique name', req.oneVP.name, req.oneVP._id);
			var query = {vcid: req.oneVP.vcid, vpids: req.oneVP._id, name: req.body.name};
			var queryGroup = VisboGroup.findOne(query);
			queryGroup.select('name');
			queryGroup.lean();
			queryGroup.exec(function (err, oneGroup) {
				if (err) {
					errorHandler(err, res, `DB: POST VP Groups find ${query}`, 'Error getting Project Groups');
					return;
				}
				if (oneGroup) {
					return res.status(409).send({
						state: 'failure',
						message: 'Project Group already exists'
					});
				}

				var vgGroup = new VisboGroup();
				// fill in the required fields
				vgGroup.name = req.body.name;
				vgGroup.vcid = req.oneVP.vcid;
				vgGroup.vpids.push(req.oneVP._id);
				vgGroup.global = vgGlobal;
				vgGroup.permission = newPerm;
				vgGroup.groupType = groupType;
				vgGroup.internal = false;
				logger4js.debug('Post Group %s to VP %s now: %O', req.body.name, req.params.vpid, vgGroup);
				vgGroup.save(function(err, oneGroup) {
					if (err) {
						errorHandler(err, res, 'DB: POST VP Groups save', 'Error updating Project Groups');
						return;
					}
					req.oneGroup = oneGroup;
					var resultGroup = {};
					resultGroup._id = oneGroup._id;
					resultGroup.name = oneGroup.name;
					resultGroup.vcid = oneGroup.vcid;
					resultGroup.global = oneGroup.global;
					resultGroup.permission = oneGroup.permission;
					resultGroup.groupType = oneGroup.groupType;
					resultGroup.users = oneGroup.users;
					return res.status(200).send({
						state: 'success',
						message: 'Inserted Project Group',
						groups: [ resultGroup ]
					});
				});
			});
		});


	router.route('/:vpid/group/:groupid')

	/**
		* @api {delete} /vp/:vpid/group/:groupid Delete a Group
		* @apiVersion 1.0.0
		* @apiGroup VISBO Project Permission
		* @apiName DeleteVISBOProjectGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Deletes the specified group in the Project
		*
		* @apiPermission Authenticated and VP.View and VP.ManagePerm Permission for the Project.
		* @apiError {number} 400 delete of internal Project Group or a VISBO Center Group inside the Project not allowed.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete a Project Group
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vp/:vpid/group/:groupid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Project Group deleted'
		* }
		*/

	// Delete Project Group
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;

			req.auditDescription = 'Project Group Delete';
			req.auditInfo = req.oneGroup.name;
			logger4js.info('DELETE Project Group for userid %s email %s and vc %s group %s ', userId, useremail, req.params.vpid, req.params.groupid);

			if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to delete Project Group'
				});
			}
			logger4js.debug('Delete Project Group after permission check %s', req.params.vpid);

			// Do not allow to delete internal or VC Group
			if (req.oneGroup.internal || req.oneGroup.groupType != 'VP') {
				return res.status(400).send({
					state: 'failure',
					message: 'Project Group not deletable'
			});
			}
			req.oneGroup.remove(function(err) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VP Group', 'Error deleting Project Group');
					return;
				}
				return res.status(200).send({
					state: 'success',
					message: 'Deleted Project Group'
				});
			});
		})

	/**
		* @api {put} /vp/:vpid/group/:groupid Update a Group
		* @apiVersion 1.0.0
		* @apiGroup VISBO Project Permission
		* @apiName PutVISBOProjectGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Put updates a group inside the Project
		*
		* @apiPermission Authenticated and VP.View and VP.ManagePerm Permission for the Project.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 Not allowed to change a VISBO Center Group inside the Project.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a Project Group
		* @apiError {number} 409 Project Group with same name exists already
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vp/:vpid/group/:groupid
		*  {
	  *    'name':'My first Group Renamed',
		*    'global': true,
		*    'permission': {vp: 1 }
	  *   }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned Project Group',
		*   'groups':[{
		*     '_id':'vpgroup5c754feaa',
		*     'name':'My first Group Renamed',
		*     'vcid': 'vc5c754feaa',
		*     'global': true
		*   }]
		* }
		*/

	// Change Group
		.put(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var vgName = (req.body.name || '').trim();
			var newPerm = {};
			var vgGlobal = false;

			req.auditDescription = 'Project Group Update';
			req.auditInfo = req.oneGroup.name;
			if (vgName && vgName != req.oneGroup.name) {
				req.auditInfo = req.auditInfo.concat(' / ', vgName);
			}

			if (req.body.global != undefined)
				vgGlobal = req.body.global == true;
			logger4js.debug('Get Global Flag %s process %s', req.body.global, vgGlobal);
			if ( req.body.permission ) {
				newPerm.vp = (parseInt(req.body.permission.vp) || undefined) & Const.constPermVPAll;
			}

			logger4js.info('PUT Project Group for userid %s email %s and vc %s group %s perm %O', userId, useremail, req.params.vpid, req.params.groupid, req.listVPPerm.getPerm(req.params.vpid));
			if (!validateName(vgName, true)) {
				logger4js.info('PUT Project Group contains illegal strings body %O', req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'Project Group Body contains invalid strings'
				});
			}

			if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to change Project Group'
				});
			}
			if (req.oneGroup.groupType != 'VP') {
				return res.status(400).send({
					state: 'failure',
					message: 'not a Project Group'
				});
			}

			logger4js.debug('Update Project Group after permission check vpid %s groupName %s', req.params.vpid, req.oneGroup.name);
			// check unique group name
			var query = {vcid: req.oneVP.vcid, vpids: req.oneVP._id, name: req.body.name};
			var queryGroup = VisboGroup.find(query);
			queryGroup.lean();
			queryGroup.exec(function (err, listVPGroup) {
				if (err) {
					errorHandler(err, res, `DB: PUT VP Groups find ${query}`, 'Error getting Project Groups');
					return;
				}
				if (listVPGroup.length > 1 || (listVPGroup.length == 1 &&  listVPGroup[0]._id.toString() != req.oneGroup._id.toString())) {
					return res.status(409).send({
						state: 'failure',
						message: 'Project Group already exists'
					});
				}
				// fill in the required fields
				if (vgName) req.oneGroup.name = vgName;
				req.oneGroup.permission = newPerm;
				req.oneGroup.internal = req.oneGroup.internal == true; // to guarantee that it is set
				req.oneGroup.save(function(err, oneGroup) {
					if (err) {
						errorHandler(err, res, 'DB: PUT VP Group', 'Error updating Project Group');
						return;
					}
					var resultGroup = {};
					resultGroup._id = oneGroup._id;
					resultGroup.name = oneGroup.name;
					resultGroup.vcid = oneGroup.vcid;
					resultGroup.global = oneGroup.global;
					resultGroup.permission = oneGroup.permission;
					resultGroup.groupType = oneGroup.groupType;
					resultGroup.users = oneGroup.users;
					return res.status(200).send({
						state: 'success',
						message: 'Updated Project Group',
						groups: [ resultGroup ]
					});
				});
			});
		});

	router.route('/:vpid/group/:groupid/user')

		/**
			* @api {post} /vp/:vpid/group/:groupid/user Add User to Group
			* @apiVersion 1.0.0
			* @apiGroup VISBO Project Permission
			* @apiName AddUserToVISBOProjectGroup
			* @apiHeader {String} access-key User authentication token.
			* @apiDescription Adds the specified user from body to the group
			*
			* @apiPermission Authenticated and VP.View and VP.ManagePerm Permission for the Project.
			* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
			* @apiError {number} 400 missing user name to add to the Project Group or the Group is a VISBO Center Group
			* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
			* @apiError {number} 403 No Permission to Add a User to Project Group
			* @apiError {number} 409 user is already member of the Project Group
			* @apiExample Example usage:
			*  url: https://my.visbo.net/api/vp/:vpid/group/:groupid/user
			*  {
		  *    'email':'new.user@visbo.de',
			*    'message': 'Invitation message'
		  *  }
			* @apiSuccessExample {json} Success-Response:
			* HTTP/1.1 200 OK
			* {
			*   'state':'success',
			*   'message':'User was added to Project Group',
			*   'groups':[{
			*     '_id':'vpgroup5c754feaa',
			*     'name':'My first Group Renamed',
			*     'vcid': 'vc5c754feaa',
			*     'users': [{userId: 'userId5c754feaa', email: 'new.user@visbo.de'}]
			*     'global': true
			*   }]
			* }
			*/

		// Add User to Project Group
		.post(function(req, res) {
			// User is authenticated already
			var userId = req.decoded._id;
			var useremail = req.decoded.email;

			logger4js.info('Post a new Project User with name %s to group %s executed by user %s with perm %s ', req.body.email, req.oneGroup.name, userId, req.listVPPerm.getPerm(req.params.vpid));
			req.auditDescription = 'Project User Add';

			if (req.body.email) req.body.email = req.body.email.toLowerCase().trim();
			if (!req.body.email || !validate.validateEmail(req.body.email, false)) {
				return res.status(400).send({
					state: 'failure',
					message: 'No valid user definition'
				});
			}

			req.auditInfo = req.body.email + ' / ' + req.oneGroup.name;
			// no check for SysAdmin as SysAdmin does not get any special permissions
			if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No valid Project or no Permission'
				});
			}
			if (req.oneGroup.groupType != 'VP') {
				return res.status(400).send({
					state: 'failure',
					message: 'not a Project Group'
				});
			}
			logger4js.debug('Post User to VP %s Permission is ok', req.params.vpid);

			var vgUser = new VisboGroupUser();
			var eMailMessage = undefined;
			if (req.body.message) {
				eMailMessage = sanitizeHtml(req.body.message, {allowedTags: [], allowedAttributes: {}});
			}
			vgUser.email = req.body.email;

			// check if the user is not member of the group already
			if (req.oneGroup.users.filter(users => (users.email == vgUser.email)).length != 0) {
				logger4js.debug('Post User %s to Group %s User is already a member', vgUser.email, req.oneGroup._id);
				return res.status(409).send({
					state: 'failure',
					message: 'User is already member',
					groups: [req.oneGroup]
				});
			}
			logger4js.debug('Post User to VP User is not member of the group');
			// check if the user exists and get the UserId or create the user
			var query = {'email': vgUser.email};
			var queryUsers = User.findOne(query);
			//queryUsers.select('email');
			queryUsers.exec(function (err, user) {
				if (err) {
					errorHandler(err, res, `DB: POST VP User to Group Find one ${query}`, 'Error adding User to Project Group');
					return;
				}
				if (!user) {
					user = new User();
					user.email = vgUser.email;
					logger4js.debug('Create new User %s for VP as %s', vgUser.email, vgUser.groupName);
					user.save(function(err, user) {
						if (err) {
							errorHandler(err, res, 'DB: POST VP User to Group Add', 'Error adding User to Project Group');
							return;
						}
						// user exists now, now the group can be updated
						vgUser.userId = user._id;

						req.oneGroup.users.push(vgUser);
						req.oneGroup.save(function(err, vgGroup) {
							if (err) {
								errorHandler(err, res, 'DB: POST VP User to Group update', 'Error adding User to Project Group');
								return;
							}
							req.oneGroup = vgGroup;
							// now send an e-Mail to the user for registration
							var lang = validate.evaluateLanguage(req);
							var template = __dirname.concat(eMailTemplates, lang, '/inviteVPNewUser.ejs');
							var uiUrl =  getSystemUrl();
							var eMailSubject = res.__('Mail.Subject.VPInvite') + ' ' + req.oneVP.name;

							var secret = 'register'.concat(user._id, user.updatedAt.getTime());
							var hash = createHash(secret);
							uiUrl = uiUrl.concat('/register/', user._id, '?hash=', hash);

							logger4js.debug('E-Mail template %s, url %s', template, uiUrl);
							if (eMailMessage === undefined) {
									// do not send invitation mail if no message is specified
									return res.status(200).send({
										state: 'success',
										message: 'Successfully added User to Group',
										groups: [ vgGroup ]
									});
							} else {
								ejs.renderFile(template, {userFrom: req.decoded, userTo: user, url: uiUrl, vp: req.oneVP, message: eMailMessage}, function(err, emailHtml) {
									if (err) {
										logger4js.warn('E-Mail Rendering failed %s', err.message);
										return res.status(500).send({
											state: 'failure',
											message: 'E-Mail Rendering failed',
											error: err
										});
									}
									// logger4js.debug('E-Mail Rendering done: %s', emailHtml);
									var message = {
											from: useremail,
											to: user.email,
											subject: eMailSubject,
											html: '<p> '.concat(emailHtml, ' </p>')
									};
									logger4js.info('Now send mail from %s to %s', message.from, message.to);
									mail.VisboSendMail(message);
									return res.status(200).send({
										state: 'success',
										message: 'Successfully added User to Project',
										groups: [ vgGroup ]
									});
								});
							}
						});
					});
				} else {
					vgUser.userId = user._id;
					req.oneGroup.users.push(vgUser);
					req.oneGroup.save(function(err, vgGroup) {
						if (err) {
							errorHandler(err, res, 'DB: POST VP User to Group Add', 'Error adding User to Project Group');
							return;
						}
						req.oneGroup = vgGroup;
						// now send an e-Mail to the user for registration/login
						var lang = validate.evaluateLanguage(req);
						var template = __dirname.concat(eMailTemplates, lang);
						var uiUrl =  getSystemUrl();
						var eMailSubject = res.__('Mail.Subject.VPInvite') + ' ' + req.oneVP.name;
						logger4js.debug('E-Mail User Status %O %s', user.status, user.status.registeredAt);
						if (user.status && user.status.registeredAt) {
							// send e-Mail to a registered user
							template = template.concat('/inviteVPExistingUser.ejs');
							uiUrl = uiUrl.concat('/vpKeyMetrics/', req.oneVP._id);
						} else {
							// send e-Mail to an existing but unregistered user
							template = template.concat('/inviteVPNewUser.ejs');
							var secret = 'register'.concat(user._id, user.updatedAt.getTime());
							var hash = createHash(secret);
							uiUrl = uiUrl.concat('/register/', user._id, '?hash=', hash);
						}

						logger4js.debug('E-Mail template %s, url %s', template, uiUrl);
						if (eMailMessage === undefined) {
								// do not send invitation mail if no message is specified
								return res.status(200).send({
									state: 'success',
									message: 'Successfully added User to Group',
									groups: [ vgGroup ]
								});
						} else {
							ejs.renderFile(template, {userFrom: req.decoded, userTo: user, url: uiUrl, vp: req.oneVP, message: eMailMessage}, function(err, emailHtml) {
								if (err) {
									logger4js.warn('E-Mail Rendering failed %s', err.message);
									return res.status(500).send({
										state: 'failure',
										message: 'E-Mail Rendering failed',
										error: err
									});
								}
								var message = {
										from: useremail,
										to: user.email,
										subject: eMailSubject,
										html: '<p> '.concat(emailHtml, ' </p>')
								};
								logger4js.info('Now send mail from %s to %s', message.from, message.to);
								mail.VisboSendMail(message);
								return res.status(200).send({
									state: 'success',
									message: 'Successfully added User to Project',
									groups: [ vgGroup ]
								});
							});
						}
					});
				}
			});
		});

		router.route('/:vpid/group/:groupid/user/:userid')

		/**
			* @api {delete} /vp/:vpid/group/:groupid/user/:userid Delete a User from Group
			* @apiVersion 1.0.0
			* @apiGroup VISBO Project Permission
			* @apiName DeleteVISBOProjectUser
			* @apiHeader {String} access-key User authentication token.
			* @apiDescription Deletes the specified user in the Project Group
			*
			* @apiPermission Authenticated and VP.View and VP.ManagePerm Permission for the Project.
			* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
			* @apiError {number} 400 the group is a VISBO Center Group
			* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
			* @apiError {number} 403 No Permission to Create a Project Group
			* @apiError {number} 409 user is not member of the Project Group
			*
			* @apiExample Example usage:
			*   url: https://my.visbo.net/api/vp/:vpid/group/:groupid/user/:userid
			* @apiSuccessExample {json} Success-Response:
			* HTTP/1.1 200 OK
			* {
			*   'state':'success',
			*   'message':'Project User deleted from Group'
			* }
			*/

	// Delete Project User
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;

			logger4js.info('DELETE Project User by userid %s email %s for user %s Group %s ', userId, useremail, req.params.userid, req.oneGroup._id);

			req.auditDescription = 'Project User Delete';

			var delUser = req.oneGroup.users.find(findUserById, req.params.userid);
			if (delUser) req.auditInfo = delUser.email  + ' / ' + req.oneGroup.name;

			if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No valid Project or no Permission'
				});
			}
			if (req.oneGroup.groupType != 'VP') {
				return res.status(400).send({
					state: 'failure',
					message: 'not a Project Group'
				});
			}
			var newUserList = req.oneGroup.users.filter(users => (!(users.userId == req.params.userid )));
			logger4js.debug('DELETE Group User List Length new %d old %d', newUserList.length, req.oneGroup.users.length);
			logger4js.trace('DELETE Project Filtered User List %O ', newUserList);
			if (newUserList.length == req.oneGroup.users.length) {
				return res.status(409).send({
					state: 'failure',
					message: 'User is not member of Group',
					groups: [req.oneGroup]
				});
			}
			logger4js.debug('Delete Project User after permission check %s', req.params.userid);
			req.oneGroup.users = newUserList;
			req.oneGroup.save(function(err, vg) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VP User from Group', 'Error delete User from Project Group');
					return;
				}
				req.oneGroup = vg;
				return res.status(200).send({
					state: 'success',
					message: 'Successfully removed User from Project',
					groups: [req.oneGroup]
				});
			});
		});

router.route('/:vpid/lock')
/**
	* @api {post} /vp/:vpid/lock Create Lock
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Properties
	* @apiName CreateLock
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Post creates or renews a lock for a user to a specific project and variant
	* In case a lock is already active for another user, the lock request fails, in case a lock exists for the current user, it gets replaced by the new lock.
	* A User who can not Modify the Project can not lock the Project only a Variant of a Project, if the user has CreateVariant Permission.
  *
	* @apiPermission Authenticated and VP.View and VP.Modify or VP.CreateVariant Permission for the Project.
	* @apiError {number} 400 no valid lock date or a variant that does not exist
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Lock the Project
	* @apiError {number} 409 Project already locked by another user.
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5aada025/lock
	* {
	*  'variantName': 'V1',
	*  'expiresAt': '2018-04-26T12:04:12.094Z'
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'Successfully locked Project',
	*  'lock':[{
	*    '_id': 'id5c754feaa',
	*    'variantName': '',
	*    'email': 'someone@visbo.de',
	*    'createdAt': '2018-04-26T11:04:12.094Z',
	*    'expiresAt': '2018-04-26T12:04:12.094Z'
	*  }]
	* }
	*/
// Create a Lock for a Project
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var variantName = (req.body.variantName || '').trim();

		req.auditDescription = 'Project Lock Create';
		req.auditInfo = variantName || ' ';

		logger4js.info('POST Lock Project for userid %s email %s and vp %s ', userId, useremail, req.params.vpid);
		var expiredAt = (req.body.expiresAt  && Date.parse(req.body.expiresAt)) ? new Date(req.body.expiresAt) : undefined;
		var dateNow = new Date();

		if (expiredAt == undefined) {
			expiredAt = dateNow;
			// set the lock date to 1 hour later
			expiredAt.setHours(expiredAt.getHours() + 1);
		}
		logger4js.info('POST Lock Project %s Check variant %s does exists  ', req.params.vpid, variantName);

		var variant;
		if (variantName) {
			variant = req.oneVP.variant.find(item => item.variantName == variantName);
			if (!variant) {
				logger4js.warn('POST Lock Project %s variant %s does not exists  ', req.params.vpid, variantName);
				return res.status(400).send({
					state: 'failure',
					message: 'Project Variant does not exist',
					vp: [req.oneVP]
				});
			}
		}
		var hasPerm = false;
		if (req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Modify) {
			hasPerm = true;
		} else if (variant && variant.email == useremail && req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.CreateVariant) {
			hasPerm = true;
		}
		if (!hasPerm) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to lock Project'
			});
		}

		if (lockVP.lockStatus(req.oneVP, useremail, variantName).locked) {
			return res.status(409).send({
				state: 'failure',
				message: 'Project already locked',
				lock: req.oneVP.lock
			});
		}
		if (expiredAt <= dateNow) {
			logger4js.info('POST Lock new Lock already expired %s email %s and vp %s ', expiredAt, useremail, req.params.vpid);
			return res.status(400).send({
				state: 'failure',
				message: 'New Lock already expired',
				lock: req.oneVP.lock
			});
		}
		var listLockNew = lockVP.lockCleanup(req.oneVP.lock);
		req.oneVP.lock = listLockNew;

		var newLock = new Lock;
		newLock.email = useremail;
		newLock.expiresAt = expiredAt;
		newLock.variantName = variantName;
		newLock.createdAt = new Date();
		// insert new lock or replace existing lock
		var resultLock = lockVP.lockStatus(req.oneVP, useremail, variantName);
		if (resultLock.lockindex < 0) {
			req.oneVP.lock.push(newLock);
		} else {
			req.oneVP.lock[resultLock.lockindex] = newLock;
		}
		req.oneVP.save(function(err, oneVP) {
			if (err) {
				errorHandler(err, res, 'DB: POST VP Lock', 'Error updating Project Locks');
				return;
			}
			newLock = oneVP.lock.filter(lock => (lock.email == newLock.email && lock.expiresAt == newLock.expiresAt && lock.variantName == newLock.variantName && lock.createdAt == newLock.createdAt ))[0];
			return res.status(200).send({
				state: 'success',
				message: 'Updated Project Locks',
				lock: [newLock]
			});
		});
	})

/**
	* @api {delete} /vp/:vpid/lock Delete Lock
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Properties
	* @apiName DeleteLock
	* @apiDescription Deletes a lock for a specific project and a specific variant
	* the user needs to have read access to the Project and either owns the lock or has Modify Permission in the Project
	* @apiHeader {String} access-key User authentication token.
	* @apiParam {String} variantID The Variant ID of the Project for the Lock
	* @apiParam {String} variantName The Variant Name of the Project for the Lock (outdated)
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	*
	* @apiPermission Authenticated and VP.View and optional VP.Modify Permission for the Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to UnLock the Project
	* @apiError {number} 409 No Lock exists for the specified Project and Variant.
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5aada025/lock
	*   url: https://my.visbo.net/api/vp/vp5aada025/lock?variantID=variant5aada029
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Deleted Project Lock'
	* }
	*/
// Delete Lock
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		var variantName = (req.query.variantName || '').trim();
		var variantID = req.query.variantID;
		logger4js.info('DELETE Project Lock for userid %s email %s and vp %s variant :%s:', userId, useremail, req.params.vpid, variantID || variantName);

		if (variantID) {
			var variant = req.oneVP.variant.find(item => item._id.toString() == variantID);
			if (variant) {
				variantName = variant.variantName;
			}
		}

		req.auditDescription = 'Project Lock Delete';
		req.auditInfo = variantName;

		req.oneVP.lock = lockVP.lockCleanup(req.oneVP.lock);
		var resultLock = lockVP.lockStatus(req.oneVP, useremail, variantName);
		if (resultLock.lockindex < 0) {
			logger4js.info('Delete Lock for VP :%s: No Lock exists', req.oneVP.name);
			return res.status(409).send({
				state: 'failure',
				message: 'Lock does not exists for Deletion',
				lock: req.oneVP.lock
			});
		}
		if (resultLock.locked && !(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Modify)) {	// lock from a different user and no Admin, deny to delete
			logger4js.info('Delete Lock for VP :%s: Project is locked by another user', req.oneVP.name);
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete the Lock',
				lock: req.oneVP.lock
			});
		}

		logger4js.debug('Delete Lock for VP :%s: after perm check has %d Locks', req.oneVP.name, req.oneVP.lock.length);
		req.oneVP.lock.splice(resultLock.lockindex, 1);  // remove the found lock
		logger4js.debug('Delete Lock for VP :%s: after Modification has %d Locks', req.oneVP.name, req.oneVP.lock.length);

		req.oneVP.save(function(err) {
			if (err) {
				errorHandler(err, res, 'DB: DELETE VP Lock', 'Error deleting Project Locks');
				return;
			}
			return res.status(200).send({
				state: 'success',
				message: 'Deleted Project Locks',
				lock: req.oneVP.lock
			});
		});
	});

router.route('/:vpid/variant')
/**
	* @api {post} /vp/:vpid/variant Create a Variant
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Properties
	* @apiName CreateVISBOProjectVariant
	* @apiDescription Post creates a new Variant for the Project
	*
	* @apiPermission Authenticated and VP.View and VP.Modify or VP.CreateVariant Permission for the Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Create a Variant for the Project
	* @apiError {number} 409 Variant already exists.
	*
	* @apiHeader {String} access-key User authentication token.
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5aada025/variant
	* {
	*  'variantName': 'some name',
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'Successfully created Variant for Project',
	*  'variant':[{
	*    '_id': 'id5c754feaa',
	*    'variantName': 'V1',
	*    'email': 'someone@visbo.de',
	*    'createdAt': '2018-04-26T11:04:12.094Z',
	*    'vpvCount': '1'
	*  ]}
	* }
	*/
// Create Variant inside a Project
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Project Variant Create';
		req.auditInfo = req.body.variantName;

		logger4js.info('POST Project Variant for userid %s email %s and vp %s Variant %O Perm %O', userId, useremail, req.params.vpid, req.body, req.listVPPerm.getPerm(req.params.vpid));

		var variantList = req.oneVP.variant;
		var variantName = (req.body.variantName || '').trim();

		if (!validateName(variantName, false)) {
			logger4js.info('POST Project Variant contains illegal strings body %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'Project Variant Body contains invalid strings'
			});
		}
		if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Modify
				|| req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.CreateVariant)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to create Variant'
			});
		}
		logger4js.trace('Variant %s current list %O', variantName, variantList);
		var variantDuplicate = false;
		variantDuplicate = variantList.findIndex(variant => variant.variantName == variantName) >= 0;
		logger4js.debug('Variant Duplicate %s Variant Name %s', variantDuplicate, variantName);
		if (variantDuplicate || variantName == '') {
			return res.status(409).send({
				state: 'failure',
				message: 'Variant already exists',
				vp: [req.oneVP]
		});
		}
		logger4js.trace('Variant List %d orig %O ', variantList.length, variantList);
		var newVariant = new Variant;
		newVariant.email = useremail;
		newVariant.variantName = variantName;
		newVariant.createdAt = new Date();
		newVariant.vpvCount = 0;
		if (req.oneVP.vpType == 1) {
			newVariant.vpfCount = 0;
		}
		variantList.push(newVariant);
		req.oneVP.variant = variantList;
		logger4js.trace('Variant List new %O ', variantList);
		req.oneVP.save(function(err, oneVP) {
			if (err) {
				errorHandler(err, res, 'DB: POST VP Variant', 'Error creating Project Variant');
				return;
			}
			newVariant = oneVP.variant.filter(variant => (variant.email == newVariant.email && variant.createdAt == newVariant.createdAt && variant.variantName == newVariant.variantName ))[0];
			return res.status(200).send({
				state: 'success',
				message: 'Created Project Variant',
				variant: [newVariant]
			});
		});
	});

router.route('/:vpid/variant/:vid')

/**
	* @api {delete} /vp/:vpid/variant/:vid Delete a Variant
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Properties
	* @apiName DeleteVISBOProjectVariant
	* @apiDescription Deletes a specific Variant for a project if the variant does not contain versions.
	* The user needs to either own the Variant or has Modify Permission in the Project
	* @apiHeader {String} access-key User authentication token.
	*
	* @apiPermission Authenticated and VP.View and optional VP.Modify Permission for the Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Lock the Project
	* @apiError {number} 409 Variant does not exists or still contains Versions
	* @apiError {number} 423 Variant is locked by another user
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5aada025/variant/variant5aada
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Deleted Project Variant',
	*   'vp': [vpList]
	* }
	*/
// Delete Project Variant
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var variantId = req.params.vid;
		var lockResult;

		req.auditDescription = 'Project Variant Delete';
		req.auditInfo = req.body.variantId;

		logger4js.info('DELETE Project Variant for userid %s email %s and vp %s variant :%s:', userId, useremail, req.params.vpid, req.params.vid);

		var variantIndex = req.oneVP.variant.findIndex(variant => variant._id.toString() == variantId.toString());
		if (variantIndex < 0) {
			return res.status(409).send({
				state: 'failure',
				message: 'Variant does not exists',
				vp: [req.oneVP]
			});
		}
		var variantName = req.oneVP.variant[variantIndex].variantName;
		req.auditInfo = variantName;
		//variant belongs to a different user and curr. user is not an Admin
		if (req.oneVP.variant[variantIndex].email != useremail && !(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Modify)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete Variant',
				vp: [req.oneVP]
			});
		}
		lockResult = lockVP.lockStatus(req.oneVP, useremail, variantName);
		if (lockResult.locked) {
			return res.status(423).send({
				state: 'failure',
				message: 'Project locked',
				vp: [req.oneVP]
			});
		}
		if (req.oneVP.variant[variantIndex].vpvCount > 0 || req.oneVP.variant[variantIndex].vpfCount > 0) {
			return res.status(409).send({
				state: 'failure',
				message: 'Project Variant still has Versions',
				vp: [req.oneVP]
			});
		}
		req.oneVP.variant.splice(variantIndex, 1);
		if (lockResult.lockindex >= 0) {
			req.oneVP.lock.splice(lockResult.lockindex, 1);
		}
		logger4js.trace('DELETE Project Variant List after %O', req.oneVP.variant);

		// MS TODO Destroy the Deleted Variant Versions of the Project

		req.oneVP.save(function(err) {
			if (err) {
				errorHandler(err, res, 'DB: DELETE VP Variant', 'Error deleting Project Variant');
				return;
			}
			return res.status(200).send({
				state: 'success',
				message: 'Deleted Project Variant',
				vp: [req.oneVP]
			});
		});
	});

router.route('/:vpid/portfolio')
/**
	* @api {get} /vp/:vpid/portfolio Get Portfolio Versions
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Portfolio
	* @apiName GetPortfolio
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp/:vpid/portfolio returns all Portfolio List Versions in the specified Project
	* In case of success it delivers an array of Portfolio Lists, the array contains in each element a Portfolio List
	*
	* @apiPermission Authenticated and VP.View Permission for the Portfolio.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View the Project
	*
	* With additional query paramteters the amount of versions can be restricted. Available Restirctions are: refDate, refNext, variantName.
	* to query only the main version of a project, use variantID= in the query string.
	*
	* @apiParam {Date} refDate only the latest version before the reference date for the project and variant is delivered
	* Date Format is in the form: 2018-10-30T10:00:00Z
	* @apiParam {String} refNext If refNext is not empty the system delivers not the version before refDate instead it delivers the version after refDate
	* @apiParam {String} variantID Deliver only versions for the specified variant, if client wants to have only versions from the main branch, use variantName=
	* @apiParam {String} variantName Deliver only versions for the specified variant (outdated)
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5aaf992/portfolio
	*   url: https://my.visbo.net/api/vp/vp5aaf992/portfolio?refDate=2018-01-01&variantID=varaint5aaf999&refNext=1
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Returned Portfolios',
	*   'vpf': [{
	*   'updatedAt': '2018-06-07T13:17:35.434Z',
	*   'createdAt': '2018-06-07T13:17:35.434Z',
	*   'updatedFrom': {
	*		  'userId': 'user5b01b11',
	*		  'email': 'someone@visbo.de'
	*   },
	*   'sortType': 1,
	*   'timestamp': '2018-06-07T13:17:35.000Z',
	*   'name': 'VP Test01 PF',
	*   'variantName': '',
	*   'vpid': '5b192d7915609a50f5702a2c',
	*   '_id': '5b19306f53eb4b516619a5ab',
	*   'allItems': [{
	*     'vpid': '5b1532e8586c150506ab9633',
	*     'name': 'Project Name',
	*     'variantName': '',
	*     'Start': '2018-04-01T12:00:00.000Z',
	*     'show': true,
	*     'zeile': 2,
	*     'reasonToInclude': 'Description Text Include',
	*     'reasonToExclude': 'Description Text Exclude',
	*     '_id': '5b19306f53eb4b516619a5ac'
	*   }]
  * }
	*/
// Get Portfolio Versions
	.get(function(req, res) {
		// no need to check authentication, already done centrally

		var userId = req.decoded._id;
		var isSysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Portfolio List Read';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;
		var checkDeleted = req.query.deleted == true;

		if (req.query.refDate && !validate.validateDate(req.query.refDate)) {
			logger4js.warn('Get VPF mal formed query parameter %O ', req.query);
			return res.status(400).send({
				state: 'failure',
				message: 'Bad Content in Query Parameters'
			});
		}
		var query = {};
		var latestOnly = false; 	// as default show all portfolio lists of the project
		query.vpid = req.oneVP._id;
		var refDate;
		if (req.query.refDate && Date.parse(req.query.refDate)) {
			refDate = new Date(req.query.refDate);
		} else if (req.query.refDate == '') {
			refDate = new Date();
		}
		if (refDate){
			query.timestamp =  req.query.refNext ? {$gt: refDate} : {$lt: refDate};
			latestOnly = true;
		}
		if (req.query.variantID != undefined){
			logger4js.debug('Get Portfolio %s VariantID :%s:', req.oneVP.name, req.query.variantID);
			const variant = req.oneVP.variant.find(item => item._id.toString() === req.query.variantID);
			// if variantName not found return only main variant
			query.variantName = variant ? variant.variantName : '';
		} else if (req.query.variantName != undefined){
			logger4js.debug('Variant Query String :%s:', req.query.variantName);
			query.variantName = req.query.variantName;
		}
		query.deletedAt = {$exists: checkDeleted};

		logger4js.debug('Get Portfolio Version for user %s with query parameters %O', userId, query);

		var queryVPF = VisboPortfolio.find(query);
		if (req.query.refNext)
			queryVPF.sort('vpid variantName +timestamp');
		else
			queryVPF.sort('vpid variantName -timestamp');
		queryVPF.lean();
		queryVPF.exec(function (err, listVPF) {
			if (err) {
				errorHandler(err, res, 'DB: GET VPF', 'Error getting Project Portfolio');
				return;
			}
			logger4js.debug('Found %d Portfolios', listVPF.length);
			logger4js.trace('Found Portfolios/n', listVPF);

			if (listVPF.length > 1 && latestOnly){
				var listVPFfiltered = [];
				listVPFfiltered.push(listVPF[0]);
				for (let i = 1; i < listVPF.length; i++){
					//compare current item with previous and ignore if it is the same vpid & variantname
					// logger4js.trace('compare: :%s: vs. :%s:', JSON.stringify(listVPF[i].vpid), JSON.stringify(listVPF[i-1].vpid), JSON.stringify(listVPF[i].variantName), JSON.stringify(listVPF[i-1].variantName) );
					if (JSON.stringify(listVPF[i].vpid) != JSON.stringify(listVPF[i-1].vpid)
					|| JSON.stringify(listVPF[i].variantName) != JSON.stringify(listVPF[i-1].variantName) ) {
						listVPFfiltered.push(listVPF[i]);
						// logger4js.trace('compare unequal: ', listVPF[i].vpid != listVPF[i-1].vpid);
					}
				}
				logger4js.debug('Found %d Portfolio Lists after Filtering', listVPFfiltered.length);
				req.auditInfo = listVPFfiltered.length;
				verifyVp.squeezePortfolio(listVPFfiltered);
				return res.status(200).send({
					state: 'success',
					message: 'Returned Portfolios',
					count: listVPFfiltered.length,
					vpid: req.oneVP._id,
					name: req.oneVP.name,
					vpf: listVPFfiltered
				});
			} else {
				verifyVp.squeezePortfolio(req, listVPF);
				return res.status(200).send({
					state: 'success',
					message: 'Returned Portfolios',
					count: listVPF.length,
					vpid: req.oneVP._id,
					name: req.oneVP.name,
					vpf: listVPF
				});
			}
		});
	})

/**
	* @api {post} /vp/:vpid/portfolio Create a Portfolio Version
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Portfolio
	* @apiName CreatePortfolio
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Post creates a new Definition of a Portfolio for the Project
	*
	* @apiPermission Authenticated and VP.View and VP.Modify Permission for the Portfolio.
	* @apiError {number} 400 no Project Items specified for Portfolio or Project is not a Portfolio.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View the Visb Project (Portfolio) or Modify the Project (Portfolio) or Variant
	* @apiError {number} 409 Variant does not exist
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5aada025/portfolio
	*  {
	*    'variantName': 'name of the portfolio variant',
	*    'allItems': [{
	*      'vpid' : 'vp5aada025',
	*      'variantName' : 'name of the Variant of the Project',
	*      'Start' : '2018-04-01T12:00:00.000Z',
	*      'show' : 'true',
	*      'zeile' : 'row number',
	*      'reasonToInclude' : 'Description Text',
	*      'reasonToExclude' : 'Description Text'
	*    }],
	*   'sortType': '1',
	*   'sortList': 'internal Object'
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	*  {
	*    'state':'success',
	*    'message':'Successfully Created Portfolio',
	*    'vpf':[{
	*      '_id':'vpf541c754feaa',
	*      'updatedAt':'2018-03-16T12:39:54.042Z',
	*      'createdAt':'2018-03-12T09:54:56.411Z',
	*      'updatedFrom': {
	*		     'userId': 'user5b01b11',
	*		     'email': 'someone@visbo.de'
	*      },
	*      'vpid' : 'vp5aada025',
	*      'name' : 'Project Name',
	*      'allItems': [{
	*        'vpid' : 'vp5aada0251',
	*        'name' : 'Project Name',
	*        'variantName' : 'name of the Variant of the Project',
	*        'Start' : '2018-04-01T12:00:00.000Z',
	*        'show' : 'true',
	*        'zeile' : 'row number',
	*        'reasonToInclude' : 'Description Text',
	*        'reasonToInclude' : 'Description Text'
	*      }],
	*      'sortType': '1',
	*      'sortList': 'internal Object'
	*    }]
	*  }
	*/
// Post a Portfolio List
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Portfolio List Create';

		logger4js.info('POST Portfolio for userid %s email %s and vp %s perm %O', userId, useremail, req.params.vpid, req.listVPPerm.getPerm(req.params.vpid));

		logger4js.debug('Variant %s Portfolio %O', variantName || 'None', req.body);

		var variantName = req.body.variantName == undefined ? '' : req.body.variantName;
		var variantIndex = 0;
		if (variantName) {
			variantIndex = req.oneVP.variant.findIndex(variant => variant.variantName == variantName);
		}
		if (variantIndex < 0) {
			return res.status(409).send({
				state: 'failure',
				message: 'Variant does not exists',
				vp: [req.oneVP]
			});
		}
		if (!req.body.allItems || req.body.allItems.length == 0) {
			return res.status(400).send({
				state: 'failure',
				message: 'No valid Project Items in Portfolio',
				vp: [req.oneVP]
			});
		}
		if (req.oneVP.vpType != constVPTypes.portfolio) {
			return res.status(400).send({
				state: 'failure',
				message: 'Project is not a Portfolio Project',
				vp: [req.oneVP]
			});
		}
		if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Modify)
		&& !((req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.CreateVariant) && variantName != '')) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to create Portfolio List'
			});
		}

		var newPortfolio = new VisboPortfolio;
		newPortfolio.vpid = req.oneVP._id;
		newPortfolio.variantName = variantName;
		newPortfolio.name = req.oneVP.name;
		newPortfolio.timestamp = req.body.timestamp || new Date();

		// check that the vpid exist and user has permission to access
		var listVPid = new Array();
		for (var i = 0; i < req.body.allItems.length; i++) {
			// build up unique project list to check that they exist
			if (validate.validateObjectId(req.body.allItems[i].vpid, false) && !listVPid.find(findVP, req.body.allItems[i].vpid)){
				listVPid.push(req.body.allItems[i].vpid);
			}
		}
		logger4js.debug('Check vpids if they exist %s', JSON.stringify(listVPid));
		var query = {'_id': {'$in': listVPid}};
		var queryVP = VisboProject.find(query);
		queryVP.select('_id name');
		queryVP.exec(function (err, listVP) {
			if (err) {
				errorHandler(err, res, 'DB: POST VPF find', 'Error getting Projects for Portfolio');
				return;
			}
			if (listVP.length != req.body.allItems.length) {
				logger4js.warn('Found only %d of %d VP IDs', listVP.length, req.body.allItems.length);
				return res.status(403).send({
					state: 'failure',
					message: 'Not all Projects exists or User has permission to',
					list: listVP
				});
			}
			// MS TODO Check that the sort lists only contain projects from the arrayList, if not return error

			// Copy the items to the newPortfolio
			for (var i = 0; i < req.body.allItems.length; i++) {
				// get the item, overwrite Project name with correct name
				req.body.allItems[i].name = listVP.find(findVPList, req.body.allItems[i].vpid).name;
				if (!req.body.allItems[i].variantName) req.body.allItems[i].variantName = '';
				delete req.body.allItems[i]._id;
				newPortfolio.allItems.push(req.body.allItems[i]);
			}
			logger4js.warn('Replaced in List (%d) correct VP Names %s', newPortfolio.allItems.length, JSON.stringify(newPortfolio.allItems));
			newPortfolio.sortType = req.body.sortType;
			newPortfolio.sortList = req.body.sortList;
			newPortfolio.updatedFrom = {};
			newPortfolio.updatedFrom.userId = userId;
			newPortfolio.updatedFrom.email = useremail;

			newPortfolio.save(function(err, onePortfolio) {
				if (err) {
					errorHandler(err, res, 'DB: POST VPF save', 'Error creating Portfolio');
					return;
				}
				req.oneVPF = onePortfolio;
				// update the version count of the base version or the variant
				updateVPFCount(req.oneVPF.vpid, variantName, 1);
				return res.status(200).send({
					state: 'success',
					message: 'Created Portfolio Version',
					vpf: [onePortfolio]
				});
			});
		});
	});

router.route('/:vpid/portfolio/:vpfid')
/**
	* @api {get} /vp/:vpid/portfolio/:vpfid Get specific Portfolio Version
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Portfolio
	* @apiName GetVISBOPortfolio
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp/:vpid/portfolio retruns all Portfolio Versions in the specified Project
	* In case of success it delivers an array of Portfolio Lists, the array contains in each element a Portfolio List
	*
	* @apiParam (Parameter) {Boolean} [deletedVPF=false]  Request Deleted VPFs, only allowed for users with DeleteVP Permission.
	* @apiPermission Authenticated and VP.View Permission for the Portfolio.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View the Project
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5aaf992/portfolio/vpf5aaf992
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Returned Portfolios',
	*   'vpf': [{
	*   'updatedAt': '2018-06-07T13:17:35.434Z',
	*   'createdAt': '2018-06-07T13:17:35.434Z',
	*   'updatedFrom': {
	*		  'userId': 'user5b01b11',
	*		  'email': 'someone@visbo.de'
	*   },
	*   'sortType': 1,
	*   'timestamp': '2018-06-07T13:17:35.000Z',
	*   'name': 'VP Test01 PF',
	*   'variantName': '',
	*   'vpid': 'vp50f5702a2c',
	*   '_id': 'vpf116619a5ab',
	*   'allItems': [{
	*     'vpid': 'vp150506ab9633',
	*     'name': 'Project Name',
	*     'variantName': '',
	*     'Start': '2018-04-01T12:00:00.000Z',
	*     'show': true,
	*     'zeile': 2,
	*     'reasonToInclude': 'Description Text Include',
	*     'reasonToExclude': 'Description Text Exclude',
	*     '_id': '5b19306f53eb4b516619a5ac'
	*   }]
  * }
	*/
// Get specific portfolio version
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		var isSysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Portfolio List Read';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		logger4js.trace('Get Portfolio Versions');
		var query = {};
		query._id = req.params.vpfid;
		query.vpid = req.oneVP._id;
		// MS TODO: Check if the user has permission to get deleted VPFs
		query.deletedAt = {$exists: req.query.deletedVPF ? true : false};

		var queryVPF = VisboPortfolio.find(query);
		queryVPF.exec(function (err, listVPF) {
			if (err) {
				errorHandler(err, res, 'DB: GET VPF Version find', 'Error getting Versions of Portfolio');
				return;
			}

			logger4js.debug('Found %d Portfolios', listVPF.length);
			logger4js.trace('Found Portfolios/n', listVPF);
			if (listVPF.length === 0) {
				return res.status(403).send({
					state: 'failure',
					message: 'Portfolio Version not found or deleted'
				});
			}

			verifyVp.squeezePortfolio(req, listVPF);
			return res.status(200).send({
				state: 'success',
				message: 'Returned Portfolio',
				vpid: req.oneVP._id,
				name: req.oneVP.name,
				vpf: listVPF
			});
		});
	})

/**
	* @api {put} /vp/:vpid/portfolio/:vpfid Update Portfolio Version
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Portfolio
	* @apiName UpdateVISBOPortfolio
	* @apiDescription Put updates a specific Portfolio Version used for undelete
	* the system checks if the user has Delete permission to the Project.
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and VP.View and VP.Delete Permission for the Portfolio.
	* @apiError {number} 400 not allowed to change Portfolio Version or bad values in body
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Un-Delete Portfolio
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5cf3da025/portfolio/vpf541c754feaa?deleted=1
	* {
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Returned Portfolios',
	*   'vpf': [{
	*   'updatedAt': '2018-06-07T13:17:35.434Z',
	*   'createdAt': '2018-06-07T13:17:35.434Z',
	*   'updatedFrom': {
	*		  'userId': 'user5b01b11',
	*		  'email': 'someone@visbo.de'
	*   },
	*   'sortType': 1,
	*   'timestamp': '2018-06-07T13:17:35.000Z',
	*   'name': 'VP Test01 PF',
	*   'variantName': '',
	*   'vpid': 'vp50f5702a2c',
	*   '_id': 'vpf116619a5ab',
	*   'allItems': [{
	*     'vpid': 'vp150506ab9633',
	*     'name': 'Project Name',
	*     'variantName': '',
	*     'Start': '2018-04-01T12:00:00.000Z',
	*     'show': true,
	*     'zeile': 2,
	*     'reasonToInclude': 'Description Text Include',
	*     'reasonToExclude': 'Description Text Exclude',
	*     '_id': '5b19306f53eb4b516619a5ac'
	*   }]
  * }
	*/
// Update Portfolio Version including undelete
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var variantName = req.body.variantName == undefined ? '' : req.body.variantName.trim();

		req.auditDescription = 'Portfolio List Update';

		logger4js.info('PUT/Save Portfolio List for userid %s email %s and vpf %s perm %O', userId, useremail, req.params.vpfid, req.listVPPerm);
		// undelete the VPF in case of PUT
		if (req.oneVPF.deletedAt) {
			req.auditDescription = 'Portfolio List Undelete';
			if (!req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Delete) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to undelete Portfolio List!'
				});
			} else {
				logger4js.debug('Undelete VPF %s', req.oneVPF._id);
				req.oneVPF.deletedAt = undefined;
				req.oneVPF.save(function(err, oneVPF) {
					if (err) {
						errorHandler(err, res, 'DB: PUT VPF Save', 'Error updating Portfolio List ');
						return;
					}
					req.oneVPF = oneVPF;
					updateVPFCount(req.oneVPF.vpid, req.oneVPF.variantName, 1);
					return res.status(200).send({
						state: 'success',
						message: 'Portfolio List undeleted',
						vpf: [ oneVPF ]
					});
				});
			}
		} else {
			var today = new Date();
			today.setHours(0,0,0,0);

			if ((userId != (req.oneVPF.updatedFrom && req.oneVPF.updatedFrom.userId.toString()))
			|| (req.oneVPF.updatedAt.getTime() < today.getTime())) {
				return res.status(403).send({
					state: 'failure',
					message: 'No permission to change Portfolio List'
				});
			}

			// MS TODO: Check & update Portfolio List
			req.oneVPF.variantName = variantName;
			req.oneVPF.timestamp = req.body.timestamp || new Date();
			// check that the vpid exist and user has permission to access
			var listVPid = new Array();
			for (var i = 0; i < req.body.allItems.length; i++) {
				// build up unique project list to check that they exist
				if (validate.validateObjectId(req.body.allItems[i].vpid, false) && !listVPid.find(findVP, req.body.allItems[i].vpid)){
					listVPid.push(req.body.allItems[i].vpid);
				}
			}
			logger4js.debug('Check vpids if they exist %s', JSON.stringify(listVPid));
			var query = {'_id': {'$in': listVPid}};
			var queryVP = VisboProject.find(query);
			queryVP.select('_id name');
			queryVP.exec(function (err, listVP) {
				if (err) {
					errorHandler(err, res, 'DB: PUT VPF find', 'Error getting Projects for Portfolio');
					return;
				}
				if (listVP.length != req.body.allItems.length) {
					logger4js.warn('Found only %d of %d VP IDs', listVP.length, req.body.allItems.length);
					return res.status(403).send({
						state: 'failure',
						message: 'Not all Projects exists or User has permission to',
						list: listVP
					});
				}
				// MS TODO Check that the sort lists only contain projects from the arrayList, if not return error

				req.oneVPF.allItems = [];
				// Copy the items to the newPortfolio
				for (var i = 0; i < req.body.allItems.length; i++) {
					// get the item, overwrite Project name with correct name
					req.body.allItems[i].name = listVP.find(findVPList, req.body.allItems[i].vpid).name;
					if (!req.body.allItems[i].variantName) req.body.allItems[i].variantName = '';
					delete req.body.allItems[i]._id;
					req.oneVPF.allItems.push(req.body.allItems[i]);
				}
				logger4js.warn('Replaced in List (%d) correct VP Names %s', req.oneVPF.allItems.length, JSON.stringify(req.oneVPF.allItems));
				if (req.body.sortType) req.oneVPF.sortType = req.body.sortType;
				if (req.body.sortType) req.oneVPF.sortList = req.body.sortList;

				logger4js.debug('PUT VPF: save now %s', req.oneVPF._id);
				req.oneVPF.save(function(err, oneVPF) {
					if (err) {
						errorHandler(err, res, 'DB: PUT VPF Save', 'Error updating Portfolio List ');
						return;
					}
					req.oneVPF = oneVPF;
					updateVPFCount(req.oneVPF.vpid, req.oneVPF.variantName, 1);
					return res.status(200).send({
						state: 'success',
						message: 'Portfolio List updated',
						vpf: [ oneVPF ]
					});
				});
			});
		}
	})

/**
	* @api {delete} /vp/:vpid/portfolio/:vpfid Delete a Portfolio Version
	* @apiVersion 1.0.0
	* @apiGroup VISBO Project Portfolio
	* @apiName DeleteVISBOPortfolio
	* @apiDescription Deletes a specific Portfolio List Version
	* the user needs to have Delete Project Permission to the Project
	* @apiHeader {String} access-key User authentication token.
	*
	* @apiPermission Authenticated and VP.View and VP.Delete Permission for the Portfolio.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View the Project or no Delete Permission to delete the Version
	* @apiError {number} 423 Portfolio locked by another user
	*
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/vp/vp5aada025/portfolio/vpf5aada
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Deleted Portfolio Version',
	*   'vp': [vpList]
	* }
	*/
// Delete Portfolio Version
	.delete(function(req, res) {
		var useremail = req.decoded.email;
		var vpfid = req.params.vpfid;

		req.auditDescription = 'Portfolio List Delete';

		logger4js.debug('DELETE Portfolio in Project %s', req.oneVP.name);
		if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Delete)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete Portfolio List'
			});
		}
		var query = {};
		query._id = vpfid;
		query.vpid = req.oneVP._id;
		query.deletedAt = {$exists: false};
		var queryVPF = VisboPortfolio.findOne(query);
		queryVPF.exec(function (err, oneVPF) {
			if (err) {
				errorHandler(err, res, 'DB: DELETE VPF find', 'Error getting Portfolio');
				return;
			}
			if (!oneVPF) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Portfolio or no Permission'
				});
			}
			var variantIndex;
			var variantName = oneVPF.variantName;
			if (variantName != '') {
				// check that the Variant exists
				variantIndex = req.oneVP.variant.findIndex(variant => variant.variantName == variantName);
				if (variantIndex < 0) {
					logger4js.warn('VP PortfolioList Delete Variant does not exist %s %s', req.params.vpvid, variantName);
					// Allow Deleting of a version where Variant does not exists for Admins
					variantName = '';
				}
			}
			var lockResult = lockVP.lockStatus(req.oneVP, useremail, variantName);
			if (lockResult.locked) {
				return res.status(423).send({
					state: 'failure',
					message: 'Portfolio Project locked',
					vp: [req.oneVP]
				});
			}
			// user needs to have Delete Permission or owns the Variant
			var hasPerm = false;
			if (req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.Delete) {
				hasPerm = true;
			} else if (variantName != '' && req.oneVP.variant[variantIndex].email == useremail) {
				hasPerm = true;
			}
			if (!hasPerm) {
				logger4js.warn('VP Portfolio List Delete no Permission %s %s', req.params.vpid, variantName);
				return res.status(403).send({
					state: 'failure',
					message: 'No permission to delete Portfolio List Version'
				});
			}
			oneVPF.deletedAt = new Date();
			// update the version count of the base version or the variant
			updateVPFCount(req.oneVPF.vpid, req.oneVPF.variantName, -1);
			oneVPF.save(function(err, oneVPF) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VPF', 'Error deleting Portfolio');
					return;
				}
				req.oneVPF = oneVPF;
				return res.status(200).send({
					state: 'success',
					message: 'Deleted Portfolio'
				});
			});
		});
	});

	router.route('/:vpid/portfolio/:vpfid/capacity')

	/**
		* @api {get} /vp/:vpid/portfolio/:vpfid/capacity Get Capacity of VISBO Portfolio
		* @apiVersion 1.0.0
		* @apiGroup VISBO Project Properties
		* @apiName GetVISBOPortfolioCapacity
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets the capacity numbers for the specified VISBO Portfolio Version.
		* With additional query paramteters the list could be configured. Available Parameters are: refDate, startDate & endDate, roleID and hierarchy
		* A roleID must be specified. If hierarchy is true, the capacity for the first level of subroles are delivered in addition to the main role.
		*
		* @apiParam {Date} refDate the latest VPV with a timestamp before the reference date is used for calculation, if ommited the current Date is used.
		* Date Format is in the form: 2018-10-30T10:00:00Z
		* @apiParam {Date} startDate Deliver only capacity values beginning with month of startDate, default is today
		* @apiParam {Date} endDate Deliver only capacity values ending with month of endDate, default is today + 6 months
		* @apiParam {String} roleID Deliver the capacity planning for the specified organisaion, default is complete organisation
		* @apiParam {Boolean} hierarchy Deliver the capacity planning including all dircect childs of roleID
		* @apiParam {Boolean} pfv Deliver the capacity planning compared to PFV instead of total capacity
		*
		* @apiPermission Authenticated and VP.View and either VP.ViewAudit or VP.Modify for the VISBO Portfolio.
		* In addition the Project List is filtered to all the Projects where the user has View Permission. This filtered list is checked to have either VP.ViewAudit or VP.Modify Permission for each project, if not the request fails with permission denied.
		* If the user has VP.ViewAudit Permission for the Portfolio and all Projects with View Permission, he gets in addition to the PD Values also the money values.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to generate Capacity Figures for the VISBO Center
		* @apiError {number} 409 No Organisation configured in the VISBO Center
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vp/:vpid/portfolio/:vpfid/capacity?roleID=1
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Portfolio Capacity',
		*   'vp':[{
		*     '_id':'vp5c754feaa',
		*     'name':'VISBO Portfolio Name',
		*     'capacity': [{
						'month': 2020-05-01T00:00:00.000Z,
						....
					}]
		*   }]
		* }
		*/

	// get VPF Capacity
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var roleID = req.query.roleID;
			var hierarchy = req.query.hierarchy == true;

			req.auditDescription = 'Portfolio Capacity Read';

			if (!(req.listVPPerm.getPerm(req.params.vpid).vp & (constPermVP.Modify + constPermVP.ViewAudit))) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to calculate Portfolio Capacity'
				});
			}

			var onlyPT = false;
			var vpCalc = 0;
			var vpCount = 0;
			if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.ViewAudit)) {
				onlyPT  = true;
			}
			// Validate Permission for all projects to get Capacity at all and to get PD or euro
			if (req.oneVPF && req.oneVPF.allItems) {
				// collect vpids with View Permission that have to be Checked
				vpCount = req.oneVPF.allItems.length;
				var vpList = [];
				req.oneVPF.allItems.forEach(item => {
					var perm = req.listVPPerm.getPerm(item.vpid).vp;
					if (perm & constPermVP.View
					&& (perm & (constPermVP.ViewAudit + constPermVP.Modify)) > 0) {
						vpList.push(item.vpid);
					}
				});
				vpCalc = vpList.length;
				logger4js.debug('VPF  %s, AllItems %d ViewItems %d', req.oneVPF.name, req.oneVPF.allItems.length, vpCalc);

				let canCalcCapacity = true;
				vpList.forEach(item =>
					canCalcCapacity = canCalcCapacity && (req.listVPPerm.getPerm(item).vp & (constPermVP.Modify + constPermVP.ViewAudit)) > 0
				);
				logger4js.debug('VPF  %s, canCalcCapacity %s', req.oneVPF.name, canCalcCapacity);
				if (!canCalcCapacity) {
					return res.status(403).send({
						state: 'failure',
						message: 'No Permission to calculate Portfolio Capacity for all Projects'
					});
				}

				let canSeeCost = true;
				vpList.forEach(item => canSeeCost = canSeeCost && (req.listVPPerm.getPerm(item).vp & constPermVP.ViewAudit) > 0);
				logger4js.debug('VPF  %s, canSeeCost %s', req.oneVPF.name, canSeeCost);
				if (!onlyPT && !canSeeCost) {
					onlyPT = true;
				}
			}

			logger4js.info('Get VISBO Portfolio Capacity for userid %s email %s and vc %s roleID %s Hierarchy %s', userId, useremail, req.params.vcid, roleID, hierarchy);
			var capacity = visboBusiness.calcCapacities(req.listVPV, req.listVPVPFV, roleID, req.visboOrganisations, hierarchy, onlyPT);

			req.auditInfo = '';
			return res.status(200).send({
				state: 'success',
				message: 'Returned VISBO Portfolio Capacity',
				// count: listVCSetting.length,
				vp: [ {
					_id: req.oneVP._id,
					name: req.oneVP.name,
					description: req.oneVP.description,
					roleID: roleID,
					vpAll: vpCount,
					vpCalc: vpCalc,
					createdAt: req.oneVP.createdAt,
					updatedAt: req.oneVP.updatedAt,
					capacity: capacity
				} ]
			});
		});


	router.route('/:vpid/restrict')

	/**
		* @api {post} /vp/:vpid/restrict Create a Restriction
		* @apiVersion 1.0.0
		* @apiGroup VISBO Project Permission
		* @apiName PostVISBOProjectRestrict
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Post creates a new group inside the Project
		*
		* @apiPermission Authenticated and VP.View and VP.ManagePerm Permission for the Project.
		* @apiError {number} 400 missing name or group of Project Restriction during Creation
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a Project Restriction
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vp/:vpid/restrict
		*  {
		*     'name': 'Restriction Name',
		*     'group': 'vpgroup5c754feaa',
		*     'element': 'ElementName'
		*  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned Project Restriction',
		*   'restrict':[{
		*     '_id':'vprestrict5c754feaa',
		*     'name': 'Restriction Name',
		*     'group': 'vpgroup5c754feaa',
		*     'element': 'ElementName'
		*   }]
		* }
		*/

	// Create a Project Restriction
		.post(function(req, res) {
			// User is authenticated already
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			// var isSysAdmin = req.query && req.query.sysadmin ? true : false;

			var restrictName = (req.body.name || '').trim();
			var groupid = req.body.groupid;
			var elementPath = req.body.elementPath;
			var inclChildren = req.body.inclChildren == true;

			req.auditDescription = 'Project Restriction Create';
			req.auditInfo = req.body.name;

			logger4js.info('Post a new Project Restriction with name %s executed by user %s ', restrictName, userId);
			logger4js.debug('Post a new Project Restriction Req Body: %O Perm %O', req.body, req.listVPPerm.getPerm(req.params.vpid));

			if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to change Permission of Project'
				});
			}
			if (!validateName(restrictName, false)
			|| !validate.validateObjectId(groupid, false)
			|| !validate.validatePath(elementPath, false)) {
				logger4js.info('POST Project Restrict bad format %O', req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'No valid Restrict Definition'
				});
			}
			if (req.listVPGroup.findIndex(item => item._id.toString() === groupid.toString() && item.groupType == 'VP') < 0) {
				logger4js.info('POST Project Restrict unknown VP Group ID', groupid);
				return res.status(403).send({
					state: 'failure',
					message: 'No permission for Group'
				});
			}
			// MS TODO: implement validUntil functionality

			var restrictList = req.oneVP.restrict || [];

			logger4js.trace('Restrict %s current list %O', restrictName, restrictList);
			var restrictDuplicate = false;
			restrictDuplicate = restrictList.find(item => item.name == restrictName &&  item.groupid == groupid && item.elementPath.join('/') == elementPath.join('/')) >= 0;
			logger4js.debug('Restrict Duplicate %s Restrict Name %s', restrictDuplicate, restrictName);
			var newRestrict = new Restrict();
			// fill in the required fields
			newRestrict.user.userId = userId;
			newRestrict.user.email = useremail;
			newRestrict.name = restrictName;
			newRestrict.groupid = groupid;
			newRestrict.elementPath = elementPath;
			newRestrict.inclChildren = inclChildren;
			newRestrict.createdAt = new Date();
			logger4js.debug('Post Restrict to VP %s now: %O', req.params.vpid, newRestrict);
			restrictList.push(newRestrict);
			req.oneVP.restrict = restrictList;
			req.oneVP.save(function(err, oneVP) {
				if (err) {
					errorHandler(err, res, 'DB: POST VP Restriction', 'Error creating Project Restriction');
					return;
				}
				newRestrict = oneVP.restrict.filter(restrict => (restrict.name == newRestrict.name && restrict.groupid == newRestrict.groupid && restrict.element == newRestrict.element ))[0];
				return res.status(200).send({
					state: 'success',
					message: 'Created Project Restriction',
					restrict: [newRestrict]
				});
			});

		});

	router.route('/:vpid/restrict/:rid')
	/**
		* @api {delete} /vp/:vpid/restrict/:rid Delete a Restriction
		* @apiVersion 1.0.0
		* @apiGroup VISBO Project Permission
		* @apiName DeleteVISBOProjectRestriction
		* @apiDescription Deletes a specific Restriction for a group
		* the user needs to have read access to the Project and Modify Permission in the Project
		* @apiHeader {String} access-key User authentication token.
		*
		* @apiPermission Authenticated and VP.View and VP.Modfiy Permission for the Project.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to delete Restriction in the Project
		* @apiError {number} 409 Restriction does not exists
		*
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vp/vp5aada025/restrict/restrict5aada
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Deleted Project Restriction',
		* }
		*/
	// Delete Project Restriction
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var restrictId = req.params.rid;

			req.auditDescription = 'Project Restrict Delete';
			req.auditInfo = restrictId;

			logger4js.info('DELETE Project Restriction for userid %s email %s and vp %s restrict :%s:', userId, useremail, req.params.vpid, req.params.rid);

			var restrictIndex = req.oneVP.restrict.findIndex(restrict => restrict._id.toString() === restrictId.toString());
			if (restrictIndex < 0) {
				return res.status(409).send({
					state: 'failure',
					message: 'Restriction does not exists',
					vp: [req.oneVP]
				});
			}
			var restrictName = req.oneVP.restrict[restrictIndex].name;
			req.auditInfo = restrictName;

			if (!(req.listVPPerm.getPerm(req.params.vpid).vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to delete Restriction',
					vp: [req.oneVP]
				});
			}
			req.oneVP.restrict.splice(restrictIndex, 1);

			req.oneVP.save(function(err) {
				if (err) {
					errorHandler(err, res, 'DB: DELETE VP Restriction', 'Error deleting Project Restriction');
					return;
				}
				return res.status(200).send({
					state: 'success',
					message: 'Deleted Project Restriction',
					vp: [req.oneVP]
				});
			});
		});

module.exports = router;
