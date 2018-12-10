var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');

var assert = require('assert');
var auth = require('./../components/auth');
var verifyVc = require('./../components/verifyVc');
var verifyVg = require('./../components/verifyVg');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboGroup = mongoose.model('VisboGroup');
var VCGroupUser = mongoose.model('VisboGroupUser');
var VCUser = mongoose.model('VCUser');
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

var logging = require('../components/logging');
var logModule = "VC";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

// Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// Register the VC middleware to check that the user has access to the VC
router.use('/', verifyVc.getAllGroups);
// Register the VC middleware to check the vcid param
router.param('vcid', verifyVc.getVcidGroups);
// Register the Group middleware to check the groupid param
router.param('groupid', verifyVg.getGroupId);

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
	var updateQuery = {vcid: vcid, deleted: {$exists: false}};
	var updateOption = {upsert: false};
	var updateUpdate = {$set: {"vc": { "name": name}}};

	logger4js.debug("Update VPs for VC %s with new Name %s", vcid, name)
	VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error("Problem updating VPs for VC %s vpvCount: %s", vcid, err);
		}
		logger4js.trace("Updated VP for VC %s Populate Name changed %d %d", vcid, result.n, result.nModified)
	})
}

// undelete the VPs after undelete VC and set the actual VC Name
var unDeleteVP = function(vcid, name){
	var updateQuery = {vcid: vcid, 'deleted.byParent': true};
	var updateOption = {upsert: false};
	var updateUpdate = {$unset: {deleted: ""}, $set: {"vc": { "name": name}}};

	logger4js.debug("Update VPs for VC %s with new Name %s", vcid, name)
	VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error("Problem updating VPs for VC %s set undelete", vcid, err);
		}
		logger4js.trace("Updated VP for VC %s set undelete changed %d %d", vcid, result.n, result.nModified)
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

			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Center (Read)';

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
				// query['deleted.deletedAt'] = {$exists: true}				//  deleted
				query.deleted = {$exists: true}				//  deleted
			} else {
				// query['deleted.deletedAt'] = {$exists: false}				// Not deleted
				query.deleted = {$exists: false}				// Not deleted
			}
			query.system = req.query.systemvc ? {$eq: true} : {$ne: true};						// do not show System VC
			logger4js.trace("Check for VC query %O", query);

			var queryVC = VisboCenter.find(query);
			queryVC.select('-users');
			queryVC.lean();
			queryVC.exec(function (err, listVC) {
				if (err) {
					logger4js.fatal("VC Get DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting VisboCenters',
						error: err
					});
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
	 * Optinal an initial user can be defined who will get Visbo Center Administrator, if none is specified, the current user is added.
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
	 *  "description": "Visbo Center Descripton"
	 *  "users":[
	 *   {
	 *    "email":"example1@visbo.de",
	 *    "role": "Admin"
	 *   },
	 *   {
	 *    "email":"example2@visbo.de",
	 *    "role": "User"
	 *   }
	 *  ]
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
	 *    "vpCount": 0,
	 *    "users":[
	 *     {
	 *      "_id": "us5c754feab"
	 *      "email": "example@visbo.de",
	 *      "role": "Admin"
	 *     },
	 *    {
	 *     "email": "example2@visbo.de",
	 *     "role": "User",
	 *     "_id": "us5c754feac"
	 *    }
	 *   ]
	 *  }]
	 * }
	 */
// Create a Visbo Center
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var name = (req.body.name || '').trim();
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center (Create)';

		logger4js.trace("Post a new Visbo Center Req Body: %O Name %s", req.body, name);
		logger4js.info("Post a new Visbo Center with name %s executed by user %s Perm %O ", name, useremail, req.combinedPerm);

		if (name == '') {
			return res.status(400).send({
				state: "failure",
				message: "Empty Visbo Center Name not allowed"
			});
		}
		if (!(req.combinedPerm.system & constPermSystem.CreateVC)) {
			return res.status(403).send({
				state: "failure",
				message: "No permission to create Visbo Center"
			});
		}
		// check that VC name is unique
		var query = {};
		query.name = name;								// name Duplicate check
		// query['deleted.deletedAt'] = {$exists: false};
		query.deleted = {$exists: false};
		VisboCenter.findOne(query, function(err, vc) {
			if (err) {
				logger4js.fatal("VC Post DB Connection ", err);
				return res.status(500).send({
					state: "failure",
					message: "database error",
					error: err
				});
			}
			if (vc) {
				return res.status(409).send({
					state: "failure",
					message: "Visbo Center already exists"
				});
			}
			logger4js.debug("Create Visbo Center (name is already unique) check users");
			var newVC = new VisboCenter();
			newVC.name = name;
			newVC.description = (req.body.description || "").trim();
			newVC.vpCount = 0;
			// Check for Valid User eMail remove non existing eMails

			// check the users that they exist already, if not ignore the non existing users
			var vcUsers = new Array();
			if (req.body.users) {
				for (var i=0; i < req.body.users.length; i++) {
					req.body.users[i].email = req.body.users[i].email.toLowerCase();
					// build up unique user list vcUsers to check that they exist
					if (!vcUsers.find(findUser, req.body.users[i].email)){
						vcUsers.push(req.body.users[i].email)
					}
				};
			};
			logger4js.debug("Check users if they exist %s", JSON.stringify(vcUsers));
			var queryUsers = User.find({'email': {'$in': vcUsers}});
			queryUsers.select('_id email');
			queryUsers.lean();
			queryUsers.exec(function (err, listUsers) {
				if (err) {
					logger4js.fatal("VC Post DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Users for VisboCenters',
						error: err
					});
				}
				if (listUsers.length != vcUsers.length)
					logger4js.warn("Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vcUsers.length);

				// Create new VC Group and add all existing Admin Users to the new Group
				var newVG = new VisboGroup();
				newVG.name = 'Visbo Center Admin'
				newVG.groupType = 'VC';
				newVG.internal = true;
				newVG.global = true;
				newVG.permission = {vc: Const.constPermVCAll }
				newVG.vcid = newVC._id;
				newVG.users = [];
				for (var i = 0; i < listUsers.length; i++) {
					// build up user list for Visbo Project Admin Group
					newVG.users.push({email: listUsers[i].email, userId: listUsers[i]._id});
				};
				// no admin defined, add current user as admin
				if (newVG.users.length == 0)
					newVG.users.push({email: useremail, userId: userId});

				logger4js.debug("VC Post Create 1. Group for vc %s group %O ", newVC._id, newVG);
				newVG.save(function(err, vg) {
					if (err) {
						logger4js.fatal("VC Post Create 1. Group for vc %s DB Connection ", newVC._id, err);
					}
				});

				logger4js.debug("Save VisboCenter %s %s", newVC.name, newVC._id);
				newVC.save(function(err, vc) {
					if (err) {
						logger4js.fatal("VC Post DB Connection ", err);
						return res.status(500).send({
							state: "failure",
							message: "database error, failed to create visbocenter",
							error: err
						});
					}
					req.oneVC = vc;
					return res.status(200).send({
						state: "success",
						message: "Successfully created new VisboCenter",
						vc: [ vc ]
					});
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
	*     "vpCount": "0",
 	*     "users":[
 	*      {
 	*       "email":"example1@visbo.de",
 	*       "role":"Admin",
 	*       "userId":"us5c754feab"
 	*      },
 	*      {
 	*       "email":"example2@visbo.de",
 	*       "role":"User",
 	*       "userId":"us5c754feac"
 	*      }
 	*     ]
 	*   }],
	*   "perm": {"vc": 307}
 	* }
	*/
// Get a specific VC
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;

		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center (Read)';

		logger4js.info("Get Visbo Center for userid %s email %s and vc %s oneVC %s Perm %O", userId, useremail, req.params.vcid, req.oneVC.name, req.combinedPerm);
		// we have found the VC already in middleware
		return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Centers',
				vc: [req.oneVC],
				perm: req.combinedPerm
			});
	})

/**
	* @api {put} /vc/:vcid Update Visbo Center
	* @apiVersion 1.0.0
	* @apiGroup Visbo Center
	* @apiName UpdateVisboCenters
	* @apiDescription Put updates a specific Visbo Center.
	* the system checks if the user has access permission to it.
	* Only basic properties of the Visbo Centers can be changed. The modification of users is done with special calls to add/delete users
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
	*  "description": "Changed Descripton"
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
	*    "vpCount": "0",
	*    "users":[
	*     {
	*      "userId":"us5aaf992",
	*      "email":"example@visbo.de",
	*      "role":"Admin"
	*     },
	*     {
	*      "email":"example2@visbo.de",
	*      "role":"User",
	*      "userId":"us5aaf993"
	*     }
	*    ]
	*  }]
	* }
	*/

// Change Visbo Center
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center (Update)';

		logger4js.info("PUT/Save Visbo Center for userid %s vc %s oneVC %s Perm %O ", userId, req.params.vcid, req.oneVC.name, req.combinedPerm);

		if (!req.body) {
			return res.status(400).send({
				state: 'failure',
				message: 'No Body provided for update'
			});
		}
		var vcUndelete = false;
		// undelete the VC in case of change
		// TODO check correct undelete Permission
		if (req.oneVC.deleted && req.oneVC.deleted.deletedAt) {
			req.oneVC.deleted = undefined;
			vcUndelete = true;
			logger4js.debug("Undelete VC %s flag %O", req.oneVC._id, req.oneVC.deleted);
		}

		if ((!vcUndelete && !(req.combinedPerm.vc & constPermVC.Modify))
		|| (vcUndelete && !(req.combinedPerm.system & constPermSystem.DeleteVC))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		var name = (req.body.name || '').trim();
		if (name == '') name = req.oneVC.name;
		var vpPopulate = req.oneVC.name != name ? true : false;

		logger4js.debug("PUT/Save Visbo Center %s Name :%s: Namechange: %s", req.oneVC._id, name, vpPopulate);
		req.oneVC.name = name;
		if (req.body.description != undefined) {
			req.oneVC.description = req.body.description.trim();
		}
		// check that VC name is unique
		var query = {};
		query._id = {$ne: req.oneVC._id}
		query.name = name;								// name Duplicate check
		// query['deleted.deletedAt'] = {$exists: false};
		query.deleted = {$exists: false};

		VisboCenter.findOne(query, function(err, vc) {
			if (err) {
				logger4js.fatal("VC Put DB Connection ", err);
				return res.status(500).send({
					state: "failure",
					message: "database error",
					error: err
				});
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
					logger4js.fatal("VC Put DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Center',
						error: err
					});
				}
				// Update underlying projects if name has changed
				if (vpPopulate){
					logger4js.debug("VC PUT %s: Update SubProjects to %s", oneVC._id, oneVC.name);
					updateVCName(oneVC._id, oneVC.name);
				}
				if (vcUndelete){
					logger4js.debug("VC PUT %s: Undelete VC and VPs", oneVC._id);
					unDeleteVP(oneVC._id, oneVC.name);
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

		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
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
		logger4js.trace("Delete Visbo Center %s Status %s %O", req.params.vcid, req.oneVC.deleted, req.oneVC);
		if (!(req.oneVC.deleted && req.oneVC.deleted.deletedAt)) {
			req.oneVC.deleted = {deletedAt: new Date(), byParent: false }
			logger4js.trace("Delete Visbo Center after premission check %s %O", req.params.vcid, req.oneVC);
			req.oneVC.save(function(err, oneVC) {
				if (err) {
					logger4js.fatal("VC Delete DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error deleting Visbo Center',
						error: err
					});
				}
				req.oneVC = oneVC;
				logger4js.debug("VC Delete %s: Update SubProjects to %s", req.oneVC._id, req.oneVC.name);
				var updateQuery = {}
				updateQuery.vcid = req.oneVC._id;
				// updateQuery['deleted.deletedAt'] = {$exists: false};
				updateQuery.deleted = {$exists: false};
				var updateUpdate = {$set: {deleted: {deletedAt: new Date(), byParent: true }}};
				var updateOption = {upsert: false, multi: "true"};
				VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
					if (err){
						logger4js.fatal("VC Delete DB Connection ", err);
						return res.status(500).send({
							state: 'failure',
							message: 'Error updating Visbo Projects',
							error: err
						});
					}
					logger4js.debug("VC Delete found %d VPs and updated %d VPs", result.n, result.nModified)
					return res.status(200).send({
						state: 'success',
						message: 'Deleted Visbo Center'
					});
				});
			});
		} else {
			// VC is already marked as deleted, now destory it including VP and VPV
			// MS TODO: Destroy VC
			// Collect all ProjectIDs of this VC
			var query = {};
			query.vcid = req.oneVC._id
			var queryVP = VisboProject.find(query);
			queryVP.select = '_id';
			queryVP.lean();
			queryVP.exec(function (err, listVP) {
				if (err) {
					logger4js.fatal("VC Destroy: VP GET DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Internal Server Error with DB Connection',
						error: err
					});
				};
				logger4js.debug("VC Destroy: Found %d Projects", listVP.length);
				var vpidList = [];
				for (var i=0; i < listVP.length; i++) vpidList.push(listVP[i]._id);
				logger4js.trace("VC Destroy: ProjectIDs %O", vpidList);
				// Delete all VPVs relating to these ProjectIDs
				var queryvpv = {vpid: {$in: vpidList}};
				VisboProjectVersion.deleteMany(queryvpv, function (err) {
					if (err){
						logger4js.error("VC Destroy: %s Problem deleting VPVs %O", req.oneVC._id, err);
					}
					logger4js.trace("VC Destroy: %s VPVs Deleted", req.oneVC._id)
				})
				// Delete all VP Portfolios relating to these ProjectIDs
				var queryvpf = {vpid: {$in: vpidList}};
				VisboPortfolio.deleteMany(queryvpf, function (err) {
					if (err){
						logger4js.error("VC Destroy: %s Problem deleting VP Portfolios %O", req.oneVC._id, err);
					}
					logger4js.trace("VC Destroy: %s VP Portfolios Deleted", req.oneVC._id)
				})
				// Delete Audit Trail of VPs & VPVs
				var queryaudit = {'vp.vpid': {$in: vpidList}};
				VisboAudit.deleteMany(queryaudit, function (err) {
					if (err){
						logger4js.error("VC Destroy: %s Problem deleting Audit %O", req.oneVC._id, err);
					}
					logger4js.trace("VC Destroy: %s VP Audit Deleted", req.oneVC._id)
				});
				// Delete all VPs regarding these ProjectIDs
				var queryvp = {_id: {$in: vpidList}};
				VisboProject.deleteMany(queryvp, function (err) {
					if (err){
						logger4js.error("VC Destroy: %s Problem deleting VPs %O", req.oneVC._id, err);
					}
					logger4js.trace("VC Destroy: %s VPs Deleted", req.oneVC._id)
				});
				// Delete all VCCosts
				var queryvcid = {vcid: req.oneVC._id};
				VCCost.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error("VC Destroy: %s Problem deleting VC Cost %O", req.oneVC._id, err);
					}
					logger4js.trace("VC Destroy: %s VC Costs Deleted", req.oneVC._id)
				});
				// Delete all VCRoles
				VCRole.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error("VC Destroy: %s Problem deleting VC Role %O", req.oneVC._id, err);
					}
					logger4js.trace("VC Destroy: %s VC Roles Deleted", req.oneVC._id)
				});
				// Delete all VCSettings
				VCSetting.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error("VC Destroy: %s Problem deleting VC Role %O", req.oneVC._id, err);
					}
					logger4js.trace("VC Destroy: %s VC Roles Deleted", req.oneVC._id)
				});

				// Delete all Groups
				VisboGroup.deleteMany(queryvcid, function (err) {
					if (err){
						logger4js.error("VC Destroy: %s Problem deleting VC Groups %O", req.oneVC._id, err);
					}
					logger4js.trace("VC Destroy: %s VC Groups Deleted", req.oneVC._id)
				});

				// Delete Audit Trail of VC
				var queryaudit = {'vc.vcid': req.oneVC._id};
				VisboAudit.deleteMany(queryaudit, function (err) {
					if (err){
						logger4js.error("VC Destroy: %s Problem deleting VC Audit %O", req.oneVC._id, err);
					}
					logger4js.trace("VC Destroy: %s VC Audit Deleted", req.oneVC._id)
				});
				// Delete the VC  itself
				return res.status(200).send({
					state: 'success',
					message: 'VC Destroyed'
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center Audit (Read)';

		logger4js.info("Get Visbo Center Audit Trail for userid %s email %s and vc %s oneVC %s Perm %O", userId, useremail, req.params.vcid, req.oneVC.name, req.combinedPerm);
		if (!(req.combinedPerm.vc & constPermVC.ViewAudit)) {
			return res.status(403).send({
					state: 'failure',
					message: 'You need to have View Audit permission to get audit trail'
				});
		}

		var from, to, maxcount = 1000;
		logger4js.debug("Get Audit Trail DateFilter from %s to %s", req.query.from, req.query.to);
		if (req.query.from && Date.parse(req.query.from)) from = new Date(req.query.from)
		if (req.query.to && Date.parse(req.query.to)) to = new Date(req.query.to)
		if (parseInt(req.query.maxcount) > 0) maxcount = parseInt(req.query.maxcount);
		// no date is set to set to to current Date and recalculate from afterwards
		if (!from && !to) to = new Date();
		logger4js.trace("Get Audit Trail at least one value is set %s %s", from, to);
		if (!from) {
			from = new Date(to);
			from.setDate(from.getDate()-1)
		}
		if (!to) {
			to = new Date(from);
			to.setDate(to.getDate()+1)
		}
		logger4js.trace("Get Audit Trail DateFilter after recalc from %s to %s", from, to);

		var query = {'vc.vcid': req.oneVC._id, "createdAt": {"$gte": from, "$lt": to}};
		// now fetch all entries related to this vc
		VisboAudit.find(query)
		.limit(maxcount)
		.sort({createdAt: -1})
		.lean()
		.exec(function (err, listVCAudit) {
			if (err) {
				logger4js.fatal("VC Audit Get DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Audit',
					error: err
				});
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
	*     "vpids": ["vp5c754feaa","vp5c754febb"],
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center Group (Read)';

		logger4js.info("Get Visbo Center Group for userid %s email %s and vc %s oneVC %s Perm %O", userId, useremail, req.params.vcid, req.oneVC.name, req.combinedPerm);

		var query = {};
		query.vcid = req.oneVC._id;
		query.groupType = req.oneVC.system ? 'System' : 'VC';

		var queryVCGroup = VisboGroup.find(query);
		queryVCGroup.select('-vpids');
		queryVCGroup.lean();
		queryVCGroup.exec(function (err, listVCGroup) {
			if (err) {
				logger4js.fatal("VC Get Group DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Groups',
					error: err
				});
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
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Center Groups',
					count: listVCGroup.length,
					groups: listVCGroup,
					users: listVCUsers
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

		var vgName = req.body.name ? req.body.name.trim() : '';
		var newPerm = {};
		var vgGlobal = req.body.global == true;
		groupType = req.oneVC.system ? 'System' : 'VC';
		if ( req.body.permission ) {
			if (groupType == 'System') newPerm.system = (parseInt(req.body.permission.system) || undefined) & Const.constPermSystemAll
			if (groupType == 'VC' || vgGlobal) newPerm.vc = (parseInt(req.body.permission.vc) || undefined) & Const.constPermVCAll
			if (vgGlobal) newPerm.vp = (parseInt(req.body.permission.vp) || undefined) & Const.constPermVPAll
		}
		if (req.body.name) req.body.name = req.body.name.trim();

		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center Group (Create)';

		logger4js.info("Post a new Visbo Center Group with name %s executed by user %s ", req.body.name, useremail);
		logger4js.debug("Post a new Visbo Center Group Req Body: %O Name %s Perm %O", req.body, vgName, req.combinedPerm);

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
		if (!req.body.name) {
			logger4js.info("Body is inconsistent VC %s Body %O", req.oneVC._id, req.body);
			return res.status(400).send({
				state: 'failure',
				message: 'No valid Group Definition'
			});
		}
		logger4js.debug("Post Group to VC %s Permission is ok, check unique name", req.params.vcid);
		var queryVCGroup = VisboGroup.findOne({'vcid': req.params.vcid, 'name': req.body.name});
		queryVCGroup.select('name');
		queryVCGroup.lean();
		queryVCGroup.exec(function (err, oneVCGroup) {
			if (err) {
				logger4js.fatal("VC Post Group DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Visbo Center Groups',
					error: err
				});
			}
			if (oneVCGroup) {
				return res.status(409).send({
					state: 'failure',
					message: 'Visbo Center Group already exists'
				});
			}
			logger4js.debug("Post Group %s to VC %s now", req.body.name, req.params.vcid);

			var vcGroup = new VisboGroup();
			// fill in the required fields
			vcGroup.name = req.body.name;
			vcGroup.vcid = req.params.vcid;
			vcGroup.global = vgGlobal;
			vcGroup.permission = newPerm;
			vcGroup.groupType = groupType;
			vcGroup.internal = false;
			vcGroup.save(function(err, oneVcGroup) {
				if (err) {
					logger4js.fatal("VC Post Group DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Center Group',
						error: err
					});
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
					message: 'Inserted Visbo Center Group',
					groups: [ resultGroup ]
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
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
		logger4js.debug("Delete Visbo Center Group after premission check %s", req.params.vcid);

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
				logger4js.fatal("VC Delete Group DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error deleting Visbo Center Group',
					error: err
				});
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

		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center Group (Update)';

		var vgName = req.body.name ? req.body.name.trim() : '';
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
		if (req.oneGroup.internal) vgName = req.oneGroup.groupName; // do not overwrite internal Group Name
		if (req.oneGroup.groupType != 'VC' && !req.oneVC.system) {
			return res.status(400).send({
				state: 'failure',
				message: 'not a Visbo Center Group'
			});
		}
		logger4js.debug("Update Visbo Center Group after premission check vcid %s groupName %s", req.params.vcid, req.oneGroup.name);

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
		// query['deleted.deletedAt'] = {$exists: false};
		var queryVP = VisboProject.find(query);
		queryVP.select('_id'); // return only _id
		queryVP.lean();
		queryVP.exec(function (err, listVP) {
			if (err) {
				logger4js.fatal("VP GET DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			logger4js.debug("Found %d Projects", listVP.length);
			// logger4js.debug("Found Projects/n", listVP);

			// fill in the required fields
			if (vgName) req.oneGroup.name = vgName;
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
					logger4js.fatal("VC Put Group DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Center Group',
						error: err
					});
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

		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		logger4js.info("Post a new Visbo Center User with name %s  to group executed by user %s with perm %s ", req.body.email, req.oneGroup.name, useremail, req.combinedPerm);
		req.auditDescription = 'Visbo Center User (Add)';

		if (req.body.email) req.body.email = req.body.email.toLowerCase().trim();
		if (!req.body.email) {
			return res.status(400).send({
				state: 'failure',
				message: 'No valid user definition'
			});
		}

		req.auditInfo = req.body.email;
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
			eMailMessage = req.body.message;
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
		var queryUsers = User.findOne({'email': vcUser.email});
		//queryUsers.select('email');
		queryUsers.exec(function (err, user) {
			if (err) {
				logger4js.fatal("Post User to Group cannot find User, DB Connection %s", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Users for VisboCenters',
					error: err
				});
			}
			if (!user) {
				user = new User();
				user.email = vcUser.email;
				logger4js.debug("Create new User %s for VC as %s", vcUser.email, vcUser.role);
				user.save(function(err, user) {
					if (err) {
						logger4js.error("Add User to VC: Error DB Connection %O", err);
						return res.status(500).send({
							state: "failure",
							message: "database error, failed to create user",
							error: err
						});
					}
					// user exists now, now the VC can be updated
					vcUser.userId = user._id;

					req.oneGroup.users.push(vcUser)
					req.oneGroup.save(function(err, vcGroup) {
						if (err) {
							logger4js.error("Error Update VisboGroup %s  with Error %s", req.oneGroup._id, err);
							return res.status(500).send({
								state: "failure",
								message: "database error, failed to update Visbo Group",
								error: err
							});
						}
						req.oneGroup = vcGroup;
						// now send an e-Mail to the user for registration
						var template = __dirname.concat('/../emailTemplates/inviteVCNewUser.ejs')
						var uiUrl =  'http://localhost:4200'
						if (process.env.UI_URL != undefined) {
							uiUrl = process.env.UI_URL;
						}

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
									logger4js.fatal("E-Mail Rendering failed %O", err);
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
						logger4js.error("Error Update VisboGroup %s  with Error %s", req.oneGroup._id, err);
						return res.status(500).send({
							state: "failure",
							message: "database error, failed to update Visbo Group",
							error: err
						});
					}
					req.oneGroup = vcGroup;
					// now send an e-Mail to the user for registration/login
					var template = __dirname.concat('/../emailTemplates/');
					var uiUrl =  'http://localhost:4200'
					var eMailSubject = 'You have been invited to a Visbo Center ' + req.oneVC.name
					if (process.env.UI_URL != undefined) {
						uiUrl = process.env.UI_URL;
					}
					logger4js.debug("E-Mail User Status %O %s", user.status, user.status.registeredAt);
					if (user.status && user.status.registeredAt) {
						// send e-Mail to a registered user
						template = template.concat('inviteVCExistingUser.ejs');
						uiUrl = uiUrl.concat('/vp/', req.oneVC._id);
					} else {
						// send e-Mail to an existing but unregistered user
						template = template.concat('inviteVCNewUser.ejs');
						var secret = 'register'.concat(user._id, user.updatedAt.getTime());
						var hash = createHash(secret);
						uiUrl = 'http://'.concat(uiUrl, '/register/', user._id, '?hash=', hash);
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
								logger4js.fatal("E-Mail Rendering failed %O", err);
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
								users: [ vcUser ]
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
		* @apiError {number} 404 user is not member of the Visbo Center Group
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		logger4js.info("DELETE Visbo Center User by userid %s email %s for user %s Group %s ", userId, useremail, req.params.userid, req.oneGroup._id);

		req.auditDescription = 'Visbo Center User (Delete)';
		req.auditInfo = req.params.userid + ' from ' + req.oneGroup.name;

		var delUser = req.oneGroup.users.find(findUserById, req.params.userid)
		if (delUser) req.auditInfo = delUser.email  + ' from ' + req.oneGroup.name;

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
			return res.status(404).send({
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
		logger4js.debug("Delete Visbo Center User after premission check %s", req.params.userid);
		req.oneGroup.users = newUserList;
		req.oneGroup.save(function(err, vg) {
			if (err) {
				logger4js.error("Error Update VisboCenter Group %s with Error %s", req.oneVC.name, err);
				return res.status(500).send({
					state: "failure",
					message: "database error, failed to update Visbo Center",
					error: err
				});
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
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Center Role (Read)';

			logger4js.info("Get Visbo Center Role for userid %s email %s and vc %s oneVC %s Perm %O", userId, useremail, req.params.vcid, req.oneVC.name, req.combinedPerm);

			var queryVCRole = VCRole.find({'vcid': req.oneVC._id});
			// queryVCRole.select('_id vcid name');
			queryVCRole.lean();
			queryVCRole.exec(function (err, listVCRole) {
				if (err) {
					logger4js.fatal("VC Get Role DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting VisboCenter Roles',
						error: err
					});
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
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Center Role (Create)';

			logger4js.trace("Post a new Visbo Center Role Req Body: %O Name %s", req.body, req.body.name);
			logger4js.info("Post a new Visbo Center Role with name %s executed by user %s ", req.body.name, useremail);

			if (!(req.combinedPerm.vc & constPermVC.Modify)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			if (!req.body.name ) { //|| req.body.uid == undefined) {
				logger4js.debug("Body is inconsistent %O", req.body);
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
					logger4js.fatal("VC Post Role DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Visbo Center Roles',
						error: err
					});
				}
				if (oneVCRole) {
					return res.status(403).send({
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
				vcRole.timestamp = req.body.timestamp ? req.body.timestamp : new Date();
				vcRole.save(function(err, oneVcRole) {
					if (err) {
						logger4js.fatal("VC Post Role DB Connection ", err);
						return res.status(500).send({
							state: 'failure',
							message: 'Error updating Visbo Center Role',
							error: err
						});
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
		* @apiError {number} 404 Visbo Center Role does not exists
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
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Center Role (Delete)';

			logger4js.info("DELETE Visbo Center Role for userid %s email %s and vc %s role %s ", userId, useremail, req.params.vcid, req.params.roleid);

			if (!(req.combinedPerm.vc & constPermVC.Modify)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			logger4js.debug("Delete Visbo Center Role after premission check %s", req.params.vcid);
			var query = {};
			query._id = req.params.roleid;
			query.vcid = req.params.vcid;
			var queryVCRole = VCRole.findOne(query);
			// queryVCRole.select('_id vcid name');
			queryVCRole.exec(function (err, oneVCRole) {
				if (err) {
					logger4js.fatal("VC Delete Role DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting VisboCenter Roles',
						error: err
					});
				}
				if (!oneVCRole) {
					return res.status(404).send({
						state: 'failure',
						message: 'Visbo Center Role not found',
						error: err
					});
				}
				logger4js.info("Found the Role for VC");
				oneVCRole.remove(function(err, empty) {
					if (err) {
						logger4js.fatal("VC Delete Role DB Connection ", err);
						return res.status(500).send({
							state: 'failure',
							message: 'Error deleting Visbo Center Role',
							error: err
						});
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
		* @apiError {number} 404 Visbo Center Role does not exists
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
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Center Role (Update)';

			logger4js.info("PUT Visbo Center Role for userid %s email %s and vc %s role %s ", userId, useremail, req.params.vcid, req.params.roleid);

			if (!(req.combinedPerm.vc & constPermVC.Modify)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			logger4js.debug("Update Visbo Center Role after premission check %s", req.params.vcid);
			var query = {};
			query._id = req.params.roleid;
			query.vcid = req.params.vcid;

			var queryVCRole = VCRole.findOne(query);
			// queryVCRole.select('_id vcid name');
			queryVCRole.exec(function (err, oneVCRole) {
				if (err) {
					logger4js.fatal("VC Put Role DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting VisboCenter Roles',
						error: err
					});
				}
				if (!oneVCRole) {
					return res.status(404).send({
						state: 'failure',
						message: 'Visbo Center Role not found',
						error: err
					});
				}
				logger4js.info("Found the Role for VC");
				oneVCRole.name = req.body.name;
				oneVCRole.subRoleIDs = req.body.subRoleIDs;
				oneVCRole.teamIDs = req.body.teamIDs;
				oneVCRole.isTeam = req.body.isTeam;
				oneVCRole.isExternRole = req.body.isExternRole;
				oneVCRole.farbe = req.body.farbe;
				oneVCRole.defaultKapa = req.body.defaultKapa;
				oneVCRole.tagessatzIntern = req.body.tagessatzIntern;
				oneVCRole.kapazitaet = req.body.kapazitaet;
				oneVCRole.startOfCal = req.body.startOfCal;
				oneVCRole.timestamp = req.body.timestamp ? req.body.timestamp : new Date();
				oneVCRole.save(function(err, oneVcRole) {
					if (err) {
						logger4js.fatal("VC Put Role DB Connection ", err);
						return res.status(500).send({
							state: 'failure',
							message: 'Error updating Visbo Center Role',
							error: err
						});
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center Cost (Read)';

		logger4js.info("Get Visbo Center Cost for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);

		var queryVCCost = VCCost.find({'vcid': req.oneVC._id});
		// queryVCCost.select('_id vcid name');
		queryVCCost.lean();
		queryVCCost.exec(function (err, listVCCost) {
			if (err) {
				logger4js.fatal("VC Get Cost DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Costs',
					error: err
				});
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center Cost (Create)';

		logger4js.trace("Post a new Visbo Center Cost Req Body: %O Name %s", req.body, req.body.name);
		logger4js.info("Post a new Visbo Center Cost with name %s executed by user %s ", req.body.name, useremail);

		if (!req.body.name) {
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
		vcCost.timestamp = new Date();
		vcCost.save(function(err, oneVcCost) {
			if (err) {
				logger4js.fatal("VC Post Role DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error updating Visbo Center Cost',
					error: err
				});
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
	* @apiError {number} 404 Visbo Center Cost does not exists
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center Cost (Delete)';

		logger4js.info("DELETE Visbo Center Cost for userid %s email %s and vc %s cost %s ", userId, useremail, req.params.vcid, req.params.costid);

		if (!(req.combinedPerm.vc & constPermVC.Modify)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		logger4js.debug("Delete Visbo Center Cost after premission check %s", req.params.vcid);
		var query = {};
		query._id = req.params.costid;
		query.vcid = req.params.vcid;
		var queryVCCost = VCCost.findOne(query);
		// queryVCCost.select('_id vcid name');
		queryVCCost.exec(function (err, oneVCCost) {
			if (err) {
				logger4js.fatal("VC Delete Role DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Costs',
					error: err
				});
			}
			if (!oneVCCost) {
				return res.status(404).send({
					state: 'failure',
					message: 'Visbo Center Cost not found',
					error: err
				});
			}
			logger4js.info("Found the Cost for VC");
			oneVCCost.remove(function(err, empty) {
				if (err) {
					logger4js.fatal("VC Delete Role DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error deleting Visbo Center Cost',
						error: err
					});
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
	* @apiError {number} 404 Visbo Center Cost does not exists
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center Cost (Update)';

		logger4js.info("PUT Visbo Center Cost for userid %s email %s and vc %s cost %s ", userId, useremail, req.params.vcid, req.params.costid);

		if (!(req.combinedPerm.vc & constPermVC.Modify)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		logger4js.debug("Update Visbo Center Cost after premission check %s", req.params.vcid);
		var query = {};
		query._id =  req.params.costid;
		query.vcid = req.params.vcid;
		var queryVCCost = VCCost.findOne(query);
		// queryVCCost.select('_id vcid name');
		queryVCCost.exec(function (err, oneVCCost) {
			if (err) {
				logger4js.fatal("VC Put Cost DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Costs',
					error: err
				});
			}
			if (!oneVCCost) {
				return res.status(404).send({
					state: 'failure',
					message: 'Visbo Center Cost not found',
					error: err
				});
			}
			logger4js.info("Found the Cost for VC");
			oneVCCost.name = req.body.name;
			oneVCCost.uid = req.body.uid;
			oneVCCost.farbe = req.body.farbe;
			oneVCCost.timestamp = new Date();
			oneVCCost.save(function(err, oneVcCost) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Center Cost',
						error: err
					});
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
		*     "uid": 0,
		*     "timestamp": "2018-12-01",
		*     "value": {"any name": "any value"}
		*   }]
		* }
		*/

	// get VC Settings
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Center Setting (Read)';

			logger4js.info("Get Visbo Center Setting for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);

			var query = {};
			query.vcid = req.oneVC._id
			if (req.query.name) query.name = req.query.name;
			var queryVCSetting = VCSetting.find(query);
			// queryVCSetting.select('_id vcid name');
			queryVCSetting.lean();
			queryVCSetting.exec(function (err, listVCSetting) {
				if (err) {
					logger4js.fatal("VC Get Setting DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting VisboCenter Settings',
						error: err
					});
				}
				logger4js.info("Found %d Settings for VC", listVCSetting.length);
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Center Settings',
					count: listVCSetting.length,
					vcsetting: listVCSetting
				});
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
		*    "uid": 0,
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
		*     "uid": 0,
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
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Center Setting (Create)';

			logger4js.trace("Post a new Visbo Center Setting Req Body: %O Name %s", req.body, req.body.name);
			logger4js.info("Post a new Visbo Center Setting with name %s executed by user %s sysadmin %s", req.body.name, useremail, req.query.sysadmin);

			if (!req.body.name || !req.body.value) {
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
			if (req.body.timestamp) vcSetting.timestamp = req.body.timestamp;
			else vcSetting.timestamp = new Date();
			if (req.body.uid) vcSetting.uid = req.body.uid;
			vcSetting.type = 'Custom';
			if (req.body.type && req.body.type != 'Internal') vcSetting.type = req.body.type;
			vcSetting.value = req.body.value;
			vcSetting.save(function(err, oneVcSetting) {
				if (err) {
					logger4js.fatal("VC Post Role DB Connection ", err);
					if (err.code == 11000) {
						return res.status(409).send({
							state: 'failure',
							message: 'Visbo Center Setting with same Name, UID and Timestamp exists'
						});
					}
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Center Setting',
						error: err
					});
				}
				return res.status(200).send({
					state: 'success',
					message: 'Inserted Visbo Center Setting',
					vcsetting: [ oneVcSetting ]
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
		* @apiError {number} 404 Visbo Center Setting does not exists
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
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Center Setting (Delete)';

			logger4js.info("DELETE Visbo Center Setting for userid %s email %s and vc %s setting %s ", userId, useremail, req.params.vcid, req.params.settingid);

			if ((!req.query.sysadmin && !(req.combinedPerm.vc & constPermVC.Modify))
			|| (req.query.sysadmin && !(req.combinedPerm.system & constPermSystem.Modify))) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			logger4js.debug("Delete Visbo Center Setting after premission check %s", req.params.vcid);
			var query = {};
			query._id = req.params.settingid;
			query.vcid = req.params.vcid;
			var queryVCSetting = VCSetting.findOne(query);
			// queryVCSetting.select('_id vcid name');
			queryVCSetting.exec(function (err, oneVCSetting) {
				if (err) {
					logger4js.fatal("VC Delete Role DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting VisboCenter Settings',
						error: err
					});
				}
				if (!oneVCSetting) {
					return res.status(404).send({
						state: 'failure',
						message: 'Visbo Center Setting not found',
						error: err
					});
				}
				if (oneVCSetting.type == 'Internal') {
					return res.status(400).send({
						state: 'failure',
						message: 'Not allowed to delete Internal Settings'
					});
				}
				logger4js.info("Found the Setting for VC");
				oneVCSetting.remove(function(err, empty) {
					if (err) {
						logger4js.fatal("VC Delete Role DB Connection ", err);
						return res.status(500).send({
							state: 'failure',
							message: 'Error deleting Visbo Center Setting',
							error: err
						});
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
		* @apiError {number} 404 Visbo Center Setting does not exists
		*
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/setting/:settingid
		*  {
	  *    "name":"My first Setting Renamed",
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
		*     "uid": 0,
		*     "timestamp": "2018-12-01",
		*     "value": {"any name": "any value"}
		*   }]
		* }
		*/

// change setting
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Center Setting (Update)';

		logger4js.info("PUT Visbo Center Setting for userid %s email %s and vc %s setting %s ", userId, useremail, req.params.vcid, req.params.settingid);

		if ((!req.query.sysadmin && !(req.combinedPerm.vc & constPermVC.Modify))
		|| (req.query.sysadmin && !(req.combinedPerm.system & constPermSystem.Modify))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		logger4js.debug("Update Visbo Center Setting after premission check %s", req.params.vcid);
		var query = {};
		query._id =  req.params.settingid;
		query.vcid = req.params.vcid;
		var queryVCSetting = VCSetting.findOne(query);
		// queryVCSetting.select('_id vcid name');
		queryVCSetting.exec(function (err, oneVCSetting) {
			if (err) {
				logger4js.fatal("VC Put Setting DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Settings',
					error: err
				});
			}
			if (!oneVCSetting) {
				return res.status(404).send({
					state: 'failure',
					message: 'Visbo Center Setting not found',
					error: err
				});
			}
			logger4js.info("Found the Setting for VC");
			if (req.body.name) oneVCSetting.name = req.body.name;
			if (req.body.value) oneVCSetting.value = req.body.value;
			oneVCSetting.save(function(err, oneVcSetting) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Center Setting',
						error: err
					});
				}
				if (oneVcSetting.type == 'Internal') {
					if (oneVcSetting.name == 'DEBUG') {
						logger4js.info("Update System Log Setting");
						logging.setLogLevelConfig(oneVcSetting.value)
					}
				}
				return res.status(200).send({
					state: 'success',
					message: 'Updated Visbo Center Setting',
					vcsetting: [ oneVcSetting ]
				});
			});
		});
	})

module.exports = router;
