var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');
var crypt = require('./../components/encrypt');


var assert = require('assert');
var auth = require('./../components/auth');
var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;
var verifyVc = require('./../components/verifyVc');
var verifyVg = require('./../components/verifyVg');
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
var VCRole = mongoose.model('VCRole');
var VCCost = mongoose.model('VCCost');
var VCSetting = mongoose.model('VCSetting');
var VisboAudit = mongoose.model('VisboAudit');

var Const = require('../models/constants')
var constPermVC = Const.constPermVC
var constPermVP = Const.constPermVP
var constPermSystem = Const.constPermSystem

var mail = require('../components/mail');
var ejs = require('ejs');
var read = require('fs').readFileSync;
var sanitizeHtml = require('sanitize-html');

var logging = require('../components/logging');
var logModule = "VC";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// Register the VC middleware to check that the user has access to the VC
router.use('/', verifyVc.getAllGroups);
// Register the VC middleware to check the vcid param
router.param('vcid', verifyVc.getVcidGroups);
// Register the Group middleware to check the groupid param
router.param('groupid', verifyVg.getGroupId);
// Register the UserId middleware to check the userid param
router.param('userid', verifyVg.checkUserId);

var findUser = function(currentUser) {
		return currentUser == this;
}

var findUserList = function(currentUser) {
		//console.log("compare %s %s", currentUser.email, this);
		return currentUser.email == this;
}

var findUserById = function(currentUser) {
	// logger4js.info("FIND User by ID %s with %s result %s", this, currentUser.userId, currentUser.userId.toString() == this.toString());
	return currentUser.userId.toString() == this.toString();
}

// Generates hash using bCrypt
var createHash = function(secret){
	return bCrypt.hashSync(secret, bCrypt.genSaltSync(10), null);
};

// updates the VC Name in the VP after rename VC
var updateVCName = function(vcid, name){
	var updateQuery = {vcid: vcid, $or: [{deletedAt: {$exists: false}},{'vc.deletedAt': {$exists: false}}]} ;
	var updateOption = {upsert: false};
	var updateUpdate = {$set: {"vc.name": name}};

	logger4js.debug("Update VPs for VC %s with new Name %s", vcid, name)
	VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating VPs for VC ${vcid}`, undefined)
		}
		logger4js.trace("Updated VP for VC %s Populate Name changed %d %d", vcid, result.n, result.nModified)
	})
}

// undelete the VPs after undelete VC and set the actual VC Name
var unDeleteVP = function(vcid, name){

	var updateQuery = {vcid: vcid, 'vc.deletedAt': {$exists: true}};
	var updateOption = {upsert: false};
	var updateUpdate = {$unset: {'vc.deletedAt': new Date()}, $set: {"vc.name": name}};

	logger4js.debug("Update VPs for VC %s with new Name %s", vcid, name)
	VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating VPs for VC ${vcid} set undelete`, undefined)
		}
		logger4js.trace("Updated VP for VC %s set undelete changed %d %d", vcid, result.n, result.nModified)
	})
}

// undelete the Groups after undelete VC
var unDeleteGroup = function(vcid){
	var updateQuery = {vcid: vcid, 'deletedByParent': 'VC'};
	var updateOption = {upsert: false};
	var updateUpdate = {$unset: {'deletedByParent': ''}};

	logger4js.debug("Update Groups for VC %s", vcid)
	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, `DB: Problem updating Groups for VC ${vcid} set undelete`, undefined)
		}
		logger4js.trace("Updated Groups for VC %s set undelete changed %d %d", vcid, result.n, result.nModified)
	})
}

/////////////////
// Visbo Center API
// /vc
/////////////////

router.route('/')
	/**
	* @api {get} /vc Get Visbo Centers
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center
	* @apiName GetVisboCenters
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get retruns all VC where the user has access permission to
	* In case of success it delivers an array of VCs, the array contains in each element a VC
	* if systemvc is specified only the systemvc is retrieved if the user has permission to see it
	* @apiPermission Permission: Authenticated, View Visbo Center.
	* In case of AppAdmin Parameters the User needs to have View Visbo Center Permission on System Level.
	* @apiParam (Parameter AppAdmin) {Boolean} [deleted=false]  Request Deleted VCs
	* @apiParam (Parameter AppAdmin) {Boolean} [systemvc=false]  Optional Request System VC
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false]  Optional Request VCs for Appl. Admin User
	* @apiError {number} 401 user not authenticated, the <code>token</code> is no longer valid
	* @apiExample Example usage:
	* url: http://localhost:3484/vc
	* url: http://localhost:3484/vc?systemvc=true&deleted=true
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state": "success",
	*   "message": "Returned Visbo Centers",
	*   "vc":[{
	*      "_id": "vc541c754feaa",
	*      "updatedAt": "2018-03-16T12:39:54.042Z",
	*      "createdAt": "2018-03-12T09:54:56.411Z",
	*      "name": "My new VisobCenter",
	*      "vpCount": "0"
	*   }]
	* }
	*/
	// Get Visbo Centers
	.get(function(req, res) {
			// no need to check authentication, already done centrally
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var isSysAdmin = req.query.sysadmin ? true : false;

			req.auditDescription = 'Visbo Center (Read)';
			req.auditSysAdmin = isSysAdmin;
			req.auditTTLMode = 1;

			logger4js.info("Get Visbo Center for user %s sysAdmin %s", useremail, req.query.sysadmin);

			var query = {};
			// Get all VCs there the user Group is assigned to
			if (!isSysAdmin) {
				var vcidList = [];
				for (var i=0; i < req.permGroups.length; i++) {
					vcidList.push(req.permGroups[i].vcid)
				}
				logger4js.debug("Get Visbo Center with %d Group VCIDs", vcidList.length);
				query._id = {$in: vcidList};
			}

			// check for deleted only for sysAdmins
			if (isSysAdmin && req.query.deleted) {
				query.deletedAt = {$exists: true}				//  deleted
			} else {
				query.deletedAt = {$exists: false}				// Not deleted
			}
			query.system = req.query.systemvc ? {$eq: true} : {$ne: true};						// do not show System VC
			logger4js.trace("Check for VC query %O", query);

			var queryVC = VisboCenter.find(query);
			queryVC.select('-users');
			queryVC.exec(function (err, listVC) {
				if (err) {
					errorHandler(err, res, `DB: GET VCs`, `Error getting VisboCenters`)
					return;
				}
				logger4js.debug("Found VCs %d", listVC.length);
				req.auditInfo = listVC.length;

				if (isSysAdmin) {
					return res.status(200).send({
						state: 'success',
						message: 'Returned Visbo Centers',
						count: listVC.length,
						vc: listVC,
						perm: req.combinedPerm
					});
				} else {
					return res.status(200).send({
						state: 'success',
						message: 'Returned Visbo Centers',
						count: listVC.length,
						vc: listVC
					});
				}
			});
		})

	/**
	 * @api {post} /vc Create a Visbo Center
	 * @apiVersion 1.0.0
	 * @apiGroup Visbo Center
	 * @apiName CreateVisboCenters
	 * @apiDescription Post creates a new VC with a unique name and  a description.
	 * Optinal initial admin can be defined who will get Visbo Center Administrator, if none is specified, the current user is added.
	 * In case of success it delivers an array of VCs. The array contains one element for the created VC.
	 * @apiHeader {String} access-key User authentication token.
	 * @apiPermission Authenticated and System Permission: View Sytem, Create Visbo Center.
	 * @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	 * @apiError {number} 400 missing name of Visbo Center during Creation
	 * @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	 * @apiError {number} 403 No Permission to Create Visbo Center
	 * @apiError {number} 409 Visbo Center with same name exists already
	 * @apiExample Example usage:
	 * url: http://localhost:3484/vc
	 * {
	 *  "name":"My first Visbo Center",
	 *  "description": "Visbo Center Description"
	 * }
	 * @apiSuccessExample {json} Success-Response:
	 * HTTP/1.1 200 OK
	 * {
	 *  "state":"success",
	 *  "message":"Successfully created new VisboCenter",
	 *  "vc": [{
	 *    "__v":0,
	 *    "updatedAt":"2018-03-19T11:04:12.094Z",
	 *    "createdAt":"2018-03-19T11:04:12.094Z",
	 *    "name":"My first Visbo Center",
	 *    "_id":"vc541c754feaa",
	 *    "vpCount": 0
	 * }
	 */
// Create a Visbo Center
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Visbo Center (Create)';

		if (req.body.name) req.body.name = (req.body.name || '').trim();
		if (req.body.description) req.body.description = (req.body.description || '').trim();

		logger4js.trace("Post a new Visbo Center Req Body: %O Name %s", req.body, req.body.name);
		logger4js.info("Post a new Visbo Center with name %s executed by user %s Perm %O ", req.body.name, useremail, req.combinedPerm);

		if (!validate.validateName(req.body.name, false) || !validate.validateName(req.body.description, true)) {
			return res.status(400).send({
				state: "failure",
				message: "Visbo Center: Body contains illegal characters"
			});
		}
		if (!(req.combinedPerm.system & constPermSystem.CreateVC)) {
			return res.status(403).send({
				state: "failure",
				message: "No permission to create Visbo Center"
			});
		}
		// check that VC Name is unique
		var query = {};
		query.name = req.body.name;								// Name Duplicate check
		query.deletedAt = {$exists: false};
		VisboCenter.findOne(query, function(err, vc) {
			if (err) {
				errorHandler(err, res, `DB: POST VC ${req.body.name} Find`, `Create Visbo Center ${req.body.name} failed`)
				return;
			}
			if (vc) {
				return res.status(409).send({
					state: "failure",
					message: "Visbo Center already exists"
				});
			}
			logger4js.debug("Create Visbo Center (Name is already unique) check users");
			var newVC = new VisboCenter();
			newVC.name = req.body.name;
			newVC.description = req.body.description;
			newVC.vpCount = 0;

			// Create new VC Group and add current user to the new Group
			var newVG = new VisboGroup();
			newVG.name = 'Visbo Center Admin'
			newVG.groupType = 'VC';
			newVG.internal = true;
			newVG.global = true;
			newVG.permission = {vc: Const.constPermVCAll }
			newVG.vcid = newVC._id;
			newVG.users = [];
			newVG.users.push({email: useremail, userId: userId});

			logger4js.trace("VC Post Create Admin Group for vc %s group %O ", newVC._id, newVG);
			newVG.save(function(err, vg) {
				if (err) {
					errorHandler(err, undefined, `DB: POST VC  ${req.body.name} Create Admin Group`, undefined)
				}
			});

			logger4js.debug("Save VisboCenter %s %s", newVC.name, newVC._id);
			newVC.save(function(err, vc) {
				if (err) {
					errorHandler(err, res, `DB: POST VC ${req.body.name} Save`, `Failed to create Visbo Center ${req.body.name}`)
					return;
				}
				req.oneVC = vc;
				return res.status(200).send({
					state: "success",
					message: "Successfully created new VisboCenter",
					vc: [ vc ]
				});
			});
		});
	})

router.route('/:vcid')
 /**
 	* @api {get} /vc/:vcid Get a Visbo Center
 	* @apiVersion 1.0.0
 	* @apiGroup Visbo Center
 	* @apiName GetVisboCenter
	* @apiDescription Gets a specific Visbo Center including the permission to the VC as User
	* the system checks if the user has access permission to it.
	* In case of success, the system delivers an array of VCs, with one element in the array that is the info about the VC
 	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Permission: Authenticated, View Visbo Center.
 	* @apiError NotAuthenticated no valid token HTTP 401
	* In case of AppAdmin Parameters the User needs to have View Visbo Center Permission on System Level.
	* @apiParam (Parameter AppAdmin) {Boolean} [deleted=false]  Request Deleted VCs
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false]  Optional Request VCs for Appl. Admin User
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Visbo Center
 	* @apiExample Example usage:
 	* url: http://localhost:3484/vc/vc5aada025
 	* @apiSuccessExample {json} Success-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   "state":"success",
 	*   "message":"Returned Visbo Centers",
 	*   "vc": [{
 	*     "_id":"vc541c754feaa",
 	*     "updatedAt":"2018-03-16T12:39:54.042Z",
 	*     "createdAt":"2018-03-12T09:54:56.411Z",
 	*     "name":"My new VisobCenter",
	*     "vpCount": "0"
 	*   }],
	*   "perm": {"vc": 307}
 	* }
	*/
// Get a specific VC
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Visbo Center (Read)';
		req.auditSysAdmin = isSysAdmin;
		req.auditTTLMode = 1;

		// check for deleted only for sysAdmins
		var found = false;
		if (isSysAdmin && req.query.deleted && req.oneVC.deletedAt) {
			found = true;
		} else if (!req.oneVC.deletedAt) {
			logger4js.info("VC not Deleted: DeletedAt %s", req.oneVC.deletedAt);
			found= true;
		}

		logger4js.info("Get Visbo Center for userid %s email %s and vc %s oneVC %s Perm %O found %s", userId, useremail, req.params.vcid, req.oneVC.name, req.combinedPerm, found);
		if (found) {
			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Centers',
				vc: [req.oneVC],
				perm: req.combinedPerm
			});
		} else {
			return res.status(200).send({
				state: 'failure',
				message: 'Visbo Center not found',
			});
		}
	})

/**
	* @api {put} /vc/:vcid Update Visbo Center
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center
	* @apiName UpdateVisboCenters
	* @apiDescription Put updates a specific Visbo Center.
	* the system checks if the user has access permission to it.
	* Only basic properties of the Visbo Centers can be changed. The modification of users is done with special calls to add/delete users to groups
	* In case of success, the system delivers an array of VCs, with one element in the array that is the info about the VC
	*
	* If the VC Name is changed, the VC Name is populated to the Visbo Projects.
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 400 no Data provided in Body for updating the Visbp Center
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Modify Visbo Center
	* @apiError {number} 409 Visbo Center with same name exists already or Visbo Center was updatd in between
	* @apiHeader {String} access-key User authentication token.
	* @apiExample Example usage:
	* url: http://localhost:3484/vc/vc5aada025
	* {
	*  "name":"My first Visbo Center Renamed",
	*  "description": "Changed Description"
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"Successfully updated VisboCenter Renamed",
	*  "vc":[{
	*    "__v":0,
	*    "updatedAt":"2018-03-19T11:04:12.094Z",
	*    "createdAt":"2018-03-19T11:04:12.094Z",
	*    "name":"My first Visbo Center",
	*    "_id":"vc541c754feaa",
	*    "vpCount": "0"
	*  }]
	* }
	*/

// Change Visbo Center
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		req.auditDescription = 'Visbo Center (Update)';

		logger4js.info("PUT/Save Visbo Center for userid %s vc %s oneVC %s Perm %O ", userId, req.params.vcid, req.oneVC.name, req.combinedPerm);

		if (req.body.name) req.body.name = (req.body.name || '').trim();
		if (req.body.description) req.body.description = req.body.description != undefined ? (req.body.description || '').trim() : undefined;
		if (!validate.validateName(req.body.name, true) || !validate.validateName(req.body.description, true)) {
			logger4js.info("PUT/Save Visbo Center name :%s: %s description :%s: %s contains illegal characters", req.body.name, validate.validateName(req.body.name, true), req.body.description, validate.validateName(req.body.description, true));
			return res.status(400).send({
				state: "failure",
				message: "Visbo Center Body contains illegal characters"
			});
		}
		var vcUndelete = false;
		// undelete the VC in case of change
		if (req.oneVC.deletedAt) {
			req.auditDescription = 'Visbo Center (Undelete)';
			req.oneVC.deletedAt = undefined;
			vcUndelete = true;
			logger4js.debug("Undelete VC %s flag %s", req.oneVC._id, req.oneVC.deletedAt);
		}

		if ((!vcUndelete && !(req.combinedPerm.vc & constPermVC.Modify))
		|| (vcUndelete && !(req.combinedPerm.system & constPermSystem.DeleteVC))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		if (!req.body.name) req.body.name = req.oneVC.name;
		var vpPopulate = req.oneVC.name != req.body.name ? true : false;

		logger4js.debug("PUT/Save Visbo Center %s Name :%s: Desc :%s: Namechange: %s", req.oneVC._id, req.body.name, req.body.description, vpPopulate);
		req.oneVC.name = req.body.name;
		if (req.body.description != undefined) {
			req.oneVC.description = req.body.description;
		}
		// check that VC Name is unique
		var query = {};
		query._id = {$ne: req.oneVC._id}
		query.name = req.body.name;								// Name Duplicate check
		query.deletedAt = {$exists: false};

		VisboCenter.findOne(query, function(err, vc) {
			if (err) {
				errorHandler(err, res, `DB: PUT VC ${req.oneVC._id} Unique Name Check`, `Error updating Visbo Center ${req.oneVC.name}`)
				return;
			}
			if (vc) {
				logger4js.trace("PUT VC: duplicate name check found vc %s %s compare with %s %s", vc._id, vc.name, req.oneVC._id, req.oneVC.name);
				return res.status(409).send({
					state: "failure",
					message: "Visbo Center with same name already exists"
				});
			}
			logger4js.debug("PUT VC: save now");
			req.oneVC.save(function(err, oneVC) {
				if (err) {
					errorHandler(err, res, `DB: PUT VC ${req.oneVC._id} Save`, `Error updating Visbo Center ${req.oneVC.name}`)
					return;
				}
				// Update underlying projects if name has changed
				if (vpPopulate){
					logger4js.debug("VC PUT %s: Update SubProjects to %s", oneVC._id, oneVC.name);
					updateVCName(oneVC._id, oneVC.name);
				}
				if (vcUndelete){
					logger4js.debug("VC PUT %s: Undelete VC and VPs", oneVC._id);
					unDeleteVP(oneVC._id, oneVC.name);
					unDeleteGroup(oneVC._id);
				}
				return res.status(200).send({
					state: 'success',
					message: 'Updated Visbo Center',
					vc: [ oneVC ]
				});
			});
		});
	})

/**
	* @api {delete} /vc/:vcid Delete a Visbo Centers
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center
	* @apiName DeleteVisboCenter
	* @apiDescription Deletes a specific Visbo Center.
	* the system checks if the user has Delete Visbo Center permission to it.
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and System Permission: View Visbo Center, Delete Visbo Center.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Modify Visbo Center or Visbo Center does not exists
	* @apiExample Example usage:
	* url: http://localhost:3484/vc/vc5aada025
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Deleted Visbo Centers"
	* }
	*/

// Delete Visbo Center
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Visbo Center (Delete)';

		logger4js.info("DELETE Visbo Center for userid %s email %s and vc %s oneVC %s is SysAdminPerm %O", userId, useremail, req.params.vcid, req.oneVC.name, req.combinedPerm);
		// user is sysAdmin
		if (!(req.combinedPerm.system & constPermSystem.DeleteVC) || req.oneVC.system) {
			return res.status(403).send({
				state: "failure",
				message: "No permission to delete Visbo Center"
			});
		}
		// if the VC is not deleted up to now, mark it as deleted only
		logger4js.trace("Delete Visbo Center %s Status %s %O", req.params.vcid, req.oneVC.deletedAt, req.oneVC);
		if (!req.oneVC.deletedAt) {
			req.oneVC.deletedAt = new Date();
			logger4js.trace("Delete Visbo Center after permission check %s %O", req.params.vcid, req.oneVC);
			req.oneVC.save(function(err, oneVC) {
				if (err) {
					errorHandler(err, res, `DB: DELETE VC ${req.oneVC._id}`, `Error deleting Visbo Center ${req.oneVC.name}`)
					return;
				}
				req.oneVC = oneVC;
				logger4js.debug("VC Delete %s: Update SubProjects to %s", req.oneVC._id, req.oneVC.name);
				var updateQuery = {}
				var deleteDate = new Date();
				updateQuery.vcid = req.oneVC._id;
				var updateUpdate = {$set: {'vc.deletedAt': deleteDate}};
				var updateOption = {upsert: false, multi: "true"};
				VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
					if (err){
						errorHandler(err, res, `DB: DELETE VC ${req.oneVC._id} update Projects`, `Error deleting Visbo Center ${req.oneVC.name}`)
						return;
					}
					logger4js.debug("VC Delete found %d VPs and updated %d VPs", result.n, result.nModified)
					updateQuery = {vcid: req.oneVC._id, deletedByParent: {$exists: false}};
					updateUpdate = {$set: {'deletedByParent': 'VC'}};
					var updateOption = {upsert: false, multi: "true"};
					VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
						if (err){
							errorHandler(err, res, `DB: DELETE VC ${req.oneVC._id} update Groups`, `Error deleting Visbo Center ${req.oneVC.name}`)
							return;
						}
						logger4js.debug("VC Delete found %d Groups and updated %d Groups", result.n, result.nModified)
						return res.status(200).send({
							state: 'success',
							message: 'Deleted Visbo Center'
						});
					});
				});
			});
		} else {
			// VC is already marked as deleted, now destory it including VP and VPV
			// Collect all ProjectIDs of this VC
			req.auditDescription = 'Visbo Center (Destroy)';
			var query = {};
			query.vcid = req.oneVC._id
			var queryVP = VisboProject.find(query);
			queryVP.select = '_id';
			queryVP.lean();
			queryVP.exec(function (err, listVP) {
				if (err) {
					errorHandler(err, res, `DB: DELETE VC ${req.oneVC._id} Destroy Find`, `Error deleting Visbo Center ${req.oneVC.name}`)
					return;
				};
				logger4js.debug("VC Destroy: Found %d Projects", listVP.length);
				var vpidList = [];
				for (var i=0; i < listVP.length; i++) vpidList.push(listVP[i]._id);
				logger4js.trace("VC Destroy: ProjectIDs %O", vpidList);
				// Delete all VPVs relating to these ProjectIDs
				var queryvpv = {vpid: {$in: vpidList}};
				VisboProjectVersion.deleteMany(queryvpv, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting VPVs %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VPVs Deleted", req.oneVC._id)
				})
				// Delete all VP Portfolios relating to these ProjectIDs
				var queryvpf = {vpid: {$in: vpidList}};
				VisboPortfolio.deleteMany(queryvpf, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting VP Portfolios %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VP Portfolios Deleted", req.oneVC._id)
				})
				// Delete Audit Trail of VPs & VPVs
				var queryaudit = {'vp.vpid': {$in: vpidList}};
				VisboAudit.deleteMany(queryaudit, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting Audit %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VP Audit Deleted", req.oneVC._id)
				});
				// Delete all VPs regarding these ProjectIDs
				var queryvp = {_id: {$in: vpidList}};
				VisboProject.deleteMany(queryvp, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting VPs %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VPs Deleted", req.oneVC._id)
				});
				// Delete all VCCosts
				var queryvcid = {vcid: req.oneVC._id};
				VCCost.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting VC Cost %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VC Costs Deleted", req.oneVC._id)
				});
				// Delete all VCRoles
				VCRole.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting VC Role %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VC Roles Deleted", req.oneVC._id)
				});
				// Delete all VCSettings
				VCSetting.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting VC Role %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VC Roles Deleted", req.oneVC._id)
				});

				// Delete all Groups
				VisboGroup.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting VC Groups %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VC Groups Deleted", req.oneVC._id)
				});

				// Delete Audit Trail of VC
				var queryaudit = {'vc.vcid': req.oneVC._id};
				queryaudit.action = {$ne: 'DELETE'}
				VisboAudit.deleteMany(queryaudit, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting VC Audit %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VC Audit Deleted", req.oneVC._id)
				});
				// Delete the VC  itself
				var queryvc = {_id: req.oneVC._id};
				VisboCenter.deleteOne(queryvc, function (err) {
					if (err){
						logger4js.error("DB: Destroy VC %s, Problem deleting VC %s", req.oneVC._id, err.message);
					}
					logger4js.trace("VC Destroy: %s VC Deleted", req.oneVC._id)
				});
				return res.status(200).send({
					state: 'success',
					message: 'Visbo Center Destroyed'
				});
			});
		}
	})

router.route('/:vcid/audit')
 /**
 	* @api {get} /vc/:vcid/audit Get Visbo Center Audit Trail
 	* @apiVersion 1.0.0
 	* @apiGroup Visbo Center
 	* @apiName GetVisboCenterAudit
	* @apiDescription Get Audit Trail for a specific Visbo Center
	* the system checks if the user has access permission to it.
	* In case of success, the system delivers an array of Audit Trail Activities
 	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and Permission: View Visbo Center, View Visbo Center Audit.
	* @apiParam (Parameter) {Date} [from] Request Audit Trail starting with from date. Default Today -1.
	* @apiParam (Parameter) {Date} [to] Request Audit Trail ending with to date. Default Today.
	* @apiParam (Parameter) {text} [text] Request Audit Trail containing text in Detail.
	* @apiParam (Parameter) {text} [action] Request Audit Trail only for specific ReST Command (GET, POST, PUT DELETE).
	* @apiParam (Parameter) {text} [area] Request Audit Trail only for specific Area (vc, vp).
	* @apiParam (Parameter) {number} [maxcount] Request Audit Trail maximum entries.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Visbo Center Audit or Visbo Center does not exists
 	* @apiExample Example usage:
 	* url: http://localhost:3484/vc/vc5aada025/audit
 	* @apiSuccessExample {json} Success-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   "state":"success",
 	*   "message":"Audit Trail delivered",
 	*   "audit": [{
 	*     "_id":"vc541c754feaa",
 	*     "updatedAt":"2018-03-16T12:39:54.042Z",
 	*     "createdAt":"2018-03-12T09:54:56.411Z",
	*			"XXXXXXXX": "XXXXXXXX"
 	*   }]
 	* }
	*/
// Get audit trail for a specific VC
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Visbo Center Audit (Read)';
		req.auditSysAdmin = sysAdmin;

		logger4js.info("Get Visbo Center Audit Trail for userid %s email %s and vc %s oneVC %s Perm %O", userId, useremail, req.params.vcid, req.oneVC.name, req.combinedPerm);
		if (!(req.combinedPerm.vc & constPermVC.ViewAudit)) {
			return res.status(403).send({
					state: 'failure',
					message: 'You need to have View Audit permission to get audit trail'
				});
		}

		var from, to, maxcount = 1000, action, area;
		logger4js.debug("Get Audit Trail DateFilter from %s to %s", req.query.from, req.query.to);
		if (req.query.from && Date.parse(req.query.from)) from = new Date(req.query.from)
		if (req.query.to && Date.parse(req.query.to)) to = new Date(req.query.to)
		if (req.query.maxcount) maxcount = Number(req.query.maxcount) || 10;
		if (req.query.action) action = req.query.action.trim();
		if (req.query.area) area = req.query.area.trim();
		// no date is set to set to to current Date and recalculate from afterwards
		if (!to) to = new Date();
		logger4js.trace("Get Audit Trail at least one value is set %s %s", from, to);
		if (!from) {
			from = new Date(to);
			from.setDate(from.getDate()-7)
		}
		logger4js.trace("Get Audit Trail DateFilter after recalc from %s to %s", from, to);

		var query = {'vc.vcid': req.oneVC._id, "createdAt": {"$gte": from, "$lt": to}};
		if (action) {
			query.action = action;
		}
		if (!sysAdmin) {
			query.sysAdmin = {$exists: false};
		}
		var queryListCondition = [];
		logger4js.info("Get Audit Trail for vc %O ", req.permGroups[0].vcid);
		var areaCondition = [];
		switch(area) {
			case "vc":
				areaCondition.push({"vp": {$exists: false}});
		    break;
		  case "vp":
				areaCondition.push({"vp": {$exists: true}});
				// areaCondition.push({"$or": [{"vp": {$exists: true}}, {"url": /^.vp/}]});
		    break;
		}
		if (areaCondition.length > 0) queryListCondition.push({"$and": areaCondition})
		if (req.query.text) {
			var textCondition = [];
			var text = req.query.text;
			var expr;
			try {
			    expr = new RegExp(text, "i");
			} catch(e) {
					logger4js.info("System Audit RegEx corrupt: %s ", text);
					return res.status(400).send({
						state: 'failure',
						message: 'No Valid Regular Expression'
					});
			}
			if (mongoose.Types.ObjectId.isValid(req.query.text)) {
				logger4js.debug("Get Audit Search for ObjectID %s", text);
				textCondition.push({"vp.vpid": text});
				textCondition.push({"vpv.vpvid": text});
				textCondition.push({"user.userId": text});
			}
			// if it is recognised as ObjectID it could still be a normal text search pattern
			textCondition.push({"user.email": expr});
			textCondition.push({"vc.name": expr});
			textCondition.push({"vp.name": expr});
			textCondition.push({"vpv.name": expr});
			textCondition.push({"action": expr});
			textCondition.push({"actionDescription": expr});
			textCondition.push({"result.statusText": expr});
			textCondition.push({"userAgent": expr});
			textCondition.push({"vc.vcjson": expr});
			textCondition.push({"vp.vpjson": expr});
			textCondition.push({"url": expr});
			queryListCondition.push({"$or": textCondition})
		}
		var ttlCondition = [];
		ttlCondition.push({"ttl": {$exists: false}});
		ttlCondition.push({"ttl": {$gt: new Date()}});
		queryListCondition.push({"$or": ttlCondition})

		query["$and"] = queryListCondition;
		logger4js.debug("Prepared Audit Query: %s", JSON.stringify(query));
		// now fetch all entries related to this vc
		VisboAudit.find(query)
		.limit(maxcount)
		.sort({createdAt: -1})
		.lean()
		.exec(function (err, listVCAudit) {
			if (err) {
				errorHandler(err, res, `DB: GET VC Audit ${req.oneVC._id} `, `Error getting Audit for Visbo Center ${req.oneVC.name}`)
				return;
			}
			logger4js.debug("Found VC Audit Logs %d", listVCAudit.length);
			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Center Audit',
				count: listVCAudit.length,
				audit: listVCAudit
			});
		});
	})

router.route('/:vcid/group')

/**
	* @api {get} /vc/:vcid/group Get Groups
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center Permission
	* @apiName GetVisboCenterGroup
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Gets all groups of the specified Visbo Center
	*
	* @apiPermission Authenticated and Permission: View Visbo Center.
	* @apiParam (Parameter) {Boolean} [userlist=false]  Request User List with Group IDs in addition to the group list.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Visbo Center, or Visbo Center does not exists
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/group
	*   url: http://localhost:3484/vc/:vcid/group?userlist=true
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Center Groups",
	*   "count": 1,
	*   "groups":[{
	*     "_id":"vcgroup5c754feaa",
	*     "name":"Group Name",
	*     "vcid": "vc5c754feaa",
	*     "global": true,
	*     "permission": {vc: 307 },
	*    "users":[
	*     {"userId":"us5aaf992", "email":"example@visbo.de"},
	*     {"userId":"us5aaf993", "email":"example2@visbo.de"}
	*    ]
	*   }]
	* }
	*/

// Get VC Groups
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Visbo Center Group (Read)';
		req.auditSysAdmin = sysAdmin;
		req.auditTTLMode = 1;

		logger4js.info("Get Visbo Center Group for userid %s email %s and vc %s oneVC %s Perm %O", userId, useremail, req.params.vcid, req.oneVC.name, req.combinedPerm);

		var query = {};
		query.vcid = req.oneVC._id;
		query.groupType = req.oneVC.system ? 'System' : 'VC';

		var queryVCGroup = VisboGroup.find(query);
		queryVCGroup.select('-vpids');
		queryVCGroup.lean();
		queryVCGroup.exec(function (err, listVCGroup) {
			if (err) {
				errorHandler(err, res, `DB: GET VC Groups ${req.oneVC._id} `, `Error getting Groups for Visbo Center ${req.oneVC.name}`)
				return;
			}
			logger4js.info("Found %d Groups for VC", listVCGroup.length);
			if (req.query.userlist) {
				var listVCUsers = [];
				for (var i = 0; i < listVCGroup.length; i++) {
					for (var j = 0; j < listVCGroup[i].users.length; j++) {
						listVCUsers.push({userId: listVCGroup[i].users[j].userId,
														email: listVCGroup[i].users[j].email,
														groupId: listVCGroup[i]._id,
														groupName: listVCGroup[i].name,
														groupType: listVCGroup[i].groupType,
														internal: listVCGroup[i].internal})
					}
				}
				var aggregateQuery = [
			    {$match: {vcid: req.oneVC._id, deletedByParent:{$exists:false}}},
			    {$project: {_id: 1, groupType:1, name:1, vpids:1, users:1}},
			    {$unwind: "$vpids"},
			    {$unwind: "$users"},
			    {$project: {_id: 1, groupType:1, name:1, vpids:1, "users.userId":1, "users.email":1}},
			    {$lookup: {
			         from: "visboprojects",
			         localField: "vpids",    // field in the orders collection
			         foreignField: "_id",  // field in the items collection
			         as: "vp"
			      }
			    },
			    {$unwind: "$vp"},
			    {$match: {groupType: 'VP'}},
					{$addFields: {vpid: '$vpids'}},
			    {$addFields: {groupName: '$name'}},
			    {$project: {_id: 1, groupType:1, groupName:1, vpid:1, "users.userId":1, "users.email":1, "vp.name":1}},
			  ];
				var queryVCAllUsers = VisboGroup.aggregate(aggregateQuery);
				queryVCAllUsers.exec(function (err, listVPUsers) {
					if (err) {
						errorHandler(err, res, `DB: GET VC All Users ${req.oneVC._id} `, `Error getting Groups for Visbo Center ${req.oneVC.name}`)
						return;
					}
					return res.status(200).send({
						state: 'success',
						message: 'Returned Visbo Center Groups',
						count: listVCGroup.length,
						groups: listVCGroup,
						users: listVCUsers,
						vpusers: listVPUsers
					});
				});
			} else {
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Center Groups',
					count: listVCGroup.length,
					groups: listVCGroup
				});
			}
		});
	})

/**
	* @api {post} /vc/:vcid/group Create a Group
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center Permission
	* @apiName PostVisboCenterGroup
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Post creates a new group inside the Visbo Center
	* @apiPermission Authenticated and System Permission: View Visbo Center, Manage Visbo Center Permission.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 400 missing name of Visbo Center Group during Creation
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Create a Visbo Center Group
	* @apiError {number} 409 Visbo Center Group with same name exists already
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/groups
	*  {
	*     "name":"Group Name",
	*     "global": true,
	*     "permission": {vc: 307 }
	*  }
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Center Group",
	*   "groups":[{
	*     "_id":"vcgroup5c754feaa",
	*     "name":"My first Group",
	*     "vcid": "vc5c754feaa",
	*     "global": true,
	*     "permission": {vc: 307 },
	*   }]
	* }
	*/

// Create a Visbo Center Group
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query && req.query.sysAdmin ? true : false;
		var groupType;

		req.body.name = req.body.name ? req.body.name.trim() : '';
		if (!validate.validateName(req.body.name, false)) {
			logger4js.info("Body is inconsistent VC Group %s Body %O", req.oneVC._id, req.body);
			return res.status(400).send({
				state: "failure",
				message: "Visbo Center Group Name not allowed"
			});
		}
		var newPerm = {};
		var vgGlobal = req.body.global == true;
		groupType = req.oneVC.system ? 'System' : 'VC';
		if ( req.body.permission ) {
			if (groupType == 'System') newPerm.system = (parseInt(req.body.permission.system) || undefined) & Const.constPermSystemAll
			if (groupType == 'VC' || vgGlobal) newPerm.vc = (parseInt(req.body.permission.vc) || undefined) & Const.constPermVCAll
			if (vgGlobal) newPerm.vp = (parseInt(req.body.permission.vp) || undefined) & Const.constPermVPAll
		}
		if (req.body.name) req.body.name = req.body.name.trim();

		req.auditDescription = 'Visbo Center Group (Create)';

		logger4js.info("Post a new Visbo Center Group with name %s executed by user %s ", req.body.name, useremail);
		logger4js.trace("Post a new Visbo Center Group Req Body: %O Name %s Perm %O", req.body, req.body.name, req.combinedPerm);

		if (groupType == 'VC') {
			if (!(req.combinedPerm.vc & constPermVC.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
		} else {
			if (!(req.combinedPerm.system & constPermSystem.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
		}
		logger4js.debug("Post Group to VC %s Permission is ok, check unique name", req.oneVC._id);
		var queryVCGroup = VisboGroup.findOne({'vcid': req.oneVC._id, 'name': req.body.name});
		queryVCGroup.select('name');
		queryVCGroup.lean();
		queryVCGroup.exec(function (err, oneVCGroup) {
			if (err) {
				errorHandler(err, res, `DB: POST VC ${req.oneVC._id} Group ${req.body.name} `, `Error updating Group for Visbo Center ${req.oneVC.name} `)
				return;
			}
			if (oneVCGroup) {
				return res.status(409).send({
					state: 'failure',
					message: 'Visbo Center Group already exists'
				});
			}
			logger4js.debug("Post Group %s to VC %s now", req.body.name, req.oneVC._id);

			// query vpids to fill in if group is global
			var query = {};
			query.vcid = req.oneVC._id;
			query.deletedAt = {$exists: false};
			var queryVP = VisboProject.find(query);
			queryVP.select('_id'); // return only _id
			queryVP.lean();
			queryVP.exec(function (err, listVP) {
				if (err) {
					errorHandler(err, res, `DB: POST VC ${req.oneVC._id} Get Projects `, `Error creating Group for Visbo Center ${req.oneVC.name} `)
					return;
				};
				logger4js.debug("VC Create Group: Found %d Projects", listVP.length);

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
					logger4js.debug("Set Global Flag %s", vgGlobal);
					vcGroup.vpids = [];
					for (var i = 0; i<listVP.length; i++) {
						vcGroup.vpids.push(listVP[i]._id)
					}
					logger4js.debug("Updated Projects/n", vcGroup.vpids);
				} else {
						vcGroup.permission.vp = undefined;
				}
				vcGroup.save(function(err, oneVcGroup) {
					if (err) {
						errorHandler(err, res, `DB: POST VC ${req.oneVC._id} Save Group ${req.body.name} `, `Error creating Group for Visbo Center ${req.oneVC.name} `)
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
						message: 'Inserted Visbo Center Group',
						groups: [ resultGroup ]
					});
				});
			});
		});
	})

router.route('/:vcid/group/:groupid')

/**
	* @api {delete} /vc/:vcid/group/:groupid Delete a Group
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center Permission
	* @apiName DeleteVisboCenterGroup
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Deletes the specified group in the Visbo Center
	*
	* @apiPermission Authenticated and Permission: View Visbo Center, Manage Visbo Center Permission.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 400 delete of internal Visbo Center Group not allowed
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Delete a Visbo Center Group
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/group/:groupid
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Visbo Center Group deleted"
	* }
	*/

// Delete Visbo Center Group
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		req.auditDescription = 'Visbo Center Group (Delete)';
		req.auditInfo = req.oneGroup.name;
		logger4js.info("DELETE Visbo Center Group for userid %s email %s and vc %s group %s ", userId, useremail, req.params.vcid, req.params.groupid);

		if (req.oneGroup.groupType == 'VC') {
			if (!(req.combinedPerm.vc & constPermVC.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
		} else {
			if (!(req.combinedPerm.system & constPermSystem.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
		}
		logger4js.debug("Delete Visbo Center Group after permission check %s", req.params.vcid);

		// Do not allow to delete internal VC Group
		if (req.oneGroup.internal
			|| (req.oneGroup.groupType != 'VC' && !req.oneVC.system)) {
			return res.status(400).send({
				state: 'failure',
				message: 'Visbo Center Group not deletable'
			});
		}
		req.oneGroup.remove(function(err, empty) {
			if (err) {
				errorHandler(err, res, `DB: DELETE VC Group ${req.oneGroup._id} `, `Error deleting Visbo Center Group ${req.oneGroup.name} `)
				return;
			}
			return res.status(200).send({
				state: 'success',
				message: 'Deleted Visbo Center Group'
			});
		});
	})

/**
	* @api {put} /vc/:vcid/group/:groupid Update a Group
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center Permission
	* @apiName PutVisboCenterGroup
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Put updates a group inside the Visbo Center
	*
	* @apiPermission Authenticated and Permission: View Visbo Center, Manage Visbo Center Permission.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 400 name of internal group can not be changed or new permission does not meet the minimal permission for internal group.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Create a Visbo Center Group
	* @apiError {number} 409 Visbo Center Group with same name exists already
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/group/:groupid
	*  {
  *    "name":"My first Group Renamed",
	*    "global": true,
	*    "permission": {vc: 3, vp: 1 }
  *   }
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Center Group",
	*   "groups":[{
	*     "_id":"vcgroup5c754feaa",
	*     "name":"My first Group Renamed",
	*     "vcid": "vc5c754feaa",
	*     "global": true,
	*     "permission": {vc: 3 },
	*   }]
	* }
	*/

// Change Group
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Visbo Center Group (Update)';

		if (req.body.name) req.body.name = (req.body.name || '').trim();
		if (!validate.validateName(req.body.name, true)) {
			logger4js.info("Body is inconsistent VC Group %s Body %O", req.oneVC._id, req.body);
			return res.status(400).send({
				state: "failure",
				message: "Visbo Center Group Name not allowed"
			});
		}
		var newPerm = {};
		var vgGlobal = req.oneGroup.global == true;
		if (req.body.global != undefined)
			vgGlobal = req.body.global == true;
		logger4js.debug("Get Global Flag %s process %s", req.body.global, vgGlobal);
		if ( req.body.permission ) {
			if (req.oneGroup.groupType == 'System') newPerm.system = (parseInt(req.body.permission.system) || undefined) & Const.constPermSystemAll
			if (req.oneGroup.groupType == 'VC' || vgGlobal) newPerm.vc = (parseInt(req.body.permission.vc) || undefined) & Const.constPermVCAll
			if (vgGlobal) newPerm.vp = (parseInt(req.body.permission.vp) || undefined) & Const.constPermVPAll
		}

		logger4js.info("PUT Visbo Center Group for userid %s email %s and vc %s group %s perm %O", userId, useremail, req.params.vcid, req.params.groupid, req.combinedPerm);

		if ((req.oneGroup.groupType == 'VC' && !(req.combinedPerm.vc & constPermVC.ManagePerm))
		|| (req.oneGroup.groupType != 'VC' && !(req.combinedPerm.system & constPermSystem.ManagePerm))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		if (req.oneGroup.internal) req.body.name = req.oneGroup.groupName; // do not overwrite internal Group Name
		if (req.oneGroup.groupType != 'VC' && !req.oneVC.system) {
			return res.status(400).send({
				state: 'failure',
				message: 'not a Visbo Center Group'
			});
		}
		logger4js.debug("Update Visbo Center Group after permission check vcid %s groupName %s", req.params.vcid, req.oneGroup.name);

		if (req.oneGroup.groupType == 'VC') {
			var minimalPerm = constPermVC.View | constPermVC.ManagePerm;
			if (req.oneGroup.internal == true && (newPerm.vc & minimalPerm) != minimalPerm  ) {
				return res.status(400).send({
					state: 'failure',
					message: 'No Valid Permission for internal group'
				});
			}
		} else {
			var minimalPerm = constPermSystem.View | constPermSystem.ManagePerm;
			if (req.oneGroup.internal == true && (newPerm.system & minimalPerm) != minimalPerm  ) {
				return res.status(400).send({
					state: 'failure',
					message: 'No Valid Permission for internal group'
				});
			}
		}
		// query vpids to fill in if group is global
		var query = {};
		query.vcid = req.oneGroup.vcid;
		query.deletedAt = {$exists: false};
		var queryVP = VisboProject.find(query);
		queryVP.select('_id'); // return only _id
		queryVP.lean();
		queryVP.exec(function (err, listVP) {
			if (err) {
				errorHandler(err, res, `DB: PUT VC ${req.oneVC._id} Group, Get Projects `, `Error updating Group for Visbo Center ${req.oneVC.name} `)
				return;
			};
			logger4js.debug("Found %d Projects", listVP.length);
			// logger4js.debug("Found Projects/n", listVP);

			// fill in the required fields
			if (req.body.name) req.oneGroup.name = req.body.name;
			req.oneGroup.permission = newPerm;
			if (vgGlobal != req.oneGroup.global) {
				// switch global group setting, handle vpids
				logger4js.debug("Switch Global Flag %s", vgGlobal);
				req.oneGroup.vpids = [];
				if (vgGlobal == true) {
					for (var i = 0; i<listVP.length; i++) {
						req.oneGroup.vpids.push(listVP[i]._id)
					}
					logger4js.debug("Updated Projects/n", req.oneGroup.vpids);
				} else {
					req.oneGroup.permission.vp = undefined;
				}
				req.oneGroup.global = vgGlobal;
			}
			req.oneGroup.internal = req.oneGroup.internal == true; // to guarantee that it is set
			req.oneGroup.save(function(err, oneVcGroup) {
				if (err) {
					errorHandler(err, res, `DB: PUT VC Group ${req.oneGroup._id} Save `, `Error updating Visbo Center Group ${req.oneGroup.name} `)
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
					message: 'Updated Visbo Center Group',
					groups: [ resultGroup ]
				});
			});
		});
	})

	router.route('/:vcid/group/:groupid/user')

	/**
		* @api {post} /vc/:vcid/group/:groupid/user Add User to Group
		* @apiVersion 1.0.0
		* @apiGroup Visbo Center Permission
		* @apiName AddUserToVisboCenterGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Adds the specified user from body to the group
		*
		* @apiPermission Authenticated and Permission: View Visbo Center, Manage Visbo Center Permission.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 missing user name to add to the Visbo Center Group
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to add a user to a Visbo Center Group
		* @apiError {number} 409 user is already member of the Visbo Center Group
		* @apiExample Example usage:
		*  url: http://localhost:3484/vc/:vcid/group/:groupid/user
		*  {
	  *    "email":"new.user@visbo.de",
		*    "message": "Invitation message"
	  *  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"User was added to Visbo Center Group",
		*   "groups":[{
		*     "_id":"vcgroup5c754feaa",
		*     "name":"My first Group Renamed",
		*     "vcid": "vc5c754feaa",
		*     "users": [{userId: "userId5c754feaa", email: "new.user@visbo.de"}]
		*     "global": true,
		*     "permission": {vc: 3 },
		*   }]
		* }
		*/

	// Add User to Visbo Center Group
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		logger4js.info("Post a new Visbo Center User with name %s  to group executed by user %s with perm %s ", req.body.email, req.oneGroup.name, useremail, req.combinedPerm);
		req.auditDescription = 'Visbo Center User (Add)';

		if (req.body.email) req.body.email = req.body.email.trim().toLowerCase();
		if (!validate.validateEmail(req.body.email, false)) {
			logger4js.warn("Post a not allowed UserName %s to Visbo Center group executed by user %s with perm %s ", req.body.email, req.oneGroup.name, useremail, req.combinedPerm);
			return res.status(400).send({
				state: "failure",
				message: "Visbo Center User Name not allowed"
			});
		}

		req.auditInfo = req.body.email + ' / ' + req.oneGroup.name;
		// verify check for System VC & SysAdmin
		if ((req.oneGroup.groupType == 'VC' && !(req.combinedPerm.vc & constPermVC.ManagePerm))
		|| (req.oneGroup.groupType != 'VC' && !(req.combinedPerm.system & constPermSystem.ManagePerm))) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
		}
		if (req.oneGroup.groupType != 'VC' && req.oneGroup.groupType != 'System') {
			return res.status(400).send({
				state: 'failure',
				message: 'not a Visbo Center Group'
			});
		}
		logger4js.debug("Post User to VC %s Permission is ok", req.params.vcid);

		var vcUser = new VCGroupUser();
		var eMailMessage = undefined;
		if (req.body.message) {
			eMailMessage = sanitizeHtml(req.body.message, {allowedTags: [], allowedAttributes: {}});
		}
		vcUser.email = req.body.email;

		// check if the user is not member of the group already
		if (req.oneGroup.users.filter(users => (users.email == vcUser.email)).length != 0) {
			logger4js.debug("Post User %s to VC Group %s User is already a member", vcUser.email, req.oneGroup._id);
			return res.status(409).send({
				state: 'failure',
				message: 'User is already member',
				groups: [req.oneGroup]
			});
		}
		// check if the user exists and get the UserId or create the user
		var query = {'email': vcUser.email}
		var queryUsers = User.findOne(query);
		//queryUsers.select('email');
		queryUsers.exec(function (err, user) {
			if (err) {
				errorHandler(err, res, `DB: POST User to VC Group ${req.oneGroup._id} Find User `, `Error adding User to Visbo Center Group ${req.oneGroup.name} `)
				return;
			}
			if (!user) {
				user = new User();
				user.email = vcUser.email;
				logger4js.debug("Create new User %s for VC in Group %s", vcUser.email, req.oneGroup._id);
				user.save(function(err, user) {
					if (err) {
						errorHandler(err, res, `DB: POST User to VC Group ${req.oneGroup._id} Create new User `, `Error adding User to Visbo Center Group ${req.oneGroup.name}`)
						return;
					}
					// user exists now, now the VC can be updated
					vcUser.userId = user._id;

					req.oneGroup.users.push(vcUser)
					req.oneGroup.save(function(err, vcGroup) {
						if (err) {
							errorHandler(err, res, `DB: POST User to VC Group ${req.oneGroup._id} Save Group `, `Error adding User to Visbo Center Group ${req.oneGroup.name}`)
							return;
						}
						req.oneGroup = vcGroup;
						// now send an e-Mail to the user for registration
						var template = __dirname.concat('/../emailTemplates/inviteVCNewUser.ejs')
						var uiUrl =  getSystemUrl();

						var secret = 'register'.concat(user._id, user.updatedAt.getTime());
						var hash = createHash(secret);
						uiUrl = uiUrl.concat('/register/', user._id, '?hash=', hash);

						logger4js.debug("E-Mail template %s, url %s", template, uiUrl);
						if (eMailMessage === undefined) {
								// do not send invitation mail if no message is specified
								return res.status(200).send({
									state: "success",
									message: "Successfully added User to Visbo Group",
									groups: [ vcGroup ]
								});
						} else {
							ejs.renderFile(template, {userFrom: req.decoded, userTo: user, url: uiUrl, vc: req.oneVC, message: eMailMessage}, function(err, emailHtml) {
								if (err) {
									logger4js.warn("E-Mail Rendering failed %s", err.message);
									return res.status(500).send({
										state: "failure",
										message: "E-Mail Rendering failed",
										error: err
									});
								}
								// logger4js.debug("E-Mail Rendering done: %s", emailHtml);
								var message = {
										from: useremail,
										to: user.email,
										subject: 'You have been invited to a Visbo Center ' + req.oneVC.name,
										html: '<p> '.concat(emailHtml, " </p>")
								};
								logger4js.info("Now send mail from %s to %s", message.from, message.to);
								mail.VisboSendMail(message);
								return res.status(200).send({
									state: "success",
									message: "Successfully added User to Visbo Center",
									groups: [ vcGroup ]
								});
							});
						}
					})
				});
			} else {
				vcUser.userId = user._id;
				req.oneGroup.users.push(vcUser)
				req.oneGroup.save(function(err, vcGroup) {
					if (err) {
						errorHandler(err, res, `DB: POST User to VC Group ${req.oneGroup._id} Save Group `, `Error adding User to Visbo Center Group ${req.oneGroup.name}`)
						return;
					}
					req.oneGroup = vcGroup;
					// now send an e-Mail to the user for registration/login
					var template = __dirname.concat('/../emailTemplates/');
					var uiUrl =  getSystemUrl();
					var eMailSubject = 'You have been invited to a Visbo Center ' + req.oneVC.name
					logger4js.trace("E-Mail User Status %O %s", user.status, user.status.registeredAt);
					if (user.status && user.status.registeredAt) {
						// send e-Mail to a registered user
						template = template.concat('inviteVCExistingUser.ejs');
						uiUrl = uiUrl.concat('/vp/', req.oneVC._id);
					} else {
						// send e-Mail to an existing but unregistered user
						template = template.concat('inviteVCNewUser.ejs');
						var secret = 'register'.concat(user._id, user.updatedAt.getTime());
						var hash = createHash(secret);
						uiUrl = uiUrl.concat('/register/', user._id, '?hash=', hash);
					}

					logger4js.debug("E-Mail template %s, url %s", template, uiUrl);
					if (eMailMessage === undefined) {
							// do not send invitation mail if no message is specified
							return res.status(200).send({
								state: "success",
								message: "Successfully added User to Visbo Group",
								groups: [ vcGroup ]
							});
					} else {
						ejs.renderFile(template, {userFrom: req.decoded, userTo: user, url: uiUrl, vc: req.oneVC, message: eMailMessage}, function(err, emailHtml) {
							if (err) {
								logger4js.warn("E-Mail Rendering failed %s", err.message);
								return res.status(500).send({
									state: "failure",
									message: "E-Mail Rendering failed",
									error: err
								});
							}
							var message = {
									from: useremail,
									to: user.email,
									subject: eMailSubject,
									html: '<p> '.concat(emailHtml, " </p>")
							};
							logger4js.info("Now send mail from %s to %s", message.from, message.to);
							mail.VisboSendMail(message);
							return res.status(200).send({
								state: "success",
								message: "Successfully added User to Visbo Center",
								groups: [ vcGroup ]
							});
						});
					}
				})
			}
		})
	})

	router.route('/:vcid/group/:groupid/user/:userid')

	/**
		* @api {delete} /vc/:vcid/group/:groupid/user/:userid Delete User from Group
		* @apiVersion 1.0.0
		* @apiGroup Visbo Center Permission
		* @apiName DeleteVisboCenterUser
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Deletes the specified user in the Visbo Center Group
		*
		* @apiPermission Authenticated and Permission: View Visbo Center, Manage Visbo Center Permission.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 no Admin user will be left in internal Visbo Center Group
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete a user from Visbo Center Group
		* @apiError {number} 409 user is not member of the Visbo Center Group
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/group/:groupid/user/:userid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Visbo Center User deleted from Group"
		* }
		*/

// Delete Visbo Center User
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		logger4js.info("DELETE Visbo Center User by userid %s email %s for user %s Group %s ", userId, useremail, req.params.userid, req.oneGroup._id);

		req.auditDescription = 'Visbo Center User (Delete)';

		var delUser = req.oneGroup.users.find(findUserById, req.params.userid)
		if (delUser) req.auditInfo = delUser.email  + ' / ' + req.oneGroup.name;

		if ((req.oneGroup.groupType == 'VC' && !(req.combinedPerm.vc & constPermVC.ManagePerm))
		|| (req.oneGroup.groupType != 'VC' && !(req.combinedPerm.system & constPermSystem.ManagePerm))) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
		}
		if (req.oneGroup.groupType != 'VC' && req.oneGroup.groupType != 'System') {
			return res.status(400).send({
				state: 'failure',
				message: 'not a Visbo Center Group'
			});
		}
		var newUserList = req.oneGroup.users.filter(users => (!(users.userId == req.params.userid )))
		logger4js.debug("DELETE Visbo Group User List Length new %d old %d", newUserList.length, req.oneGroup.users.length);
		logger4js.trace("DELETE Visbo Center Filtered User List %O ", newUserList);
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
		logger4js.debug("Delete Visbo Center User after permission check %s", req.params.userid);
		req.oneGroup.users = newUserList;
		req.oneGroup.save(function(err, vg) {
			if (err) {
				errorHandler(err, res, `DB: DELETE User from VC Group ${req.oneGroup._id} Save Group `, `Error deleting User from Visbo Center Group ${req.oneGroup.name} `)
				return;
			}
			req.oneGroup = vg;
			return res.status(200).send({
				state: "success",
				message: "Successfully removed User from Visbo Center",
				groups: [req.oneGroup]
			});
		})
	})


	router.route('/:vcid/role')

	/**
		* @api {get} /vc/:vcid/role Role: get all
		* @apiVersion 1.0.0
		* @apiGroup Visbo Center Properties
		* @apiName GetVisboCenterRole
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets all roles of the specified Visbo Center
		*
		* @apiPermission Authenticated and Permission: View Visbo Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View the Visbo Center
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/role
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Returned Visbo Center Roles",
		*   "vcrole":[{
		*     "_id":"vcrole5c754feaa",
		*     "name":"Role Name",
		*     "vcid": "vc5c754feaa",
		*     "timestamp": "2018-01-01",
		*     "allOthers": ""
		*   }]
		* }
		*/

	// Get VC Roles
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var sysAdmin = req.query.sysadmin ? true : false;

			req.auditDescription = 'Visbo Center Role (Read)';
			req.auditSysAdmin = sysAdmin;
			req.auditTTLMode = 1;

			logger4js.info("Get Visbo Center Role for userid %s email %s and vc %s oneVC %s Perm %O", userId, useremail, req.params.vcid, req.oneVC.name, req.combinedPerm);

			var queryVCRole = VCRole.find({'vcid': req.oneVC._id});
			// queryVCRole.select('_id vcid name');
			queryVCRole.lean();
			queryVCRole.exec(function (err, listVCRole) {
				if (err) {
					errorHandler(err, res, `DB: GET Role of VC ${req.oneVC._id} Select `, `Error getting Roles of Visbo Center ${req.oneVC.name} `)
					return;
				}
				logger4js.info("Found %d Roles for VC", listVCRole.length);
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Center Roles',
					vcrole: listVCRole
				});
			});
		})

	/**
		* @api {post} /vc/:vcid/role Role: create new
		* @apiVersion 1.0.0
		* @apiGroup Visbo Center Properties
		* @apiName PostVisboCenterRole
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Post creates a new role inside the Visbo Center
		*
		* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
		* @apiError {number} 400 no valid name is defined
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a Visbo Center Role
		*
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/role
		*  {
		*    "name":"My first Role",
		*    "uid": "1",
		*    "defaultKapa": "1",
		*    "allOthers": ""
		*  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Returned Visbo Center Role",
		*   "vcrole":[{
		*     "_id":"vcrole5c754feaa",
		*     "name":"My first Role",
		*     "vcid": "vc5c754feaa",
		*     "timestamp": "2018-01-01",
		*     "allOthers": ""
		*   }]
		* }
		*/

	// Create a Visbo Center Role
		.post(function(req, res) {
			// User is authenticated already
			var userId = req.decoded._id;
			var useremail = req.decoded.email;

			req.auditDescription = 'Visbo Center Role (Create)';

			logger4js.trace("Post a new Visbo Center Role Req Body: %O Name %s", req.body, req.body.name);
			logger4js.info("Post a new Visbo Center Role with name %s executed by user %s ", req.body.name, useremail);

			if (!(req.combinedPerm.vc & constPermVC.Modify)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			if (req.body.name) req.body.name = req.body.name.trim();
			if (!validate.validateName(req.body.name, false) ||  !validate.validateNumber(req.body.uid, false)) {
				logger4js.info("Body is inconsistent %O", req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'No valid role definition'
				});
			}
			logger4js.debug("Post Role to VC %s Permission is ok, check unique uid", req.params.vcid);
			var queryVCRole = VCRole.findOne({'vcid': req.params.vcid, 'uid': req.body.uid});
			queryVCRole.select('name uid');
			queryVCRole.lean();
			queryVCRole.exec(function (err, oneVCRole) {
				if (err) {
					errorHandler(err, res, `DB: POST Role to VC ${req.oneVC._id} Select `, `Error creating Role in Visbo Center ${req.oneVC.name} `)
					return;
				}
				if (oneVCRole) {
					return res.status(409).send({
						state: 'failure',
						message: 'Visbo Center Role already exists'
					});
				}
				logger4js.debug("Post Role to VC %s now", req.params.vcid);

				var vcRole = new VCRole();
				vcRole.name = req.body.name;
				vcRole.vcid = req.params.vcid;
				vcRole.uid = req.body.uid;
				vcRole.subRoleIDs = req.body.subRoleIDs;
				vcRole.teamIDs = req.body.teamIDs;
				vcRole.isTeam = req.body.isTeam;
				vcRole.isExternRole = req.body.isExternRole;
				vcRole.farbe = req.body.farbe;
				vcRole.defaultKapa = req.body.defaultKapa;
				vcRole.tagessatzIntern = req.body.tagessatzIntern;
				vcRole.kapazitaet = req.body.kapazitaet;
				vcRole.startOfCal = req.body.startOfCal;
				var dateValue = req.body.timestamp ? new Date(req.body.timestamp) : new Date();
				if (isNaN(dateValue)) dateValue = new Date()
				vcRole.timestamp = dateValue;
				vcRole.save(function(err, oneVcRole) {
					if (err) {
						errorHandler(err, res, `DB: POST Role to VC ${req.oneVC._id} Save `, `Error creating Role in Visbo Center ${req.oneVC.name} `)
						return;
					}
					return res.status(200).send({
						state: 'success',
						message: 'Inserted Visbo Center Role',
						vcrole: [ oneVcRole ]
					});
				});
			});
		})


	router.route('/:vcid/role/:roleid')

	/**
		* @api {delete} /vc/:vcid/role/:roleid Role: delete one
		* @apiVersion 1.0.0
		* @apiGroup Visbo Center Properties
		* @apiName DeleteVisboCenterRole
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Deletes the specified role in the Visbo Center
		*
		* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete a Visbo Center Role
		* @apiError {number} 409 Visbo Center Role does not exists
		*
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/role/:roleid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Visbo Center Role deleted"
		* }
		*/

	// Delete Visbo Center Role
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;

			req.auditDescription = 'Visbo Center Role (Delete)';

			logger4js.info("DELETE Visbo Center Role for userid %s email %s and vc %s role %s ", userId, useremail, req.params.vcid, req.params.roleid);

			if (!(req.combinedPerm.vc & constPermVC.Modify)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			logger4js.debug("Delete Visbo Center Role after permission check %s", req.params.vcid);
			var query = {};
			query._id = req.params.roleid;
			query.vcid = req.params.vcid;
			var queryVCRole = VCRole.findOne(query);
			// queryVCRole.select('_id vcid name');
			queryVCRole.exec(function (err, oneVCRole) {
				if (err) {
					errorHandler(err, res, `DB: DELETE Role of VC ${req.params.roleid} Select `, `Error delete Role of Visbo Center ${req.oneVC.name} `)
					return;
				}
				if (!oneVCRole) {
					return res.status(409).send({
						state: 'failure',
						message: 'Visbo Center Role not found',
						error: err
					});
				}
				logger4js.info("Found the Role for VC");
				oneVCRole.remove(function(err, empty) {
					if (err) {
						errorHandler(err, res, `DB: DELETE Role ${req.params.roleid} of VC `, `Error delete Role of Visbo Center ${req.oneVC.name} `)
						return;
					}
					return res.status(200).send({
						state: 'success',
						message: 'Deleted Visbo Center Role'
					});
				});
			});
		})

	/**
		* @api {put} /vc/:vcid/role/:roleid Role: update one
		* @apiVersion 1.0.0
		* @apiGroup Visbo Center Properties
		* @apiName PutVisboCenterRole
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Put updates a role inside the Visbo Center
		*
		* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Modify a Visbo Center Role
		* @apiError {number} 409 Visbo Center Role does not exists
		*
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/role/:roleid
		*  {
	  *    "name":"My first Role Renamed",
	  *    "uid": "2",
	  *    "defaultKapa": "2",
	  *    "allOthers": ""
	  *   }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Returned Visbo Center Role",
		*   "vcrole":[{
		*     "_id":"vcrole5c754feaa",
		*     "name":"My first Role Renamed",
		*     "vcid": "vc5c754feaa",
		*     "timestamp": "2018-01-01",
		*     "allOthers": ""
		*   }]
		* }
		*/

	// Change Role
		.put(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;

			req.auditDescription = 'Visbo Center Role (Update)';

			logger4js.info("PUT Visbo Center Role for userid %s email %s and vc %s role %s ", userId, useremail, req.params.vcid, req.params.roleid);

			if (!(req.combinedPerm.vc & constPermVC.Modify)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			logger4js.debug("Update Visbo Center Role after permission check %s", req.params.vcid);
			var query = {};
			query._id = req.params.roleid;
			query.vcid = req.params.vcid;

			var queryVCRole = VCRole.findOne(query);
			// queryVCRole.select('_id vcid name');
			queryVCRole.exec(function (err, oneVCRole) {
				if (err) {
					errorHandler(err, res, `DB: VC Put Role ${req.params.roleid} Find`, `Error updating VisboCenter Role ${req.params.roleid}`)
					return;
				}
				if (!oneVCRole) {
					return res.status(409).send({
						state: 'failure',
						message: 'Visbo Center Role not found',
						error: err
					});
				}
				logger4js.info("Found the Role for VC");
				if (req.body.uid) oneVCRole.uid = req.body.uid;
				if (req.body.name) oneVCRole.name = req.body.name;
				if (req.body.subRoleIDs) oneVCRole.subRoleIDs = req.body.subRoleIDs;
				if (req.body.teamIDs) oneVCRole.teamIDs = req.body.teamIDs;
				if (req.body.isTeam) oneVCRole.isTeam = req.body.isTeam;
				if (req.body.isExternRole) oneVCRole.isExternRole = req.body.isExternRole;
				if (req.body.farbe) oneVCRole.farbe = req.body.farbe;
				if (req.body.defaultKapa) oneVCRole.defaultKapa = req.body.defaultKapa;
				if (req.body.tagessatzIntern) oneVCRole.tagessatzIntern = req.body.tagessatzIntern;
				if (req.body.kapazitaet) oneVCRole.kapazitaet = req.body.kapazitaet;
				if (req.body.startOfCal) oneVCRole.startOfCal = req.body.startOfCal;
				if (req.body.timestamp) oneVCRole.timestamp = req.body.timestamp;
				oneVCRole.save(function(err, oneVcRole) {
					if (err) {
						errorHandler(err, res, `DB: PUT VC Role ${req.params.roleid} Save`, `Error updating Visbo Center Role ${req.params.roleid}`)
						return;
					}
					return res.status(200).send({
						state: 'success',
						message: 'Updated Visbo Center Role',
						vcrole: [ oneVcRole ]
					});
				});
			});
		})

router.route('/:vcid/cost')

/**
	* @api {get} /vc/:vcid/cost Cost: get all
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center Properties
	* @apiName GetVisboCenterCost
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Gets all costs of the specified Visbo Center
	* @apiPermission Authenticated and Permission: View Visbo Center.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View the Visbo Center
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/cost
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Center Costs",
	*   "vccost":[{
	*     "_id":"vccost5c754feaa",
	*     "name":"Cost Name",
	*     "vcid": "vc5c754feaa",
	*     "timestamp": "2018-01-01",
	*     "uid": "1",
	*     "farbe": "49407"
	*   }]
	* }
	*/

// get VC Costs
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;

		req.auditDescription = 'Visbo Center Cost (Read)';
		req.auditSysAdmin = sysAdmin;
		req.auditTTLMode = 1;

		logger4js.info("Get Visbo Center Cost for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);

		var queryVCCost = VCCost.find({'vcid': req.oneVC._id});
		// queryVCCost.select('_id vcid name');
		queryVCCost.lean();
		queryVCCost.exec(function (err, listVCCost) {
			if (err) {
				errorHandler(err, res, `DB: GET Cost for VC ${req.oneVC._id}`, `Error getting Cost for Visbo Center ${req.oneVC._id}`)
				return;
			}
			logger4js.info("Found %d Costs for VC", listVCCost.length);
			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Center Costs',
				vccost: listVCCost
			});
		});
	})

/**
	* @api {post} /vc/:vcid/cost Cost: create one
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center Properties
	* @apiName PostVisboCenterCost
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Post creates a new cost inside the Visbo Center
	*
	* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
	* @apiError {number} 400 no valid cost definition
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Create a Visbo Center Cost
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/cost
	*  {
  *    "name":"My first Cost",
  *    "uid": "1",
	*    "farbe": "49407"
  *  }
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Center Cost",
	*   "vccost":[{
	*     "_id":"vccost5c754feaa",
	*     "name":"My first Cost",
	*     "vcid": "vc5c754feaa",
	*     "timestamp": "2018-01-01",
	*     "uid": "1",
	*     "farbe": "49407"
	*   }]
	* }
	*/

// Create Visbo Center Cost
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Visbo Center Cost (Create)';

		logger4js.trace("Post a new Visbo Center Cost Req Body: %O Name %s", req.body, req.body.name);
		logger4js.info("Post a new Visbo Center Cost with name %s executed by user %s ", req.body.name, useremail);

		if (req.body.name) req.body.name = req.body.name.trim();
		if (!validate.validateName(req.body.name, false)) {
			return res.status(400).send({
				state: 'failure',
				message: 'No valid cost definition'
			});
		}
		if (!(req.combinedPerm.vc & constPermVC.Modify)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		logger4js.debug("Post Cost to VC %s Permission is ok", req.params.vcid);
		var vcCost = new VCCost();
		vcCost.name = req.body.name;
		vcCost.vcid = req.params.vcid;
		vcCost.uid = req.body.uid;
		vcCost.farbe = req.body.farbe;
		var dateValue = req.body.timestamp ? new Date(req.body.timestamp) : new Date();
		if (isNaN(dateValue)) dateValue = new Date()
		vcCost.timestamp = dateValue;
		vcCost.save(function(err, oneVcCost) {
			if (err) {
				errorHandler(err, res, `DB: POST Cost for VC ${req.params.vcid}`, `Error creating Cost for Visbo Center ${req.oneVC.name}`)
				return;
			}
			return res.status(200).send({
				state: 'success',
				message: 'Inserted Visbo Center Cost',
				vccost: [ oneVcCost ]
			});
		});
	})

	router.route('/:vcid/cost/:costid')

/**
  * @api {delete} /vc/:vcid/cost/:costid Cost: delete one
  * @apiVersion 1.0.0
  * @apiGroup Visbo Center Properties
  * @apiName DeleteVisboCenterCost
  * @apiHeader {String} access-key User authentication token.
  * @apiDescription Deletes the specified cost in the Visbo Center
  *
	* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Delete a Visbo Center Cost
	* @apiError {number} 409 Visbo Center Cost does not exists
	*
  * @apiExample Example usage:
  *   url: http://localhost:3484/vc/:vcid/cost/:costid
  * @apiSuccessExample {json} Success-Response:
  * HTTP/1.1 200 OK
  * {
  *   "state":"success",
  *   "message":"Visbo Center Cost deleted"
  * }
  */

// Delete Visbo Center Cost
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Visbo Center Cost (Delete)';

		logger4js.info("DELETE Visbo Center Cost for userid %s email %s and vc %s cost %s ", userId, useremail, req.params.vcid, req.params.costid);

		if (!(req.combinedPerm.vc & constPermVC.Modify)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		logger4js.debug("Delete Visbo Center Cost after permission check %s", req.params.vcid);
		var query = {};
		query._id = req.params.costid;
		query.vcid = req.params.vcid;
		var queryVCCost = VCCost.findOne(query);
		// queryVCCost.select('_id vcid name');
		queryVCCost.exec(function (err, oneVCCost) {
			if (err) {
				errorHandler(err, res, `DB: DELETE VC Cost ${req.params.costid} Find`, `Error deleting Cost in VisboCenter ${req.oneVC.name}`)
				return;
			}
			if (!oneVCCost) {
				return res.status(409).send({
					state: 'failure',
					message: 'Visbo Center Cost not found',
					error: err
				});
			}
			logger4js.info("Found the Cost for VC");
			oneVCCost.remove(function(err, empty) {
				if (err) {
					errorHandler(err, res, `DB: DELETE VC Cost ${req.params.costid}`, `Error deleting VisboCenter Cost ${req.oneVC.name}`)
					return;
				}
				return res.status(200).send({
					state: 'success',
					message: 'Deleted Visbo Center Cost'
				});
			});
		});
	})

/**
	* @api {put} /vc/:vcid/cost/:costid Cost: update one
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center Properties
	* @apiName PutVisboCenterCost
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Put updates a cost definition inside the Visbo Center
	*
	* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Update a Visbo Center Cost
	* @apiError {number} 409 Visbo Center Cost does not exists
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/cost/:costid
	*  {
  *    "name":"My first Cost Renamed",
  *    "uid": "2",
	*    "farbe": "49407"
  *   }
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Center Cost",
	*   "vccost":[{
	*     "_id":"vccost5c754feaa",
	*     "name":"My first Cost Renamed",
	*     "vcid": "vc5c754feaa",
	*     "timestamp": "2018-01-01",
	*     "uid": "1",
	*     "farbe": "49407"
	*   }]
	* }
	*/

// change cost
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;

		req.auditDescription = 'Visbo Center Cost (Update)';

		logger4js.info("PUT Visbo Center Cost for userid %s email %s and vc %s cost %s ", userId, useremail, req.params.vcid, req.params.costid);

		if (!(req.combinedPerm.vc & constPermVC.Modify)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		logger4js.debug("Update Visbo Center Cost after permission check %s", req.params.vcid);
		var query = {};
		query._id =  req.params.costid;
		query.vcid = req.params.vcid;
		var queryVCCost = VCCost.findOne(query);
		// queryVCCost.select('_id vcid name');
		queryVCCost.exec(function (err, oneVCCost) {
			if (err) {
				errorHandler(err, res, `DB: PUT VC Cost ${req.params.costid} Find`, `Error updating VisboCenter Cost ${req.params.costid}`)
				return;
			}
			if (!oneVCCost) {
				return res.status(409).send({
					state: 'failure',
					message: 'Visbo Center Cost not found',
					error: err
				});
			}
			logger4js.info("Found the Cost for VC");
			if (req.body.name) oneVCCost.name = req.body.name.trim();
			if (req.body.uid) oneVCCost.uid = req.body.uid;
			if (req.body.farbe) oneVCCost.farbe = req.body.farbe;
			var dateValue = req.body.timestamp ? new Date(req.body.timestamp) : new Date();
			if (isNaN(dateValue)) dateValue = new Date()
			oneVCCost.timestamp = dateValue;
			oneVCCost.save(function(err, oneVcCost) {
				if (err) {
					errorHandler(err, res, `DB: PUT VC Cost ${req.params.costid} Save`, `Error updating VisboCenter Cost ${req.params.costid}`)
					return;
				}
				return res.status(200).send({
					state: 'success',
					message: 'Updated Visbo Center Cost',
					vccost: [ oneVcCost ]
				});
			});
		});
	})

	router.route('/:vcid/setting')

	/**
		* @api {get} /vc/:vcid/setting Setting: get all
		* @apiVersion 1.0.0
		* @apiGroup Visbo Center Properties
		* @apiName GetVisboCenterSetting
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets all settings of the specified Visbo Center
		*
		* With additional query paramteters the amount of settings can be restricted. Available Restirctions are: refDate, type, name, userId.
		*
		* @apiParam {Date} refDate only the latest setting with a timestamp before the reference date is delivered
		* Date Format is in the form: 2018-10-30T10:00:00Z
		* @apiParam {String} refNext If refNext is not empty the system delivers not the setting before refDate instead it delivers the setting after refDate
		* @apiParam {String} name Deliver only settings with the specified name
		* @apiParam {String} type Deliver only settings of the the specified type
		* @apiParam {String} userId Deliver only settings that has set the specified userId
		*
		* @apiPermission Authenticated and Permission: View Visbo Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View the Visbo Center
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/setting
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Returned Visbo Center Settings",
		*   "vcsetting":[{
		*     "_id":"vcsetting5c754feaa",
		*     "vcid": "vc5c754feaa",
		*     "name":"Setting Name",
		*     "userId": "us5c754feab",
		*     "type": "Type of Setting",
		*     "timestamp": "2018-12-01",
		*     "value": {"any name": "any value"}
		*   }]
		* }
		*/

	// get VC Settings
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var latestOnly = false; 	// as default show all settings
			var sysAdmin = req.query.sysadmin ? true : false;

			req.auditDescription = 'Visbo Center Setting (Read)';
			req.auditSysAdmin = sysAdmin;
			req.auditTTLMode = 1;

			logger4js.info("Get Visbo Center Setting for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);

			var query = {};
			if (req.query.refDate && Date.parse(req.query.refDate)){
				var refDate = new Date(req.query.refDate);
				var compare = req.query.refNext ? {$gt: refDate} : {$lt: refDate};
				query = { $or: [ { timestamp: compare }, { timestamp: {$exists: false}  } ] };
				latestOnly = true;
			}
			query.vcid = req.oneVC._id
			if (req.query.name) query.name = req.query.name;
			if (req.query.type) query.type = req.query.type;
			if (req.query.userId && mongoose.Types.ObjectId.isValid(req.query.userId)) query.userId = req.query.userId;

			logger4js.info("Find VC Settings with query %O", query);
			var queryVCSetting = VCSetting.find(query);
			// queryVCSetting.select('_id vcid name');
			if (req.query.refNext)
				queryVCSetting.sort('type name userId +timestamp')
			else
				queryVCSetting.sort('type name userId -timestamp')
			queryVCSetting.lean();
			queryVCSetting.exec(function (err, listVCSetting) {
				if (err) {
					errorHandler(err, res, `DB: GET VC Settings ${req.oneVC._id} Find`, `Error getting Setting for VisboCenter ${req.oneVC.name}`)
					return;
				}
				for (let i = 0; i < listVCSetting.length; i++){
					// Remove Password Information
					if (listVCSetting[i].type == "SysConfig" && listVCSetting[i].name == "SMTP"
					&& listVCSetting[i].value && listVCSetting[i].value.auth && listVCSetting[i].value.auth.pass) {
						listVCSetting[i].value.auth.pass = ""
						break;
					}
				}
				if (listVCSetting.length > 1 && latestOnly){
					var listVCSettingfiltered = [];
					listVCSettingfiltered.push(listVCSetting[0]);
					for (let i = 1; i < listVCSetting.length; i++){
						//compare current item with previous and ignore if it is the same type, name, userId
						logger4js.trace("compare: :%s: vs. :%s:", JSON.stringify(listVCSetting[i]), JSON.stringify(listVCSetting[i-1]) );
						if (listVCSetting[i].type != listVCSetting[i-1].type
						|| listVCSetting[i].name != listVCSetting[i-1].name
						|| JSON.stringify(listVCSetting[i].userId) != JSON.stringify(listVCSetting[i-1].userId)) {
							listVCSettingfiltered.push(listVCSetting[i])
							logger4js.trace("compare unequal: ", listVCSetting[i]._id != listVCSetting[i-1]._id);
						}
					}
					logger4js.debug("Found %d Project Versions after Filtering", listVCSettingfiltered.length);

					req.auditInfo = listVCSettingfiltered.length;
					return res.status(200).send({
						state: 'success',
						message: 'Returned Visbo Project Versions',
						count: listVCSettingfiltered.length,
						vcsetting: listVCSettingfiltered
					});
				} else {
					req.auditInfo = listVCSetting.length;
					return res.status(200).send({
						state: 'success',
						message: 'Returned Visbo Project Versions',
						count: listVCSetting.length,
						vcsetting: listVCSetting
					});
				}
			});
		})

	/**
		* @api {post} /vc/:vcid/setting Setting: create one
		* @apiVersion 1.0.0
		* @apiGroup Visbo Center Properties
		* @apiName PostVisboCenterSetting
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Post creates a new setting inside the Visbo Center
		*
		* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
		* @apiError {number} 400 no valid setting definition
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a Visbo Center Setting
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/setting
		*  {
	  *    "name":"My first Setting",
		*    "type": "Type of Setting",
		*    "timestamp": "2018-12-01",
	  *    "value": {"any name": "any value"}
	  *  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Returned Visbo Center Setting",
		*   "vcsetting":[{
		*     "_id":"vcsetting5c754feaa",
		*     "vcid": "vc5c754feaa",
		*     "name":"My first Setting",
		*     "type": "Type of Setting",
		*     "timestamp": "2018-12-01",
		*     "value": {"any name": "any value"}
		*   }]
		* }
		*/

	// Create Visbo Center Setting
		.post(function(req, res) {
			// User is authenticated already
			var userId = req.decoded._id;
			var useremail = req.decoded.email;

			req.auditDescription = 'Visbo Center Setting (Create)';

			logger4js.trace("Post a new Visbo Center Setting Req Body: %O Name %s", req.body, req.body.name);
			logger4js.info("Post a new Visbo Center Setting with name %s executed by user %s sysadmin %s", req.body.name, useremail, req.query.sysadmin);

			if (req.body.name) req.body.name = req.body.name.trim();
			if (req.body.type) req.body.type = req.body.type.trim();
			if (!validate.validateName(req.body.name, false) || !req.body.value || !validate.validateObjectId(req.body.userId, true)
			|| !validate.validateDate(req.body.timestamp, true) || !validate.validateName(req.body.type, true)) {
				logger4js.debug("Post a new Visbo Center Setting body or value not accepted %O", req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'No valid setting definition'
				});
			}
			if ((!req.query.sysadmin && !(req.combinedPerm.vc & constPermVC.Modify))
			|| (req.query.sysadmin && !(req.combinedPerm.system & constPermSystem.Modify))) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			logger4js.debug("Post Setting to VC %s Permission is ok", req.params.vcid);
			var vcSetting = new VCSetting();
			vcSetting.name = req.body.name;
			vcSetting.vcid = req.params.vcid;
			vcSetting.value = req.body.value;
			vcSetting.type = 'Custom';
			if (req.body.userId) vcSetting.userId = req.body.userId;
			if (req.body.type
			&& req.body.type != 'SysValue' && req.body.type != 'SysConfig'	// reserved Names for System Config
			&& req.params.vcid.toString() != getSystemVC()._id.toString()) {			// do not allow creation of new Settings through ReST for System Object
				vcSetting.type = req.body.type;
			}
			var dateValue = req.body.timestamp &&  Date.parse(req.body.timestamp) ? new Date(req.body.timestamp) : new Date();
			if (req.body.timestamp) vcSetting.timestamp = dateValue;

			vcSetting.save(function(err, oneVCSetting) {
				if (err) {
					errorHandler(err, res, `DB: POST VC Settings ${req.params.vcid} save`, `Error creating VisboCenter Setting ${req.oneVC.name}`)
					return;
				}
				req.oneVCSetting = oneVCSetting;
				return res.status(200).send({
					state: 'success',
					message: 'Inserted Visbo Center Setting',
					vcsetting: [ oneVCSetting ]
				});
			});
		})

		router.route('/:vcid/setting/:settingid')

	/**
	  * @api {delete} /vc/:vcid/setting/:settingid Setting: delete one
	  * @apiVersion 1.0.0
	  * @apiGroup Visbo Center Properties
	  * @apiName DeleteVisboCenterSetting
	  * @apiHeader {String} access-key User authentication token.
	  * @apiDescription Deletes the specified setting in the Visbo Center
	  *
		* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete a Visbo Center Setting
		* @apiError {number} 409 Visbo Center Setting does not exists
		*
	  * @apiExample Example usage:
	  *   url: http://localhost:3484/vc/:vcid/setting/:settingid
	  * @apiSuccessExample {json} Success-Response:
	  * HTTP/1.1 200 OK
	  * {
	  *   "state":"success",
	  *   "message":"Visbo Center Setting deleted"
	  * }
	  */

	// Delete Visbo Center Setting
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;

			req.auditDescription = 'Visbo Center Setting (Delete)';

			logger4js.info("DELETE Visbo Center Setting for userid %s email %s and vc %s setting %s ", userId, useremail, req.params.vcid, req.params.settingid);

			if ((!req.query.sysadmin && !(req.combinedPerm.vc & constPermVC.Modify))
			|| (req.query.sysadmin && !(req.combinedPerm.system & constPermSystem.Modify))) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			logger4js.debug("Delete Visbo Center Setting after permission check %s", req.params.vcid);
			var query = {};
			query._id = req.params.settingid;
			query.vcid = req.params.vcid;
			var queryVCSetting = VCSetting.findOne(query);
			// queryVCSetting.select('_id vcid name');
			queryVCSetting.exec(function (err, oneVCSetting) {
				if (err) {
					errorHandler(err, res, `DB: DELETE VC Setting ${req.params.settingid} Find`, `Error deleting VisboCenter Setting ${req.params.settingid}`)
					return;
				}
				if (!oneVCSetting) {
					return res.status(409).send({
						state: 'failure',
						message: 'Visbo Center Setting not found',
						error: err
					});
				}
				req.oneVCSetting = oneVCSetting;
				// if (oneVCSetting.type == 'Internal') {
				// 	return res.status(400).send({
				// 		state: 'failure',
				// 		message: 'Not allowed to delete Internal Settings'
				// 	});
				// }
				logger4js.info("Found the Setting for VC");
				oneVCSetting.remove(function(err, empty) {
					if (err) {
						errorHandler(err, res, `DB: DELETE VC Setting ${req.params.settingid} Delete`, `Error deleting VisboCenter Setting ${req.params.settingid}`)
						return;
					}
					return res.status(200).send({
						state: 'success',
						message: 'Deleted Visbo Center Setting'
					});
				});
			});
		})

	/**
		* @api {put} /vc/:vcid/setting/:settingid Setting: update one
		* @apiVersion 1.0.0
		* @apiGroup Visbo Center Properties
		* @apiName PutVisboCenterSetting
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Put updates a setting definition inside the Visbo Center
		*
		* @apiPermission Authenticated and Permission: View Visbo Center, Modify Visbo Center.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Update a Visbo Center Setting
		* @apiError {number} 409 Visbo Center Setting does not exists or was updated in between.
		*
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/setting/:settingid
		*  {
	  *    "name":"My first Setting Renamed",
		*    "type": "Type of Setting",
		*    "timestamp": "2018-12-02",
	  *    "value": "any"
	  *   }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Returned Visbo Center Setting",
		*   "vcsetting":[{
		*     "_id":"vcsetting5c754feaa",
		*     "vcid": "vc5c754feaa",
		*     "name":"My first Setting Renamed",
		*     "type": "Type of Setting",
		*     "timestamp": "2018-12-02",
		*     "value": {"any name": "any value"}
		*   }]
		* }
		*/

// change setting
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var settingChangeSMTP = false;

		req.auditDescription = 'Visbo Center Setting (Update)';

		logger4js.info("PUT Visbo Center Setting for userid %s email %s and vc %s setting %s ", userId, useremail, req.params.vcid, req.params.settingid);

		if (req.body.name) req.body.name = req.body.name.trim();
		if (req.body.type) req.body.type = req.body.type.trim();
		if (!validate.validateName(req.body.name, true) || !validate.validateObjectId(req.body.userId, true)
		|| !validate.validateDate(req.body.timestamp, true) || !validate.validateName(req.body.type, true)) {
			logger4js.debug("PUT a new Visbo Center Setting body or value not accepted %O", req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'No valid setting definition'
			});
		}

		if ((!req.query.sysadmin && !(req.combinedPerm.vc & constPermVC.Modify))
		|| (req.query.sysadmin && !(req.combinedPerm.system & constPermSystem.Modify))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		logger4js.debug("Update Visbo Center Setting after permission check %s", req.params.vcid);
		var query = {};
		query._id =  req.params.settingid;
		query.vcid = req.params.vcid;
		var queryVCSetting = VCSetting.findOne(query);
		// queryVCSetting.select('_id vcid name');
		queryVCSetting.exec(function (err, oneVCSetting) {
			if (err) {
				errorHandler(err, res, `DB: PUT VC Setting ${req.params.settingid} Find`, `Error updating VisboCenter Setting ${req.params.settingid}`)
				return;
			}
			if (!oneVCSetting) {
				return res.status(409).send({
					state: 'failure',
					message: 'Visbo Center Setting not found',
					error: err
				});
			}
			logger4js.info("Found the Setting for VC Updated");
			if (req.body.updatedAt && Date.parse(req.body.updatedAt) && oneVCSetting.updatedAt.getTime() != (new Date(req.body.updatedAt)).getTime()) {
				logger4js.info("VC Setting: Conflict with updatedAt %s %s", oneVCSetting.updatedAt.getTime(), (new Date(req.body.updatedAt)).getTime());
				return res.status(409).send({
					state: 'failure',
					message: 'Visbo Center Setting already updated inbetween',
					vcsetting: [ oneVCSetting ]
				});
			}
			var isSystemVC = getSystemVC()._id.toString() == oneVCSetting.vcid.toString();
			var isTask = isSystemVC && oneVCSetting.type == "Task" ? true: false;
			var isSysConfig = isSystemVC && oneVCSetting.type == "SysConfig" ? true: false;

			if (!isTask) {
				if (isSysConfig) {
					// only update Value do not change name, type, timestamp and userId
					var password = "";
					if (oneVCSetting.name == "SMTP") {
						if (oneVCSetting.value && oneVCSetting.value.auth && oneVCSetting.value.auth.pass)
							settingChangeSMTP = true;
							password = oneVCSetting.value.auth.pass
					}
					if (req.body.value) oneVCSetting.value = req.body.value;
					if (settingChangeSMTP) {
						if (req.body.value.auth && req.body.value.auth.pass) {
							// encrypt new password before save
							oneVCSetting.value.auth.pass = crypt.encrypt(req.body.value.auth.pass);
							logger4js.warn("Update SMTP Setting New Password");

						} else {
							// restore old encrypted password
							oneVCSetting.value.auth.pass = password;
						}
					}
				} else  {
					// allow to change all
					if (req.body.name) oneVCSetting.name = req.body.name;
					if (req.body.userId) oneVCSetting.userId = req.body.userId;
					if (req.body.type) oneVCSetting.type = req.body.type;
					if (req.body.value) oneVCSetting.value = req.body.value;
					var dateValue = (req.body.timestamp && Date.parse(req.body.timestamp)) ? new Date(req.body.timestamp) : new Date();
					if (req.body.timestamp) oneVCSetting.timestamp = dateValue;
				}
				oneVCSetting.save(function(err, resultVCSetting) {
					if (err) {
						errorHandler(err, res, `DB: PUT VC Setting ${req.params.settingid} Save`, `Error updating VisboCenter Setting`)
						return;
					}
					if (isSysConfig) {
						if (resultVCSetting.name == 'DEBUG') {
							logger4js.info("Update System Log Setting");
							logging.setLogLevelConfig(resultVCSetting.value)
						}
						reloadSystemSetting();
					}
					req.oneVCSetting = resultVCSetting;
					if (settingChangeSMTP) {
						resultVCSetting.value.auth.pass = "";
					}
					return res.status(200).send({
						state: 'success',
						message: 'Updated Visbo Center Setting',
						vcsetting: [ resultVCSetting ]
					});
				});
			} else {
				// Special Handling for Tasks required to avoid parallel updates by ReST and Task-Schedule
				if (oneVCSetting.value && req.body.value) {
					// only update nextRun, interval and taskSpecific, do not change type, name, timestamp, userId
					if (req.body.value.interval) oneVCSetting.value.interval = req.body.value.interval;
					if (req.body.value.taskSpecific) oneVCSetting.value.taskSpecific = req.body.value.taskSpecific;
					var dateValue = (req.body.value.nextRun && Date.parse(req.body.value.nextRun)) ? new Date(req.body.value.nextRun) : new Date();
					oneVCSetting.value.nextRun = dateValue;
				}
				var updateQuery = {_id: oneVCSetting._id, "$or": [{"value.lockedUntil": {$exists: false}}, {"value.lockedUntil": {$lt: new Date()}}]};
				var updateOption = {upsert: false};
				var updateUpdate = {$set : {'value.nextRun' : oneVCSetting.value.nextRun, 'value.interval' : oneVCSetting.value.interval, 'value.taskSpecific' : oneVCSetting.value.taskSpecific} };
				logger4js.debug("VC Seting Task (%s/%s) Before Save %O", oneVCSetting.name, oneVCSetting._id, oneVCSetting);

				VCSetting.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
						if (err) {
							errorHandler(err, undefined, `DB: VC Setting Update Task`, undefined)
						}
						logger4js.debug("VC Seting Task (%s/%s) Saved %O", oneVCSetting.name, oneVCSetting._id, result);
						if (result.nModified == 1) {
							req.oneVCSetting = oneVCSetting;
							return res.status(200).send({
								state: 'success',
								message: 'Updated Visbo Center Setting',
								vcsetting: [ oneVCSetting ]
							});
						} else {
							logger4js.info("VC Seting Task (%s/%s) locked already by another Server", oneVCSetting.name, oneVCSetting._id);
							return res.status(409).send({
								state: 'failure',
								message: 'Visbo Center Setting already updated inbetween',
								vcsetting: [ oneVCSetting ]
							});
						}
				})


			}
		});
	})

module.exports = router;
