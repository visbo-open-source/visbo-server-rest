var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');
var crypt = require('./../components/encrypt');

var auth = require('./../components/auth');
var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;
var verifyVc = require('./../components/verifyVc');
var verifyVg = require('./../components/verifyVg');
var verifyVp = require('./../components/verifyVp');
var verifyVpv = require('./../components/verifyVpv');
var visboBusiness = require('./../components/visboBusiness');
var systemVC = require('./../components/systemVC');
var getSystemVC = systemVC.getSystemVC;
var getSystemUrl = systemVC.getSystemUrl;
var reloadSystemSetting = systemVC.reloadSystemSetting;
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboGroup = mongoose.model('VisboGroup');
var VCGroupUser = mongoose.model('VisboGroupUser');
var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var VisboPortfolio = mongoose.model('VisboPortfolio');
var VCSetting = mongoose.model('VCSetting');
var VCCapacity = mongoose.model('VCCapacity');
var PredictKM = mongoose.model('PredictKM');
var VisboAudit = mongoose.model('VisboAudit');

var helperOrga = require('./../components/helperOrga');

var ConstPerm = require('../models/constPerm');
var constPermVC = ConstPerm.constPermVC;
var constPermVP = ConstPerm.constPermVP;
var constPermSystem = ConstPerm.constPermSystem;

var mail = require('../components/mail');
var eMailTemplates = '/../emailTemplates/';
var ejs = require('ejs');
var sanitizeHtml = require('sanitize-html');

var logging = require('../components/logging');
var logModule = 'VC';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var restrictedSettings = ['SysValue', 'SysConfig', 'Task', '_VCConfig'];

// Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// Register the VC middleware to check that the user has access to the VC
router.use('/', verifyVc.getAllGroups);
// Register the VC middleware to check the vcid param
router.param('vcid', verifyVc.getVC);
// Register the Group middleware to check the groupid param
router.param('groupid', verifyVg.getGroupId);
// Register the UserId middleware to check the userid param
router.param('userid', verifyVg.checkUserId);
// Register the settingID middleware to check the settingID param
router.param('settingid', verifyVc.checkSettingId);
// get details for capacity calculation
router.use('/:vcid/capacity', verifyVp.getAllGroups);
router.use('/:vcid/capacity', verifyVc.getVCOrgs);
router.use('/:vcid/capacity', verifyVc.getVCVP);
router.use('/:vcid/capacity', verifyVpv.getVCVPVs);
router.use('/:vcid/organisation', verifyVc.getVCOrgs);
// get details for capa per role
router.use('/:vcid/capa', verifyVc.getVCOrgs);

router.use('/:vcid/setting', verifyVc.checkVCOrgs);

function findUserById(currentUser) {
	// logger4js.info('FIND User by ID %s with %s result %s', this, currentUser.userId, currentUser.userId.toString() == this.toString());
	return currentUser.userId.toString() == this.toString();
}

var privateSettings = ['organisation', 'customroles'];

function squeezeSetting(item, email) {
	if (privateSettings.findIndex(type => type == item.type) >= 0) {
		// private setting
		if (item.type == 'organisation') {
			if (item.value && item.value.allRoles) {
				var allRoles = item.value.allRoles;
				for (var i=0; i<allRoles.length; i++) {
					allRoles[i].tagessatzIntern = undefined;
					allRoles[i].tagessatz = undefined;
				}
			}
		} else if (item.type == 'customroles') {
			item.value.customUserRoles = item.value.customUserRoles.filter(role => role.userName == email);
		}
	}
}

// Generates hash using bCrypt
var createHash = function(secret){
	return bCrypt.hashSync(secret, bCrypt.genSaltSync(10), null);
};

// updates the VC Name in the VP after rename VC
var updateVCName = function(vcid, name){
	var updateQuery = {vcid: vcid, $or: [{deletedAt: {$exists: false}},{'vc.deletedAt': {$exists: false}}]} ;
	var updateOption = {upsert: false};
	var updateUpdate = {$set: {'vc.name': name}};

	logger4js.debug('Update VPs for VC %s with new Name %s', vcid, name);
	VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating VPs for VC ${vcid}`, undefined);
		}
		logger4js.trace('Updated VP for VC %s Populate Name changed %d %d', vcid, result.n, result.nModified);
	});
};

// undelete the VPs after undelete VC and set the actual VC Name
var unDeleteVP = function(vcid, name){

	var updateQuery = {vcid: vcid, 'vc.deletedAt': {$exists: true}};
	var updateOption = {upsert: false};
	var updateUpdate = {$unset: {'vc.deletedAt': new Date()}, $set: {'vc.name': name}};

	logger4js.debug('Update VPs for VC %s with new Name %s', vcid, name);
	VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating VPs for VC ${vcid} set undelete`, undefined);
		}
		logger4js.trace('Updated VP for VC %s set undelete changed %d %d', vcid, result.n, result.nModified);
	});
};

// undelete the Groups after undelete VC
var unDeleteGroup = function(vcid){
	var updateQuery = {vcid: vcid, 'deletedByParent': 'VC'};
	var updateOption = {upsert: false};
	var updateUpdate = {$unset: {'deletedByParent': ''}};

	logger4js.debug('Update Groups for VC %s', vcid);
	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating Groups for VC ${vcid} set undelete`, undefined);
		}
		logger4js.trace('Updated Groups for VC %s set undelete changed %d %d', vcid, result.n, result.nModified);
	});
};

// populate _VCConfig Setting from System to all VCs
var populateVCConfig = function(vcSetting, type) {
	var updateQuery, updateOption, updateUpdate;
	if (!vcSetting || vcSetting.type != '_VCConfig' || !vcSetting.value || vcSetting.value.systemLimit == undefined) return;

	if (type == 'System') {
		// update systemLimit & systemEnabled to all VCs
		updateQuery = {_id: {$ne: vcSetting._id}, type: vcSetting.type, 'name': vcSetting.name};
		updateOption = {upsert: false};

		if (vcSetting.value.systemLimit == true) {
			// set Limit ON populate the sysVCEnabled Value also
			updateUpdate = {$set: {'value.systemLimit': vcSetting.value.systemLimit, 'value.systemEnabled': vcSetting.value.systemEnabled}};
		} else {
			// set Limit OFF don't populate the systemEnabled Value
			updateUpdate = {$set: {'value.systemLimit': vcSetting.value.systemLimit}};
		}

		logger4js.debug('Populate Setting %s new Limit %s', vcSetting.name, vcSetting.value.systemLimit);
		VCSetting.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
			if (err){
				logger4js.warn('DB: Problem populating VC setting System', err);
			} else {
				logger4js.debug('Populate VC Setting %s changed %d %d', vcSetting.name, result.n, result.nModified);
			}
		});
	} else if (type == 'sysVC') {
		// update systemLimit & systemEnabled to all VCs
		updateQuery = {_id: {$ne: vcSetting._id}, type: vcSetting.type, 'name': vcSetting.name};
		updateOption = {upsert: false};

		if (vcSetting.value.sysVCLimit == true) {
			// set Limit ON populate the sysVCEnabled Value also
			updateUpdate = {$set: {'value.sysVCLimit': vcSetting.value.sysVCLimit, 'value.sysVCEnabled': vcSetting.value.sysVCEnabled}};
		} else {
			// set Limit OFF don't populate the sysVCEnabled Value
			updateUpdate = {$set: {'value.sysVCLimit': vcSetting.value.sysVCLimit}};
		}

		logger4js.warn('Populate Setting %s sysVC new Limit %s', vcSetting.name, vcSetting.value.sysVCLimit);
		VCSetting.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
			if (err){
				logger4js.warn('DB: Problem populating VC setting SysVC', err);
			} else {
				logger4js.warn('Populate VC Setting %s SysVC changed %d %d', vcSetting.name, result.n, result.nModified);
			}
		});
	}
};

/////////////////
// VISBO Center API
// /vc
/////////////////

router.route('/')
	/**
	* @api {get} /vc Get VISBO Centers
	* @apiVersion 1.0.0
	* @apiGroup VISBO Center
	* @apiName GetVISBOCenters
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get retruns all VC where the user has access permission to
	* In case of success it delivers an array of VCs, the array contains in each element a VC
	* if systemvc is specified only the systemvc is retrieved if the user has permission to see it
	* @apiPermission Authenticated.
	* In case of AppAdmin Parameters the User needs to have View VISBO Center Permission on System Level.
	* @apiParam (Parameter AppAdmin) {Boolean} [deleted=false]  Request Deleted VCs
	* @apiParam (Parameter AppAdmin) {Boolean} [systemvc=false]  Optional Request System VC
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false]  Optional Request VCs for Appl. Admin User
	* @apiError {number} 401 user not authenticated, the <code>token</code> is no longer valid
	* @apiExample Example usage:
	* url: https://my.visbo.net/api/vc
	* url: https://my.visbo.net/api/vc?systemvc=true&deleted=true
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state': 'success',
	*   'message': 'Returned VISBO Centers',
	*   'vc':[{
	*      '_id': 'vc541c754feaa',
	*      'updatedAt': '2018-03-16T12:39:54.042Z',
	*      'createdAt': '2018-03-12T09:54:56.411Z',
	*      'name': 'My new VisobCenter',
	*      'vpCount': '0'
	*   }]
	* }
	*/
	// Get VISBO Centers
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		var userId = req.decoded._id;
		var isSysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'VISBO Center Read';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		logger4js.info('Get VISBO Center for User %s SysAdmin %s', userId, req.query.sysadmin);

		var query = {};
		// Get all VCs where the user Group is assigned to
		if (!isSysAdmin && !req.query.systemvc) {
			query._id = {$in: req.listVCPerm.getVCIDs(constPermVC.View)};
		}

		// check for deleted only for sysAdmins
		if (isSysAdmin && req.query.deleted) {
			query.deletedAt = {$exists: true};				//  deleted
		} else {
			query.deletedAt = {$exists: false};				// Not deleted
		}
		query.system = req.query.systemvc ? {$eq: true} : {$ne: true};						// do not show System VC
		logger4js.trace('Check for VC query %O', query);

		var queryVC = VisboCenter.find(query);
		queryVC.select('-users');
		queryVC.exec(function (err, listVC) {
			if (err) {
				errorHandler(err, res, 'DB: GET VCs', 'Error getting VISBO Centers');
				return;
			}
			logger4js.debug('Found VCs %d', listVC.length);
			req.auditInfo = listVC.length;

			if (isSysAdmin) {
				return res.status(200).send({
					state: 'success',
					message: 'Returned VISBO Centers',
					count: listVC.length,
					vc: listVC,
					perm: req.listVCPerm.getPerm(0)
				});
			} else {
				return res.status(200).send({
					state: 'success',
					message: 'Returned VISBO Centers',
					count: listVC.length,
					vc: listVC
				});
			}
		});
	})

	/**
	 * @api {post} /vc Create a VISBO Center
	 * @apiVersion 1.0.0
	 * @apiGroup VISBO Center
	 * @apiName CreateVISBOCenters
	 * @apiDescription Post creates a new VC with a unique name and  a description.
	 * Optinal initial admin can be defined who will get VISBO Center Administrator, if none is specified, the current user is added.
	 * In case of success it delivers an array of VCs. The array contains one element for the created VC.
	 * @apiHeader {String} access-key User authentication token.
	 * @apiPermission Authenticated and System.ViewVC and System.CreateVC Permission for the VISBO System.
	 * @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	 * @apiError {number} 400 missing name of VISBO Center during Creation
	 * @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	 * @apiError {number} 403 No Permission to Create VISBO Center
	 * @apiError {number} 409 VISBO Center with same name exists already
	 * @apiExample Example usage:
	 * url: https://my.visbo.net/api/vc
	 * {
	 *  'name':'My first VISBO Center',
	 *  'description': 'VISBO Center Description'
	 * }
	 * @apiSuccessExample {json} Success-Response:
	 * HTTP/1.1 200 OK
	 * {
	 *  'state':'success',
	 *  'message':'Successfully created new VISBO Center',
	 *  'vc': [{
	 *    '__v':0,
	 *    'updatedAt':'2018-03-19T11:04:12.094Z',
	 *    'createdAt':'2018-03-19T11:04:12.094Z',
	 *    'name':'My first VISBO Center',
	 *    '_id':'vc541c754feaa',
	 *    'vpCount': 0
	 * }
	 */

	// Create a VISBO Center
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'VISBO Center Create';

		if (req.body.name) req.body.name = (req.body.name || '').trim();
		if (req.body.description) req.body.description = (req.body.description || '').trim();

		logger4js.trace('Post a new VISBO Center Req Body: %O Name %s', req.body, req.body.name);
		logger4js.info('Post a new VISBO Center with name %s executed by user %s Perm %O ', req.body.name, useremail, req.listVCPerm.getPerm(0));

		if (!validate.validateName(req.body.name, false) || !validate.validateName(req.body.description, true)) {
			return res.status(400).send({
				state: 'failure',
				message: 'VISBO Center: Body contains illegal characters'
			});
		}
		if ((req.listVCPerm.getPerm(0).system & constPermSystem.CreateVC) == 0) {
			return res.status(403).send({
				state: 'failure',
				message: 'No permission to create VISBO Center'
			});
		}
		// check that VC Name is unique
		var query = {};
		query.name = req.body.name;								// Name Duplicate check
		query.deletedAt = {$exists: false};
		VisboCenter.findOne(query, function(err, vc) {
			if (err) {
				errorHandler(err, res, `DB: POST VC ${req.body.name} Find`, `Create VISBO Center ${req.body.name} failed`);
				return;
			}
			if (vc) {
				return res.status(409).send({
					state: 'failure',
					message: 'VISBO Center already exists'
				});
			}
			logger4js.debug('Create VISBO Center (Name is already unique) check users');
			var newVC = new VisboCenter();
			newVC.name = req.body.name;
			newVC.description = req.body.description;
			newVC.vpCount = 0;

			logger4js.debug('Save VISBO Center %s %s', newVC.name, newVC._id);
			newVC.save(function(err, vc) {
				if (err) {
					errorHandler(err, res, `DB: POST VC ${req.body.name} Save`, `Failed to create VISBO Center ${req.body.name}`);
					return;
				}
				req.oneVC = vc;
				// Create new VC Group and add current user to the new Group
				var newVG = new VisboGroup();
				newVG.name = 'VISBO Center Admin';
				newVG.groupType = 'VC';
				newVG.internal = true;
				newVG.global = true;
				newVG.permission = {vc: ConstPerm.constPermVCAll };
				newVG.vcid = newVC._id;
				newVG.users = [];
				newVG.users.push({email: useremail, userId: userId});

				logger4js.trace('VC Post Create Admin Group (async) for vc %s group %O ', newVC._id, newVG);
				newVG.save(function(err) {
					if (err) {
						errorHandler(err, undefined, `DB: POST VC  ${req.body.name} Create Admin Group`, undefined);
					}
					var settingList = systemVC.getSystemSettingList(undefined, '_VCConfig');
					if (settingList.length > 0) {
						logger4js.warn('VC Post Setting %d ', settingList.length);
						settingList.forEach(item => item.vcid = req.oneVC._id);
						VCSetting.insertMany(settingList, function (err) {
							if (err){
								errorHandler(err, undefined, `DB: POST VC Create Setting ${req.body.name}`, undefined);
							}
						});
					}

					return res.status(200).send({
						state: 'success',
						message: 'Successfully created new VISBO Center',
						vc: [ vc ]
					});
				});
			});
		});
	});

router.route('/:vcid')
	 /**
	 	* @api {get} /vc/:vcid Get a VISBO Center
	 	* @apiVersion 1.0.0
	 	* @apiGroup VISBO Center
	 	* @apiName GetVISBOCenter
		* @apiDescription Gets a specific VISBO Center including the permission to the VC as User
		* the system checks if the user has access permission to it.
		* In case of success, the system delivers an array of VCs, with one element in the array that is the info about the VC
	 	* @apiHeader {String} access-key User authentication token.
		* @apiPermission Authenticated and VC.View for the VISBO Center.
	 	* @apiError NotAuthenticated no valid token HTTP 401
		* In case of AppAdmin Parameters the User needs to have View VISBO Center Permission on System Level.
		* @apiParam (Parameter AppAdmin) {Boolean} [deleted=false]  Request Deleted VCs
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false]  Optional Request VCs for Appl. Admin User
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View VISBO Center
	 	* @apiExample Example usage:
	 	* url: https://my.visbo.net/api/vc/vc5aada025
	 	* @apiSuccessExample {json} Success-Response:
	 	* HTTP/1.1 200 OK
	 	* {
	 	*   'state':'success',
	 	*   'message':'Returned VISBO Centers',
	 	*   'vc': [{
	 	*     '_id':'vc541c754feaa',
	 	*     'updatedAt':'2018-03-16T12:39:54.042Z',
	 	*     'createdAt':'2018-03-12T09:54:56.411Z',
	 	*     'name':'My new VisobCenter',
		*     'vpCount': '0'
	 	*   }],
		*   'perm': {'vc': 307}
	 	* }
		*/
	// Get a specific VC
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'VISBO Center Read';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		// check for deleted only for sysAdmins
		var found = false;
		if (isSysAdmin && req.query.deleted && req.oneVC.deletedAt) {
			found = true;
		} else if (!req.oneVC.deletedAt) {
			logger4js.debug('VC not Deleted: DeletedAt %s', req.oneVC.deletedAt);
			found= true;
		}

		logger4js.info('Get VISBO Center for userid %s email %s and vc %s oneVC %s Perm %O found %s', userId, useremail, req.params.vcid, req.oneVC.name, req.listVCPerm.getPerm(isSysAdmin ? 0 : req.params.vcid), found);
		if (found) {
			return res.status(200).send({
				state: 'success',
				message: 'Returned VISBO Centers',
				vc: [req.oneVC],
				perm: req.listVCPerm.getPerm(isSysAdmin ? 0: req.params.vcid)
			});
		} else {
			return res.status(403).send({
				state: 'failure',
				message: 'VISBO Center not found',
				perm: req.listVCPerm.getPerm(isSysAdmin ? 0: req.params.vcid)
			});
		}
	})

	/**
		* @api {put} /vc/:vcid Update VISBO Center
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center
		* @apiName UpdateVISBOCenters
		* @apiDescription Put updates a specific VISBO Center.
		* the system checks if the user has access permission to it.
		* Only basic properties of the VISBO Centers can be changed. The modification of users is done with special calls to add/delete users to groups
		* In case of success, the system delivers an array of VCs, with one element in the array that is the info about the VC
		*
		* If the VC Name is changed, the VC Name is populated to the VISBO Center Projects.
		* @apiHeader {String} access-key User authentication token.
		* @apiPermission Authenticated and VC.View and VC.Modify Permissionfor the VISBO Center.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 no Data provided in Body for updating the VISBO Center
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Modify VISBO Center
		* @apiError {number} 409 VISBO Center with same name exists already or VISBO Center was updatd in between
		* @apiHeader {String} access-key User authentication token.
		* @apiExample Example usage:
		* url: https://my.visbo.net/api/vc/vc5aada025
		* {
		*  'name':'My first VISBO Center Renamed',
		*  'description': 'Changed Description'
		* }
		* @apiSuccessExample {json} Success-Response:
		*     HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'Successfully updated VISBO Center Renamed',
		*  'vc':[{
		*    '__v':0,
		*    'updatedAt':'2018-03-19T11:04:12.094Z',
		*    'createdAt':'2018-03-19T11:04:12.094Z',
		*    'name':'My first VISBO Center',
		*    '_id':'vc541c754feaa',
		*    'vpCount': '0'
		*  }]
		* }
		*/

	// Change VISBO Center
	.put(function(req, res) {
		var userId = req.decoded._id;

		req.auditDescription = 'VISBO Center Update';
		var isSysAdmin = req.query.sysadmin ? true : false;
		var checkSystemPerm = false;

		logger4js.info('PUT/Save VISBO Center for userid %s vc %s oneVC %s Perm %O ', userId, req.params.vcid, req.oneVC.name, req.listVCPerm.getPerm(req.params.vcid));

		if (req.body.name) req.body.name = (req.body.name || '').trim();
		if (req.body.description) req.body.description = req.body.description != undefined ? (req.body.description || '').trim() : undefined;
		if (!validate.validateName(req.body.name, true) || !validate.validateName(req.body.description, true)) {
			logger4js.info('PUT/Save VISBO Center name :%s: %s description :%s: %s contains illegal characters', req.body.name, validate.validateName(req.body.name, true), req.body.description, validate.validateName(req.body.description, true));
			return res.status(400).send({
				state: 'failure',
				message: 'VISBO Center Body contains illegal characters'
			});
		}
		var vcUndelete = false;
		// undelete the VC in case of change
		if (req.oneVC.deletedAt) {
			req.auditDescription = 'VISBO Center Undelete';
			req.oneVC.deletedAt = undefined;
			vcUndelete = true;
			logger4js.debug('Undelete VC %s flag %s', req.oneVC._id, req.oneVC.deletedAt);
		}
		if (isSysAdmin) checkSystemPerm = true;
		if (vcUndelete) checkSystemPerm = true;
		if ((!checkSystemPerm && !(req.listVCPerm.getPerm(req.params.vcid).vc & constPermVC.Modify))
		|| (checkSystemPerm && !(req.listVCPerm.getPerm(0).system & constPermSystem.DeleteVC))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to change VISBO Center',
				perm: req.listVCPerm.getPerm(isSysAdmin ? 0 : req.params.vcid)
			});
		}
		if (!req.body.name) req.body.name = req.oneVC.name;
		var vpPopulate = req.oneVC.name != req.body.name ? true : false;

		if (vpPopulate) {
			req.auditInfo = req.oneVC.name.concat(' / ', req.body.name);
		}
		logger4js.debug('PUT/Save VISBO Center %s Name :%s: Desc :%s: Namechange: %s', req.oneVC._id, req.body.name, req.body.description, vpPopulate);
		req.oneVC.name = req.body.name;
		if (req.body.description != undefined) {
			req.oneVC.description = req.body.description;
		}
		// check that VC Name is unique
		var query = {};
		query._id = {$ne: req.oneVC._id};
		query.name = req.body.name;								// Name Duplicate check
		query.deletedAt = {$exists: false};

		VisboCenter.findOne(query, function(err, vc) {
			if (err) {
				errorHandler(err, res, `DB: PUT VC ${req.oneVC._id} Unique Name Check`, `Error updating VISBO Center ${req.oneVC.name}`);
				return;
			}
			if (vc) {
				logger4js.trace('PUT VC: duplicate name check found vc %s %s compare with %s %s', vc._id, vc.name, req.oneVC._id, req.oneVC.name);
				return res.status(409).send({
					state: 'failure',
					message: 'VISBO Center with same name already exists'
				});
			}
			logger4js.debug('PUT VC: save now');
			req.oneVC.save(function(err, oneVC) {
				if (err) {
					errorHandler(err, res, `DB: PUT VC ${req.oneVC._id} Save`, `Error updating VISBO Center ${req.oneVC.name}`);
					return;
				}
				// Update underlying projects if name has changed
				if (vpPopulate){
					logger4js.debug('VC PUT %s: Update SubProjects to %s', oneVC._id, oneVC.name);
					updateVCName(oneVC._id, oneVC.name);
				}
				if (vcUndelete){
					logger4js.debug('VC PUT %s: Undelete VC and VPs', oneVC._id);
					unDeleteVP(oneVC._id, oneVC.name);
					unDeleteGroup(oneVC._id);
				}
				return res.status(200).send({
					state: 'success',
					message: 'Updated VISBO Center',
					vc: [ oneVC ],
					perm: req.listVCPerm.getPerm(isSysAdmin ? 0: req.params.vcid)
				});
			});
		});
	})

	/**
		* @api {delete} /vc/:vcid Delete a VISBO Centers
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center
		* @apiName DeleteVISBOCenter
		* @apiDescription Deletes a specific VISBO Center.
		* the system checks if the user has Delete VISBO Center permission to it.
		* @apiHeader {String} access-key User authentication token.
		* @apiPermission Authenticated and System.ViewVC and System.Delete Permission for the VISBO System.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Modify VISBO Center or VISBO Center does not exists
		* @apiExample Example usage:
		* url: https://my.visbo.net/api/vc/vc5aada025
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Deleted VISBO Centers'
		* }
		*/

	// Delete VISBO Center
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'VISBO Center Delete';

		logger4js.info('DELETE VISBO Center for userid %s email %s and vc %s oneVC %s is SysAdminPerm %O', userId, useremail, req.params.vcid, req.oneVC.name, req.listVCPerm.getPerm(0));
		// user is sysadmin
		if (!(req.listVCPerm.getPerm(0).system & constPermSystem.DeleteVC) || req.oneVC.system) {
			return res.status(403).send({
				state: 'failure',
				message: 'No permission to delete VISBO Center',
				perm: req.listVCPerm.getPerm(0)
			});
		}
		// if the VC is not deleted up to now, mark it as deleted only
		logger4js.trace('Delete VISBO Center %s Status %s %O', req.params.vcid, req.oneVC.deletedAt, req.oneVC);
		if (!req.oneVC.deletedAt) {
			req.oneVC.deletedAt = new Date();
			logger4js.trace('Delete VISBO Center after permission check %s %O', req.params.vcid, req.oneVC);
			req.oneVC.save(function(err, oneVC) {
				if (err) {
					errorHandler(err, res, `DB: DELETE VC ${req.oneVC._id}`, `Error deleting VISBO Center ${req.oneVC.name}`);
					return;
				}
				req.oneVC = oneVC;
				logger4js.debug('VC Delete %s: Update SubProjects to %s', req.oneVC._id, req.oneVC.name);
				var updateQuery = {};
				var deleteDate = new Date();
				updateQuery.vcid = req.oneVC._id;
				var updateUpdate = {$set: {'vc.deletedAt': deleteDate}};
				var updateOption = {upsert: false, multi: 'true'};
				VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
					if (err){
						errorHandler(err, res, `DB: DELETE VC ${req.oneVC._id} update Projects`, `Error deleting VISBO Center ${req.oneVC.name}`);
						return;
					}
					logger4js.debug('VC Delete found %d VPs and updated %d VPs', result.n, result.nModified);
					updateQuery = {vcid: req.oneVC._id, deletedByParent: {$exists: false}};
					updateUpdate = {$set: {'deletedByParent': 'VC'}};
					var updateOption = {upsert: false, multi: 'true'};
					VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
						if (err){
							errorHandler(err, res, `DB: DELETE VC ${req.oneVC._id} update Groups`, `Error deleting VISBO Center ${req.oneVC.name}`);
							return;
						}
						logger4js.debug('VC Delete found %d Groups and updated %d Groups', result.n, result.nModified);
						return res.status(200).send({
							state: 'success',
							message: 'Deleted VISBO Center'
						});
					});
				});
			});
		} else {
			// VC is already marked as deleted, now destory it including VP and VPV
			// Collect all ProjectIDs of this VC
			req.auditDescription = 'VISBO Center Destroy';
			var query = {};
			query.vcid = req.oneVC._id;
			var queryVP = VisboProject.find(query);
			queryVP.select = '_id';
			queryVP.lean();
			queryVP.exec(function (err, listVP) {
				if (err) {
					errorHandler(err, res, `DB: DELETE VC ${req.oneVC._id} Destroy Find`, `Error deleting VISBO Center ${req.oneVC.name}`);
					return;
				}
				logger4js.debug('VC Destroy: Found %d Projects', listVP.length);
				var vpidList = [];
				listVP.forEach(function(item) { vpidList.push(item._id); });
				logger4js.trace('VC Destroy: ProjectIDs %O', vpidList);
				// Delete all VPVs relating to these ProjectIDs
				var queryvpv = {vpid: {$in: vpidList}};
				VisboProjectVersion.deleteMany(queryvpv, function (err) {
					if (err){
						logger4js.error('DB: Destroy VC %s, Problem deleting VPVs %s', req.oneVC._id, err.message);
					}
					logger4js.trace('VC Destroy: %s VPVs Deleted', req.oneVC._id);
				});
				// Delete all VP Portfolios relating to these ProjectIDs
				var queryvpf = {vpid: {$in: vpidList}};
				VisboPortfolio.deleteMany(queryvpf, function (err) {
					if (err){
						logger4js.error('DB: Destroy VC %s, Problem deleting VP Portfolios %s', req.oneVC._id, err.message);
					}
					logger4js.trace('VC Destroy: %s VP Portfolios Deleted', req.oneVC._id);
				});
				// Delete Audit Trail of VPs & VPVs
				var queryaudit = {'vp.vpid': {$in: vpidList}};
				VisboAudit.deleteMany(queryaudit, function (err) {
					if (err){
						logger4js.error('DB: Destroy VC %s, Problem deleting Audit %s', req.oneVC._id, err.message);
					}
					logger4js.trace('VC Destroy: %s VP Audit Deleted', req.oneVC._id);
				});
				// Delete all VPs regarding these ProjectIDs
				var queryvp = {_id: {$in: vpidList}};
				VisboProject.deleteMany(queryvp, function (err) {
					if (err){
						logger4js.error('DB: Destroy VC %s, Problem deleting VPs %s', req.oneVC._id, err.message);
					}
					logger4js.trace('VC Destroy: %s VPs Deleted', req.oneVC._id);
				});
				var queryvcid = {vcid: req.oneVC._id};
				// Delete all VCSettings
				VCSetting.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error('DB: Destroy VC %s, Problem deleting VC Role %s', req.oneVC._id, err.message);
					}
					logger4js.trace('VC Destroy: %s VC Roles Deleted', req.oneVC._id);
				});

				// Delete all Groups
				VisboGroup.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error('DB: Destroy VC %s, Problem deleting VC Groups %s', req.oneVC._id, err.message);
					}
					logger4js.trace('VC Destroy: %s VC Groups Deleted', req.oneVC._id);
				});

				// Delete Audit Trail of VC
				queryaudit = {'vc.vcid': req.oneVC._id};
				queryaudit.action = {$ne: 'DELETE'};
				VisboAudit.deleteMany(queryaudit, function (err) {
					if (err){
						logger4js.error('DB: Destroy VC %s, Problem deleting VC Audit %s', req.oneVC._id, err.message);
					}
					logger4js.trace('VC Destroy: %s VC Audit Deleted', req.oneVC._id);
				});
				// Delete the VC  itself
				var queryvc = {_id: req.oneVC._id};
				VisboCenter.deleteOne(queryvc, function (err) {
					if (err){
						logger4js.error('DB: Destroy VC %s, Problem deleting VC %s', req.oneVC._id, err.message);
					}
					logger4js.trace('VC Destroy: %s VC Deleted', req.oneVC._id);
				});
				return res.status(200).send({
					state: 'success',
					message: 'VISBO Center Destroyed'
				});
			});
		}
	});

router.route('/:vcid/audit')
	/**
	 	* @api {get} /vc/:vcid/audit Get VISBO Center Audit Trail
	 	* @apiVersion 1.0.0
	 	* @apiGroup VISBO Center
	 	* @apiName GetVISBOCenterAudit
		* @apiDescription Get Audit Trail for a specific VISBO Center
		* the system checks if the user has access permission to it.
		* In case of success, the system delivers an array of Audit Trail Activities
	 	* @apiHeader {String} access-key User authentication token.
		* @apiPermission Authenticated and VC.View and VC.ViewAudit Permission for the VISBO Center.
		* @apiParam (Parameter) {Date} [from] Request Audit Trail starting with from date. Default 01.01.1970.
		* @apiParam (Parameter) {Date} [to] Request Audit Trail ending with to date. Default Today.
		* @apiParam (Parameter) {text} [text] Request Audit Trail containing text in Detail.
		* @apiParam (Parameter) {text} [action] Request Audit Trail only for specific ReST Command (GET, POST, PUT DELETE).
		* @apiParam (Parameter) {text} [area] Request Audit Trail only for specific Area (vc, vp).
		* @apiParam (Parameter) {number} [maxcount] Request Audit Trail maximum entries.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View VISBO Center Audit or VISBO Center does not exists
	 	* @apiExample Example usage:
	 	* url: https://my.visbo.net/api/vc/vc5aada025/audit
	 	* @apiSuccessExample {json} Success-Response:
	 	* HTTP/1.1 200 OK
	 	* {
	 	*   'state':'success',
	 	*   'message':'Audit Trail delivered',
	 	*   'audit': [{
	 	*     '_id':'vc541c754feaa',
	 	*     'updatedAt':'2018-03-16T12:39:54.042Z',
	 	*     'createdAt':'2018-03-12T09:54:56.411Z',
		*			'XXXXXXXX': 'XXXXXXXX'
	 	*   }]
	 	* }
		*/
	// Get audit trail for a specific VC
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;
		var checkSystemPerm = false;

		req.auditDescription = 'VISBO Center Audit Read';
		req.auditSysAdmin = isSysAdmin;

		if (req.oneVC.system || req.query.sysadmin) checkSystemPerm = true;

		logger4js.info('Get VISBO Center Audit Trail for userid %s email %s and vc %s oneVC %s Perm %O', userId, useremail, req.params.vcid, req.oneVC.name, req.listVCPerm.getPerm(isSysAdmin ? 0 : req.params.vcid));
		if ((!checkSystemPerm && !(req.listVCPerm.getPerm(req.params.vcid).vc & constPermVC.ViewAudit))
		|| (checkSystemPerm && !(req.listVCPerm.getPerm(0).system & constPermSystem.ViewAudit))) {
			return res.status(403).send({
					state: 'failure',
					message: 'No View Audit permission to get audit trail',
					perm: req.listVCPerm.getPerm(isSysAdmin ? 0 : req.params.vcid)
			});
		}

		var from, to, maxcount = 1000, action, area;
		logger4js.debug('Get Audit Trail DateFilter from %s to %s', req.query.from, req.query.to);
		if (req.query.from && Date.parse(req.query.from)) from = new Date(req.query.from);
		if (req.query.to && Date.parse(req.query.to)) to = new Date(req.query.to);
		if (req.query.maxcount) maxcount = Number(req.query.maxcount) || 10;
		if (req.query.action) action = req.query.action.trim();
		if (req.query.area) area = req.query.area.trim();
		// no date is set to set to to current Date and recalculate from afterwards
		if (!to) to = new Date();
		logger4js.trace('Get Audit Trail at least one value is set %s %s', from, to);
		if (!from) {
			from = new Date(to);
			from.setTime(0);
		}
		logger4js.trace('Get Audit Trail DateFilter after recalc from %s to %s', from, to);

		var query = {'vc.vcid': req.oneVC._id, 'createdAt': {'$gte': from, '$lt': to}};
		if (action) {
			query.action = action;
		}
		if (!isSysAdmin) {
			query.sysAdmin = {$exists: false};
		}
		var queryListCondition = [];
		logger4js.info('Get Audit Trail for vc %O ', req.params.vcid);
		var areaCondition = [];
		switch(area) {
			case 'vc':
				areaCondition.push({'vp': {$exists: false}});
				break;
			case 'vp':
				areaCondition.push({'vp': {$exists: true}});
				// areaCondition.push({'$or': [{'vp': {$exists: true}}, {'url': /^.vp/}]});
				break;
		}
		if (areaCondition.length > 0) queryListCondition.push({'$and': areaCondition});
		if (req.query.text) {
			var textCondition = [];
			var text = req.query.text;
			var expr;
			try {
				expr = new RegExp(text, 'i');
			} catch(e) {
				logger4js.info('Audit RegEx corrupt: %s ', text);
				return res.status(400).send({
					state: 'failure',
					message: 'No Valid Regular Expression'
				});
			}
			if (mongoose.Types.ObjectId.isValid(req.query.text)) {
				logger4js.debug('Get Audit Search for ObjectID %s', text);
				textCondition.push({'vp.vpid': text});
				textCondition.push({'vpv.vpvid': text});
				textCondition.push({'user.userId': text});
			}
			// if it is recognised as ObjectID it could still be a normal text search pattern
			textCondition.push({'user.email': expr});
			textCondition.push({'vc.name': expr});
			textCondition.push({'vp.name': expr});
			textCondition.push({'vpv.name': expr});
			textCondition.push({'action': expr});
			textCondition.push({'actionDescription': expr});
			textCondition.push({'actionInfo': expr});
			textCondition.push({'result.statusText': expr});
			textCondition.push({'userAgent': expr});
			// textCondition.push({'vc.vcjson': expr});
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
		.exec(function (err, listVCAudit) {
			if (err) {
				errorHandler(err, res, `DB: GET VC Audit ${req.oneVC._id} `, `Error getting Audit for VISBO Center ${req.oneVC.name}`);
				return;
			}
			logger4js.debug('Found VC Audit Logs %d', listVCAudit.length);
			return res.status(200).send({
				state: 'success',
				message: 'Returned VISBO Center Audit',
				count: listVCAudit.length,
				audit: listVCAudit
			});
		});
	});

router.route('/:vcid/group')

	/**
		* @api {get} /vc/:vcid/group Get Groups
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Permission
		* @apiName GetVISBOCenterGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets all groups of the specified VISBO Center
		*
		* @apiPermission Authenticated and VC.View Permission for the VISBO Center.
		* @apiParam (Parameter) {Boolean} [userlist=false]  Request User List with Group IDs in addition to the group list.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View VISBO Center, or VISBO Center does not exists
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/group
		*   url: https://my.visbo.net/api/vc/:vcid/group?userlist=true
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Groups',
		*   'count': 1,
		*   'groups':[{
		*     '_id':'vcgroup5c754feaa',
		*     'name':'Group Name',
		*     'vcid': 'vc5c754feaa',
		*     'global': true,
		*     'permission': {vc: 307 },
		*    'users':[
		*     {'userId':'us5aaf992', 'email':'example@visbo.de'},
		*     {'userId':'us5aaf993', 'email':'example2@visbo.de'}
		*    ]
		*   }]
		* }
		*/

	// Get VC Groups
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'VISBO Center Group Read';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		logger4js.info('Get VISBO Center Group for userid %s email %s and vc %s oneVC %s Perm %O', userId, useremail, req.params.vcid, req.oneVC.name, req.listVCPerm.getPerm(isSysAdmin ? 0 : req.params.vcid));

		var query = {};
		query.vcid = req.oneVC._id;
		query.groupType = req.oneVC.system ? 'System' : 'VC';

		var queryVCGroup = VisboGroup.find(query);
		queryVCGroup.select('-vpids');
		queryVCGroup.lean();
		queryVCGroup.exec(function (err, listVCGroup) {
			if (err) {
				errorHandler(err, res, `DB: GET VC Groups ${req.oneVC._id} `, `Error getting Groups for VISBO Center ${req.oneVC.name}`);
				return;
			}
			logger4js.info('Found %d Groups for VC', listVCGroup.length);
			if (req.query.userlist) {
				var listVCUsers = [];
				for (var i = 0; i < listVCGroup.length; i++) {
					for (var j = 0; j < listVCGroup[i].users.length; j++) {
						listVCUsers.push({
							userId: listVCGroup[i].users[j].userId,
							email: listVCGroup[i].users[j].email,
							groupId: listVCGroup[i]._id,
							groupName: listVCGroup[i].name,
							groupType: listVCGroup[i].groupType,
							internal: listVCGroup[i].internal
						});
					}
				}
				var aggregateQuery = [
					{$match: {vcid: req.oneVC._id, deletedByParent:{$exists:false}}},
					{$project: {_id: 1, groupType:1, name:1, vpids:1, users:1}},
					{$unwind: '$vpids'},
					{$unwind: '$users'},
					{$project: {_id: 1, groupType:1, name:1, vpids:1, 'users.userId':1, 'users.email':1}},
					{
						$lookup: {
							from: 'visboprojects',
							localField: 'vpids',    // field in the orders collection
							foreignField: '_id',  // field in the items collection
							as: 'vp'
						}
					},
					{$unwind: '$vp'},
					{$match: {groupType: 'VP'}},
					{$addFields: {vpid: '$vpids'}},
					{$addFields: {groupName: '$name'}},
					{$project: {_id: 1, groupType:1, groupName:1, vpid:1, 'users.userId':1, 'users.email':1, 'vp.name':1}},
				];
				var queryVCAllUsers = VisboGroup.aggregate(aggregateQuery);
				queryVCAllUsers.exec(function (err, listVPUsers) {
					if (err) {
						errorHandler(err, res, `DB: GET VC All Users ${req.oneVC._id} `, `Error getting Groups for VISBO Center ${req.oneVC.name}`);
						return;
					}
					return res.status(200).send({
						state: 'success',
						message: 'Returned VISBO Center Groups',
						count: listVCGroup.length,
						groups: listVCGroup,
						users: listVCUsers,
						vpusers: listVPUsers,
						perm: req.listVCPerm.getPerm(req.oneVC.system ? 0: req.oneVC._id)
					});
				});
			} else {
				return res.status(200).send({
					state: 'success',
					message: 'Returned VISBO Center Groups',
					count: listVCGroup.length,
					groups: listVCGroup,
					perm: req.listVCPerm.getPerm(req.oneVC.system ? 0: req.oneVC._id)
				});
			}
		});
	})

	/**
		* @api {post} /vc/:vcid/group Create a Group
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Permission
		* @apiName PostVISBOCenterGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Post creates a new group inside the VISBO Center
		* @apiPermission Authenticated and VC.View and VC.ManagePerm Permission for the VISBO Center.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 missing name of VISBO Center Group during Creation
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a VISBO Center Group
		* @apiError {number} 409 VISBO Center Group with same name exists already
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/groups
		*  {
		*     'name':'Group Name',
		*     'global': true,
		*     'permission': {vc: 307 }
		*  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Group',
		*   'groups':[{
		*     '_id':'vcgroup5c754feaa',
		*     'name':'My first Group',
		*     'vcid': 'vc5c754feaa',
		*     'global': true
		*   }]
		* }
		*/

	// Create a VISBO Center Group
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var isSysAdmin = req.query && req.query.sysAdmin ? true : false;
		var groupType;
		var checkSystemPerm = false;

		req.body.name = req.body.name ? req.body.name.trim() : '';
		if (!validate.validateName(req.body.name, false)) {
			logger4js.info('Body is inconsistent VC Group %s Body %O', req.oneVC._id, req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'VISBO Center Group Name not allowed'
			});
		}
		var newPerm = {};
		var vgGlobal = req.body.global == true;
		groupType = req.oneVC.system ? 'System' : 'VC';
		if ( req.body.permission ) {
			if (groupType == 'System') newPerm.system = (parseInt(req.body.permission.system) || undefined) & ConstPerm.constPermSystemAll;
			if (groupType == 'VC' || vgGlobal) newPerm.vc = (parseInt(req.body.permission.vc) || undefined) & ConstPerm.constPermVCAll;
			if (vgGlobal) newPerm.vp = (parseInt(req.body.permission.vp) || undefined) & ConstPerm.constPermVPAll;
		}
		if (req.body.name) req.body.name = req.body.name.trim();

		req.auditDescription = 'VISBO Center Group Create';
		req.auditInfo = req.body.name;

		if (groupType == 'VC' && req.query.sysadmin) checkSystemPerm = true;
		if (groupType != 'VC')  checkSystemPerm = true;

		logger4js.info('Post a new VISBO Center Group with name %s executed by user %s ', req.body.name, userId);
		logger4js.trace('Post a new VISBO Center Group Req Body: %O Name %s Perm %O', req.body, req.body.name, req.listVCPerm.getPerm(isSysAdmin ? 0 : req.params.vcid));

		if ((!checkSystemPerm && !(req.listVCPerm.getPerm(req.oneVC._id).vc & constPermVC.ManagePerm))
		|| (checkSystemPerm && !(req.listVCPerm.getPerm(0).system & constPermSystem.ManagePerm))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to create VISBO Center Group',
				perm: req.listVCPerm.getPerm(req.oneVC._id)
			});
		}
		logger4js.debug('Post Group to VC %s Permission is ok, check unique name', req.oneVC._id);
		var queryVCGroup = VisboGroup.findOne({'vcid': req.oneVC._id, 'name': req.body.name});
		queryVCGroup.select('name');
		queryVCGroup.lean();
		queryVCGroup.exec(function (err, oneVCGroup) {
			if (err) {
				errorHandler(err, res, `DB: POST VC ${req.oneVC._id} Group ${req.body.name} `, `Error updating Group for VISBO Center ${req.oneVC.name} `);
				return;
			}
			if (oneVCGroup) {
				return res.status(409).send({
					state: 'failure',
					message: 'VISBO Center Group already exists',
					perm: req.listVCPerm.getPerm(req.oneVC.system ? 0: req.oneVC._id)
				});
			}
			logger4js.debug('Post Group %s to VC %s now', req.body.name, req.oneVC._id);

			// query vpids to fill in if group is global
			var query = {};
			query.vcid = req.oneVC._id;
			query.deletedAt = {$exists: false};
			var queryVP = VisboProject.find(query);
			queryVP.select('_id'); // return only _id
			queryVP.lean();
			queryVP.exec(function (err, listVP) {
				if (err) {
					errorHandler(err, res, `DB: POST VC ${req.oneVC._id} Get Projects `, `Error creating Group for VISBO Center ${req.oneVC.name} `);
					return;
				}
				logger4js.debug('VC Create Group: Found %d Projects', listVP.length);

				var vcGroup = new VisboGroup();
				// fill in the required fields
				vcGroup.name = req.body.name;
				vcGroup.vcid = req.params.vcid;
				vcGroup.global = vgGlobal;
				vcGroup.permission = newPerm;
				vcGroup.groupType = groupType;
				vcGroup.internal = false;
				if (vgGlobal) {
					// set global group setting, handle vpids
					logger4js.debug('Set Global Flag %s', vgGlobal);
					vcGroup.vpids = [];
					listVP.forEach(function(item) { vcGroup.vpids.push(item._id); });
					logger4js.debug('Updated Projects/n', vcGroup.vpids);
				} else {
						vcGroup.permission.vp = undefined;
				}
				vcGroup.save(function(err, oneVcGroup) {
					if (err) {
						errorHandler(err, res, `DB: POST VC ${req.oneVC._id} Save Group ${req.body.name} `, `Error creating Group for VISBO Center ${req.oneVC.name} `);
						return;
					}
					req.oneGroup = oneVcGroup;
					var resultGroup = {};
					resultGroup._id = oneVcGroup._id;
					resultGroup.name = oneVcGroup.name;
					resultGroup.vcid = oneVcGroup.vcid;
					resultGroup.global = oneVcGroup.global;
					resultGroup.permission = oneVcGroup.permission;
					resultGroup.groupType = oneVcGroup.groupType;
					resultGroup.users = oneVcGroup.users;
					return res.status(200).send({
						state: 'success',
						message: 'Inserted VISBO Center Group',
						groups: [ resultGroup ]
					});
				});
			});
		});
	});

router.route('/:vcid/group/:groupid')

	/**
		* @api {delete} /vc/:vcid/group/:groupid Delete a Group
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Permission
		* @apiName DeleteVISBOCenterGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Deletes the specified group in the VISBO Center
		*
		* @apiPermission Authenticated and VC.View and VC.ManagePerm Permission for the VISBO Center.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 delete of internal VISBO Center Group not allowed
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete a VISBO Center Group
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/group/:groupid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'VISBO Center Group deleted'
		* }
		*/

	// Delete VISBO Center Group
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var checkSystemPerm = false;

		req.auditDescription = 'VISBO Center Group Delete';
		req.auditInfo = req.oneGroup.name;
		logger4js.info('DELETE VISBO Center Group for userid %s email %s and vc %s group %s ', userId, useremail, req.params.vcid, req.params.groupid);

		if (req.oneGroup.groupType == 'VC' && req.query.sysadmin) checkSystemPerm = true;
		if (req.oneGroup.groupType != 'VC')  checkSystemPerm = true;

		if ((!checkSystemPerm && !(req.listVCPerm.getPerm(req.params.vcid).vc & constPermVC.ManagePerm))
		|| (checkSystemPerm && !(req.listVCPerm.getPerm(0).system & constPermSystem.ManagePerm))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete VISBO Center Group'
			});
		}
		logger4js.debug('Delete VISBO Center Group after permission check %s', req.params.vcid);

		// Do not allow to delete internal VC Group
		if (req.oneGroup.internal
			|| (req.oneGroup.groupType != 'VC' && !req.oneVC.system)) {
			return res.status(400).send({
				state: 'failure',
				message: 'VISBO Center Group not deletable'
			});
		}
		req.oneGroup.remove(function(err) {
			if (err) {
				errorHandler(err, res, `DB: DELETE VC Group ${req.oneGroup._id} `, `Error deleting VISBO Center Group ${req.oneGroup.name} `);
				return;
			}
			return res.status(200).send({
				state: 'success',
				message: 'Deleted VISBO Center Group'
			});
		});
	})

	/**
		* @api {put} /vc/:vcid/group/:groupid Update a Group
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Permission
		* @apiName PutVISBOCenterGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Put updates a group inside the VISBO Center
		*
		* @apiPermission Authenticated and VC.View and VC.ManagePerm Permission for the VISBO Center.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 name of internal group can not be changed or new permission does not meet the minimal permission for internal group.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a VISBO Center Group
		* @apiError {number} 409 VISBO Center Group with same name exists already
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/group/:groupid
		*  {
	  *    'name':'My first Group Renamed',
		*    'global': true,
		*    'permission': {vc: 3, vp: 1 }
	  *   }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Group',
		*   'groups':[{
		*     '_id':'vcgroup5c754feaa',
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
		var checkSystemPerm = false;

		req.auditDescription = 'VISBO Center Group Update';
		req.auditInfo = req.oneGroup.name;
		if (req.body.name) req.body.name = (req.body.name || '').trim();
		if (req.body.name && req.body.name != req.oneGroup.name) {
			req.auditInfo = req.auditInfo.concat(' / ', req.body.name);
		}

		if (!validate.validateName(req.body.name, true)) {
			logger4js.info('Body is inconsistent VC Group %s Body %O', req.oneVC._id, req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'VISBO Center Group Name not allowed'
			});
		}
		var newPerm = {};
		var vgGlobal = req.oneGroup.global == true;
		if (req.body.global != undefined)
			vgGlobal = req.body.global == true;
		logger4js.debug('Get Global Flag %s process %s', req.body.global, vgGlobal);
		if ( req.body.permission ) {
			if (req.oneGroup.groupType == 'System') newPerm.system = (parseInt(req.body.permission.system) || undefined) & ConstPerm.constPermSystemAll;
			if (req.oneGroup.groupType == 'VC' || vgGlobal) newPerm.vc = (parseInt(req.body.permission.vc) || undefined) & ConstPerm.constPermVCAll;
			if (vgGlobal) newPerm.vp = (parseInt(req.body.permission.vp) || undefined) & ConstPerm.constPermVPAll;
		}

		logger4js.info('PUT VISBO Center Group for userid %s email %s and vc %s group %s perm %O', userId, useremail, req.params.vcid, req.params.groupid, req.listVCPerm.getPerm(req.params.vcid));

		if (req.oneGroup.groupType == 'VC' && req.query.sysadmin) checkSystemPerm = true;
		if (req.oneGroup.groupType != 'VC')  checkSystemPerm = true;

		if ((!checkSystemPerm && !(req.listVCPerm.getPerm(req.params.vcid).vc & constPermVC.ManagePerm))
		|| (checkSystemPerm && !(req.listVCPerm.getPerm(0).system & constPermSystem.ManagePerm))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to change VISBO Center Group',
				perm: req.listVCPerm.getPerm(req.params.vcid)
			});
		}
		if (req.oneGroup.internal) req.body.name = req.oneGroup.groupName; // do not overwrite internal Group Name
		if (req.oneGroup.groupType != 'VC' && !req.oneVC.system) {
			return res.status(400).send({
				state: 'failure',
				message: 'Not a VISBO Center Group'
			});
		}
		logger4js.debug('Update VISBO Center Group after permission check vcid %s groupName %s', req.params.vcid, req.oneGroup.name);

		var minimalPerm;
		if (req.oneGroup.groupType == 'VC') {
			minimalPerm = constPermVC.View | constPermVC.ManagePerm;
			if (req.oneGroup.internal == true && (newPerm.vc & minimalPerm) != minimalPerm  ) {
				return res.status(400).send({
					state: 'failure',
					message: 'No Valid Permission for internal group'
				});
			}
		} else {
			minimalPerm = constPermSystem.View | constPermSystem.ManagePerm;
			if (req.oneGroup.internal == true && (newPerm.system & minimalPerm) != minimalPerm  ) {
				return res.status(400).send({
					state: 'failure',
					message: 'No Valid Permission for internal group'
				});
			}
		}
		// check that group name does not exist
		var query = {};
		query.name = req.body.name;								// Name Duplicate check
		query.vcid = req.oneVC._id;
		query.groupType = 'VC';
		VisboGroup.find(query, function(err, listVCGroup) {
			if (err) {
				errorHandler(err, res, `DB: PUT VC Group ${req.body.name} Find`, `Update VISBO Center Group ${req.body.name} failed`);
				return;
			}
			if (listVCGroup.length > 1 || (listVCGroup.length == 1 &&  listVCGroup[0]._id.toString() != req.oneGroup._id.toString())) {
				logger4js.debug('Put VISBO Center Group (Name is not unique) %O', listVCGroup);
				return res.status(409).send({
					state: 'failure',
					message: 'VISBO Center Group already exists'
				});
			}
			logger4js.debug('Create VISBO Center Group (Name is already unique)');
			// query vpids to fill in if group is global
			var query = {};
			query.vcid = req.oneGroup.vcid;
			query.deletedAt = {$exists: false};
			var queryVP = VisboProject.find(query);
			queryVP.select('_id'); // return only _id
			queryVP.lean();
			queryVP.exec(function (err, listVP) {
				if (err) {
					errorHandler(err, res, `DB: PUT VC ${req.oneVC._id} Group, Get Projects `, `Error updating Group for VISBO Center ${req.oneVC.name} `);
					return;
				}
				logger4js.debug('Found %d Projects', listVP.length);
				// logger4js.debug('Found Projects/n', listVP);

				// fill in the required fields
				if (req.body.name) req.oneGroup.name = req.body.name;
				req.oneGroup.permission = newPerm;
				if (vgGlobal != req.oneGroup.global) {
					// switch global group setting, handle vpids
					logger4js.debug('Switch Global Flag %s', vgGlobal);
					req.oneGroup.vpids = [];
					if (vgGlobal == true) {
						listVP.forEach(function(item) { req.oneGroup.vpids.push(item._id); });
						logger4js.debug('Updated Projects/n', req.oneGroup.vpids);
					} else {
						req.oneGroup.permission.vp = undefined;
					}
					req.oneGroup.global = vgGlobal;
				}
				req.oneGroup.internal = req.oneGroup.internal == true; // to guarantee that it is set
				req.oneGroup.save(function(err, oneVcGroup) {
					if (err) {
						errorHandler(err, res, `DB: PUT VC Group ${req.oneGroup._id} Save `, `Error updating VISBO Center Group ${req.oneGroup.name} `);
						return;
					}
					var resultGroup = {};
					resultGroup._id = oneVcGroup._id;
					resultGroup.name = oneVcGroup.name;
					resultGroup.vcid = oneVcGroup.vcid;
					resultGroup.global = oneVcGroup.global;
					resultGroup.permission = oneVcGroup.permission;
					resultGroup.groupType = oneVcGroup.groupType;
					resultGroup.users = oneVcGroup.users;
					return res.status(200).send({
						state: 'success',
						message: 'Updated VISBO Center Group',
						groups: [ resultGroup ]
					});
				});
			});
		});
	});

router.route('/:vcid/group/:groupid/user')
	/**
		* @api {post} /vc/:vcid/group/:groupid/user Add User to Group
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Permission
		* @apiName AddUserToVISBOCenterGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Adds the specified user from body to the group
		*
		* @apiPermission Authenticated and VC.View and VC.ManagePerm Permission for the VISBO Center.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 missing user name to add to the VISBO Center Group
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to add a user to a VISBO Center Group
		* @apiError {number} 409 user is already member of the VISBO Center Group
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/vc/:vcid/group/:groupid/user
		*  {
	  *    'email':'new.user@visbo.de',
		*    'message': 'Invitation message'
	  *  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'User was added to VISBO Center Group',
		*   'groups':[{
		*     '_id':'vcgroup5c754feaa',
		*     'name':'My first Group Renamed',
		*     'vcid': 'vc5c754feaa',
		*     'users': [{userId: 'userId5c754feaa', email: 'new.user@visbo.de'}]
		*     'global': true
		*   }]
		* }
		*/

	// Add User to VISBO Center Group
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var checkSystemPerm = false;

		logger4js.info('Post a new VISBO Center User with name %s  to group executed by user %s with perm %s ', req.body.email, req.oneGroup.name, userId, req.listVCPerm.getPerm(req.params.vcid));
		req.auditDescription = 'VISBO Center User Add';

		if (req.body.email) req.body.email = req.body.email.trim().toLowerCase();
		if (!validate.validateEmail(req.body.email, false)) {
			logger4js.warn('Post a not allowed UserName %s to VISBO Center group executed by user %s with perm %s ', req.body.email, req.oneGroup.name, userId, req.listVCPerm.getPerm(req.params.vcid));
			return res.status(400).send({
				state: 'failure',
				message: 'VISBO Center User Name not allowed'
			});
		}

		req.auditInfo = req.body.email + ' / ' + req.oneGroup.name;

		if (req.oneGroup.groupType == 'VC' && req.query.sysadmin) checkSystemPerm = true;
		if (req.oneGroup.groupType != 'VC')  checkSystemPerm = true;

		if ((!checkSystemPerm && !(req.listVCPerm.getPerm(req.params.vcid).vc & constPermVC.ManagePerm))
		|| (checkSystemPerm && !(req.listVCPerm.getPerm(0).system & constPermSystem.ManagePerm))) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to add User to VISBO Center Group'
				});
		}
		if (req.oneGroup.groupType != 'VC' && req.oneGroup.groupType != 'System') {
			return res.status(400).send({
				state: 'failure',
				message: 'not a VISBO Center Group'
			});
		}
		logger4js.debug('Post User to VC %s Permission is ok', req.params.vcid);

		var vcUser = new VCGroupUser();
		var eMailMessage = undefined;
		if (req.body.message) {
			eMailMessage = sanitizeHtml(req.body.message, {allowedTags: [], allowedAttributes: {}});
		}
		vcUser.email = req.body.email;

		// check if the user is not member of the group already
		if (req.oneGroup.users.filter(users => (users.email == vcUser.email)).length != 0) {
			logger4js.debug('Post User %s to VC Group %s User is already a member', vcUser.email, req.oneGroup._id);
			return res.status(409).send({
				state: 'failure',
				message: 'User is already member',
				groups: [req.oneGroup]
			});
		}
		// check if the user exists and get the UserId or create the user
		var query = {'email': vcUser.email};
		var queryUsers = User.findOne(query);
		//queryUsers.select('email');
		queryUsers.exec(function (err, user) {
			if (err) {
				errorHandler(err, res, `DB: POST User to VC Group ${req.oneGroup._id} Find User `, `Error adding User to VISBO Center Group ${req.oneGroup.name} `);
				return;
			}
			if (!user) {
				user = new User();
				user.email = vcUser.email;
				logger4js.debug('Create new User %s for VC in Group %s', vcUser.email, req.oneGroup._id);
				user.save(function(err, user) {
					if (err) {
						errorHandler(err, res, `DB: POST User to VC Group ${req.oneGroup._id} Create new User `, `Error adding User to VISBO Center Group ${req.oneGroup.name}`);
						return;
					}
					// user exists now, now the VC can be updated
					vcUser.userId = user._id;

					req.oneGroup.users.push(vcUser);
					req.oneGroup.save(function(err, vcGroup) {
						if (err) {
							errorHandler(err, res, `DB: POST User to VC Group ${req.oneGroup._id} Save Group `, `Error adding User to VISBO Center Group ${req.oneGroup.name}`);
							return;
						}
						req.oneGroup = vcGroup;
						// now send an e-Mail to the user for registration
						var lang = validate.evaluateLanguage(req);
						var template = __dirname.concat(eMailTemplates, lang, '/inviteVCNewUser.ejs');
						var uiUrl =  getSystemUrl();

						var secret = 'register'.concat(user._id, user.updatedAt.getTime());
						var hash = createHash(secret);
						uiUrl = uiUrl.concat('/register/', user._id, '?hash=', hash);
						var eMailSubject = res.__('Mail.Subject.VCInvite') + ' ' + req.oneVC.name;

						logger4js.debug('E-Mail template %s, url %s', template, uiUrl);
						if (eMailMessage === undefined) {
								// do not send invitation mail if no message is specified
								return res.status(200).send({
									state: 'success',
									message: 'Successfully added User to VISBO Center Group',
									groups: [ vcGroup ]
								});
						} else {
							ejs.renderFile(template, {userFrom: req.decoded, userTo: user, url: uiUrl, vc: req.oneVC, message: eMailMessage}, function(err, emailHtml) {
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
									message: 'Successfully added User to VISBO Center',
									groups: [ vcGroup ]
								});
							});
						}
					});
				});
			} else {
				vcUser.userId = user._id;
				req.oneGroup.users.push(vcUser);
				req.oneGroup.save(function(err, vcGroup) {
					if (err) {
						errorHandler(err, res, `DB: POST User to VC Group ${req.oneGroup._id} Save Group `, `Error adding User to VISBO Center Group ${req.oneGroup.name}`);
						return;
					}
					req.oneGroup = vcGroup;
					// now send an e-Mail to the user for registration/login
					var lang = validate.evaluateLanguage(req);
					var template = __dirname.concat(eMailTemplates, lang);
					var uiUrl =  getSystemUrl();
					var eMailSubject = res.__('Mail.Subject.VCInvite') + ' ' + req.oneVC.name;
					logger4js.trace('E-Mail User Status %O %s', user.status, user.status.registeredAt);
					if (user.status && user.status.registeredAt) {
						// send e-Mail to a registered user
						template = template.concat('/inviteVCExistingUser.ejs');
						uiUrl = uiUrl.concat('/vp/', req.oneVC._id);
					} else {
						// send e-Mail to an existing but unregistered user
						template = template.concat('/inviteVCNewUser.ejs');
						var secret = 'register'.concat(user._id, user.updatedAt.getTime());
						var hash = createHash(secret);
						uiUrl = uiUrl.concat('/register/', user._id, '?hash=', hash);
					}

					logger4js.debug('E-Mail template %s, url %s', template, uiUrl);
					if (eMailMessage === undefined) {
							// do not send invitation mail if no message is specified
							return res.status(200).send({
								state: 'success',
								message: 'Successfully added User to VISBO Center Group',
								groups: [ vcGroup ]
							});
					} else {
						ejs.renderFile(template, {userFrom: req.decoded, userTo: user, url: uiUrl, vc: req.oneVC, message: eMailMessage}, function(err, emailHtml) {
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
								message: 'Successfully added User to VISBO Center',
								groups: [ vcGroup ]
							});
						});
					}
				});
			}
		});
	});

router.route('/:vcid/group/:groupid/user/:userid')
	/**
		* @api {delete} /vc/:vcid/group/:groupid/user/:userid Delete User from Group
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Permission
		* @apiName DeleteVISBOCenterUser
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Deletes the specified user in the VISBO Center Group
		*
		* @apiPermission Authenticated and VC.View and VC.ManagePerm Permission for the VISBO Center.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 no Admin user will be left in internal VISBO Center Group
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete a user from VISBO Center Group
		* @apiError {number} 409 user is not member of the VISBO Center Group
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/group/:groupid/user/:userid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'VISBO Center User deleted from Group'
		* }
		*/

	// Delete VISBO Center User
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var checkSystemPerm = false;

		logger4js.info('DELETE VISBO Center User by userid %s email %s for user %s Group %s ', userId, useremail, req.params.userid, req.oneGroup._id);

		req.auditDescription = 'VISBO Center User Delete';

		var delUser = req.oneGroup.users.find(findUserById, req.params.userid);
		if (delUser) req.auditInfo = delUser.email  + ' / ' + req.oneGroup.name;

		if (req.oneGroup.groupType == 'VC' && req.query.sysadmin) checkSystemPerm = true;
		if (req.oneGroup.groupType != 'VC')  checkSystemPerm = true;

		if ((!checkSystemPerm && !(req.listVCPerm.getPerm(req.params.vcid).vc & constPermVC.ManagePerm))
		|| (checkSystemPerm && !(req.listVCPerm.getPerm(0).system & constPermSystem.ManagePerm))) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Permission to Delete User from Group',
					perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
				});
		}
		if (req.oneGroup.groupType != 'VC' && req.oneGroup.groupType != 'System') {
			return res.status(400).send({
				state: 'failure',
				message: 'not a VISBO Center Group'
			});
		}
		var newUserList = req.oneGroup.users.filter(users => (!(users.userId == req.params.userid )));
		logger4js.debug('DELETE Group User List Length new %d old %d', newUserList.length, req.oneGroup.users.length);
		logger4js.trace('DELETE VISBO Center Filtered User List %O ', newUserList);
		if (newUserList.length == req.oneGroup.users.length) {
			return res.status(409).send({
				state: 'failure',
				message: 'User is not member of Group',
				groups: [req.oneGroup]
			});
		}
		// Check that there is still an Admin beside the removed one, if we remove a Admin role
		if (req.oneGroup.internal && newUserList.length == 0) {
			return res.status(400).send({
				state: 'failure',
				message: 'No Admin User will be left',
				groups: [req.oneGroup]
			});
		}
		logger4js.debug('Delete VISBO Center User after permission check %s', req.params.userid);
		req.oneGroup.users = newUserList;
		req.oneGroup.save(function(err, vg) {
			if (err) {
				errorHandler(err, res, `DB: DELETE User from VC Group ${req.oneGroup._id} Save Group `, `Error deleting User from VISBO Center Group ${req.oneGroup.name} `);
				return;
			}
			req.oneGroup = vg;
			return res.status(200).send({
				state: 'success',
				message: 'Successfully removed User from VISBO Center',
				groups: [req.oneGroup]
			});
		});
	});

router.route('/:vcid/message')
	/**
		* @api {post} /vc/:vcid/message Send Mail to User
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center
		* @apiName SendMessageToUserOfVISBOCenter
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Sends a message to specified user
		*
		* @apiPermission Authenticated and VC.View Permission for the VISBO Center.
		* @apiError {number} 400 missing user name to send message
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 409 receiving user is not member of VC
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/vc/:vcid/message
		*  {
	  *    'email':'existing.user@visbo.de',
		*    'message': 'Message'
	  *  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Message was sent to VISBO Center User'
		* }
		*/

	// Sent Message to VC User
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		logger4js.info('Sent a message to VISBO Center User with name %s executed by user %s with perm %s ', req.body.email, userId, req.listVCPerm.getPerm(req.params.vcid));
		req.auditDescription = 'VISBO Center Send Message';

		if (req.body.email) req.body.email = req.body.email.trim().toLowerCase();
		if (!validate.validateEmail(req.body.email, false)) {
			logger4js.warn('Post Message a not allowed UserName %s to VISBO Center executed by user %s with perm %s ', req.body.email, userId, req.listVCPerm.getPerm(req.params.vcid));
			return res.status(400).send({
				state: 'failure',
				message: 'VISBO Center User Name not allowed'
			});
		}

		var eMailMessage = undefined;
		var recipient = req.body.email;
		req.auditInfo = recipient;

		if (req.body.message) {
			eMailMessage = sanitizeHtml(req.body.message, {allowedTags: [], allowedAttributes: {}});
		}

		// check if the user is member of the VC
		// {"users.email": 'visbotest@seyfried.bayern', "permission.vc": { $bitsAllSet: 1 }}
		var query = {};
		query.vcid = req.oneVC._id;
		query.groupType = req.oneVC.system ? 'System' : 'VC';
		query['users.email'] = recipient;
		query['permission.vc'] = { $bitsAllSet: 1 };

		var queryVCGroup = VisboGroup.find(query);
		queryVCGroup.select('-vpids');
		queryVCGroup.lean();
		queryVCGroup.exec(function (err, listVCGroup) {
			if (err) {
				errorHandler(err, res, `DB: POST Message to VC ${recipient} Find User `, `Error User not member of VISBO Center ${recipient} `);
				return;
			}
			if (listVCGroup?.length > 0) {
				var user = new User();
				user.email = recipient;
				var lang = validate.evaluateLanguage(req);
				var template = __dirname.concat(eMailTemplates, lang, '/sendVCMessage.ejs');
				var uiUrl =  getSystemUrl();
				uiUrl = uiUrl.concat('/vp/', req.oneVC._id);
				var eMailSubject = res.__('Mail.Subject.VCMessage') + ' ' + req.oneVC.name;
				ejs.renderFile(template, {userFrom: req.decoded, userTo: user, url: uiUrl, vc: req.oneVC, message: eMailMessage}, function(err, emailHtml) {
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
						message: 'Successfully sent message to User of VISBO Center'
					});
				});
			} else {
				logger4js.info('Try to send to unknown user from %s to %s', userId, recipient);
				return res.status(409).send({
					state: 'failure',
					message: 'Unknown Recipient of VISBO Center: '.concat(recipient)
				});
			}
		});
	});

router.route('/:vcid/organisation')
	/**
		* @api {get} /vc/:vcid/organisation Get Organisations
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName GetVISBOCenterOrganisations
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets the organisation of the specified VISBO Center, filtered by the users role what he can see from the organisaion
		*
		* With additional query paramteters the amount of results can be restricted. Available Restirctions are: refDate, refNext, longList returns the organisation including Capacities
		*
		* @apiParam {Date} refDate only the latest organisation with a timestamp before the reference date is delivered
		* Date Format is in the form: 2018-10-30T10:00:00Z
		* @apiParam {String} refNext If refNext is not empty the system delivers not the setting before refDate instead it delivers the setting after refDate
		* @apiParam {Boolean} hierarchy Deliver orga with hierarchy
		* @apiParam {Boolean} withCapa Deliver capaPerMonth for each role that has a specific capacity. Only valid in combination with hierarchy
		*
		* @apiPermission Authenticated and VC.View for the VISBO Center. For longList it requires also VC.ViewAudit or VC.Modify to get information about extended properties like tagessatz.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View the VISBO Center
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/organisation
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Organisation',
		*   'organisation':[{
		*     '_id':'vcsetting5c754feaa',
		*     'vcid': 'vc5c754feaa',
		*     'name': 'organisation',
		*     'timestamp': '2018-12-01',
		*     'allRoles': [roleDefinition],
		*     'allCosts': [costDefinition],
		*     'allUnits': [Definition],
		*   }]
		* }
		*/

	// get VC Organisation
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var latestOnly = false; 	// as default show all settings
		var withCapa = req.query.withCapa == true;
		var getOrgaList = req.query.hierarchy != true;

		req.auditDescription = 'VISBO Center Organisation Read';
		req.auditTTLMode = 1;

		logger4js.info('Get VISBO Center Organisation for userid %s email %s and vc %s ', userId, useremail, req.params.vcid);

		var query = {};
		if (req.query.refDate != undefined){
			var refDate = validate.validateDate(req.query.refDate, true);
			var compare = req.query.refNext ? {$gt: refDate} : {$lt: refDate};
			query.timestamp = compare;
			latestOnly = true;
		}
		query.vcid = req.oneVC._id;
		query.type = 'organisation';

		logger4js.debug('Find VC Organisation with query %O', query);
		var queryVCSetting = latestOnly ? VCSetting.findOne(query) : VCSetting.find(query);
		// queryVCSetting.select('_id vcid name');
		if (req.query.refNext) {
			queryVCSetting.sort({vcid:1, timestamp: 1});
		} else {
			queryVCSetting.sort({vcid:1, timestamp: -1});
		}
		queryVCSetting.lean();
		if (latestOnly) {
			queryVCSetting.exec(function (err, VCSetting) {
				if (err) {
					errorHandler(err, res, `DB: GET VC Settings ${req.oneVC._id} Find`, `Error getting Setting for VISBO Center ${req.oneVC.name}`);
					return;
				}
				req.auditInfo = VCSetting ? 1 : 0;
				if (!VCSetting) {
					return res.status(403).send({
						state: 'failure',
						message: 'No VISBO Center Organisation found or no permission',
						count: req.auditInfo
					});
				}
				logger4js.debug('Found VC Organisation', VCSetting && VCSetting.timestamp);
				if ((req.listVCPerm.getPerm(req.params.vcid).vc & (constPermVC.ViewAudit)) == 0) {
					VCSetting.value?.allRoles?.forEach(role => {
						delete role.tagessatz;
					});
				}
				if (!getOrgaList && withCapa) {
					helperOrga.joinCapacity(VCSetting, req.visboVCCapacity);
				}
				var resultOrga = helperOrga.convertSettingToOrga(VCSetting, getOrgaList);
				return res.status(200).send({
					state: 'success',
					message: 'Returned VISBO Center Organisation',
					count: req.auditInfo,
					organisation: [resultOrga]
				});
			});
		} else {
			queryVCSetting.exec(function (err, listVCSetting) {
				if (err) {
					errorHandler(err, res, `DB: GET VC Organisations ${req.oneVC._id} Find`, `Error getting Organisations for VISBO Center ${req.oneVC.name}`);
					return;
				}
				logger4js.debug('Found %d VC Organisation', listVCSetting.length);
				req.auditInfo = listVCSetting.length;
				var hasNoAudit = (req.listVCPerm.getPerm(req.params.vcid).vc & (constPermVC.ViewAudit)) == 0;

				var listOrganisation = [];
				listVCSetting.forEach(item => {
					var resultOrga = helperOrga.convertSettingToOrga(item, getOrgaList);
					if (hasNoAudit) {
						resultOrga.allRoles.forEach(role => {
							delete role.tagessatz;
						});
					}
					if (!getOrgaList && withCapa) {
						helperOrga.joinCapacity(item, req.visboVCCapacity);
					}
					listOrganisation.push(resultOrga);
				});
				return res.status(200).send({
					state: 'success',
					message: 'Returned VISBO Center Organisations',
					count: listVCSetting.length,
					organisation: listOrganisation
				});
			});
		}
	})

	/**
		* @api {post} /vc/:vcid/organisation Create a new organisation
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center
		* @apiName CreateVISBOCenterOrganisation
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Creates a new VISBO Center Organisation. It supports old & new format.
		* oldFormat means allRoles & allCosts as List with the defined properties
		* newFormat means allUnits as List with reduced/extended properties
		* the format that is returned is the same as what was delivered
		*
		* @apiPermission Authenticated and VC.View & VC.Manage Permission for the VISBO Center.
		* @apiError {number} 400 inconsistent information inside the new organisation
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 409 an organisation with the same time stamp already exists
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/vc/:vcid/organisation
		*  {
		*    'name': 'name',
		*    'timestamp': '2018-12-01',
		* 	 'allUnits': [
	  *      'name':'name of orga unit',
		*      'type': 'type of orga unit',
		*      'uid': 'uid of orga unit',
		*      'parent': 'parent name of orga unit',
		*      'entryDate': '2021-01-01',
		*      'exitDate': '2022-07-15',
		*      'isExternRole': false,
		*      'defaultCapa': 20,
		*      'defaultDayCapa': 6.5,
		*      'tagessatz': 800,
		*      'employeeNr': 'U4711',
		*      'aliases': ['Alias1', 'Alias2'],
		*      'isAggregationRole': false,
		*      'isSummaryRole': false,
		*      'percent': 0.25
	  *    ]
		*  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Successfully created VISBO Center Organisation',
		*   'timestamp': '2018-12-01',
		*   'organisation': [{
		*   }]
		* }
		*/

	// Create VC Organisation
	.post(function(req, res) {
		var userId = req.decoded._id;
		req.auditDescription = 'VISBO Center Organisation Create';
		req.auditInfo = req.body.name;

		logger4js.trace('Post a new VISBO Center Organisation Req Body: %O Name %s', req.body, req.body.name);
		logger4js.info('Post a new VISBO Center Organisation with name %s executed by user %s sysadmin %s', req.body.name, userId, req.query.sysadmin);

		if (!(req.listVCPerm.getPerm(req.params.vcid).vc & constPermVC.ManagePerm)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to create VISBO Center Setting',
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		}
		if (req.body.name) req.body.name = (req.body.name || '').trim();
		if (!validate.validateName(req.body.name, false)
		|| !validate.validateDate(req.body.timestamp, true)) {
			logger4js.debug('Post a new VISBO Center Organisation name or timestamp not accepted %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'No valid name or timestamp in Organisation definition'
			});
		}
		if (!(req.body.allUnits || (req.body.allRoles && req.body.allCosts))) {
			logger4js.debug('Post a new VISBO Center Organisation orga definition missing %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'Organisation definition missing'
			});
		}
		var newTimeStamp = req.body.timestamp;
		newTimeStamp = Date.parse(newTimeStamp) ? new Date(newTimeStamp) : new Date();
		newTimeStamp.setDate(1);
		newTimeStamp.setHours(0,0,0,0);
		var oldOrga = undefined;
		if (req.visboOrganisation?.length > 0) {
			// req.visboOrganisation.forEach( item => logger4js.warn('Orga Timestamp', item.timestamp));
			oldOrga = req.visboOrganisation[0];
			var oldTimeStamp = new Date(oldOrga.timestamp);
			if (newTimeStamp.getTime() <= oldTimeStamp.getTime()) {
				return res.status(409).send({
					state: 'failure',
					message: 'Newer Organisation exists already'
				});
			}
		}
		var errorList = [];
		var orga;
		var isOrgaList = req.body.allUnits != undefined;
		if (isOrgaList) {
			orga = helperOrga.initOrgaFromList(req.body.allUnits, newTimeStamp, oldOrga?.value, errorList);
		} else {
			orga = helperOrga.initOrga(req.body, newTimeStamp, oldOrga?.value, errorList);
		}
		if (!orga) {
			return res.status(400).send({
				state: 'failure',
				message: 'Incorrect Information in organisation',
				error: errorList
			});
		}
		logger4js.debug('Post Organisation Check new Orga against', oldOrga ? oldOrga.timestamp : 'Nothing');
		if (!helperOrga.verifyOrga(orga, oldOrga)) {
			return res.status(400).send({
				state: 'failure',
				message: 'Incorrect Information compared to old organisation',
				organisation: orga
			});
		}
		// now create the Setting that gets saved
		var vcSetting = new VCSetting();
		vcSetting.name = req.body.name;
		vcSetting.vcid = req.params.vcid;
		vcSetting.value = orga;
		vcSetting.timestamp = newTimeStamp;
		vcSetting.type = 'organisation';
		vcSetting.save(function(err, oneVCSetting) {
			if (err) {
				errorHandler(err, res, `DB: POST VC Organisation ${req.params.vcid} save`, `Error creating VISBO Center Organisation ${req.oneVC.name}`);
				return;
			}
			req.oneVCSetting = oneVCSetting;
			var resultOrga = helperOrga.convertSettingToOrga(oneVCSetting, isOrgaList);
			return res.status(200).send({
				state: 'success',
				message: 'Inserted VISBO Center Organisation',
				organisation: [ resultOrga ],
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		});
	});

router.route('/:vcid/organisation/:settingid')
	/**
		* @api {get} /vc/:vcid/organisation/:orgaid Get a specific Organisation
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName GetVISBOCenterOrganisation
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets the specific organisation of the specified VISBO Center, filtered by the users role what he can see from the organisaion
		*
		* @apiParam {Date} refDate only the latest organisation with a timestamp before the reference date is delivered
		* Date Format is in the form: 2018-10-30T10:00:00Z
		* @apiParam {Boolean} hierarchy Deliver orga with hierarchy
		* @apiParam {Boolean} withCapa Deliver capaPerMonth for each role that has a specific capacity. Only valid in combination with hierarchy
		*
		* @apiPermission Authenticated and VC.View for the VISBO Center. For longList it requires also VC.ViewAudit or VC.Modify to get information about extended properties like tagessatz.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View the VISBO Center
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/organisation/:orgaid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Organisation',
		*   'organisation':[{
		*     '_id':'vcsetting5c754feaa',
		*     'name': 'organisation',
		*     'timestamp': '2018-12-01',
		*     'allRoles': [roleDefinition],
		*     'allCosts': [costDefinition],
		*     'allUnits': [Definition],
		*   }]
		* }
		*/

	// Get specific VC Organisation
	.get(function(req, res) {
		var userId = req.decoded._id;
		var withCapa = req.query.withCapa == true;
		var getOrgaList = req.query.hierarchy != true;

		req.auditDescription = 'VISBO Center Organisation Read';
		req.auditTTLMode = 1;
		req.auditInfo = req.oneVCSetting.name;

		logger4js.info('Get VISBO Center Organisation %s for userid %s and vc %s ', req.params.settingid, userId, req.params.vcid);

		var orga = req.oneVCSetting;
		if ((req.listVCPerm.getPerm(req.params.vcid).vc & (constPermVC.ViewAudit)) == 0) {
			orga.value?.allRoles?.forEach(role => {
				delete role.tagessatz;
			});
		}
		if (!getOrgaList && withCapa) {
			helperOrga.joinCapacity(req.oneVCSetting, req.visboVCCapacity);
		}
		var resultOrga = helperOrga.convertSettingToOrga(req.oneVCSetting, getOrgaList);
		return res.status(200).send({
			state: 'success',
			message: 'Returned VISBO Center Organisation',
			count: 1,
			organisation: [resultOrga]
		});
	})

	/**
		* @api {put} /vc/:vcid/organisation/:orgaid Update an organisation
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center
		* @apiName UpdateVISBOCenterOrganisation
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Updates a VISBO Center Organisation. It supports old & new format.
		* oldFormat means allRoles & allCosts as List with the defined properties
		* newFormat means allUnits as List with reduced/extended properties
		* the format that is returned is the same as what was delivered
		*
		* @apiPermission Authenticated and VC.View & VC.Manage Permission for the VISBO Center.
		* @apiError {number} 400 inconsistent information inside the new organisation
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 409 an organisation with the same time stamp already exists
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/vc/:vcid/organisation
		*  {
		*    'name': 'name',
		*    'timestamp': '2018-12-01',
		* 	 'allUnits': [
	  *      'name': 'name of orga unit',
		*      'type': 'type of orga unit',
		*      'uid': 'uid of orga unit',
		*      'parent': 'parent name of orga unit',
		*      'entryDate': '2021-01-01',
		*      'exitDate': '2022-07-15',
		*      'isExternRole': false,
		*      'defaultCapa': 20,
		*      'defaultDayCapa': 6.5,
		*      'tagessatz': 800,
		*      'employeeNr': 'U4711',
		*      'aliases': ['Alias1', 'Alias2'],
		*      'isAggregationRole': false,
		*      'isSummaryRole': false,
		*      'percent': 0.25
	  *    ]
		*  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Successfully created VISBO Center Organisation',
		*   'timestamp': '2018-12-01',
		*   'organisation': [{
		*   }]
		* }
		*/

	// Update VC Organisation
	.put(function(req, res) {
		var userId = req.decoded._id;
		req.auditDescription = 'VISBO Center Organisation Update';
		req.auditInfo = req.body.name;

		logger4js.trace('Put VISBO Center Organisation Req Body: %O Name %s', req.body, req.body.name);
		logger4js.info('Put VISBO Center Organisation with name %s executed by user %s sysadmin %s', req.body.name, userId, req.query.sysadmin);

		if (!(req.listVCPerm.getPerm(req.params.vcid).vc & constPermVC.ManagePerm)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to update VISBO Center Setting',
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		}
		if (req.body.name) req.body.name = (req.body.name || '').trim();
		if (!validate.validateName(req.body.name, false)) {
			logger4js.debug('Put VISBO Center Organisation name not accepted %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'No valid name in Organisation definition'
			});
		}
		if (!(req.body.allUnits || (req.body.allRoles && req.body.allCosts))) {
			logger4js.debug('Put VISBO Center Organisation orga definition missing %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'Organisation definition missing'
			});
		}
		if (req.visboOrganisation?.length > 1) {
			var oldOrga = req.visboOrganisation[0];
			if (validate.compareDate(req.oneVCSetting.timestamp, oldOrga.timestamp) < 0) {
				return res.status(409).send({
					state: 'failure',
					message: 'Newer Organisation exists already, update is not allowed'
				});
			}
		}
		var oldOrga = req.oneVCSetting;
		var errorList = [];
		var orga;
		var isOrgaList = req.body.allUnits != undefined;
		if (isOrgaList) {
			orga = helperOrga.initOrgaFromList(req.body.allUnits, oldOrga.timestamp, oldOrga?.value, errorList);
		} else {
			orga = helperOrga.initOrga(req.body, oldOrga.timestamp, oldOrga?.value, errorList);
		}
		if (!orga) {
			return res.status(400).send({
				state: 'failure',
				message: 'Incorrect Information in organisation',
				organisation: orga,
				error: errorList
			});
		}
		logger4js.debug('Put Organisation Check new Orga against', oldOrga ? oldOrga.timestamp : 'Nothing');
		if (!helperOrga.verifyOrga(orga, oldOrga)) {
			return res.status(400).send({
				state: 'failure',
				message: 'Incorrect Information compared to old organisation',
				organisation: orga
			});
		}
		if (req.body.name) {
			oldOrga.name = req.body.name
		}
		req.auditInfo = oldOrga.name.concat('/', oldOrga.timestamp.toISOString());
		oldOrga.value = orga;

		oldOrga.save(function(err, oneVCSetting) {
			if (err) {
				errorHandler(err, res, `DB: POST VC Organisation ${req.params.vcid} save`, `Error creating VISBO Center Organisation ${req.oneVC.name}`);
				return;
			}
			req.oneVCSetting = oneVCSetting;
			var resultOrga = helperOrga.convertSettingToOrga(oneVCSetting, isOrgaList);
			return res.status(200).send({
				state: 'success',
				message: 'Updated VISBO Center Organisation',
				organisation: [ resultOrga ],
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		});
	});

router.route('/:vcid/setting')

	/**
		* @api {get} /vc/:vcid/setting Get all Settings
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName GetVISBOCenterSetting
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets all settings of the specified VISBO Center there the user has permission to.
		* Depending on the setting private/public/personal different rules applies, how the result looks like.
		* Private settings were content filtered, so that the user gets oon sensitive data, if he has not enough Permission
		* Public settings were delivered as is.
		* Personal settings were only delivered if it belongs to the acting user or if the user has Modify permission.
		*
		* With additional query paramteters the amount of settings can be restricted. Available Restirctions are: refDate, type, name, userId.
		*
		* @apiParam {Date} refDate only the latest setting with a timestamp before the reference date is delivered per Setting Type/Name and UserID.
		* if several settings per type & name and userID are available, the refDate filters the latest settings per group dependant on the timestamp compared to refDate.
		* without extra setting the grouping is done per name, type and userID. With parameter groupBy the grouping is applied to type & userId.
		* Date Format is in the form: 2018-10-30T10:00:00Z
		* @apiParam {String} refNext If refNext is not empty the system delivers not the setting before refDate instead it delivers the setting after refDate
		* @apiParam {String} name Deliver only settings with the specified name
		* @apiParam {String} type Deliver only settings of the the specified types (comma separated list)
		* @apiParam {String} userId Deliver only settings that has set the specified userId
		* @apiParam {String} groupBy Groups the Settings regarding refDate by Type and userId and returns one per group
		* @apiParam {String} shortList Delivers only the Settings without the value structure (to be able to check what is available)
		*
		* @apiPermission Authenticated and VC.View Permission for the VISBO Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View the VISBO Center
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/setting
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Settings',
		*   'vcsetting':[{
		*     '_id':'vcsetting5c754feaa',
		*     'vcid': 'vc5c754feaa',
		*     'name':'Setting Name',
		*     'userId': 'us5c754feab',
		*     'type': 'Type of Setting',
		*     'timestamp': '2018-12-01',
		*     'value': {'any name': 'any value'}
		*   }]
		* }
		*/

	// get VC Settings
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var latestOnly = false; 	// as default show all settings
		var groupBy = 'name';
		var isSysAdmin = req.query.sysadmin ? true : false;
		var sortColumns;

		req.auditDescription = 'VISBO Center Setting Read';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		logger4js.info('Get VISBO Center Setting for userid %s email %s and vc %s ', userId, useremail, req.params.vcid);

		var query = {};
		var refDate;
		if (req.query.refDate != undefined) {
			if (Date.parse(req.query.refDate)) {
				refDate = new Date(req.query.refDate);
			} else {
				refDate = new Date();
			}
			var compare = req.query.refNext ? {$gt: refDate} : {$lt: refDate};
			query = { $or: [ { timestamp: compare }, { timestamp: {$exists: false}  } ] };
			latestOnly = true;
		}

		query.vcid = req.oneVC._id;
		if (req.query.name) query.name = req.query.name;
		if (req.query.type) {
			if (req.query.type.indexOf(',') == -1) {
				query.type = req.query.type;
			} else {
				query.type = {$in: req.query.type.split(',')};
			}
		}
		if (req.query.userId && validate.validateObjectId(req.query.userId, true)) query.userId = req.query.userId;
		if (req.query.groupBy == 'type') groupBy = 'type';

		if (groupBy == 'type') sortColumns = 'type userId ';
		else sortColumns = 'type name userId ';
		if (latestOnly) {
			if (req.query.refNext) sortColumns = sortColumns.concat(' +timestamp');
			else sortColumns = sortColumns.concat(' -timestamp');
		}

		logger4js.debug('Find VC Settings with query %O', query);
		var queryVCSetting = VCSetting.find(query);
		if (req.query.shortList == true) {
			queryVCSetting.select('-value');
		}
		// queryVCSetting.select('_id vcid name');
		queryVCSetting.sort(sortColumns);
		queryVCSetting.lean();
		queryVCSetting.exec(function (err, listVCSetting) {
			if (err) {
				errorHandler(err, res, `DB: GET VC Settings ${req.oneVC._id} Find`, `Error getting Setting for VISBO Center ${req.oneVC.name}`);
				return;
			}
			for (let i = 0; i < listVCSetting.length; i++){
				// Remove Password Information
				if (listVCSetting[i].type == 'SysConfig' && listVCSetting[i].name == 'SMTP'
				&& listVCSetting[i].value && listVCSetting[i].value.auth && listVCSetting[i].value.auth.pass) {
					listVCSetting[i].value.auth.pass = '';
					break;
				}
			}
			var listVCSettingfiltered = [];
			if (listVCSetting.length > 1 && latestOnly) {
				listVCSettingfiltered.push(listVCSetting[0]);
				for (let i = 1; i < listVCSetting.length; i++){
					//compare current item with previous and ignore if it is the same type, name, userId
					logger4js.trace('compare: :%s: vs. :%s:', JSON.stringify(listVCSetting[i]), JSON.stringify(listVCSetting[i-1]) );
					if (listVCSetting[i].type != listVCSetting[i-1].type
					|| (groupBy == 'name' && listVCSetting[i].name != listVCSetting[i-1].name)
					|| (listVCSetting[i].userId || '').toString() != (listVCSetting[i-1].userId || '').toString()) {
						listVCSettingfiltered.push(listVCSetting[i]);
						logger4js.trace('compare unequal: ', listVCSetting[i]._id != listVCSetting[i-1]._id);
					}
				}
				logger4js.debug('Found %d Settings after Filtering', listVCSettingfiltered.length);
			} else {
				listVCSettingfiltered = listVCSetting;
			}
			if (!req.query.sysadmin && !(req.listVCPerm.getPerm(req.params.vcid).vc & (constPermVC.ViewAudit))) {
				// if user has no Modify/Audit permission the personal settings of other users were removed
				listVCSettingfiltered = listVCSettingfiltered.filter(item => !item.userId || item.userId.toString() == userId);
				// squeeze private settings, remove sensitive Information
				listVCSettingfiltered.forEach(function (item) { squeezeSetting(item, useremail); });
			}
			// filter _VCConfig Settings if not sysAdmin
			if (!isSysAdmin) {
				listVCSettingfiltered = listVCSettingfiltered.filter(item => item.type != '_VCConfig' || !item.value || item.value.level == 2);
			}
			// join the capacity to the orga if it is available
			listVCSettingfiltered.forEach(setting => {
				if (setting.type == 'organisation') {
					helperOrga.joinCapacity(setting, req.visboVCCapacity);
					helperOrga.compatibilityOldOrga(setting);
				}
			});
			req.auditInfo = listVCSettingfiltered.length;
			return res.status(200).send({
				state: 'success',
				message: 'Returned VISBO Center Settings',
				count: listVCSettingfiltered.length,
				vcsetting: listVCSettingfiltered
			});
		});
	})

	/**
		* @api {post} /vc/:vcid/setting Create a Setting
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName PostVISBOCenterSetting
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Post creates a new setting inside the VISBO Center
		*
		* @apiPermission Authenticated and VC.View and VC.Modify Permission for the VISBO Center.
		* @apiError {number} 400 no valid setting definition
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a VISBO Center Setting
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/setting
		*  {
	  *    'name':'My first Setting',
		*    'type': 'Type of Setting',
		*    'timestamp': '2018-12-01',
	  *    'value': {'any name': 'any value'}
	  *  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Inserted VISBO Center Setting',
		*   'vcsetting':[{
		*     '_id':'vcsetting5c754feaa',
		*     'vcid': 'vc5c754feaa',
		*     'name':'My first Setting',
		*     'type': 'Type of Setting',
		*     'timestamp': '2018-12-01',
		*     'value': {'any name': 'any value'}
		*   }]
		* }
		*/

	// Create VISBO Center Setting
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var settingArea = 'public';

		req.auditDescription = 'VISBO Center Setting Create';
		req.auditInfo = req.body.name;

		logger4js.trace('Post a new VISBO Center Setting Req Body: %O Name %s', req.body, req.body.name);
		logger4js.info('Post a new VISBO Center Setting with name %s executed by user %s sysadmin %s', req.body.name, userId, req.query.sysadmin);

		if (req.body.name) req.body.name = (req.body.name || '').trim();
		if (req.body.type) req.body.type = (req.body.type || '').trim();
		if (!validate.validateName(req.body.name, false) || !req.body.value || !validate.validateObjectId(req.body.userId, true)
		|| !validate.validateDate(req.body.timestamp, true) || !validate.validateName(req.body.type, false)) {
			logger4js.debug('Post a new VISBO Center Setting body or value not accepted %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'No valid setting definition'
			});
		}
		if (privateSettings.findIndex(type => type == req.body.type) >= 0) {
			settingArea = 'private';
		} else if (req.body.userId == userId) {
			settingArea = 'personal';
		}
		var reqPermVC = constPermVC.View;
		if (settingArea == 'private') {
			reqPermVC = constPermVC.ManagePerm;
		} else if (settingArea == 'public') {
			reqPermVC = constPermVC.Modify;
		}
		if ((!req.query.sysadmin && !(req.listVCPerm.getPerm(req.params.vcid).vc & reqPermVC))
		|| (req.query.sysadmin && !(req.listVCPerm.getPerm(0).system & constPermSystem.Modify))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to create VISBO Center Setting',
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		}
		logger4js.debug('Post Setting to VC %s Permission is ok', req.params.vcid);
		var vcSetting = new VCSetting();
		vcSetting.name = req.body.name;
		vcSetting.vcid = req.params.vcid;
		vcSetting.value = req.body.value;
		vcSetting.type = 'Custom';
		if (req.body.userId) vcSetting.userId = req.body.userId;
		if (req.body.type) {
			if (restrictedSettings.findIndex(item => item == req.body.type) >= 0) {
				// not allowed to Create / Delete System Config Settings
				return res.status(409).send({
					state: 'failure',
					message: 'Not allowed to create this setting type'
				});
			}
			vcSetting.type = req.body.type;
		}
		// var newTimeStamp = req.body.timestamp || (req.body.value && req.body.value.validFrom);
		var newTimeStamp = req.body.timestamp;
		if (vcSetting.type == 'organisation') {
			// no longer allowed to change organisation through setting POST/PUT
			return res.status(400).send({
				state: 'failure',
				message: 'Organisation change only through separate ReST Call'
			});
		}
		newTimeStamp = Date.parse(newTimeStamp) ? new Date(newTimeStamp) : undefined;
		vcSetting.timestamp = newTimeStamp;

		vcSetting.save(function(err, oneVCSetting) {
			if (err) {
				errorHandler(err, res, `DB: POST VC Settings ${req.params.vcid} save`, `Error creating VISBO Center Setting ${req.oneVC.name}`);
				return;
			}
			req.oneVCSetting = oneVCSetting;
			return res.status(200).send({
				state: 'success',
				message: 'Inserted VISBO Center Setting',
				vcsetting: [ oneVCSetting ],
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		});
	});

router.route('/:vcid/setting/:settingid')

	/**
	  * @api {delete} /vc/:vcid/setting/:settingid Delete a Setting
	  * @apiVersion 1.0.0
	  * @apiGroup VISBO Center Properties
	  * @apiName DeleteVISBOCenterSetting
	  * @apiHeader {String} access-key User authentication token.
	  * @apiDescription Deletes the specified setting in the VISBO Center
	  *
		* @apiPermission Authenticated and VC.View and VC.Modify Permission for the VISBO Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete a VISBO Center Setting
		* @apiError {number} 409 VISBO Center Setting does not exists
		*
	  * @apiExample Example usage:
	  *   url: https://my.visbo.net/api/vc/:vcid/setting/:settingid
	  * @apiSuccessExample {json} Success-Response:
	  * HTTP/1.1 200 OK
	  * {
	  *   'state':'success',
	  *   'message':'VISBO Center Setting deleted'
	  * }
	  */

	// Delete VISBO Center Setting
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var settingArea = 'public';

		req.auditDescription = 'VISBO Center Setting Delete';
		req.auditInfo = req.oneVCSetting.name;

		logger4js.info('DELETE VISBO Center Setting for userid %s email %s and vc %s setting %s ', userId, useremail, req.params.vcid, req.params.settingid);

		if (privateSettings.findIndex(type => type == req.oneVCSetting.type) >= 0) {
			settingArea = 'private';
		} else if (req.oneVCSetting.userId && req.oneVCSetting.userId.toString() == userId) {
			settingArea = 'personal';
		}
		var reqPermVC = constPermVC.View;
		if (settingArea == 'private') {
			reqPermVC = constPermVC.ManagePerm;
		} else if (settingArea == 'public') {
			reqPermVC = constPermVC.Modify;
		}
		if ((!req.query.sysadmin && !(req.listVCPerm.getPerm(req.params.vcid).vc & reqPermVC))
		|| (req.query.sysadmin && !(req.listVCPerm.getPerm(0).system & constPermSystem.Modify))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete VISBO Center Setting',
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		}

		if (restrictedSettings.findIndex(item => item == req.oneVCSetting.type) >= 0) {
			// not allowed to Create / Delete System Config Settings
			return res.status(409).send({
				state: 'failure',
				message: 'Not allowed to delete this setting type'
			});
		}
		req.oneVCSetting.remove(function(err) {
			if (err) {
				errorHandler(err, res, `DB: DELETE VC Setting ${req.params.settingid} Delete`, `Error deleting VISBO Center Setting ${req.params.settingid}`);
				return;
			}
			return res.status(200).send({
				state: 'success',
				message: 'Deleted VISBO Center Setting'
			});
		});
	})

	/**
		* @api {put} /vc/:vcid/setting/:settingid Update a Setting
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName PutVISBOCenterSetting
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Put updates a setting definition inside the VISBO Center, the type and userId could not be changed for security reasons, use delete and create instead.
		*
		* @apiPermission Authenticated and VC.View and VC.Modify Permission for the VISBO Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Update a VISBO Center Setting
		* @apiError {number} 409 VISBO Center Setting does not exists or was updated in between.
		*
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/setting/:settingid
		*  {
	  *    'name':'My first Setting Renamed',
		*    'type': 'Type of Setting',
		*    'timestamp': '2018-12-02',
	  *    'value': 'any'
	  *   }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Setting',
		*   'vcsetting':[{
		*     '_id':'vcsetting5c754feaa',
		*     'vcid': 'vc5c754feaa',
		*     'name':'My first Setting Renamed',
		*     'type': 'Type of Setting',
		*     'timestamp': '2018-12-02',
		*     'value': {'any name': 'any value'}
		*   }]
		* }
		*/

	// change setting
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var settingChangeSMTP = false;
		var settingArea = 'public';

		req.auditDescription = 'VISBO Center Setting Update';
		req.auditInfo = (req.body.name || '').trim();

		logger4js.info('PUT VISBO Center Setting for userid %s email %s and vc %s setting %s ', userId, useremail, req.params.vcid, req.params.settingid);

		if (req.body.name) req.body.name = req.body.name.trim();
		if (!validate.validateName(req.body.name, true) || !validate.validateDate(req.body.timestamp, true)) {
			logger4js.debug('PUT a new VISBO Center Setting body or value not accepted %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'No valid setting definition'
			});
		}

		if (req.auditInfo && req.auditInfo != req.oneVCSetting.name) {
			req.auditInfo = req.oneVCSetting.name.concat(' / ', req.body.name);
		}
		logger4js.debug('Found the Setting for VC Updated');

		if (privateSettings.findIndex(type => type == req.oneVCSetting.type) >= 0) {
			settingArea = 'private';
		} else if (req.oneVCSetting.userId && req.oneVCSetting.userId.toString() == userId) {
			settingArea = 'personal';
		}
		var reqPermVC = constPermVC.View;
		if (settingArea == 'private') {
			reqPermVC = constPermVC.ManagePerm;
		} else if (settingArea == 'public') {
			reqPermVC = constPermVC.Modify;
		}

		if ((!req.query.sysadmin && !(req.listVCPerm.getPerm(req.params.vcid).vc & reqPermVC))
		|| (req.query.sysadmin && !(req.listVCPerm.getPerm(0).system & constPermSystem.Modify))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Change VISBO Center Setting',
				perm: req.listVCPerm.getPerm(req.query.sysadmin? 0 : req.oneVC._id)
			});
		}
		if (req.body.updatedAt && Date.parse(req.body.updatedAt) && req.oneVCSetting.updatedAt.getTime() != (new Date(req.body.updatedAt)).getTime()) {
			logger4js.info('VC Setting: Conflict with updatedAt %s %s', req.oneVCSetting.updatedAt.getTime(), (new Date(req.body.updatedAt)).getTime());
			return res.status(409).send({
				state: 'failure',
				message: 'VISBO Center Setting already updated inbetween',
				vcsetting: [ req.oneVCSetting ],
				perm: req.listVCPerm.getPerm(req.query.sysadmin? 0 : req.oneVC._id)
			});
		}
		var isSystemVC = getSystemVC()._id.toString() == req.oneVCSetting.vcid.toString();
		var isTask = isSystemVC && req.oneVCSetting.type == 'Task' ? true: false;
		var isSysConfig = isSystemVC && req.oneVCSetting.type == 'SysConfig' ? true: false;
		var isVCConfig = req.oneVCSetting.type == '_VCConfig' ? true: false;

		if (!isTask) {
			if (isSysConfig) {
				// only update Value do not change name, type, timestamp and userId
				logger4js.info('Update System Setting for VC %O', req.body.value);
				var password = '';
				if (req.oneVCSetting.name == 'SMTP') {
					if (req.oneVCSetting.value && req.oneVCSetting.value.auth && req.oneVCSetting.value.auth.pass)
						settingChangeSMTP = true;
						password = req.oneVCSetting.value.auth.pass;
				}
				if (req.body.value) req.oneVCSetting.value = req.body.value;
				if (settingChangeSMTP) {
					if (req.body.value.auth && req.body.value.auth.pass) {
						// encrypt new password before save
						req.oneVCSetting.value.auth.pass = crypt.encrypt(req.body.value.auth.pass);
						logger4js.warn('Update SMTP Setting New Password');

					} else {
						// restore old encrypted password
						req.oneVCSetting.value.auth.pass = password;
					}
				}
			} else if (isVCConfig) {
				// Change Limit & Setting for VC
				var newValue = Object.assign({}, req.oneVCSetting.value);			//make a copy of the object to allow recognize change for mongoose
				var reqValue = req.body.value;

				var changedValue, changedVCValue, changedLimit;
				if (isSystemVC && reqValue) {
					// Change it for the System itself and populate it to the VCs
					logger4js.debug('PUT update _VCConfig for systemVC', req.oneVCSetting.name, req.oneVCSetting.value);
					changedValue = false;
					changedVCValue = false;
					changedLimit = false;
					if (reqValue.systemEnabled != undefined) {
						reqValue.systemEnabled = reqValue.systemEnabled ? true : false;
						if (newValue.systemEnabled != reqValue.systemEnabled) {
							changedValue = true;
							newValue.systemEnabled = reqValue.systemEnabled;
						}
					}
					if (reqValue.sysVCEnabled != undefined) {
						reqValue.sysVCEnabled = reqValue.sysVCEnabled ? true : false;
						if (newValue.sysVCEnabled != reqValue.sysVCEnabled) {
							changedVCValue = true;
							newValue.sysVCEnabled = reqValue.sysVCEnabled;
						}
					}
					if (reqValue.sysVCLimit != undefined) {
						reqValue.sysVCLimit = reqValue.sysVCLimit ? true : false;
						if (newValue.sysVCLimit != reqValue.sysVCLimit) {
							changedVCValue = true;
							newValue.sysVCLimit = reqValue.sysVCLimit;
						}
					}
					if (reqValue.systemLimit != undefined) {
						reqValue.systemLimit = reqValue.systemLimit ? true : false;
						if (newValue.systemLimit != reqValue.systemLimit) {
							changedLimit = true;
							newValue.systemLimit = reqValue.systemLimit;
						}
					}
					if (changedValue || changedVCValue || changedLimit) {
						req.oneVCSetting.value = newValue;
					}
					if (changedLimit || (changedValue && newValue.systemLimit)) {
						logger4js.debug('PUT update _VCConfig for systemVC set/unset SystemLimit', req.oneVCSetting.name, req.oneVCSetting.value.systemLimit, req.oneVCSetting.value.systemEnabled);
						// populate to all VCs
						populateVCConfig(req.oneVCSetting, 'System');
					}
					if (changedVCValue) {
						logger4js.debug('PUT update _VCConfig for all sysVC set sysVCEnabled', req.oneVCSetting.name, req.oneVCSetting.value.systemEnabled);
						// populate to all VCs
						populateVCConfig(req.oneVCSetting, 'sysVC');
					}
				} else if (req.query.sysadmin && reqValue) {
					// Change it as sysadmin for a specific VC
					logger4js.debug('PUT update _VCConfig as sysadmin for VC', req.oneVCSetting.vcid, req.oneVCSetting.name, req.oneVCSetting.value);
					changedValue = false;
					changedLimit = false;
					if (reqValue.sysVCEnabled != undefined) {
						reqValue.sysVCEnabled = reqValue.sysVCEnabled ? true : false;
						if (newValue.sysVCEnabled != reqValue.sysVCEnabled) {
							changedValue = true;
							newValue.sysVCEnabled = reqValue.sysVCEnabled;
						}
					}
					if (reqValue.sysVCLimit != undefined) {
						reqValue.sysVCLimit = reqValue.sysVCLimit ? true : false;
						if (newValue.sysVCLimit != reqValue.sysVCLimit) {
							changedLimit = true;
							newValue.sysVCLimit = reqValue.sysVCLimit;
						}
					}
					// accept change only if systemLimit is not set
					if (newValue.systemLimit && (changedValue || changedLimit)) {
						return res.status(409).send({
							state: 'failure',
							message: 'VISBO Center Setting is set as System Limit',
							vcsetting: [ req.oneVCSetting ]
						});
					}
					if (changedValue || changedLimit) {
						req.oneVCSetting.value = newValue;
					}
				} else if (reqValue) {
					// Change it as VC Admin for a specific VC
					logger4js.debug('PUT update _VCConfig as VC admin for VC', req.oneVCSetting.vcid, req.oneVCSetting.name, req.oneVCSetting.value);
					if (reqValue.VCEnabled != undefined) {
						reqValue.VCEnabled = reqValue.VCEnabled ? true : false;
						if (newValue.VCEnabled != reqValue.VCEnabled) {
							if (newValue.systemLimit || newValue.sysVCLimit) {
								return res.status(409).send({
									state: 'failure',
									message: 'VISBO Center Setting is set as Limit',
									vcsetting: [ req.oneVCSetting ]
								});
							} else {
								newValue.VCEnabled = reqValue.VCEnabled;
							}
							req.oneVCSetting.value = newValue;
						}
					}
				}
			} else {
				if (req.oneVCSetting.type == 'organisation') {
					// no longer allowed to change organisation through setting POST/PUT
					return res.status(400).send({
						state: 'failure',
						message: 'Organisation change only through separate ReST Call'
					});
				}
				// allow to change name and value
				if (req.body.name) req.oneVCSetting.name = req.body.name;
				if (req.body.value) req.oneVCSetting.value = req.body.value;
			}
			req.oneVCSetting.save(function(err, resultVCSetting) {
				if (err) {
					errorHandler(err, res, `DB: PUT VC Setting ${req.params.settingid} Save`, 'Error updating VISBO Center Setting');
					return;
				}
				if (isSysConfig || isVCConfig) {
					if (resultVCSetting.name == 'DEBUG') {
						logger4js.debug('Update System Log Setting');
						logging.setLogLevelConfig(resultVCSetting.value);
					}
					reloadSystemSetting();
				}
				if (settingChangeSMTP) {
					resultVCSetting.value.auth.pass = '';
				}
				req.oneVCSetting = resultVCSetting;
				logger4js.debug('Update Setting %s Value %O', req.oneVCSetting._id, req.oneVCSetting);
				return res.status(200).send({
					state: 'success',
					message: 'Updated VISBO Center Setting',
					vcsetting: [ resultVCSetting ],
					perm: req.listVCPerm.getPerm(req.query.sysadmin? 0 : req.oneVC._id)
				});
			});
		} else {
			// Special Handling for Tasks required to avoid parallel updates by ReST and Task-Schedule
			if (req.oneVCSetting.value && req.body.value) {
				// only update nextRun, interval and taskSpecific, do not change type, name, timestamp, userId
				if (req.body.value.interval) req.oneVCSetting.value.interval = req.body.value.interval;
				if (req.body.value.taskSpecific) req.oneVCSetting.value.taskSpecific = req.body.value.taskSpecific;
				req.oneVCSetting.value.nextRun = (req.body.value.nextRun && Date.parse(req.body.value.nextRun)) ? new Date(req.body.value.nextRun) : new Date();
			}
			var updateQuery = {_id: req.oneVCSetting._id, '$or': [{'value.lockedUntil': {$exists: false}}, {'value.lockedUntil': {$lt: new Date()}}]};
			var updateOption = {upsert: false};
			var updateUpdate = {$set : {'value.nextRun' : req.oneVCSetting.value.nextRun, 'value.interval' : req.oneVCSetting.value.interval, 'value.taskSpecific' : req.oneVCSetting.value.taskSpecific} };
			logger4js.debug('VC Seting Task (%s/%s) Before Save %O', req.oneVCSetting.name, req.oneVCSetting._id, req.oneVCSetting);

			VCSetting.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
					if (err) {
						errorHandler(err, undefined, 'DB: VC Setting Update Task', undefined);
					}
					logger4js.debug('VC Seting Task (%s/%s) Saved %O', req.oneVCSetting.name, req.oneVCSetting._id, result);
					if (result.nModified == 1) {
						return res.status(200).send({
							state: 'success',
							message: 'Updated VISBO Center Setting',
							vcsetting: [ req.oneVCSetting ],
							perm: req.listVCPerm.getPerm(req.query.sysadmin? 0 : req.oneVC._id)
						});
					} else {
						logger4js.info('VC Seting Task (%s/%s) locked already by another Server', req.oneVCSetting.name, req.oneVCSetting._id);
						return res.status(409).send({
							state: 'failure',
							message: 'VISBO Center Setting already updated inbetween',
							vcsetting: [ req.oneVCSetting ],
							perm: req.listVCPerm.getPerm(req.query.sysadmin? 0 : req.oneVC._id)
						});
					}
			});
		}
	});

router.route('/:vcid/capacity')

	/**
		* @api {get} /vc/:vcid/capacity Get Capacity of Visbo Center
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName GetVISBOCenterCapacity
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets the capacity numbers for the specified VISBO Center.
		* With additional query paramteters the list could be configured. Available Parameters are: refDate, startDate & endDate, roleID and hierarchy
		* A roleID must be specified. If hierarchy is true, the capacity for the first level of subroles are delivered in addition to the main role.
		*
		* @apiParam {Date} refDate the latest VPV with a timestamp before the reference date is used for calculation, if ommited the current Date is used.
		* Date Format is in the form: 2018-10-30T10:00:00Z
		* @apiParam {Date} startDate Deliver only capacity values beginning with month of startDate, default is today
		* @apiParam {Date} endDate Deliver only capacity values ending with month of endDate, default is today + 6 months
		* @apiParam {String} roleID Deliver the capacity planning for the specified organisaion-uid, default is complete organisation
		* @apiParam {Boolean} hierarchy Deliver the capacity planning including all dircect childs of roleID
		* @apiParam {Boolean} pfv Deliver the capacity planning compared to PFV instead of total capacity
		* @apiParam {Boolean} perProject Deliver the capacity per project and cumulative
		*
		* @apiPermission Authenticated and VC.View and VC.Modify or VC.ViewAudit for the VISBO Center.
		* In addition the Project List of the VC is filtered to all the Projects in the VISBO Center where the user has VP.View Permission and VP.ViewAudit or VP.Modify permission.
		* If the user has VP.ViewAudit Permission for all Projects with View Permission, he gets in addition to the PD Values also the money values.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to generate Capacity Figures for the VISBO Center
		* @apiError {number} 409 No Organisation configured in the VISBO Center
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/capacity?roleID=1
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Capacity',
		*   'vc':[{
		*     '_id':'vc5c754feaa',
		*     'name':'VISBO Center Name',
		*     'capacity': [{
						'month': 2020-05-01T00:00:00.000Z,
						....
					}]
		*   }]
		* }
		*/

	// get VC Capacity
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var roleID = req.query.roleID;
		var parentID = req.query.parentID;
		var hierarchy = req.query.hierarchy == true;
		var perProject = req.query.perProject == true;

		var perm = req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id);

		req.auditDescription = 'VISBO Center Capacity Read';

		if ((perm.vc & (constPermVC.ViewAudit + constPermVC.Modify)) == 0) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to calculate Capacity',
				perm: perm
			});
		}

		logger4js.info('Get VISBO Center Capacity for userid %s email %s and vc %s RoleID %s Hierarchy %s', userId, useremail, req.params.vcid, roleID, hierarchy);
		if (!req.visboOrganisation) {
			return res.status(409).send({
				state: 'failure',
				message: 'No VISBO Center Organisation',
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		}
		var onlyPT = true;
		if (req.listVCPerm.getPerm(req.params.vcid).vc & constPermVC.ViewAudit) {
			onlyPT = false;
		}
		var listVPV = [];
		req.listVPV && req.listVPV.forEach(vpv => {
				var perm = req.listVPPerm.getPerm(vpv.vpid).vp;
				if (perm & constPermVP.ViewAudit == 0) {
					onlyPT = true;
				}
				if ((perm & (constPermVP.ViewAudit + constPermVP.Modify)) > 0) {
					listVPV.push(vpv);
				}
			});
		var listVPVPFV = [];
		req.listVPVPFV && req.listVPVPFV.forEach(vpv => {
				var perm = req.listVPPerm.getPerm(vpv.vpid).vp;
				if (perm & constPermVP.ViewAudit == 0) {
					onlyPT = true;
				}
				if ((perm & (constPermVP.ViewAudit + constPermVP.Modify)) > 0) {
					listVPVPFV.push(vpv);
				}
			});

		var capacity = undefined;
		if (perProject) {
			capacity = visboBusiness.calcCapacitiesPerProject(listVPV, listVPVPFV, roleID, parentID, req.query.startDate, req.query.endDate, req.visboOrganisation, req.visboVCCapacity, onlyPT);
		} else {
			capacity = visboBusiness.calcCapacities(listVPV, listVPVPFV, roleID, parentID, req.query.startDate, req.query.endDate, req.visboOrganisation, req.visboVCCapacity, hierarchy, onlyPT);
		}

		var filteredCapacity = [];
		var startDate = validate.validateDate(req.query.startDate, false, true);
		if (!startDate) {
			startDate = new Date(-8640000000000000);
		}
		var endDate = validate.validateDate(req.query.endDate, false, true);
		if (!endDate) {
			endDate = new Date(8640000000000000);
		}

		capacity.forEach(item => {
				var current = new Date(item.month);
				if (current.getTime() >= startDate.getTime() && current.getTime() <= endDate.getTime()) {
					filteredCapacity.push(item);
				}
		});

		req.auditInfo = '';
		return res.status(200).send({
			state: 'success',
			message: 'Returned VISBO Center Capacity',
			// count: capacity.length,
			vc: [ {
				_id: req.oneVC._id,
				name: req.oneVC.name,
				description: req.oneVC.description,
				roleID: roleID,
				vpCount: req.oneVC.vpCount,
				createdAt: req.oneVC.createdAt,
				updatedAt: req.oneVC.updatedAt,
				capacity: filteredCapacity
			} ]
		});
	});

router.route('/:vcid/capa')

	/**
		* @api {get} /vc/:vcid/capa Get all capacities of persons
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName GetVISBOCenterCapa
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets all capa records of the specified VISBO Center there the user has permission to.
		*
		* With additional query paramteters the amount of settings can be restricted. Available Restirctions are: roleID.
		*
		* @apiParam {Number} roleID only capa values for a specific user
		* @apiParam {Date} startOfYear only capa values for this date or later
		*
		* @apiPermission Authenticated and VC.View & (VC.Audit || VC.Modify) Permission for the VISBO Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View the VISBO Center Capacities
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/capa
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Settings',
		*   'vcsetting':[{
		*     '_id':'vcsetting5c754feaa',
		*     'vcid': 'vc5c754feaa',
		*     'name':'Setting Name',
		*     'userId': 'us5c754feab',
		*     'type': 'Type of Setting',
		*     'timestamp': '2018-12-01',
		*     'value': {'any name': 'any value'}
		*   }]
		* }
		*/

	// get VC Capa
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'VISBO Center User Capacity Read';
		req.auditTTLMode = 1;

		logger4js.info('Get VISBO Center User Capacity for userid %s email %s and vc %s ', userId, useremail, req.params.vcid);
		var query = {};
		query.vcid = req.oneVC._id;
		var roleID = validate.validateNumber(req.query.roleID, false);
		if (roleID >= 0) {
			query.roleID = roleID;
		}

		var queryVCCapacity = VCCapacity.find(query);
		queryVCCapacity.sort('roleID startOfYear');
		queryVCCapacity.lean();
		queryVCCapacity.exec(function (err, listVCCapacity) {
			if (err) {
				errorHandler(err, res, `DB: GET VC User Capacity ${req.oneVC._id} Find`, `Error getting User Capacity for VISBO Center ${req.oneVC.name}`);
				return;
			}
			req.auditInfo = listVCCapacity.length;
			return res.status(200).send({
				state: 'success',
				message: 'Returned VISBO Center User Capacities',
				count: listVCCapacity.length,
				capacity: listVCCapacity
			});
		});
	})

	/**
		* @api {post} /vc/:vcid/capa Create Capacity Entry for OrgaUnit of Visbo Center
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName CreateVISBOCenterCapacity
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Creates a new capacity entry for an organization unit for a calendar year.
		* A roleID and the startOfYear must be specified.
		*
		* @apiPermission Authenticated and VC.View and VC.Modify for the VISBO Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to create capacity for the VISBO Center
		* @apiError {number} 400 Unknown roleID or no valid startOfYear
		* @apiError {number} 409 No Organisation configured in the VISBO Center
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/capa
		* {
 	  *  'roleID': 11,
 	  *  'startOfYear': '2021-01-01',
		*  'capaPerMonth': [10, 12, 8]
 	  * }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Successfully created new capacity definition',
		*   'capacity':[{
		*     '_id':'vccapa5c754feaa',
		*     'roleID': 11,
		*     'startOfYear': '2021-01-01T00:00:00.000Z'
		*     'capaPerMonth': [10, 12, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		*   }]
		* }
		*/

	// post VC Capacity
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		var perm = req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id);

		req.auditDescription = 'VISBO Center Capacity Create';
		logger4js.info('Post VISBO Center Capacity for userid %s email %s and vc %s RoleID %s', userId, useremail, req.params.vcid, req.body.roleID);

		if ((perm.vc & constPermVC.Modify) == 0) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to create Capacity',
				perm: perm
			});
		}

		var roleID = validate.validateNumber(req.body.roleID, false);
		var startOfYear = validate.validateDate(req.body.startOfYear, true, true);
		if (!startOfYear || roleID == undefined) {
			logger4js.debug('Post a new VISBO Center Capacity body not accepted %O', req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'No valid capacity definition'
			});
		}
		startOfYear.setMonth(0);
		startOfYear.setDate(1);
		startOfYear.setHours(0, 0, 0, 0);

		if (!req.visboOrganisation) {
			return res.status(409).send({
				state: 'failure',
				message: 'No VISBO Center Organisation',
				perm: perm
			});
		}

		// check if roleID is defined in the latest organisation
		var allRoles = req.visboOrganisation[0].value.allRoles;
		var role = allRoles.find(role => role.uid == roleID);
		if (!role || role.isSummaryRole || role.isTeam) {
			return res.status(400).send({
				state: 'failure',
				message: `RoleID ${roleID} unknonw in actual Organisation`,
				perm: perm
			});
		}

		var newCapacity = new VCCapacity();
		newCapacity.vcid = req.oneVC._id;
		newCapacity.roleID = roleID;
		newCapacity.startOfYear = startOfYear;
		newCapacity.capaPerMonth = [];

		if (!req.body.capaPerMonth || req.body.capaPerMonth.length != 12) {
			return res.status(400).send({
				state: 'failure',
				message: `Capacity Definition needs to have a capacity per month (12) ${JSON.stringify(req.body)}`,
				perm: perm
			});
		}
		req.body.capaPerMonth.forEach(item => {
			var capaPerMonth = validate.validateNumber(item, true);
			if (newCapacity.capaPerMonth.length < 12) {
				newCapacity.capaPerMonth.push(capaPerMonth);
			}
		});

		logger4js.debug('Save VISBO Center Capacity %s %s %s', newCapacity.vcid, newCapacity.roleID, newCapacity.startOfCal);
		newCapacity.save(function(err, capacity) {
			if (err) {
				errorHandler(err, res, `DB: POST VC Capacity ${req.oneVC._id} Save`, `Failed to create VISBO Center Capacity ${req.oneVC._id}`);
				return;
			}

			req.auditInfo = '';
			return res.status(200).send({
				state: 'success',
				message: 'Successfully created new capacity definition',
				capacity: [ capacity ]
			});
		});
	});

router.route('/:vcid/capa/:capaid')
	/**
		* @api {put} /vc/:vcid/capa/:capaid Update a User capacity
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName UpdateVISBOCenterUserCapacity
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Updates the capaPerMonth for a specific roleID and calendar year
		*
		* @apiPermission Authenticated and VC.View and VC.Modify Permission for the VISBO Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Update a VISBO Center User Capacity
		* @apiError {number} 409 VISBO Center User Capacity does not exists
		*
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/capa/:capaid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'VISBO Center User Capacity updated'
		* }
		*/
	// Update VISBO Center User Capa
	.put(function(req, res) {
		req.auditDescription = 'VISBO Center User Capacicty Update';
		req.auditInfo = '';

		var reqPermVC = constPermVC.View + constPermVC.Modify;
		if ((req.listVCPerm.getPerm(req.params.vcid).vc & reqPermVC) != reqPermVC) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to update VISBO Center User Capacity',
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		}
		if (!req.body.capaPerMonth || req.body.capaPerMonth.length != 12) {
			return res.status(400).send({
				state: 'failure',
				message: `Capacity Definition needs to have a capacity per month (12) ${JSON.stringify(req.body)}`
			});
		}

		var query = {};
		query.vcid = req.oneVC._id;
		query._id = req.params.capaid;
		var queryVCCapa = VCCapacity.findOne(query);
		queryVCCapa.exec(function (err, capa) {
			if (err) {
				errorHandler(err, res, `DB: Get VC User Capacity ${req.oneVC._id} Find`, `Error getting User Capacity for VISBO Center ${req.oneVC.name}`);
				return;
			}
			if (capa) {
				req.auditInfo = capa.roleID.toString().concat(' / ', capa.startOfYear.toISOString().substr(0, 10));
				capa.capaPerMonth = [];
				req.body.capaPerMonth.forEach(item => {
					capa.capaPerMonth.push(validate.validateNumber(item, true));
				});
				capa.save(function(err, oneCapa) {
					if (err) {
						errorHandler(err, res, `DB: Update VC User Capacity ${req.params.capaid} Update`, `Error updating VISBO Center User Capacity ${req.params.capaid}`);
						return;
					}
					return res.status(200).send({
						state: 'success',
						message: 'Updated VISBO Center User Capacity',
						capacity: [oneCapa]
					});
				});
			} else {
				return res.status(409).send({
					state: 'failure',
					message: 'VISBO Center User Capacity does not exists',
					perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
				});
			}
		});
	})

	/**
		* @api {delete} /vc/:vcid/capa/:capaid Delete a User capacity
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName DeleteVISBOCenterUserCapacity
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Deletes a specific user capacity for a specific roleID and calendar year
		*
		* @apiPermission Authenticated and VC.View and VC.Modify Permission for the VISBO Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete a VISBO Center User Capacity
		* @apiError {number} 409 VISBO Center User Capacity does not exists
		*
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/capa/:capaid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'VISBO Center User Capacity deleted'
		* }
		*/
	// Delete VISBO Center User Capa
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'VISBO Center User Capacity Delete';
		req.auditInfo = '';

		logger4js.info('DELETE VISBO Center User Capacity for userid %s email %s and vc %s setting %s ', userId, useremail, req.params.vcid, req.params.capaid);

		var reqPermVC = constPermVC.View + constPermVC.Modify;
		if ((req.listVCPerm.getPerm(req.params.vcid).vc & reqPermVC) != reqPermVC) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete VISBO Center User Capacity',
				perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
			});
		}
		var query = {};
		query.vcid = req.oneVC._id;
		query._id = req.params.capaid;
		var queryVCCapa = VCCapacity.findOne(query);
		queryVCCapa.exec(function (err, capa) {
			if (err) {
				errorHandler(err, res, `DB: GET VC User Capacity ${req.oneVC._id} Find`, `Error getting User Capacity for VISBO Center ${req.oneVC.name}`);
				return;
			}
			if (capa) {
				req.auditInfo = capa.roleID.toString().concat(' / ', capa.startOfYear.toISOString().substr(0, 10));
				capa.remove(function(err) {
					if (err) {
						errorHandler(err, res, `DB: DELETE VC User Capacity ${req.params.capaid} Delete`, `Error deleting VISBO Center User Capacity ${req.params.capaid}`);
						return;
					}
					return res.status(200).send({
						state: 'success',
						message: 'Deleted VISBO Center User Capacity'
					});
				});
			} else {
				return res.status(409).send({
					state: 'failure',
					message: 'VISBO Center User Capacity does not exists',
					perm: req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id)
				});
			}
		});
	});

router.route('/:vcid/predict')

	/**
		* @api {get} /vc/:vcid/predict Get Predict Statistics
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName GetVISBOCenterPredict
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets all groups of the specified VISBO Center
		*
		* @apiPermission Authenticated and sysAdmin and VC.View Permission for the VISBO Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View VISBO Center, or VISBO Center does not exists
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/predict
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Returned VISBO Center Predict Statistics',
		*   'count': 100,
		*   'vp':[{
		*     '_id':'vp5c754feaa',
		*     'name':'Project Name',
		*     'vcid': 'vc5c754feaa',
		*     'vpvCount': 10
		*   }]
		* }
		*/

	// Get VC Predict Statistics
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;
		var perm = req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id);

		req.auditDescription = 'VISBO Center Predict Read';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		if (!isSysAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to get Predict Statistics',
				perm: perm
			});
		}

		logger4js.info('Get VISBO Center Predict for userid %s email %s and vc %s oneVC %s Perm %O', userId, useremail, req.params.vcid, req.oneVC.name, req.listVCPerm.getPerm(isSysAdmin ? 0 : req.params.vcid));
		var aggregateQuery = [
			{$match: {vcid: req.oneVC._id}},
			{
				$group: {
					_id: '$vpid',
					vpvCount: { $sum: 1}
				}
			},
			{
				$lookup: {
					from: 'visboprojects',
					localField: '_id',
					foreignField: '_id',  // field in the items collection
					as: 'vp'
				}
			},
			{$unwind: '$vp'}
		];
		var queryVCPredictKM = PredictKM.aggregate(aggregateQuery);
		queryVCPredictKM.exec(function (err, listVP) {
			if (err) {
				errorHandler(err, res, `DB: GET VC Predict ${req.oneVC._id} `, `Error getting Predict Information for VISBO Center ${req.oneVC.name}`);
				return;
			}
			var totalVersions = 0;
			listVP.forEach(item => totalVersions += item.vpvCount || 0);
			logger4js.info('Found %d Projects for VC with total Versions %d', listVP.length, totalVersions);
			req.auditInfo = totalVersions;
			var list = [];
			listVP.forEach(item => list.push({_id: item.vp._id, name: item.vp.name, vcid: item.vp.vcid, vpvCount: item.vpvCount }));
			return res.status(200).send({
				state: 'success',
				message: 'Returned VISBO Center Predict Statistics',
				count: totalVersions,
				vp: list
			});
		});
	})

	/**
		* @api {delete} /vc/:vcid/predict Delete Predict Training
		* @apiVersion 1.0.0
		* @apiGroup VISBO Center Properties
		* @apiName DeleteVISBOCenterPredict
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Deletes the training data of the VISBO Center
		*
		* @apiPermission Authenticated and sysAdmin and VC.View and VC.Delete for the VISBO Center.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete VISBO Center Training Data
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/vc/:vcid/predict
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Deleted VISBO Center Predict Training'
		* }
		*/

	// Delete VISBO Center Predict Training
	.delete(function(req, res) {
		var isSysAdmin = req.query.sysadmin ? true : false;
		var perm = req.listVCPerm.getPerm(req.oneVC.system? 0 : req.oneVC._id);

		req.auditDescription = 'VISBO Center Predict Training Delete';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		if (!isSysAdmin || (perm.system & constPermSystem.DeleteVC)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete Predict Training',
				perm: perm
			});
		}
		var queryPredict = {vcid: req.oneVC._id};
		PredictKM.deleteMany(queryPredict, function (err) {
			if (err){
				logger4js.error('DB: Problem Deleting Predict Training for VC %s', req.oneVC._id, err.message);
			}
			logger4js.debug('VC Predict Deleted: %s', req.oneVC._id);
			return res.status(200).send({
				state: 'success',
				message: 'Deleted VISBO Center Predict Training'
			});
		});
	});

module.exports = router;
