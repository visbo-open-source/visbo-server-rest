var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');

var assert = require('assert');
var auth = require('./../components/auth');
var lockVP = require('./../components/lock');
var validate = require('./../components/validate');
var variant = require('./../components/variant');
var verifyVp = require('./../components/verifyVp');
var verifyVg = require('./../components/verifyVg');

var VPUser = mongoose.model('VPUser');
var User = mongoose.model('User');
var VisboGroup = mongoose.model('VisboGroup');
var VisboGroupUser = mongoose.model('VisboGroupUser');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var Lock = mongoose.model('Lock');
var Variant = mongoose.model('Variant');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var VisboPortfolio = mongoose.model('VisboPortfolio');
var VisboAudit = mongoose.model('VisboAudit');

var Const = require('../models/constants')
var constPermVC = Const.constPermVC
var constPermVP = Const.constPermVP
var constPermSystem = Const.constPermSystem

var mail = require('./../components/mail');
var ejs = require('ejs');
var read = require('fs').readFileSync;

var logModule = "VP";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var validateName = validate.validateName;

var constVPTypes = Object.freeze({"project":0, "portfolio":1, "projecttemplate":2});

// find a user in a simple array of user names
var findUser = function(currentUser) {
		return currentUser == this;
}

// find a user in an array of a structured user (name, id, ...)
var findUserList = function(currentUser) {
		//console.log("compare %s %s", currentUser.email, this);
		return currentUser.email == this;
}

// find a user in an array of users by userId
var findUserById = function(currentUser) {
	// logger4js.info("FIND User by ID %s with %s result %s", this, currentUser.userId, currentUser.userId.toString() == this.toString());
	return currentUser.userId.toString() == this.toString();
}

// find a user in a simple array of user names
var findVP = function(vpid) {
		return vpid == this;
}

// find a project in an array of a structured projects (name, id)
var findVPList = function(vp) {
		//console.log("compare %s %s result %s", vp._id.toString(), this.toString(), vp._id.toString() == this.toString());
		return vp._id.toString() == this.toString();
}

// Generates hash using bCrypt
var createHash = function(secret){
	return bCrypt.hashSync(secret, bCrypt.genSaltSync(10), null);
};

// updates the VP Count in the VC after create/delete/undelete Visbo Project
var updateVPCount = function(vcid, increment){
	var updateQuery = {_id: vcid};
	var updateUpdate = {$inc: {vpCount: increment}};
	var updateOption = {upsert: false};

	VisboCenter.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error("Problem updating VC %s vpCount: %s", vcid, err);
		}
		logger4js.trace("Updated VC %s vpCount inc %d changed %d %d", vcid, increment, result.n, result.nModified)
	})
}

// updates the VC Name in the VP after undelete as the name could have changed in between
var updateVCName = function(vp){
	logger4js.trace("Start Update VP%s with correct VC Name ", vp._id)
	var query = {_id: vp.vcid}
	var queryVC = VisboCenter.findOne(query);
	queryVC.lean();
	queryVC.exec(function (err, vc) {
		if (err) {
			logger4js.fatal("VP PUT: Update VC Name DB Connection ", err);
			return;
		}
		if (vc) {
			logger4js.debug("Found VC %s/%s VP info %s", vc._id, vc.name, vp.vc.name);
			if (vc.name == vp.vc.name) {
				// nothing to do
				return;
			}
			var updateQuery = {_id: vp._id};
			var updateOption = {upsert: false};
			var updateUpdate = {$set: {"vc": { "name": vc.name}}};
			logger4js.debug("Update VP %s for correct VC Name %s ", vp._id, vc.name)
			VisboProject.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
				if (err){
					logger4js.error("Problem updating VP for correct VC Name: %s", vpid, err);
				}
				logger4js.trace("Updated VP %s for VC Name changed %d %d", vp._id, result.n, result.nModified)
			})
		}
	});
}

// updates the VP Name in the VPV after name change of Visbo Project
var updateVPName = function(vpid, name, type){
	logger4js.trace("Start Update VP %s New Name %s ", vpid, name)
	var updateQuery = {vpid: vpid, deletedAt: {$exists: false}};
	var updateUpdate = {$set: {name: name}};
	var updateOption = {upsert: false};

	VisboProjectVersion.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error("Problem updating VP %s new Name in Versions Err: %s", vpid, err);
		}
		logger4js.trace("Updated VP %s New Name %s changed %d %d", vpid, name, result.n, result.nModified)
	})

	// update Portfolio Links to new name
	var updatePFQuery = { allItems: {$elemMatch: {vpid: vpid }}};
	var updatePFUpdate = { $set: { "allItems.$[elem].name" : name } };
	var updatePFOption = {arrayFilters: [ { "elem.vpid": vpid } ], upsert: false, multi: "true"};
	VisboPortfolio.updateMany(updatePFQuery, updatePFUpdate, updatePFOption, function (err, result) {
		if (err){
			logger4js.error("Problem updating Portfolio References for VP %s", vpid);
			return res.status(500).send({
				state: 'failure',
				message: 'Error updating Visbo Project',
				error: err
			});
		}
		logger4js.trace("Updated VP %s New Name %s in Portfolio Lists changed %d %d", vpid, name, result.n, result.nModified)
		if (type == constVPTypes.portfolio) {
			var updateQuery = {};
			updateQuery.vpid = vpid;
			updateQuery.deleted = {$exists: false};

			var updateUpdate = {$set: {"name": name}};
			var updateOption = {upsert: false, multi: "true"};

			VisboPortfolio.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
				if (err){
					logger4js.error("Problem updating Portfolio Name for VP %s", vpid);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Project',
						error: err
					});
				}
				logger4js.debug("Update Portfolio %s Name found %d updated %d", vpid, result.n, result.nModified)
			});
		}
	});
}

// updates the Global VC Groups to add the VPID to the list
var updatePermAddVP = function(vcid, vpid){
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	var updateQuery = {vcid: vcid, global: true};
	var updateUpdate = {$push: {vpids: vpid}};
	var updateOption = {upsert: false};

	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error("Problem updating VC %s Gloabl Groups: %s", vcid, err);
		}
		logger4js.debug("Updated VC %s Groups with VP %s changed %d %d", vcid, vpid, result.n, result.nModified)
	})
}

// updates the Global VC Groups to remove the VPID from the list
var updatePermRemoveVP = function(vcid, vpid){
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	var updateQuery = {vcid: vcid, global: true};
	var updateUpdate = {$pull: {vpids: vpid}};
	var updateOption = {upsert: false};

	logger4js.debug("Updated VC %s Groups removed VP %s changed", vcid, vpid)
	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error("Problem updating VC %s Gloabl Groups: %s", vcid, err);
		}
		logger4js.debug("Updated VC %s Groups removed VP %s changed %d %d", vcid, vpid, result.n, result.nModified)
	})
}

// undelete the Groups after undelete Vp
var unDeleteGroup = function(vpid){
	var updateQuery = {groupType: 'VP', vpids: vpid, 'deletedByParent': 'VP'};
	var updateOption = {upsert: false};
	var updateUpdate = {$unset: {'deletedByParent': ''}};

	logger4js.debug("Update Groups for VP %s", vpid)
	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error("Problem updating Groups for VC %s set undelete", vpid, err);
		}
		logger4js.trace("Updated Groups for VC %s set undelete changed %d %d", vpid, result.n, result.nModified)
	})
}

// mark the Groups as deleted after delete Vp
var markDeleteGroup = function(vpid){
	var updateQuery = {groupType: 'VP', vpids: vpid};
	var updateOption = {upsert: false};
	var updateUpdate = {$set: {'deletedByParent': 'VP'}};

	logger4js.debug("Update Groups for VP %s", vpid)
	VisboGroup.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error("Problem updating Groups for VP %s set undelete", vpid, err);
		}
		logger4js.trace("Updated Groups for VP %s set undelete changed %d %d", vpid, result.n, result.nModified)
	})
}

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// register the VP middleware to get all Groups with VP Permissions for the user
router.use('/', verifyVp.getAllVPGroups);
// register the VP middleware to check that the user has access to the VP
router.param('vpid', verifyVp.getVpidGroups);
// Register the Group middleware to check the groupid param
router.param('groupid', verifyVg.getGroupId);

/////////////////
// Visbo Projects API
// /project
/////////////////


router.route('/')

/**
	* @api {get} /vp Get Projects
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project
	* @apiName GetVisboProjects
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp retruns all Visbo Projects the user has access permission to
	* In case of success it delivers an array of VPs, the array contains in each element a Visbo Project
	* The lock section is empty if no lock is set, otherwise it delivers the list of locks that were set for the Visbo Project and the respective Variant.
	* The variant section is empty if there are no variants for this Project, otherwise it contains a list of variants that exists for this project.
	* the Project Type 0 means it is a project template, type 1 is a project and type 2 is a portfolio
	* @apiParam (Parameter) {String} [vcid] Deliver only projects for a specific Visbo Center
	* @apiParam (Parameter) {Number=0,1,2} [vpType] Deliver only projects of the specified Type, if not defined, deliver all types
	* @apiParam (Parameter) {Boolean} [deleted=false]  Request Deleted VPs, only allowed for users with DeleteVP Permission.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false]  if true, request VPs for Appl. Admin User
	*
	* @apiPermission Permission: Authenticated, View Visbo Project, Delete Visbo Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp
	*   url: http://localhost:3484/vp?vcid=vc5aaf992&vpType=1
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Projects",
	*   "vp":[{
	*       "_id":"vp541c754feaa",
	*      "updatedAt":"2018-03-16T12:39:54.042Z",
	*      "createdAt":"2018-03-12T09:54:56.411Z",
	*      "name":"My new VisboProject",
	*      "vcid": "vc5aaf992",
	*      "vpvCount": "0",
	*      "vpType": "1",
	*      "lock": [{
	*        "variantName": "",
	*        "email": "someone@visbo.de",
	*        "createdAt": "2018-04-26T11:04:12.094Z",
	*        "expiresAt": "2018-04-26T12:04:12.094Z"
	*      }],
	*      "variant": [{
	*        "variantName": "V1",
	*        "email": "someone@visbo.de",
	*        "createdAt": "2018-04-26T11:04:12.094Z",
	*        "vpvCount": "1"
	*      }]
	*   }]
	* }
	*/
// Get Visbo projects
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project (Read)';
		req.auditSysAdmin = isSysAdmin;

		logger4js.info("Get Project for user %s check sysAdmin %s", userId, isSysAdmin);
		var query = {};
		// Get all VCs there the user Group is assigned to
		if (!isSysAdmin) {
			var vpidList = []; var allowAccess;
			for (var i=0; i < req.permGroups.length; i++) {
				allowAccess = false;
				if (req.query.deleted && req.permGroups[i].permission && req.permGroups[i].permission.vp & constPermVP.Delete)
					allowAccess = true;
				else if (!req.query.deleted)
					allowAccess = true;
				if (allowAccess && req.permGroups[i].vpids) {
					vpidList = vpidList.concat(req.permGroups[i].vpids)
				}
			}
			logger4js.debug("Get Visbo Project with %d Group VPIDs", vpidList.length);
			query._id = {$in: vpidList};
		}

		// check for deleted VPs
		if (req.query.deleted) {
			query.deletedAt = {$exists: true}				// Not deleted
		} else {
			query.deletedAt = {$exists: false};
		}
		query['vc.deletedAt'] = {$exists: false}; // Do not deliver any VP from a deleted VC
		// check if query string is used to restrict to a specific VC
		if (req.query && req.query.vcid && mongoose.Types.ObjectId.isValid(req.query.vcid)) {
			query.vcid = req.query.vcid;
		}
		// check if query string is used to restrict projects to a certain type (project, portfolio, template)
		if (req.query && req.query.vpType) query.vpType = req.query.vpType;

		logger4js.info("Get Projects for user %s", userId);
		logger4js.trace("Get Project for user %s with query parameters %O", userId, query);

		var queryVP = VisboProject.find(query);
		queryVP.lean();
		queryVP.exec(function (err, listVP) {
			if (err) {
				logger4js.fatal("VP GET DB Connection \nVisboProject.find(%s)\n%O ", query, err);
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			logger4js.trace("Found Projects\n%O", listVP);
			logger4js.debug("Found %d Projects", listVP.length);
			req.auditInfo = listVP.length;
			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Projects',
				count: listVP.length,
				vp: listVP
			});
		});
	})

/**
	* @api {post} /vp Create a Project
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project
	* @apiName CreateVisboProjects
	* @apiDescription Post creates a new VP
	* with a unique name inside VC and the admins as defined in the body.
	* If no admin is specified for the project the current user is added as Admin.
	* In case of success it delivers an array of VPs to be uniform to GET, the array contains as one element the created VP.
	* @apiHeader {String} access-key User authentication token.
  *
	* @apiPermission Authenticated and Permission: View Visbo Project, Create Visbo Project.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 400 missing name or Visbo Center ID of Visbo Project during Creation
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Create Visbo Project
	* @apiError {number} 409 Visbo Project with same name exists already
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp
	* {
	*  "name":"My first Visbo Project",
	*  "description":"Visbo Project Description",
	*  "vcid": "vc5aaf992",
	*  "kundennummer": "customer project identifier"
	*  "users":[
	*    { "email":"example1@visbo.de" },
	*    { "email":"example2@visbo.de" }]
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"Successfully created new VisboProject",
	*  "vp":[{
	*   "__v":0,
	*   "updatedAt":"2018-03-19T11:04:12.094Z",
	*   "createdAt":"2018-03-19T11:04:12.094Z",
	*   "name":"My first Visbo Project",
	*   "_id":"vp5aaf882",
	*   "vcid": "vc5aaf992",
	*   "vpvCount": "0",
	*   "vpType": "0",
	*   "kundennummer": "customer project identifier"
	*   "lock": []
	*  }]
	* }
	*/
// Post a Project or Portfolio Project
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail  = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project (Create)';

		if (req.body.vcid == undefined || !mongoose.Types.ObjectId.isValid(req.body.vcid) || req.body.name == undefined) {
				logger4js.warn("No VCID or Name in Body");
				return res.status(400).send({
				state: 'failure',
				message: 'No VCID or Name in Body'
			});
		}
		var vcid = req.body.vcid
		var vpname = (req.body.name || '').trim();
		var vpdescription = (req.body.description || "").trim();
		var kundennummer = (req.body.kundennummer || "").trim();
		var vpUsers = req.body.users || [];
		var vpCustomerID = (req.body.kundennummer != undefined) ? req.body.kundennummer.trim() : undefined;
		logger4js.info("Post a new Visbo Project for user %s with name %s in VisboCenter %s with %d Users. Perm: %O", useremail, req.body.name, vcid, vpUsers.length, req.combinedPerm);
		logger4js.trace("Post a new Visbo Project body %O", req.body);

		if (!validateName(vpname, false)
		|| !validateName(vpdescription, true)
		|| !validateName(kundennummer, true)) {
			logger4js.info("POST Visbo Project contains illegal strings body %O", req.body);
			return res.status(400).send({
				state: "failure",
				message: "Visbo Project Body contains invalid strings"
			});
		}
		var newVP = new VisboProject();

		logger4js.debug("Check VC Permission %O", req.combinedPerm);
		if (!(req.combinedPerm.vc & constPermVC.CreateVP)) {
			return res.status(403).send({
				state: 'failure',
				message: 'Visbo Centers not found or no Permission to create Project'
			});
		}
		var query = {'_id': vcid};
		VisboCenter.findOne(query, function (err, vc) {
			if (err) {
				logger4js.fatal("VP Post DB Connection \nVisboCenter.findOne(%s)\n%O ", query, err);
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			}
			if (!vc) {
				return res.status(403).send({
					state: 'failure',
					message: 'Visbo Centers not found or no Admin'
				});
			};
			req.oneVC = vc;
			logger4js.debug("User has permission to create Project %s in  %s", vpname, req.oneVC.name);
			// check duplicate Name
			var query = {};
			query.vcid = vcid;
			query.name = vpname;
			query.deletedAt = {$exists: false};

			VisboProject.findOne(query, function (err, vp) {
				if (err) {
					logger4js.fatal("VP Post DB Connection \nVisboProject.findOne(%s)\n%O ", query, err);
					return res.status(500).send({
						state: 'failure',
						message: 'Internal Server Error with DB Connection',
						error: err
					});
				}
				logger4js.debug("Duplicate Name check returned %s", vp != undefined);
				if (vp) {
					return res.status(409).send({
						state: 'failure',
						message: 'Project with same name exists'
					});
				};
				var newVP = new VisboProject;
				newVP.name = vpname;
				newVP.vcid = req.oneVC._id;
				newVP.description = vpdescription;
				if (vpCustomerID) newVP.kundennummer = vpCustomerID;
				if (req.body.vpType == undefined || req.body.vpType < 0 || req.body.vpType > 2) {
					newVP.vpType = 0;
				} else {
					newVP.vpType = req.body.vpType;
				}
				newVP.vpvCount = 0;
				var vpUsers = new Array();
				if (req.body.users) {
					for (var i = 0; i < req.body.users.length; i++) {
						req.body.users[i].email = req.body.users[i].email.toLowerCase();
						// build up unique user list vpUsers to check that they exist
						if (!vpUsers.find(findUser, req.body.users[i].email)){
							vpUsers.push(req.body.users[i].email)
						}
					};
				};
				logger4js.debug("Check users if they exist %s", JSON.stringify(vpUsers));
				var query = {'email': {'$in': vpUsers}}
				var queryUsers = User.find(query);
				queryUsers.select('_id email');
				queryUsers.lean();
				queryUsers.exec(function (err, listUsers) {
					if (err) {
						logger4js.fatal("VP Post DB Connection \nUser.findOne(%s)\n%O ", query, err);
						return res.status(500).send({
							state: 'failure',
							message: 'Error getting Users for VisboCenters',
							error: err
						});
					}
					if (listUsers.length != vpUsers.length)
						logger4js.warn("Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vpUsers.length);

					// Create new VP Group and add all existing Admin Users to the new Group
					var newVG = new VisboGroup();
					newVG.name = 'Visbo Project Admin'
					newVG.groupType = 'VP';
					newVG.internal = true;
					newVG.permission = {vp: Const.constPermVPAll }
					newVG.vcid = req.oneVC._id;
					newVG.global = false;
					newVG.vpids.push(newVP._id);
					newVG.users = [];
					for (var i = 0; i < listUsers.length; i++) {
						// build up user list for Visbo Project Admin Group
						newVG.users.push({email: listUsers[i].email, userId: listUsers[i]._id});
					};
					// no admin defined, add current user as admin
					if (newVG.users.length == 0)
						newVG.users.push({email: useremail, userId: userId});

					logger4js.debug("VP Post Create 1. Group for vp %s group %O ", newVP._id, newVG);
					newVG.save(function(err, vg) {
						if (err) {
							logger4js.fatal("VP Post Create 1. Group for vp %s DB Connection ", newVP._id, err);
						}
					});
					// set the VP Name
					newVP.vc.name = vc.name;
					logger4js.trace("VP Create add VP Name %s %O", vc.name, newVP);
					logger4js.debug("Save VisboProject %s %s", newVP.name, newVP._id);
					newVP.save(function(err, vp) {
						if (err) {
							logger4js.debug("Error Save VisboProject %s  with Error %s", newVP.name, err);
							return res.status(500).send({
								state: "failure",
								message: "database error, failed to create visboproject",
								error: err
							});
						}
						req.oneVP = vp;
						logger4js.debug("Update VC %s with %d Projects ", req.oneVC.name, req.oneVC.vpCount);
						updatePermAddVP(req.oneVP.vcid, req.oneVP._id); // async
						updateVPCount(req.oneVP.vcid, 1); // async
						return res.status(200).send({
							state: "success",
							message: "Successfully created new Project",
							vp: [ vp ]
						});
					});
				});
			});
		});
	})

router.route('/:vpid')
/**
 	* @api {get} /vp/:vpid Get a Project
	* @apiVersion 1.0.0
 	* @apiGroup Visbo Project
 	* @apiName GetVisboProject
 	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get a specific Visbo Project
	* the system checks if the user has access permission to it.
	* In case of success, the system delivers an array of VPs, with one element in the array that is the info about the VP
	* @apiPermission Permission: Authenticated, View Visbo Project.
	* @apiParam (Parameter) {Boolean} [deleted=false]  Request Deleted VPs only with additional Permission DeleteVP
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false]  Optional Request VCs for Appl. Admin User
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Visbo Project
 	* @apiExample Example usage:
 	*   url: http://localhost:3484/vp/5aada025
 	* @apiSuccessExample {json} Success-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   "state":"success",
 	*   "message":"Returned Visbo Projects",
 	*   "vp": [{
 	*    "_id":"vp5c754feaa",
 	*    "updatedAt":"2018-03-16T12:39:54.042Z",
 	*    "createdAt":"2018-03-12T09:54:56.411Z",
 	*    "name":"My new Visbo Project",
	*		 "vcid": "vc5aaf992",
	*    "vpvCount": "0",
	*    "vpType": "0",
	*    "lock": [{
	*      "variantName": "",
	*      "email": "someone@visbo.de",
	*      "createdAt": "2018-04-26T11:04:12.094Z",
	*      "expiresAt": "2018-04-26T12:04:12.094Z"
	*    }]
	* }]
 	*}
	*/
// Get a specific visbo project
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var isSysAdmin = req.query.sysadmin ? true : false;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project (Read)';
		req.auditSysAdmin = isSysAdmin;

		logger4js.info("Get Visbo Project for userid %s email %s and vp %s oneVC %s", userId, useremail, req.params.vpid, req.oneVP.name);

		if (req.query.deleted && !(req.combinedPerm.vp & constPermVP.Delete)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to deleted Visbo Projects'
			});
		}
		// we have found the VP already in middleware
		return res.status(200).send({
			state: 'success',
			message: 'Returned Visbo Projects',
			vp: [req.oneVP],
			perm: req.combinedPerm
		});
	})

/**
	* @api {put} /vp/:vpid Update Project
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project
	* @apiName UpdateVisboProjects
	* @apiDescription Put updates a specific Visbo Project
	* the system checks if the user has Modify permission to the Visbo Project.
	* If an updatedAt Info is delivered in the body, the system checks that the updatedAt flag from the body equals the updatedAt in the system.
	* If not equal, the system delivers an error because the VP was updated between the read and write of the user and therefore it might lead to inconsitency.
	* If the Visbo Project Name has changed, the Name will be populated to the Visbo Project Versions.
	* In case of success, the system delivers an array of VPs, with one element in the array that is the info about the VP
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and Permission: View Visbo Project, Modify Visbo Project. In case of undelete a Visbo Project the user needs to have Delete Visbo project permission.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 400 no Data provided in Body for updating the Visbp Project
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Modify Visbo Project
	* @apiError {number} 423 Visbo Project is locked by another user
	* @apiError {number} 409 Visbo Project with same name exists already or Visbo Project was updatd in between
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5cf3da025
	* {
	*  "name":"My first Visbo Project Renamed",
	*  "description": "New Description for VP",
	*  "kundennummer": "Customer Project Identifier"
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"Successfully updated VisboProject Renamed",
	*  "vp":[{
	*   "__v":0,
	*   "updatedAt":"2018-03-19T11:04:12.094Z",
	*   "createdAt":"2018-03-19T11:04:12.094Z",
	*   "name":"My first Visbo Project Renamed",
	*   "_id":"vp5cf3da025",
	*   "kundennummer": "Customer Project Identifier"
	*   "vcid": "vc5aaf992",
	*   "vpvCount": "0",
	*   "vpType": "0"
	*  }]
	* }
	*/
// Update Visbo Project
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project (Update)';

		logger4js.info("PUT/Save Visbo Project for userid %s email %s and vp %s perm %O", userId, useremail, req.params.vpid, req.combinedPerm);

		if (!req.body) {
			return res.status(400).send({
				state: 'failure',
				message: 'No Body provided for update'
			});
		}
		var name = (req.body.name || '').trim();
		var vpdescription = (req.body.description || "").trim();
		var kundennummer = (req.body.kundennummer || "").trim();
		if (!validateName(name, true)
		|| !validateName(vpdescription, true)
		|| !validateName(kundennummer, true)) {
			logger4js.info("PUT Visbo Project contains illegal strings body %O", req.body);
			return res.status(400).send({
				state: "failure",
				message: "Visbo Project Body contains invalid strings"
			});
		}

		var vpUndelete = false;
		// undelete the VP in case of change
		if (req.oneVP.deletedAt) {
			req.auditDescription = 'Visbo Project (Undelete)';
			req.oneVP.deletedAt = undefined;
			vpUndelete = true;
			logger4js.debug("Undelete VP %s flag %O", req.oneVP._id, req.oneVP);
		}

		if ((vpUndelete && !(req.combinedPerm.vp & constPermVP.Delete))
		|| (!vpUndelete && !(req.combinedPerm.vp & constPermVP.Modify))) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Project or no Permission'
			});
		}
		if (lockVP.lockStatus(req.oneVP, useremail, undefined).locked) {
			return res.status(423).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [req.oneVP]
			});
		}

		if (name == '') name = req.oneVP.name;
		var vpPopulate = req.oneVP.name != name ? true : false;
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
		query._id = {$ne: req.oneVP._id}
		query.name = name;
		query.deletedAt = {$exists: false};

		VisboProject.findOne(query, function (err, vp) {
			if (err) {
				logger4js.fatal("VP Put DB Connection \nVisboProject.findOne(%s)\n%O ", query, err);
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			}
			if (vp) {
				logger4js.debug("Duplicate Name check returned duplicate VP %s", vp._id);
				return res.status(409).send({
					state: 'failure',
					message: 'Project with same name exists'
				});
			};
			logger4js.debug("PUT VP: save now %O populate %s unDelete %s", req.oneVP, vpPopulate, vpUndelete);
			req.oneVP.save(function(err, oneVP) {
				if (err) {
					logger4js.fatal("VP PUT DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Project',
						error: err
					});
				}
				req.oneVP = oneVP;

				// Update project versions and portfolios
				if (vpPopulate) {
					logger4js.trace("VP PUT %s: Update Project Versions to %s", oneVP._id, oneVP.name);
					updateVPName(oneVP._id, oneVP.name, oneVP.vpType);
				}
				if (vpUndelete) {
					logger4js.trace("VP PUT %s: UnDelete Update vpCount in VC %s", oneVP._id, oneVP.vcid);
					updateVPCount(req.oneVP.vcid, 1); // async
					unDeleteGroup(req.oneVP._id); // async
					updatePermAddVP(req.oneVP.vcid, req.oneVP._id); // async
					updateVCName(req.oneVP); //async
				}
				return res.status(200).send({
					state: 'success',
					message: 'Updated Visbo Project',
					vp: [ oneVP ]
				});
			});
		});
	})

/**
	* @api {delete} /vp/:vpid Delete a Project
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project
	* @apiName DeleteVisboProject
	* @apiDescription Deletes a specific Visbo Project.
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and Permission: View Visbo Project, Delete Visbo Project.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Delete Visbo Project
	* @apiError {number} 423 Visbo Project is locked by another user
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aada025
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Deleted Visbo Projects"
	* }
	*/
// Delete Visbo Project
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project (Delete)';

		logger4js.info("DELETE Visbo Project for userid %s email %s and vp %s oneVP %s  ", userId, useremail, req.params.vpid, req.oneVP.name);

		if (!(req.combinedPerm.vp & constPermVP.Delete)) {
			return res.status(403).send({
				state: "failure",
				message: "No permission to delete Visbo Project"
			});
		}
		if (lockVP.lockStatus(req.oneVP, useremail, undefined).locked) {
			return res.status(423).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [req.oneVP]
			});
		}
		var destroyVP = req.oneVP.deletedAt
		logger4js.debug("Delete Visbo Project %s %s after premission check deletedAt %s", req.params.vpid, req.oneVP.name, destroyVP);

		if (!destroyVP) {
			req.oneVP.deletedAt = new Date();
			req.oneVP.save(function(err, oneVP) {
				if (err) {
					logger4js.fatal("VP DELETE DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error deleting Visbo Project',
						error: err
					});
				}
				req.oneVP = oneVP;
				updateVPCount(req.oneVP.vcid, -1); // async
				markDeleteGroup(req.oneVP._id); // async
				updatePermRemoveVP(req.oneVP.vcid, req.oneVP._id); //async
				return res.status(200).send({
					state: "success",
					message: "Deleted Visbo Project"
				});
			});
		} else {
			req.auditDescription = 'Visbo Project (Destroy)';
			logger4js.warn("VP DESTROY VP %s %s ", req.oneVP._id, req.oneVP.name);
			// DELETE Versions of VP
			var queryVPV = {};
			queryVPV.vpid = req.oneVP._id
			VisboProjectVersion.deleteMany(queryVPV, function(err) {
				if (err) {
					logger4js.fatal("VPV Destroy DB Connection ", err);
				}
				logger4js.debug("VP Destroy: Destroyed VP Versions");
			});
			// Delete all VP Portfolios relating to this ProjectID
			var queryvpf = {vpid: req.oneVP._id};
			VisboPortfolio.deleteMany(queryvpf, function (err) {
				if (err){
					logger4js.error("VP Destroy: %s Problem deleting VP Portfolios %O", req.oneVP._id, err);
				}
				logger4js.trace("VP Destroy: %s VP Portfolios Deleted", req.oneVP._id)
			})

			// Delete all VP Groups
			queryvpgroup = {vcid: req.oneVP.vcid, vpids: req.oneVP._id, groupType: 'VP'}
			VisboGroup.deleteMany(queryvpgroup, function (err) {
				if (err){
					logger4js.error("VC Destroy: %s Problem deleting VP Groups %O", req.oneVP._id, err);
				}
				logger4js.trace("VC Destroy: %s VP Groups Deleted", req.oneVP._id)
			});
			// Delete Audit Trail of VPs & VPVs
			var queryaudit = {'vp.vpid': req.oneVP._id};
			VisboAudit.deleteMany(queryaudit, function (err) {
				if (err){
					logger4js.error("VP Destroy: %s Problem deleting Audit %O", req.oneVP._id, err);
				}
				logger4js.trace("VP Destroy: %s VP Audit Deleted", req.oneVP._id)
			});

			// DESTROY VP itself
			var queryVP = {};
			queryVP._id = req.oneVP._id
			VisboProject.deleteOne(queryVP, function(err) {
				if (err) {
					logger4js.fatal("VP DELETE DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error deleting Visbo Project',
						error: err
					});
				}
				// no need to update vpCount in VC
				return res.status(200).send({
					state: "success",
					message: "Destroyed Visbo Project"
				});
			});
		}
	})

router.route('/:vpid/audit')
 /**
 	* @api {get} /vp/:vpid/audit Get Visbo Project Audit Trail
 	* @apiVersion 1.0.0
 	* @apiGroup Visbo Project
 	* @apiName GetVisboProjectAudit
	* @apiDescription Get Audit Trail for a specific Visbo Project
	* the system checks if the user has access permission to it.
	* In case of success, the system delivers an array of Audit Trail Activities
 	* @apiHeader {String} access-key User authentication token.
	* @apiPermission Authenticated and Permission: View Visbo Project, View Project Audit
	* @apiParam (Parameter) {Date} [from] Request Audit Trail starting with from date. Default Today -1.
	* @apiParam (Parameter) {Date} [to] Request Audit Trail ending with to date. Default Today.
	* @apiParam (Parameter) {text} [text] Request Audit Trail containing text in Detail.
	* @apiParam (Parameter) {text} [action] Request Audit Trail only for specific ReST Command (GET, POST, PUT DELETE).
	* @apiParam (Parameter) {number} [maxcount] Request Audit Trail maximum entries.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View Visbo Project Audit
 	* @apiExample Example usage:
 	* url: http://localhost:3484/vp/vp5aada025/audit
 	* @apiSuccessExample {json} Success-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   "state":"success",
 	*   "message":"Audit Trail delivered",
 	*   "audit": [{
 	*     "_id":"vp541c754feaa",
 	*     "updatedAt":"2018-03-16T12:39:54.042Z",
 	*     "createdAt":"2018-03-12T09:54:56.411Z",
	*			"XXXXXXXX": "XXXXXXXX"
 	*   }]
 	* }
	*/
// Get audit trail for a specific VP
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;

		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project Audit (Read)';
		req.auditSysAdmin = sysAdmin;

		logger4js.info("Get Visbo Project Audit Trail for userid %s email %s and vp %s oneVP %s Perm %O", userId, useremail, req.params.vpid, req.oneVP.name, req.combinedPerm);
		if (!(req.combinedPerm.vp & constPermVP.ViewAudit)) {
			return res.status(403).send({
					state: 'failure',
					message: 'You need to have View Audit permission to get audit trail'
				});
		}

		var from, to, maxcount = 1000, action;
		logger4js.debug("Get Audit Trail DateFilter from %s to %s", req.query.from, req.query.to);
		if (req.query.from && Date.parse(req.query.from)) from = new Date(req.query.from)
		if (req.query.to && Date.parse(req.query.to)) to = new Date(req.query.to)
		if (req.query.maxcount) maxcount = Number(req.query.maxcount) || 10;
		if (req.query.action) action = req.query.action.trim();
		// no date is set to set to to current Date and recalculate from afterwards
		if (!to) to = new Date();
		logger4js.trace("Get Audit Trail at least one value is set %s %s", from, to);
		if (!from) {
			from = new Date(to);
			from.setDate(from.getDate()-7)
		}
		logger4js.trace("Get Audit Trail DateFilter after recalc from %s to %s", from, to);

		var query = {'vp.vpid': req.oneVP._id, "createdAt": {"$gte": from, "$lt": to}};
		if (action) {
			query.action = action;
		}
		if (!sysAdmin) {
			query.sysAdmin = {$exists: false};
		}
		var queryListCondition = [];
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
				textCondition.push({"vpv.vpvid": text});
				textCondition.push({"user.userId": text});
			} else {
				textCondition.push({"user.email": expr});
				textCondition.push({"vp.name": expr});
				textCondition.push({"vpv.name": expr});
				textCondition.push({"action": expr});
				textCondition.push({"actionDescription": expr});
				textCondition.push({"result.statusText": expr});
				textCondition.push({"userAgent": expr});
			}
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
		.exec(function (err, listVPAudit) {
			if (err) {
				logger4js.fatal("VP Audit Get DB Connection \nVisboAudit.find(%s)\n%O ", query, err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboProject Audit',
					error: err
				});
			}
			logger4js.debug("Found VP Audit Logs %d", listVPAudit.length);
			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Project Audit',
				count: listVPAudit.length,
				audit: listVPAudit
			});
		});
	})

	router.route('/:vpid/group')

	/**
		* @api {get} /vp/:vpid/group Get Groups
		* @apiVersion 1.0.0
		* @apiGroup Visbo Project Permission
		* @apiName GetVisboProjectGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Gets all groups of the specified Visbo Project
		*
		* @apiPermission Authenticated and Permission: View Visbo Project.
		* @apiParam (Parameter) {Boolean} [userlist=false]  Request User List with Group IDs in addition to the group list.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to View Visbo Project, or Visbo Project does not exists
		* @apiExample Example usage:
		*   url: http://localhost:3484/vp/:vpid/group
		*   url: http://localhost:3484/vp/:vpid/group?userlist=true
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Returned Visbo Project Groups",
		*   "count": 1,
		*   "groups":[{
		*     "_id":"vpgroup5c754feaa",
		*     "name":"Group Name",
		*     "vcid": "vc5c754feaa",
		*     "global": true,
		*     "vpids": ["vp5c754feaa","vp5c754febb"],
		*     "permission": {vc: 307, vp: 1 },
		*     "users":[
		*      {"userId":"us5aaf992", "email":"example@visbo.de"},
		*      {"userId":"us5aaf993", "email":"example2@visbo.de"}
		*     ]
		*   }]
		* }
		*/

	// Get VC Groups
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var sysAdmin = req.query.sysadmin ? true : false;

			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Project Group (Read)';
			req.auditSysAdmin = sysAdmin;

			logger4js.info("Get Visbo Project Group for userid %s email %s and vp %s VP %s Perm %O", userId, useremail, req.params.vpid, req.oneVP.name, req.combinedPerm);

			var query = {};
			query.vpids = req.oneVP._id;
			query.groupType = {$in: ['VC', 'VP']};
			// VC Groups without global Permission are excluded, but deliver VP Groups without permission
			query['permission.vp'] = { $exists: true }		// any permission set for VP VC Groups
			logger4js.trace("Get Visbo Project Group Query %O", query);
			var queryVCGroup = VisboGroup.find(query);
			queryVCGroup.select('-vpids');
			queryVCGroup.lean();
			queryVCGroup.exec(function (err, listVPGroup) {
				if (err) {
					logger4js.fatal("VC Get Group DB Connection \nVisboGroup.find(%s)\n%O ", query, err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting VisboProject Groups',
						error: err
					});
				}
				logger4js.info("Found %d Groups for VC", listVPGroup.length);
				if (req.query.userlist) {
					var listVPUsers = [];
					for (var i = 0; i < listVPGroup.length; i++) {
						for (var j = 0; j < listVPGroup[i].users.length; j++) {
							listVPUsers.push({userId: listVPGroup[i].users[j].userId,
															email: listVPGroup[i].users[j].email,
															groupId: listVPGroup[i]._id,
															groupName: listVPGroup[i].name,
														  groupType: listVPGroup[i].groupType,
															internal: listVPGroup[i].internal})
						}
					}
					return res.status(200).send({
						state: 'success',
						message: 'Returned Visbo Project Groups',
						count: listVPGroup.length,
						groups: listVPGroup,
						users: listVPUsers
					});
				} else {
					return res.status(200).send({
						state: 'success',
						message: 'Returned Visbo Project Groups',
						count: listVPGroup.length,
						groups: listVPGroup
					});
				}
			});
		})

	/**
		* @api {post} /vp/:vpid/group Create a Group
		* @apiVersion 1.0.0
		* @apiGroup Visbo Project Permission
		* @apiName PostVisboProjectGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Post creates a new group inside the Visbo Project
		*
		* @apiPermission Authenticated and System Permission: View Visbo Project, Manage Visbo Project Permission.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 missing name of Visbo Project Group during Creation
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a Visbo Project Group
		* @apiError {number} 409 Visbo Project Group with same name exists already
		* @apiExample Example usage:
		*   url: http://localhost:3484/vp/:vpid/groups
		*  {
		*     "name":"Group Name",
		*     "global": true,
		*     "permission": {vc: 307 }
		*  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Returned Visbo Project Group",
		*   "groups":[{
		*     "_id":"vpgroup5c754feaa",
		*     "name":"My first Group",
		*     "vpid": "vc5c754feaa",
		*     "global": true,
		*     "permission": {vc: 307 },
		*   }]
		* }
		*/

	// Create a Visbo Project Group
		.post(function(req, res) {
			// User is authenticated already
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var isSysAdmin = req.query && req.query.sysAdmin ? true : false;
			var groupType = 'VP';

			var vgName = (req.body.name || '').trim();
			if (!validateName(vgName, false)) {
				logger4js.info("POST Visbo Project Group contains illegal strings body %O", req.body);
				return res.status(400).send({
					state: "failure",
					message: "Visbo Project Group Body contains invalid strings"
				});
			}

			var newPerm = {};
			var vgGlobal = false;

			if ( req.body.permission ) {
				newPerm.vp = (parseInt(req.body.permission.vp) || undefined) & Const.constPermVPAll
			}

			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Project Group (Create)';

			logger4js.info("Post a new Visbo Project Group with name %s executed by user %s ", req.body.name, useremail);
			logger4js.debug("Post a new Visbo Project Group Req Body: %O Name %s Perm %O", req.body, vgName, req.combinedPerm);

			if (!(req.combinedPerm.vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Project or no Permission'
				});
			}
			if (!req.body.name) {
				logger4js.info("Body is inconsistent VC %s Body %O", req.oneVC._id, req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'No valid Group Definition'
				});
			}
			logger4js.debug("Post Group to VP %s/%s Permission is ok, check unique name", req.oneVP.name, req.oneVP._id);
			var query = {vcid: req.oneVP.vcid, vpids: req.oneVP._id, groupType: 'VP', name: req.body.name};
			var queryVCGroup = VisboGroup.findOne(query);
			queryVCGroup.select('name');
			queryVCGroup.lean();
			queryVCGroup.exec(function (err, oneGroup) {
				if (err) {
					logger4js.fatal("VC Post Group DB Connection \nVisboGroup.findOne(%s)\n%O ", query, err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Visbo Project Groups',
						error: err
					});
				}
				if (oneGroup) {
					return res.status(409).send({
						state: 'failure',
						message: 'Visbo Project Group already exists'
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
				logger4js.debug("Post Group %s to VP %s now: %O", req.body.name, req.params.vpid, vgGroup);
				vgGroup.save(function(err, oneGroup) {
					if (err) {
						logger4js.fatal("VC Post Group DB Connection ", err);
						return res.status(500).send({
							state: 'failure',
							message: 'Error updating Visbo Project Group',
							error: err
						});
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
						message: 'Inserted Visbo Project Group',
						groups: [ resultGroup ]
					});
				});
			});
		})


	router.route('/:vpid/group/:groupid')

	/**
		* @api {delete} /vp/:vpid/group/:groupid Delete a Group
		* @apiVersion 1.0.0
		* @apiGroup Visbo Project Permission
		* @apiName DeleteVisboProjectGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Deletes the specified group in the Visbo Project
		*
		* @apiPermission Authenticated and Permission: View Visbo Project, Manage Visbo Project Permission.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 delete of internal Visbo Project Group or a Visbo Center Group inside the Visbo Project not allowed.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Delete a Visbo Project Group
		* @apiExample Example usage:
		*   url: http://localhost:3484/vp/:vpid/group/:groupid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Visbo Project Group deleted"
		* }
		*/

	// Delete Visbo Project Group
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Project Group (Delete)';
			req.auditInfo = req.oneGroup.name;
			logger4js.info("DELETE Visbo Project Group for userid %s email %s and vc %s group %s ", userId, useremail, req.params.vpid, req.params.groupid);

			if (!(req.combinedPerm.vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Project or no Permission'
				});
			}
			logger4js.debug("Delete Visbo Project Group after premission check %s", req.params.vpid);

			// Do not allow to delete internal VC Group
			if (req.oneGroup.internal || req.oneGroup.groupType != 'VP') {
				return res.status(400).send({
					state: 'failure',
					message: 'Visbo Project Group not deletable'
				});
			}
			req.oneGroup.remove(function(err, empty) {
				if (err) {
					logger4js.fatal("VC Delete Group DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error deleting Visbo Project Group',
						error: err
					});
				}
				return res.status(200).send({
					state: 'success',
					message: 'Deleted Visbo Project Group'
				});
			});
		})

	/**
		* @api {put} /vp/:vpid/group/:groupid Update a Group
		* @apiVersion 1.0.0
		* @apiGroup Visbo Project Permission
		* @apiName PutVisboProjectGroup
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Put updates a group inside the Visbo Project
		*
		* @apiPermission Authenticated and Permission: View Visbo Project, Manage Visbo Project Permission.
		* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
		* @apiError {number} 400 Not allowed to change a Visbo Center Group inside the Visbo Project.
		* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
		* @apiError {number} 403 No Permission to Create a Visbo Project Group
		* @apiError {number} 409 Visbo Project Group with same name exists already
		* @apiExample Example usage:
		*   url: http://localhost:3484/vp/:vpid/group/:groupid
		*  {
	  *    "name":"My first Group Renamed",
		*    "global": true,
		*    "permission": {vc: 3, vp: 1 }
	  *   }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Returned Visbo Project Group",
		*   "groups":[{
		*     "_id":"vpgroup5c754feaa",
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
			req.auditDescription = 'Visbo Project Group (Update)';

			var vgName = (req.body.name || '').trim();
			var newPerm = {};
			var vgGlobal = false;
			if (req.body.global != undefined)
				vgGlobal = req.body.global == true;
			logger4js.debug("Get Global Flag %s process %s", req.body.global, vgGlobal);
			if ( req.body.permission ) {
				newPerm.vp = (parseInt(req.body.permission.vp) || undefined) & Const.constPermVPAll
			}

			logger4js.info("PUT Visbo Project Group for userid %s email %s and vc %s group %s perm %O", userId, useremail, req.params.vpid, req.params.groupid, req.combinedPerm);
			if (!validateName(vgName, true)) {
				logger4js.info("PUT Visbo Project Group contains illegal strings body %O", req.body);
				return res.status(400).send({
					state: "failure",
					message: "Visbo Project Group Body contains invalid strings"
				});
			}

			if (!(req.combinedPerm.vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Project or no Permission'
				});
			}
			if (req.oneGroup.groupType != 'VP') {
				return res.status(400).send({
					state: 'failure',
					message: 'not a Visbo Project Group'
				});
			}

			logger4js.debug("Update Visbo Project Group after premission check vpid %s groupName %s", req.params.vpid, req.oneGroup.name);

			// fill in the required fields
			if (vgName) req.oneGroup.name = vgName;
			req.oneGroup.permission = newPerm;
			req.oneGroup.internal = req.oneGroup.internal == true; // to guarantee that it is set
			req.oneGroup.save(function(err, oneGroup) {
				if (err) {
					logger4js.fatal("VC Put Group DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Project Group',
						error: err
					});
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
					message: 'Updated Visbo Project Group',
					groups: [ resultGroup ]
				});
			});
		})

	router.route('/:vpid/group/:groupid/user')

		/**
			* @api {post} /vp/:vpid/group/:groupid/user Add User to Group
			* @apiVersion 1.0.0
			* @apiGroup Visbo Project Permission
			* @apiName AddUserToVisboProjectGroup
			* @apiHeader {String} access-key User authentication token.
			* @apiDescription Adds the specified user from body to the group
			*
			* @apiPermission Authenticated and Permission: View Visbo Project, Manage Visbo Project Permission.
			* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
			* @apiError {number} 400 missing user name to add to the Visbo Project Group or the Group is a Visbo Center Group
			* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
			* @apiError {number} 403 No Permission to Add a User to Visbo Project Group
			* @apiError {number} 409 user is already member of the Visbo Project Group
			* @apiExample Example usage:
			*  url: http://localhost:3484/vp/:vpid/group/:groupid/user
			*  {
		  *    "email":"new.user@visbo.de",
			*    "message": "Invitation message"
		  *  }
			* @apiSuccessExample {json} Success-Response:
			* HTTP/1.1 200 OK
			* {
			*   "state":"success",
			*   "message":"User was added to Visbo Project Group",
			*   "groups":[{
			*     "_id":"vpgroup5c754feaa",
			*     "name":"My first Group Renamed",
			*     "vcid": "vc5c754feaa",
			*     "users": [{userId: "userId5c754feaa", email: "new.user@visbo.de"}]
			*     "global": true,
			*     "permission": {vc: 3 },
			*   }]
			* }
			*/

		// Add User to Visbo Project Group
		.post(function(req, res) {
			// User is authenticated already
			var userId = req.decoded._id;
			var useremail = req.decoded.email;

			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			logger4js.info("Post a new Visbo Project User with name %s  to group %s executed by user %s with perm %s ", req.body.email, req.oneGroup.name, useremail, req.combinedPerm);
			req.auditDescription = 'Visbo Project User (Add)';

			if (req.body.email) req.body.email = req.body.email.toLowerCase().trim();
			if (!req.body.email || !validateName(req.body.email, false)) {
				return res.status(400).send({
					state: 'failure',
					message: 'No valid user definition'
				});
			}

			req.auditInfo = req.body.email + ' / ' + req.oneGroup.name;
			// no check for SysAdmin as SysAdmin does not get any special permissions
			if (!(req.combinedPerm.vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Project or no Permission'
				});
			}
			if (req.oneGroup.groupType != 'VP') {
				return res.status(400).send({
					state: 'failure',
					message: 'not a Visbo Project Group'
				});
			}
			logger4js.debug("Post User to VP %s Permission is ok", req.params.vpid);

			var vgUser = new VisboGroupUser();
			var eMailMessage = undefined;
			if (req.body.message) {
				eMailMessage = req.body.message;
			}
			vgUser.email = req.body.email;

			// check if the user is not member of the group already
			if (req.oneGroup.users.filter(users => (users.email == vgUser.email)).length != 0) {
				logger4js.debug("Post User %s to VC Group %s User is already a member", vgUser.email, req.oneGroup._id);
				return res.status(409).send({
					state: 'failure',
					message: 'User is already member',
					groups: [req.oneGroup]
				});
			}
			logger4js.debug("Post User to VP User is not member of the group");
			// check if the user exists and get the UserId or create the user
			var query = {'email': vgUser.email};
			var queryUsers = User.findOne(query);
			//queryUsers.select('email');
			queryUsers.exec(function (err, user) {
				if (err) {
					logger4js.fatal("Post User to Group cannot find User, DB Connection \nUser.findOne(%s)\n%O ", query, err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error adding User to VisboProject Group',
						error: err
					});
				}
				if (!user) {
					user = new User();
					user.email = vgUser.email;
					logger4js.debug("Create new User %s for VP as %s", vgUser.email, vgUser.groupName);
					user.save(function(err, user) {
						if (err) {
							logger4js.error("Add User to VP: Error DB Connection %O", err);
							return res.status(500).send({
								state: "failure",
								message: "database error, failed to create user",
								error: err
							});
						}
						// user exists now, now the VC can be updated
						vgUser.userId = user._id;

						req.oneGroup.users.push(vgUser)
						req.oneGroup.save(function(err, vgGroup) {
							if (err) {
								logger4js.error("Error Update VisboGroup %s  with Error %s", req.oneGroup._id, err);
								return res.status(500).send({
									state: "failure",
									message: "database error, failed to update Visbo Group",
									error: err
								});
							}
							req.oneGroup = vgGroup;
							// now send an e-Mail to the user for registration
							var template = __dirname.concat('/../emailTemplates/inviteVPNewUser.ejs')
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
										groups: [ vgGroup ]
									});
							} else {
								ejs.renderFile(template, {userFrom: req.decoded, userTo: user, url: uiUrl, vp: req.oneVP, message: eMailMessage}, function(err, emailHtml) {
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
											subject: 'You have been invited to a Visbo Project ' + req.oneVP.name,
											html: '<p> '.concat(emailHtml, " </p>")
									};
									logger4js.info("Now send mail from %s to %s", message.from, message.to);
									mail.VisboSendMail(message);
									return res.status(200).send({
										state: "success",
										message: "Successfully added User to Visbo Project",
										groups: [ vpGroup ]
									});
								});
							}
						})
					});
				} else {
					vgUser.userId = user._id;
					req.oneGroup.users.push(vgUser)
					req.oneGroup.save(function(err, vgGroup) {
						if (err) {
							logger4js.error("Error Update VisboGroup %s  with Error %s", req.oneGroup._id, err);
							return res.status(500).send({
								state: "failure",
								message: "database error, failed to update Visbo Group",
								error: err
							});
						}
						req.oneGroup = vgGroup;
						// now send an e-Mail to the user for registration/login
						var template = __dirname.concat('/../emailTemplates/');
						var uiUrl =  'http://localhost:4200'
						var eMailSubject = 'You have been invited to a Visbo Project ' + req.oneVP.name
						if (process.env.UI_URL != undefined) {
							uiUrl = process.env.UI_URL;
						}
						logger4js.debug("E-Mail User Status %O %s", user.status, user.status.registeredAt);
						if (user.status && user.status.registeredAt) {
							// send e-Mail to a registered user
							template = template.concat('inviteVPExistingUser.ejs');
							uiUrl = uiUrl.concat('/vpv/', req.oneVP._id);
						} else {
							// send e-Mail to an existing but unregistered user
							template = template.concat('inviteVPNewUser.ejs');
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
									groups: [ vgGroup ]
								});
						} else {
							ejs.renderFile(template, {userFrom: req.decoded, userTo: user, url: uiUrl, vp: req.oneVP, message: eMailMessage}, function(err, emailHtml) {
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
									message: "Successfully added User to Visbo Project",
									groups: [ vgGroup ]
								});
							});
						}
					})
				}
			})
		})

		router.route('/:vpid/group/:groupid/user/:userid')

		/**
			* @api {delete} /vp/:vpid/group/:groupid/user/:userid Delete a User from VC Group
			* @apiVersion 1.0.0
			* @apiGroup Visbo Project Permission
			* @apiName DeleteVisboProjectUser
			* @apiHeader {String} access-key User authentication token.
			* @apiDescription Deletes the specified user in the Visbo Project Group
			*
			* @apiPermission Authenticated and Permission: View Visbo Project, Manage Visbo Project Permission.
			* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
			* @apiError {number} 400 no Admin user will be left in internal Visbo Project Group or the group is a Visbo Center Group
			* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
			* @apiError {number} 403 No Permission to Create a Visbo Project Group
			* @apiError {number} 409 user is not member of the Visbo Project Group
			*
			* @apiExample Example usage:
			*   url: http://localhost:3484/vp/:vpid/group/:groupid/user/:userid
			* @apiSuccessExample {json} Success-Response:
			* HTTP/1.1 200 OK
			* {
			*   "state":"success",
			*   "message":"Visbo Project User deleted from Group"
			* }
			*/

	// Delete Visbo Project User
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			logger4js.info("DELETE Visbo Project User by userid %s email %s for user %s Group %s ", userId, useremail, req.params.userid, req.oneGroup._id);

			req.auditDescription = 'Visbo Project User (Delete)';

			var delUser = req.oneGroup.users.find(findUserById, req.params.userid)
			if (delUser) req.auditInfo = delUser.email  + ' / ' + req.oneGroup.name;

			if (!(req.combinedPerm.vp & constPermVP.ManagePerm)) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Project or no Permission'
				});
			}
			if (req.oneGroup.groupType != 'VP') {
				return res.status(400).send({
					state: 'failure',
					message: 'not a Visbo Project Group'
				});
			}
			var newUserList = req.oneGroup.users.filter(users => (!(users.userId == req.params.userid )))
			logger4js.debug("DELETE Visbo Group User List Length new %d old %d", newUserList.length, req.oneGroup.users.length);
			logger4js.trace("DELETE Visbo Project Filtered User List %O ", newUserList);
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
			logger4js.debug("Delete Visbo Project User after premission check %s", req.params.userid);
			req.oneGroup.users = newUserList;
			req.oneGroup.save(function(err, vg) {
				if (err) {
					logger4js.error("Error Update VisboProject Group %s with Error %s", req.oneVC.name, err);
					return res.status(500).send({
						state: "failure",
						message: "database error, failed to update Visbo Project",
						error: err
					});
				}
				req.oneGroup = vg;
				return res.status(200).send({
					state: "success",
					message: "Successfully removed User from Visbo Project",
					groups: [req.oneGroup]
				});
			})
		})

router.route('/:vpid/lock')
/**
	* @api {post} /vp/:vpid/lock Create Lock
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Properties
	* @apiName CreateLock
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Post creates or renews a lock for a user to a specific project and variant
	* In case a lock is already active for another user, the lock request fails, in case a lock exists for the current user, it gets replaced by the new lock.
	* A User who can not Modify the Visbo Project can not lock the Visbo Project only a Variant of a Project, if the user has CreateVariant Permission.
  *
	* @apiPermission Authenticated and Permission: View Visbo Project, Modify Project, Create Variant.
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	* @apiError {number} 400 no valid lock date or a variant that does not exist
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Lock the Visbo Project
	* @apiError {number} 409 Visbo Project already locked by another user.
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aada025/lock
	* {
	*  "variantName": "V1",
	*  "expiresAt": "2018-04-26T12:04:12.094Z"
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"Successfully locked VisboProject",
	*  "lock":[{
	*    "_id": "id5c754feaa",
	*    "variantName": "",
	*    "email": "someone@visbo.de",
	*    "createdAt": "2018-04-26T11:04:12.094Z",
	*    "expiresAt": "2018-04-26T12:04:12.094Z"
	*  }]
	* }
	*/
// Create a Lock for a Project
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project Lock (Create)';

		logger4js.info("POST Lock Visbo Project for userid %s email %s and vp %s ", userId, useremail, req.params.vpid);
		var variantName = req.body.variantName || "";
		var expiredAt = (req.body.expiresAt  && Date.parse(req.body.expiresAt)) ? new Date(req.body.expiresAt) : undefined;
		var dateNow = new Date();

		if (expiredAt == undefined) {
			expiredAt = dateNow
			// set the lock date to 1 hour later
			expiredAt.setHours(expiredAt.getHours() + 1);
		} 
		logger4js.info("POST Lock Visbo Project %s Check variant %s does exists  ", req.params.vpid, variantName);

		if (variantName != "" && variant.findVariant(req.oneVP, variantName) < 0) {
				logger4js.warn("POST Lock Visbo Project %s variant %s does not exists  ", req.params.vpid, variantName);
				return res.status(400).send({
				state: 'failure',
				message: 'Visbo Project Variant does not exist',
				vp: [req.oneVP]
			});
		}

		if (lockVP.lockStatus(req.oneVP, useremail, variantName).locked) {
			return res.status(409).send({
				state: 'failure',
				message: 'Visbo Project already locked',
				lock: req.oneVP.lock
			});
		}
		if (expiredAt <= dateNow) {
			logger4js.info("POST Lock new Lock already expired %s email %s and vp %s ", expiredAt, useremail, req.params.vpid);
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
				logger4js.fatal("VP Lock DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error updating Visbo Project Locks',
					error: err
				});
			}
			newLock = req.oneVP.lock.filter(lock => (lock.email == newLock.email && lock.expiresAt == newLock.expiresAt && lock.variantName == newLock.variantName && lock.createdAt == newLock.createdAt ))[0];
			return res.status(200).send({
				state: 'success',
				message: 'Updated Visbo Project Locks',
				lock: [newLock]
			});
		});
	})

/**
	* @api {delete} /vp/:vpid/lock Delete Lock
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Properties
	* @apiName DeleteLock
	* @apiDescription Deletes a lock for a specific project and a specific variantName
	* the user needs to have read access to the Visbo Project and either owns the lock or has Modify Permission in the Visbo Project
	* @apiHeader {String} access-key User authentication token.
	* @apiParam {String} variantName The Variant Name of the Project for the Lock
	* @apiParam (Parameter AppAdmin) {Boolean} [sysadmin=false] Request System Permission
	*
	* @apiPermission Authenticated and Permission: View Visbo Project, Modify Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Lock the Visbo Project
	* @apiError {number} 409 No Lock exists for the specified Visbo Project and Variant.
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aada025/lock
	*   url: http://localhost:3484/vp/vp5aada025/lock?variantName=Variant1
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Deleted Visbo Project Lock"
	* }
	*/
// Delete Lock
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project Lock (Delete)';

		var variantName = "";
		variantName = req.query.variantName || "";
		logger4js.info("DELETE Visbo Project Lock for userid %s email %s and vp %s variant :%s:", userId, useremail, req.params.vpid, variantName);

		var resultLock = lockVP.lockStatus(req.oneVP, useremail, variantName);
		if (resultLock.lockindex < 0) {
			logger4js.info("Delete Lock for VP :%s: No Lock exists", req.oneVP.name);
			return res.status(409).send({
				state: 'failure',
				message: 'VP no Lock exists for Deletion',
				lock: req.oneVP.lock
			});
		}
		if (resultLock.locked && !(req.combinedPerm.vp & constPermVP.Modify)) {	// lock from a different user and no Admin, deny to delete
			logger4js.info("Delete Lock for VP :%s: Project is locked by another user", req.oneVP.name);
			return res.status(403).send({
				state: 'failure',
				message: 'VP locked for another user',
				lock: req.oneVP.lock
			});
		}

		logger4js.debug("Delete Lock for VP :%s: after perm check has %d Locks", req.oneVP.name, req.oneVP.lock.length);
		req.oneVP.lock.splice(resultLock.lockindex, 1);  // remove the found lock
		var listLockNew = lockVP.lockCleanup(req.oneVP.lock);
		req.oneVP.lock = listLockNew;
		logger4js.debug("Delete Lock for VP :%s: after Modification has %d Locks", req.oneVP.name, req.oneVP.lock.length);

		req.oneVP.save(function(err, empty) {
			if (err) {
				logger4js.fatal("VP DELETE Lock DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error deleting Visbo Project',
					error: err
				});
			}
			return res.status(200).send({
				state: 'success',
				message: 'Deleted Visbo Project Locks',
				lock: req.oneVP.lock
			});
		});
	})

router.route('/:vpid/variant')
/**
	* @api {post} /vp/:vpid/variant Create a Variant
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Properties
	* @apiName CreateVisboProjectVariant
	* @apiDescription Post creates a new Variant for the Visbo Project
	*
	* @apiPermission Authenticated and Permission: View Visbo Project, Modify Project or Create Variant.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Create a Variant for the Visbo Project
	* @apiError {number} 409 Variant already exists.
	*
	* @apiHeader {String} access-key User authentication token.
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aada025/variant
	* {
	*  "variantName": "some name",
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"Successfully created Variant for Visbo Project",
	*  "variant":[{
	*    "_id": "id5c754feaa",
	*    "variantName": "V1",
	*    "email": "someone@visbo.de",
	*    "createdAt": "2018-04-26T11:04:12.094Z",
	*    "vpvCount": "1"
	*  ]}
	* }
	*/
// Create a Variant inside a Project
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project Variant (Create)';

		logger4js.info("POST Visbo Project Variant for userid %s email %s and vp %s Variant %O Perm %O", userId, useremail, req.params.vpid, req.body, req.combinedPerm);

		var variantList = req.oneVP.variant;
		var variantName = (req.body.variantName || "").trim();

		if (!validateName(variantName, false)) {
			logger4js.info("POST Visbo Project Variant contains illegal strings body %O", req.body);
			return res.status(400).send({
				state: "failure",
				message: "Visbo Project Variant Body contains invalid strings"
			});
		}
		if (!(req.combinedPerm.vp & constPermVP.Modify
				|| req.combinedPerm.vp & constPermVP.CreateVariant)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Project or no Permission'
			});
		}
		logger4js.trace("Variant %s current list %O", variantName, variantList);
		var variantDuplicate = false
		for (i = 0; i < variantList.length; i++) {
			if (variantList[i].variantName == variantName ) {
				variantDuplicate = true;
				break;
			}
		}
		logger4js.debug("Variant Duplicate %s Variant Name %s", variantDuplicate, variantName);
		if (variantDuplicate || variantName == "") {
			return res.status(409).send({
				state: 'failure',
				message: 'Variant already exists',
				vp: [req.oneVP]
			});
		}
		logger4js.trace("Variant List %d orig %O ", variantList.length, variantList);
		newVariant = new Variant;
		newVariant.email = useremail;
		newVariant.variantName = variantName;
		newVariant.createdAt = new Date();
		newVariant.vpvCount = 0;
		variantList.push(newVariant);
		req.oneVP.variant = variantList;
		logger4js.trace("Variant List new %O ", variantList);
		req.oneVP.save(function(err, oneVP) {
			if (err) {
				logger4js.fatal("VP POST Variant DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error updating Visbo Project Variants',
					error: err
				});
			}
			newVariant = oneVP.variant.filter(variant => (variant.email == newVariant.email && variant.createdAt == newVariant.createdAt && variant.variantName == newVariant.variantName ))[0];
			return res.status(200).send({
				state: 'success',
				message: 'Created Visbo Project Variant',
				variant: [newVariant]
			});
		});
	})

router.route('/:vpid/variant/:vid')

/**
	* @api {delete} /vp/:vpid/variant/:vid Delete a Variant
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Properties
	* @apiName DeleteVisboProjectVariant
	* @apiDescription Deletes a specific Variant for a project and also the project Versions
	* the user needs to have read access to the Visbo Project and either owns the Variant or has Modify Permission in the Visbo Project
	* @apiHeader {String} access-key User authentication token.
	*
	* @apiPermission Authenticated and Permission: View Visbo Project, Modify Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to Lock the Visbo Project
	* @apiError {number} 409 Variant does not exists or still contains Versions
	* @apiError {number} 423 Variant is locked by another user
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aada025/variant/variant5aada
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Deleted Visbo Project Variant",
	*   "vp": [vpList]
	* }
	*/
// Delete Project Variant
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var variantId = req.params.vid;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project Variant (Delete)';
		req.auditInfo = req.body.variantId;

		logger4js.info("DELETE Visbo Project Variant for userid %s email %s and vp %s variant :%s:", userId, useremail, req.params.vpid, req.params.vid);

		var variantIndex = variant.findVariantId(req.oneVP, variantId);
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
		if (req.oneVP.variant[variantIndex].email != useremail && !(req.combinedPerm.vp & constPermVP.Modify)) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete',
				vp: [req.oneVP]
			});
		}
		lockResult = lockVP.lockStatus(req.oneVP, useremail, variantName);
		if (lockResult.locked) {
			return res.status(423).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [req.oneVP]
			});
		}
		if (req.oneVP.variant[variantIndex].vpvCount > 0) {
			return res.status(409).send({
				state: 'failure',
				message: 'Visbo Project Variant still has Versions',
				vp: [req.oneVP]
			});
		}
		req.oneVP.variant.splice(variantIndex, 1);
		if (lockResult.lockindex >= 0) {
			req.oneVP.lock.splice(lockResult.lockindex, 1);
		}
		logger4js.trace("DELETE Visbo Project Variant List after %O", req.oneVP.variant);

		// MS TODO Destroy the Deleted Variant Versions of the Project

		req.oneVP.save(function(err, empty) {
			if (err) {
				logger4js.fatal("VP DELETE Variant DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error deleting Visbo Project Variants',
					error: err
				});
			}
			return res.status(200).send({
				state: 'success',
				message: 'Deleted Visbo Project Variant',
				vp: [req.oneVP]
			});
		})
	})

router.route('/:vpid/portfolio')
/**
	* @api {get} /vp/:vpid/portfolio Get Portfolio Versions
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Portfolio
	* @apiName GetPortfolio
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp/:vpid/portfolio returns all Portfolio List Versions in the specified Visbo Project
	* In case of success it delivers an array of Portfolio Lists, the array contains in each element a Portfolio List
	*
	* @apiPermission Authenticated and Permission: View Visbo Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View the Visbo Project
	*
	* With additional query paramteters the amount of versions can be restricted. Available Restirctions are: refDate, refNext, varianName.
	* to query only the main version of a project, use variantName= in the query string.
	*
	* @apiParam {Date} refDate only the latest version before the reference date for the project and variant is delivered
	* Date Format is in the form: 2018-10-30T10:00:00Z
	* @apiParam {String} refNext If refNext is not empty the system delivers not the version before refDate instead it delivers the version after refDate
	* @apiParam {String} variantName Deliver only versions for the specified variant, if client wants to have only versions from the main branch, use variantName=
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aaf992/portfolio
	*   url: http://localhost:3484/vp/vp5aaf992/portfolio?refDate=2018-01-01&variantName=Variant1&refNext=1
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Portfolios",
	*   "vpf": [{
	*   "updatedAt": "2018-06-07T13:17:35.434Z",
	*   "createdAt": "2018-06-07T13:17:35.434Z",
	*   "sortType": 1,
	*   "timestamp": "2018-06-07T13:17:35.000Z",
	*   "name": "VP Test01 PF",
	*   "variantName": "",
	*   "vpid": "5b192d7915609a50f5702a2c",
	*   "_id": "5b19306f53eb4b516619a5ab",
	*   "allItems": [{
	*     "vpid": "5b1532e8586c150506ab9633",
	*     "name": "VisboProject Name",
	*     "variantName": "",
	*     "Start": "2018-04-01T12:00:00.000Z",
	*     "show": true,
	*     "zeile": 2,
	*     "reasonToInclude": "Description Text Include",
	*     "reasonToExclude": "Description Text Exclude",
	*     "_id": "5b19306f53eb4b516619a5ac"
	*   }]
  * }
	*/
// Get Portfolio Versions
	.get(function(req, res) {
		// no need to check authentication, already done centrally

		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;

		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Portfolio List (Read)';
		req.auditSysAdmin = sysAdmin;

		var query = {};
		var latestOnly = false; 	// as default show all portfolio lists of the project
		query.vpid = req.oneVP._id;
		if (req.query.refDate){
			var refDate = new Date(req.query.refDate);
			query.timestamp =  req.query.refNext ? {$gt: refDate} : {$lt: refDate};
			latestOnly = true;
		} else {
			query.timestamp =  {$lt: new Date()};
		}
		if (req.query.variantName != undefined){
			logger4js.debug("Variant Query String :%s:", req.query.variantName);
			query.variantName = req.query.variantName
		}
		query.deletedAt = {$exists: false};

		logger4js.debug("Get Portfolio Version for user %s with query parameters %O", userId, query);

		var queryVPF = VisboPortfolio.find(query);
		if (req.query.refNext)
			queryVPF.sort('vpid variantName +timestamp')
		else
			queryVPF.sort('vpid variantName -timestamp')
		queryVPF.lean();
		queryVPF.exec(function (err, listVPF) {
			if (err) {
				logger4js.fatal("VPF GET DB Connection \nVisboPortfolio.find(%s)\n%O ", query, err);
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			logger4js.debug("Found %d Portfolios", listVPF.length);
			logger4js.trace("Found Portfolios/n", listVPF);

			if (listVPF.length > 1 && latestOnly){
				var listVPFfiltered = [];
				listVPFfiltered.push(listVPF[0]);
				for (let i = 1; i < listVPF.length; i++){
					//compare current item with previous and ignore if it is the same vpid & variantname
					// logger4js.trace("compare: :%s: vs. :%s:", JSON.stringify(listVPF[i].vpid), JSON.stringify(listVPF[i-1].vpid), JSON.stringify(listVPF[i].variantName), JSON.stringify(listVPF[i-1].variantName) );
					if (JSON.stringify(listVPF[i].vpid) != JSON.stringify(listVPF[i-1].vpid)
					|| JSON.stringify(listVPF[i].variantName) != JSON.stringify(listVPF[i-1].variantName) ) {
						listVPFfiltered.push(listVPF[i])
						// logger4js.trace("compare unequal: ", listVPF[i].vpid != listVPF[i-1].vpid);
					}
				}
				logger4js.debug("Found %d Portfolio Lists after Filtering", listVPFfiltered.length);
				req.auditInfo = listVPFfiltered.length;
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Portfolios',
					count: listVPFfiltered.length,
					vpf: listVPFfiltered
				});
			} else {
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Portfolios',
					count: listVPF.length,
					vpf: listVPF
				});
			}
		});
	})

/**
	* @api {post} /vp/:vpid/portfolio Create a Portfolio Version
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Portfolio
	* @apiName CreatePortfolio
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Post creates a new Definition of a Portfolio for the Visbo Project
	*
	* @apiPermission Authenticated and Permission: View Visbo Project, Modify Visbo Project.
	* @apiError {number} 400 no Project Items specified for Portfolio or Visbo Project is not a Portfolio.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View the Visb Proect (Portfolio) or Create a Visbo Center Portfolio List
	* @apiError {number} 409 Variant does not exist
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aada025/portfolio
	*  {
	*    "variantName": "name of the portfolio variant",
	*    "allItems": [{
	*      "vpid" : "VisboProject ID",
	*      "variantName" : "name of the Variant of the Project",
	*      "Start" : "2018-04-01T12:00:00.000Z",
	*      "show" : "true",
	*      "zeile" : "row number",
	*      "reasonToInclude" : "Description Text",
	*      "reasonToExclude" : "Description Text"
	*    }],
	*   "sortType": "1",
	*   "sortList": "internal Object"
	* }
	* @apiSuccessExample {json} Success-Response:
	*     HTTP/1.1 200 OK
	*  {
	*    "state":"success",
	*    "message":"Successfully Created Visbo Portfolio",
	*    "vpf":[{
	*      "_id":"vpf541c754feaa",
	*      "updatedAt":"2018-03-16T12:39:54.042Z",
	*      "createdAt":"2018-03-12T09:54:56.411Z",
	*      "vpid" : "VisboProject ID",
	*      "name" : "VisboProject Name",
	*      "allItems": [{
	*        "vpid" : "VisboProject ID",
	*        "name" : "VisboProject Name",
	*        "variantName" : "name of the Variant of the Project",
	*        "Start" : "2018-04-01T12:00:00.000Z",
	*        "show" : "true",
	*        "zeile" : "row number",
	*        "reasonToInclude" : "Description Text",
	*        "reasonToInclude" : "Description Text"
	*      }],
	*      "sortType": "1",
	*      "sortList": "internal Object"
	*    }]
	*  }
	*/
// Post a Portfolio List
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Portfolio List (Create)';

		logger4js.info("POST Visbo Portfolio for userid %s email %s and vp %s perm %O", userId, useremail, req.params.vpid, req.combinedPerm);

		logger4js.debug("Variant %s Portfolio %O", variantName || "None", req.body);

		var variantName = req.body.variantName == undefined ? "" : req.body.variantName;
		var variantIndex = variantName == "" ? 0 : variant.findVariant(req.oneVP, variantName);
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
				message: 'No Project Items in Portfolio',
				vp: [req.oneVP]
			});
		}
		if (req.oneVP.vpType != constVPTypes.portfolio) {
			return res.status(400).send({
				state: 'failure',
				message: 'Visbo Project is not a Portfolio Project',
				vp: [req.oneVP]
			});
		}
		if (!(req.combinedPerm.vp & (constPermVP.View + constPermVP.Modify))
		&& !((req.combinedPerm.vp & (constPermVP.View + constPermVP.CreateVariant)) && variantName != '')) {
			return res.status(403).send({
				state: 'failure',
				message: 'Visbo Project Portfolio no Permission to create Portfolio List'
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
			if (!listVPid.find(findVP, req.body.allItems[i].vpid)){
				listVPid.push(req.body.allItems[i].vpid)
			}
		};
		logger4js.debug("Check vpids if they exist %s", JSON.stringify(listVPid));
		var query = {'_id': {'$in': listVPid}};
		var queryVP = VisboProject.find(query);
		queryVP.select('_id name');
		queryVP.exec(function (err, listVP) {
			if (err) {
				logger4js.fatal("VPF Post DB Connection \nVisboProject.find(%s)\n%O ", query, err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Projects for Portfolio',
					error: err
				});
			}
			if (listVP.length != listVPid.length) {
				logger4js.warn("Found only %d of %d VP IDs", listVP.length, listVPid.length);
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
				delete req.body.allItems[i]._id;
				newPortfolio.allItems.push(req.body.allItems[i]);
			}
			logger4js.debug("Replaced in List (%d) correct VP Names %s", newPortfolio.allItems.length, JSON.stringify(newPortfolio.allItems));
			newPortfolio.sortType = req.body.sortType;
			newPortfolio.sortList = req.body.sortList;

			newPortfolio.save(function(err, onePortfolio) {
				if (err) {
					logger4js.fatal("VPF Post DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Portfolio',
						error: err
					});
				}
				req.oneVPF = onePortfolio;
				return res.status(200).send({
					state: 'success',
					message: 'Created Visbo Portfolio Version',
					vpf: [onePortfolio]
				});
			});
		});
	})

router.route('/:vpid/portfolio/:vpfid')
/**
	* @api {get} /vp/:vpid/portfolio/:vpfid Get specific Portfolio Version
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Portfolio
	* @apiName GetVisboPortfolio
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp/:vpid/portfolio retruns all Portfolio Versions in the specified Visbo Project
	* In case of success it delivers an array of Portfolio Lists, the array contains in each element a Portfolio List
	*
	* @apiPermission Authenticated and Permission: View Visbo Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View the Visbo Project
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aaf992/portfolio/vpf5aaf992
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Portfolios",
	*   "vpf": [{
	*   "updatedAt": "2018-06-07T13:17:35.434Z",
	*   "createdAt": "2018-06-07T13:17:35.434Z",
	*   "sortType": 1,
	*   "timestamp": "2018-06-07T13:17:35.000Z",
	*   "name": "VP Test01 PF",
	*   "variantName": "",
	*   "vpid": "vp50f5702a2c",
	*   "_id": "vpf116619a5ab",
	*   "allItems": [{
	*     "vpid": "vp150506ab9633",
	*     "name": "VisboProject Name",
	*     "variantName": "",
	*     "Start": "2018-04-01T12:00:00.000Z",
	*     "show": true,
	*     "zeile": 2,
	*     "reasonToInclude": "Description Text Include",
	*     "reasonToExclude": "Description Text Exclude",
	*     "_id": "5b19306f53eb4b516619a5ac"
	*   }]
  * }
	*/
// Get specific portfolio version
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var sysAdmin = req.query.sysadmin ? true : false;

		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Portfolio List (Read)';
		req.auditSysAdmin = sysAdmin;

		logger4js.trace("Get Portfolio Versions");
		var query = {}
		query._id = req.params.vpfid
		query.vpid = req.oneVP._id;
		query.deletedAt = {$exists: false};

		var queryVPF = VisboPortfolio.find(query);
		queryVPF.exec(function (err, listVPF) {
			if (err) {
				logger4js.fatal("VPF GET specific DB Connection \nVisboPortfolio.find(%s)\n%O ", query, err);
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			logger4js.debug("Found %d Portfolios", listVPF.length);
			logger4js.trace("Found Portfolios/n", listVPF);

			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Portfolios',
				vpf: listVPF
			});
		});
	})

/**
	* @api {delete} /vp/:vpid/portfolio/:vpfid Delete a Portfolio Version
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Portfolio
	* @apiName DeleteVisboPortfolio
	* @apiDescription Deletes a specific Portfolio List Version
	* the user needs to have Delete Visbo Project Permission to the Visbo Project
	* @apiHeader {String} access-key User authentication token.
	*
	* @apiPermission Authenticated and Permission: View Visbo Project, Delete Visbo Project.
	* @apiError {number} 401 user not authenticated, the <code>access-key</code> is no longer valid
	* @apiError {number} 403 No Permission to View the Visbo Project or no Delete Permission to delete the Version
	* @apiError {number} 423 Portfolio locked by another user
	*
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aada025/portfolio/vpf5aada
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Deleted Visbo Portfolio Version",
	*   "vp": [vpList]
	* }
	*/
// Delete Portfolio Version
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var vpfid = req.params.vpfid;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Portfolio List (Delete)';

		logger4js.debug("DELETE Visbo Portfolio in Project %s", req.oneVP.name);
		if (!(req.combinedPerm.vp & (constPermVP.View + constPermVP.Delete))) {
			return res.status(403).send({
				state: 'failure',
				message: 'Visbo Project Portfolio no Permission to delete Portfolio List'
			});
		}
		var query = {};
		query._id = vpfid;
		query.vpid = req.oneVP._id;
		query.deletedAt = {$exists: false};
		var queryVPF = VisboPortfolio.findOne(query);
		queryVPF.exec(function (err, oneVPF) {
			if (err) {
				logger4js.fatal("VPF DELETE DB Connection \nVisboPortfolio.findOne(%s)\n%O ", query, err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Visbo Portfolio',
					error: err
				});
			}
			if (!oneVPF) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Portfolio or no Permission'
				});
			}
			var variantExists = false;
			var variantIndex;
			var variantName = oneVPF.variantName
			if (variantName != "") {
				// check that the Variant exists
				variantExists = true;
				variantIndex = variant.findVariant(req.oneVP, variantName)
				if (variantIndex < 0) {
					logger4js.warn("VP PortfolioList Delete Variant does not exist %s %s", req.params.vpvid, variantName);
					// Allow Deleting of a version where Variant does not exists for Admins
					variantName = ""
					variantExists = false;
				};
			}
			lockResult = lockVP.lockStatus(req.oneVP, useremail, variantName);
			if (lockResult.locked) {
				return res.status(423).send({
					state: 'failure',
					message: 'Visbo Portfolio Project locked',
					vp: [req.oneVP]
				});
			}
			// user needs to have Delete Permission or owns the Variant
			var hasPerm = false;
			if (req.combinedPerm.vp & constPermVP.Delete) {
				hasPerm = true;
			} else if (variantName != "" && req.oneVP.variant[variantIndex].email == useremail) {
				hasPerm = true;
			}
			if (!hasPerm) {
				logger4js.warn("VP Portfolio List Delete no Permission %s %s", oneVP._id, variantName);
				return res.status(403).send({
					state: 'failure',
					message: 'Visbo Portfolio List no permission to delete Version'
				});
			}
			oneVPF.deletedAt = new Date();
			oneVPF.save(function(err, oneVPF) {
				if (err) {
					logger4js.fatal("VPF Delete DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error deleting Visbo Portfolio',
						error: err
					});
				}
				req.oneVPF = oneVPF;
				return res.status(200).send({
					state: 'success',
					message: 'Deleted Visbo Portfolio'
				});
			});
		});
	})

module.exports = router;
