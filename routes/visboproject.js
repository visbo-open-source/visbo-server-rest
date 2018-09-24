var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');

var assert = require('assert');
var auth = require('./../components/auth');
var lockVP = require('./../components/lock');
var variant = require('./../components/variant');
var verifyVp = require('./../components/verifyVp');

var VPUser = mongoose.model('VPUser');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var Lock = mongoose.model('Lock');
var Variant = mongoose.model('Variant');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var VisboPortfolio = mongoose.model('VisboPortfolio');

var mail = require('./../components/mail');
var ejs = require('ejs');
var read = require('fs').readFileSync;

var logModule = "VP";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

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

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// register the VP middleware to check that the user has access to the VP
router.use('/', verifyVp.verifyVp);

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
	* @apiDescription GET /vp retruns all VP the user has access permission to
	* In case of success it delivers an array of VPs, the array contains in each element a VP
	* the lock section is empty if no lock is set
	* the variant section is empty if there are no variants for this Project
	* the Project Type 0 means it is a project template, type 1 is a project and type 2 is a portfolio
	* with an additional query paramteter ?vcid=vc5aaf992 the system restricts the list of VP to the specified VC
	* @apiParam {String} vcid Deliver only projects for this Visbo Center
	* @apiParam {String} vpType Deliver only projects of the specified Type
	* @apiPermission user must be authenticated
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiDescription Get all Visbo Projects to whom the authenticated user has access. Optional with a query parameter "vcid" in the URL to restrict the results to a specific Visbo Center
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp
	*   url: http://localhost:3484/vp?vcid=vc5aaf992&vpType=1
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Projects",
	*   "vp":[
	*    {
	*       "_id":"vp541c754feaa",
	*      "updatedAt":"2018-03-16T12:39:54.042Z",
	*      "createdAt":"2018-03-12T09:54:56.411Z",
	*      "name":"My new VisboProject",
	*      "vcid": "vc5aaf992",
	*      "vpvCount": "0",
	*      "vpType": "1",
	*      "vpPublic": "false",
	*      "users":[
	*       {
	*        "email":"example1@visbo.de",
	*        "role":"Admin",
	*        "userId":"us5c754feab"
	*       },
	*       {
	*        "email":"example2@visbo.de",
	*        "role":"User",
	*        "userId":"us5c754feac"
	*       }
	*     ],
	*     "lock": [
	*      {
	*       "variantName": "",
	*       "email": "someone@visbo.de",
	*       "createdAt": "2018-04-26T11:04:12.094Z",
	*       "expiresAt": "2018-04-26T12:04:12.094Z"
	*      }
	*    ],
	*    "variant": [
	*      {
	*       "variantName": "V1",
	*       "email": "someone@visbo.de",
	*       "createdAt": "2018-04-26T11:04:12.094Z",
	*       "vpvCount": "1"
	*      }
	*    ]
	*   }
	*  ]
	* }
	*/
// Get Visbo projects
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project (Read)';

		var query = {};
		// if user is not sysadmin check for user permission
		logger4js.debug("Get Project for user %s check sysAdmin %s status %s", userId, req.query.sysadmin, !req.decoded.status || req.decoded.status.sysAdminRole);
		if (!req.query.sysadmin || !req.decoded.status || !req.decoded.status.sysAdminRole) {
			// either member of the project or if project is public member of the VC
			query = { $or: [ {'users.email': useremail}, { vpPublic: true, vcid: {$in: req.listVC } } ] }		// Permission for User
		}
		query.deleted =  {$exists: false};				// Not deleted
		// check if query string is used to restrict to a specific VC
		if (req.query && req.query.vcid) query.vcid = req.query.vcid;
		// check if query string is used to restrict projects to a certain type (project, portfolio, template)
		if (req.query && req.query.vpType) query.vpType = req.query.vpType;

		logger4js.info("Get Projects for user %s", userId);
		logger4js.trace("Get Project for user %s with query parameters %O", userId, query);

		var queryVP = VisboProject.find(query);
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
			logger4js.trace("Found Projects/n", listVP);

			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Projects',
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
	* with a unique name inside VC and the users with their roles as defined in the body.
	* If no admin is specified for the project the current user is added as Admin.
	* In case of success it delivers an array of VPs to be uniform to GET, the array contains as one element the created VP.
	* @apiHeader {String} access-key User authentication token.
	* @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	* @apiError NoPermission No permission to create a VisboProject HTTP 403
	* @apiError Duplicate VisboProject does already exist HTTP 409
	* @apiError HTTP-400 VisboProject does not exist or user does not have permission to create project
	* @apiPermission user must be authenticated and user must have permission to create a VP
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp
	* {
	*  "name":"My first Visbo Project",
	*  "vcid": "vc5aaf992",
	*  "vpType": "0",
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
	*   "vpPublic": "false",
	*   "users":[
	*    {
	*     "userID": "us5aaf992",
	*     "email":"example@visbo.de",
	*     "role":"Admin"
	*    },
	*    {
	*     "email":"example2@visbo.de",
	*     "role":"User",
	*     "userId":us5aaf993
	*    }
	*   ],
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

		if (req.body.vcid == undefined || req.body.name == undefined) {
				logger4js.warn("No VCID or Name in Body");
				return res.status(400).send({
				state: 'failure',
				message: 'No VCID or Name in Body'
			});
		}
		var vcid = req.body.vcid
		var vpname = (req.body.name || '').trim();
		var vpdescription = (req.body.description || "").trim();
		var vpUsers = req.body.users || [];
		var vpPublic = req.body.vpPublic == true ? true : false;
		logger4js.info("Post a new Visbo Project for user %s with name %s as Public %s in VisboCenter %s/%s with %d Users", useremail, req.body.name, vpPublic, vcid, vpUsers.length);
		logger4js.trace("Post a new Visbo Project body %O", req.body);
		var newVP = new VisboProject();

		// Check that the user has Admin permission in the VC
		var isAdmin = false;
		logger4js.trace("Check VC Permission %O", req.listVC);

		for (var i=0; i < req.listVC.length; i++) {
			if (vcid == req.listVC[i]) {
				isAdmin = true;
				break;
			}
		}
		if (!isAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'Visbo Centers not found or no Admin'
			});
		}
		VisboCenter.findOne({'_id': vcid}, function (err, vc) {
			if (err) {
				logger4js.fatal("VP Post DB Connection ", err);
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
			query.deleted = {$exists: false};

			VisboProject.findOne(query, function (err, vp) {
				if (err) {
					logger4js.fatal("VP Post DB Connection ", err);
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
				newVP.vcid = vcid;
				newVP.description = vpdescription;
				if (req.body.vpType == undefined || req.body.vpType < 0 || req.body.vpType > 2) {
					newVP.vpType = 0;
				} else {
					newVP.vpType = req.body.vpType;
				}
				newVP.vpvCount = 0;
				newVP.vpPublic = vpPublic;
				var vpUsers = new Array();
				if (req.body.users) {
					for (var i = 0; i < req.body.users.length; i++) {
						// build up unique user list vpUsers to check that they exist
						if (!vpUsers.find(findUser, req.body.users[i].email)){
							vpUsers.push(req.body.users[i].email)
						}
					};
				};
				logger4js.debug("Check users if they exist %s", JSON.stringify(vpUsers));
				var queryUsers = User.find({'email': {'$in': vpUsers}});
				queryUsers.select('email');
				queryUsers.exec(function (err, listUsers) {
					if (err) {
						logger4js.fatal("VP Post DB Connection ", err);
						return res.status(500).send({
							state: 'failure',
							message: 'Error getting Users for VisboCenters',
							error: err
						});
					}
					if (listUsers.length != vpUsers.length)
						logger4js.warn("Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vpUsers.length);
					// copy all existing users to newVP and set the userId correct.
					if (req.body.users) {
						for (i = 0; i < req.body.users.length; i++) {
							// build up user list for newVC and a unique list of vpUsers
							vpUser = listUsers.find(findUserList, req.body.users[i].email);
							// if user does not exist, ignore the user
							if (vpUser){
								req.body.users[i].userId = vpUser._id;
								delete req.body.users[i]._id;
								newVP.users.push(req.body.users[i]);
							}
						};
					};
					// check that there is an Admin available, if not add the current user as Admin
					if (newVP.users.filter(users => users.role == 'Admin').length == 0) {
						var admin = {userId: userId, email:useremail, role:"Admin"};
						logger4js.info("No Admin User found add current user as admin");
						newVP.users.push(admin);
					};
					// set the VC Name
					newVP.vc.name = vc.name;
					logger4js.trace("VP Create add VC Name %s %O", vc.name, newVP);
					logger4js.debug("Save VisboProject %s  with %d Users", newVP.name, newVP.users.length);
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
						req.oneVC.vpCount = req.oneVC.vpCount == undefined ? 1 : req.oneVC.vpCount + 1;
						req.oneVC.save(function(err, vc) {
							if (err) {
								logger4js.error("Error Update VisboCenter %s  with Error %s", req.oneVC.name, err);
								return res.status(500).send({
									state: "failure",
									message: "database error, failed to update Visbo Center",
									error: err
								});
							}
							req.oneVC = vc;
							return res.status(200).send({
								state: "success",
								message: "Successfully created new Project",
								vp: [ vp ]
							});
						})
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
 	* @apiPermission user must be authenticated and user must have permission to access the VisboProject
 	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NoPermission user does not have access to the VisboProject HTTP 403
 	* @apiError ServerIssue No DB Connection HTTP 500
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
 	*    "users":[
 	*     {
 	*      "email":"example1@visbo.de",
 	*      "role":"Admin",
 	*      "userId":"us5c754feab"
 	*     },
 	*     {
 	*      "email":"example2@visbo.de",
 	*      "role":"User",
 	*      "userId":"us5c754feac"
 	*     }
 	*    ],
	*    "lock": [
	*      {
	*       "variantName": "",
	*       "email": "someone@visbo.de",
	*       "createdAt": "2018-04-26T11:04:12.094Z",
	*       "expiresAt": "2018-04-26T12:04:12.094Z"
	*      }
	*    ]
 	*   }]
 	* }
	*/
// Get a specific visbo project
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project (Read)';

		logger4js.info("Get Visbo Project for userid %s email %s and vp %s oneVC %s Admin %s", userId, useremail, req.params.vpid, req.oneVP.name, req.oneVPisAdmin);

		// we have found the VP already in middleware
		return res.status(200).send({
			state: 'success',
			message: 'Returned Visbo Projects',
			vp: [req.oneVP]
		});
	})

/**
	* @api {put} /vp/:vpid Update Project
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project
	* @apiName UpdateVisboProjects
	* @apiDescription Put updates a specific Visbo Project
	* the system checks if the user has admin permission to it.
	* If no user list is delivered in the body, no updates will be performed to the users.
	* If the user list is delivered in the body, the system checks that the updatedAt flag from the body equals the updatedAt in the system.
	* If not equal, the system delivers an error because the VP was updated between the read and write of the user and therefore it might lead to inconsitency.
	 *
	* If the VP Name is changed, the VP Name is populated to the Visbo Project Versions.
	* In case of success, the system delivers an array of VPs, with one element in the array that is the info about the VP
	* @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	* @apiError NoPermission No permission to update this VisboProject HTTP 403
	* @apiPermission user must be authenticated and user must have Admin permission for this VP
	* @apiHeader {String} access-key User authentication token.
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5cf3da025
	* {
	*  "name":"My first Visbo Project Renamed",
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
	*   "vcid": "vc5aaf992",
	*   "vpvCount": "0",
	*   "vpType": "0",
	*   "users":[
	*    {
	*     "userId":"us5aaf992"
	*     "email":"example@visbo.de",
	*     "role":"Admin"
	*    },
	*    {
	*     "email":"example2@visbo.de",
	*     "role":"User",
	*     "userId":"us5aaf993"
	*    }
	*   ]
	*  }]
	* }
	*/
// Update Visbo Project
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Project (Update)';

		logger4js.info("PUT/Save Visbo Project for userid %s email %s and vp %s ", userId, useremail, req.params.vpid);

		if (!req.body) {
			return res.status(400).send({
				state: 'failure',
				message: 'No Body provided for update'
			});
		}
		if (!req.oneVPisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Admin Permission'
			});
		}
		if (lockVP.lockStatus(req.oneVP, useremail, undefined).locked) {
			return res.status(401).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [oneVP]
			});
		}
		var name = (req.body.name || '').trim();
		if (name == '') name = req.oneVP.name;
		var vpPopulate = req.oneVP.name != name ? true : false;
		req.oneVP.name = name;

		// change only if present
		if (req.body.vpPublic != undefined) {
			req.oneVP.vpPublic = (req.body.vpPublic == true || req.body.vpPublic == 'true') ? true : false;
		}
		if (req.body.description != undefined) {
			req.oneVP.description = req.body.description.trim();
		}
		// check duplicate Name
		var query = {};
		query.vcid = req.oneVP.vcid;
		query._id = {$ne: req.oneVP._id}
		query.name = name;
		query.deleted = {$exists: false};

		VisboProject.findOne(query, function (err, vp) {
			if (err) {
				logger4js.fatal("VP Put DB Connection ", err);
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
			logger4js.debug("PUT VP: save now");
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
				// Update underlying projects if name has changed
				if (vpPopulate) {
					if (oneVP.vpType == constVPTypes.portfolio) {
						var updateQuery = {};
						updateQuery.vpid = oneVP._id;
						updateQuery.deleted = {$exists: false};

						var updateUpdate = {$set: {"name": oneVP.name}};
						var updateOption = {upsert: false, multi: "true"};

						VisboPortfolio.update(updateQuery, updateUpdate, updateOption, function (err, result) {
							if (err){
								logger4js.error("Problem updating Portfolio Name for VP %s", oneVP._id);
								return res.status(500).send({
									state: 'failure',
									message: 'Error updating Visbo Project',
									error: err
								});
							}
							logger4js.debug("Update Portfolio Name found %d updated %d", result.n, result.nModified)
							return res.status(200).send({
								state: 'success',
								message: 'Updated Visbo Project',
								vp: [ oneVP ]
							});
						});
					} else {
						logger4js.debug("VP PUT %s: Update Project Versions to %s", oneVP._id, oneVP.name);
						var updateQuery = {};
						updateQuery.vpid = oneVP._id;
						updateQuery.deleted = {$exists: false};

						var updateUpdate = {$set: {"name": oneVP.name}};
						var updateOption = {upsert: false, multi: "true"};
						VisboProjectVersion.update(updateQuery, updateUpdate, updateOption, function (err, result) {
							if (err){
								logger4js.error("Problem updating VP Versions for VP %s", oneVP._id);
								return res.status(500).send({
									state: 'failure',
									message: 'Error updating Visbo Project',
									error: err
								});
							}
							logger4js.debug("Update VP names in VPV found %d updated %d", result.n, result.nModified)
							// update Portfolio Links to new name
							var updatePFQuery = { allItems: {$elemMatch: {vpid: oneVP._id }}};
							var updatePFUpdate = { $set: { "allItems.$[elem].name" : oneVP.name } };
							var updatePFOption = {arrayFilters: [ { "elem.vpid": oneVP._id } ], upsert: false, multi: "true"};
							VisboPortfolio.update(updatePFQuery, updatePFUpdate, updatePFOption, function (err, result) {
								if (err){
									logger4js.error("Problem updating Portfolio References for VP %s", oneVP._id);
									return res.status(500).send({
										state: 'failure',
										message: 'Error updating Visbo Project',
										error: err
									});
								}
								logger4js.debug("Update VP names in Portfolio References found %d updated %d", result.n, result.nModified)
								return res.status(200).send({
									state: 'success',
									message: 'Updated Visbo Project',
									vp: [ oneVP ]
								});
							});
						});
					}
				} else {
					return res.status(200).send({
						state: 'success',
						message: 'Updated Visbo Project',
						vp: [ oneVP ]
					});
				}
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
	* @apiPermission user must be authenticated and user must have Admin permission to access the VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NoPermission user does not have access to the VisboProject as Admin HTTP 403
	* @apiError NotFound VisboProject does not exist HTTP 400
	* @apiError ServerIssue No DB Connection HTTP 500
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

		logger4js.info("DELETE Visbo Project for userid %s email %s and vp %s oneVP %s is Admin %s", userId, useremail, req.params.vpid, req.oneVP.name, req.oneVPisAdmin);

		if (!req.oneVPisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Project or no Permission'
			});
		}
		if (lockVP.lockStatus(req.oneVP, useremail, undefined).locked) {
			return res.status(401).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [req.oneVP]
			});
		}
		req.oneVP.deleted = {deletedAt: new Date(), byParent: false }
		logger4js.debug("Delete Visbo Project after premission check %s %s", req.params.vpid, req.oneVP.name);
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
			var updateQuery = {"_id": req.oneVP.vcid};
			var updateUpdate = {$inc: {"vpCount": -1 }};
			var updateOption = {upsert: false};
			VisboCenter.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
				if (err){
					logger4js.error("Problem updating Visbo Centersfor VP %s", req.oneVP._id);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Center',
						error: err
					});
				}
				logger4js.debug("Update VP names in VPV found %d updated %d", result.n, result.nModified)
				return res.status(200).send({
					state: "success",
					message: "Deleted Visbo Project"
				});
			});
		});
	})

router.route('/:vpid/lock')
/**
	* @api {post} /vp/:vpid/lock Create Lock
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Properties
	* @apiName CreateLock
	* @apiDescription Post creates or renews a lock for a user to a specific project and variant
	* In case a lock is already active for another user, the lock request fails, in case a lock exists for the current user, it gets replaced by the new lock
	* @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	* @apiError NoPermission No permission to update this VisboProject HTTP 403
	* @apiPermission user must be authenticated and user must have permission for this VP
	* @apiHeader {String} access-key User authentication token.
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
		var expiredAt = new Date(req.body.expiresAt);
		var dateNow = new Date();

		if (expiredAt == undefined) {
			expiredAt = dateNow
			// set the lock date to 1 hour later
			expiredAt.setHours(expiredAt.getHours() + 1);
		} 
		logger4js.info("POST Lock Visbo Project %s Check variant %s does exists  ", req.params.vpid, variantName);

		if (variantName != "" && variant.findVariant(req.oneVP, variantName) < 0) {
				logger4js.warn("POST Lock Visbo Project %s variant %s does not exists  ", req.params.vpid, variantName);
				return res.status(401).send({
				state: 'failiure',
				message: 'Visbo Project Variant does not exist',
				vp: [req.oneVP]
			});
		}

		if (lockVP.lockStatus(req.oneVP, useremail, variantName).locked) {
			return res.status(403).send({
				state: 'failiure',
				message: 'Visbo Project already locked',
				lock: req.oneVP.lock
			});
		}
		if (expiredAt <= dateNow) {
			logger4js.info("POST Lock new Lock already expired %s email %s and vp %s ", expiredAt, useremail, req.params.vpid);
			return res.status(401).send({
				state: 'failiure',
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
				logger4js.fatal("VP DELETE DB Connection ", err);
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
	* the user needs to have read access to the Visbo Project and either owns the lock or is an admin in the Visbo Project
	* @apiHeader {String} access-key User authentication token.
	* @apiParam {String} variantName The Variant Name of the Project for the Lock
	* @apiPermission user must be authenticated and user must have permission to access the VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NoPermission user does not have access to the VisboProject as Admin HTTP 403
	* @apiError NotFound VisboProject does not exist HTTP 400
	* @apiError ServerIssue No DB Connection HTTP 500
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
			logger4js.warn("Delete Lock for VP :%s: No Lock exists", req.oneVP.name);
			return res.status(400).send({
				state: 'failure',
				message: 'VP no Lock exists for Deletion',
				lock: req.oneVP.lock
			});
		}
		if (resultLock.locked && req.oneVPisAdmin == false) {	// lock from a different user and no Admin, deny to delete
			logger4js.warn("Delete Lock for VP :%s: Project is locked by another user Locks \n %O", req.oneVP.name, req.oneVP.lock);
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
	* @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	* @apiError NoPermission No permission to see this VisboProject HTTP 403
	* @apiPermission user must be authenticated and user must have permission for this VP
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

		logger4js.info("POST Visbo Project Variant for userid %s email %s and vp %s Variant %O", userId, useremail, req.params.vpid, req.body);

		var variantList = req.oneVP.variant;
		var variantName = req.body.variantName == undefined ? "" : req.body.variantName;

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
			return res.status(401).send({
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
			newVariant = req.oneVP.variant.filter(variant => (variant.email == newVariant.email && variant.createdAt == newVariant.createdAt && variant.variantName == newVariant.variantName ))[0];
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
	* the user needs to have read access to the Visbo Project and either owns the Variant or is an admin in the Visbo Project
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission user must be authenticated and user must have permission to access the VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NoPermission user does not have access to the VisboProject as Admin HTTP 403
	* @apiError NotFound VisboProject does not exist HTTP 400
	* @apiError ServerIssue No DB Connection HTTP 500
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
			return res.status(400).send({
				state: 'failure',
				message: 'Variant does not exists',
				vp: [req.oneVP]
			});
		}
		var variantName = req.oneVP.variant[variantIndex].variantName;
		req.auditInfo = variantName;
		//variant belongs to a different user and curr. user is not an Admin
		if (req.oneVP.variant[variantIndex].email != useremail && req.oneVPisAdmin == false) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete',
				vp: [req.oneVP]
			});
		}
		lockResult = lockVP.lockStatus(req.oneVP, useremail, variantName);
		if (lockResult.locked) {
			return res.status(401).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [req.oneVP]
			});
		}
		if (req.oneVP.variant[variantIndex].vpvCount > 0) {
			return res.status(401).send({
				state: 'failure',
				message: 'Visbo Project Variant has Versions',
				vp: [req.oneVP]
			});
		}
		req.oneVP.variant.splice(variantIndex, 1);
		if (lockResult.lockindex >= 0) {
			req.oneVP.lock.splice(lockResult.lockindex, 1);
		}
		logger4js.trace("DELETE Visbo Project Variant List after %O", req.oneVP.variant);

		// MS TODO Remove the Variant Versions of the Project or mark them as deleted

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
	* @apiGroup Visbo Portfolio
	* @apiName GetPortfolio
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp/:vpid/portfolio retruns all Portfolio Versions in the specified Visbo Project
	* In case of success it delivers an array of Portfolios, the array contains in each element a Portfolio
	* @apiPermission user must be authenticated
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/vp5aaf992/portfolio
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Portfolio List (Read)';

		var query = {};
		query.vpid = req.oneVP._id;
		query.timestamp =  {$lt: new Date()};
		query.deleted = {$exists: false};
		if (req.query.refDate){
			var refDate = new Date(req.query.refDate);
			query.timestamp =  {$lt: refDate};
			logger4js.debug("refDate Query String :%s:", refDate);
		}
		if (req.query.variantName != undefined){
			logger4js.debug("Variant Query String :%s:", req.query.variantName);
			query.variantName = req.query.variantName
		}

		logger4js.info("Get Portfolio Version for user %s with query parameters %O", userId, query);

		var queryVPF = VisboPortfolio.find(query);
		queryVPF.exec(function (err, listVPF) {
			if (err) {
				logger4js.fatal("VPF GET DB Connection ", err);
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
	* @api {post} /vp/:vpid/portfolio Create a Portfolio Version
	* @apiVersion 1.0.0
	* @apiGroup Visbo Portfolio
	* @apiName CreatePortfolio
	* @apiDescription Post creates a new Definition of a Portfolio for the Visbo Project
	* @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	* @apiError NoPermission No permission to see this VisboProject HTTP 403
	* @apiPermission user must be authenticated and user must have Admin permission for this VP
	* @apiHeader {String} access-key User authentication token.
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

		logger4js.info("POST Visbo Portfolio for userid %s email %s and vp %s Portfolio %O", userId, useremail, req.params.vpid, req.body);

		logger4js.debug("Variant %s", variantName || "None");

		if (req.oneVPisAdmin != true) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Change Portfolio',
				vp: [req.oneVP]
			});
		}
		var variantName = req.body.variantName == undefined ? "" : req.body.variantName;
		var variantIndex = variantName == "" ? 0 : variant.findVariant(req.oneVP, variantName);
		if (variantIndex < 0) {
			return res.status(400).send({
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
		var queryVP = VisboProject.find({'_id': {'$in': listVPid}});
		queryVP.select('_id name');
		queryVP.exec(function (err, listVP) {
			if (err) {
				logger4js.fatal("VPF Post DB Connection ", err);
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
	* @apiGroup Visbo Portfolio
	* @apiName GetVisboPortfolio
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp/:vpid/portfolio retruns all Portfolio Versions in the specified Visbo Project
	* In case of success it delivers an array of Portfolios, the array contains in each element a Portfolio
	* @apiPermission user must be authenticated
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Visbo Portfolio List (Read)';

		logger4js.trace("Get Portfolio Versions");
		var query = {}
		query._id = req.params.vpfid
		query.vpid = req.oneVP._id;
		query.deleted = {$exists: false};
		// check if query string is used to restrict to a specific VC
		// if (req.query && req.query.vcid) query.vcid = req.query.vcid;
		// logger4js.trace("Get Project for user %s with query parameters %O", userId, query);

		var queryVPF = VisboPortfolio.find(query);
		queryVPF.exec(function (err, listVPF) {
			if (err) {
				logger4js.fatal("VPF GET specific DB Connection ", err);
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
	* @apiGroup Visbo Portfolio
	* @apiName DeleteVisboPortfolio
	* @apiDescription Deletes a specific Portfolio Version
	* the user needs to have admin access to the Visbo Project
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission user must be authenticated and user must have permission to access the VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NoPermission user does not have access to the VisboProject as Admin HTTP 403
	* @apiError ServerIssue No DB Connection HTTP 500
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

		logger4js.info("DELETE Visbo Portfolio for userid %s email %s and vp %s variant :%s:", userId, useremail, req.params.vpid, req.params.vpfid);

		if (!req.oneVPisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'Visbo no Permission to delete Portfolio',
				vp: [req.oneVP]
			});
		}
		logger4js.debug("DELETE Visbo Portfolio in Project %s", req.oneVP.name);
		var query = {};
		query._id = vpfid;
		query.vpid = req.oneVP._id;
		query.deleted = {$exists: false};
		var queryVPF = VisboPortfolio.findOne(query);
		queryVPF.exec(function (err, oneVPF) {
			if (err) {
				logger4js.fatal("VPF DELETE DB Connection ", err);
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
			lockResult = lockVP.lockStatus(req.oneVP, useremail, oneVPF.variantName);
			if (lockResult.locked) {
				return res.status(401).send({
					state: 'failure',
					message: 'Visbo Portfolio Project locked',
					vp: [req.oneVP]
				});
			}
			oneVPF.deleted = {deletedAt: new Date(), byParent: false }
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

	// User Management for VP
	router.route('/:vpid/user')

/**
	* @api {get} /vp/:vpid/user Get Users of the VP
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Users
	* @apiName GetVisboProjectUser
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Gets all users of the specified Visbo Project
	*
	* @apiPermission user must be authenticated, user must have access to referenced VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/:vpid/user
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Project Users",
	*   "users":[{
	*     "_id":"id5c754feaa",
	*     "userId":"userId5c754feaa",
	*     "email":"User.email@visbo.de",
	*     "role": "User"
	*   }]
	* }
	*/

	// get VP Users
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Project User (Read)';

			logger4js.info("Get Visbo Project Users for userid %s email %s and vp %s Found %d", userId, useremail, req.params.vpid, req.oneVP.users.length);
			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Project Users',
				users: req.oneVP.users
			});
		})

/**
	* @api {post} /vp/:vpid/user Add a User
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Users
	* @apiName PostVisboProjectUser
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Post creates a new user inside the Visbo Project
	*
	* User must have Amdin Permission in the VP to create new users
	* @apiPermission user must be authenticated, user must have admin access to referenced VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/:vpid/user
	*  {
  *    "email":"new.user@visbo.de",
  *    "role": "User",
	*    "message": "Invitation message"
  *  }
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Project User",
	*   "users":[{
	*     "_id":"id5c754feaa",
	*     "userId":"userId5c754feaa",
	*     "email":"User.email@visbo.de",
	*     "role": "User"
	*   }]
	* }
	*/

	// Create Visbo Project User
		.post(function(req, res) {
			// User is authenticated already
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var isSysAdmin = req.decoded.status ? req.decoded.status.sysAdminRole : undefined;
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Project User (Add)';

			logger4js.trace("Post a new Visbo Project User Req Body: %O Name %s", req.body, req.body.email);
			logger4js.info("Post a new Visbo Project User with name %s executed by user %s ", req.body.email, useremail);

			if (!req.body.email) {
				return res.status(400).send({
					state: 'failure',
					message: 'No valid user definition'
				});
			}
			req.auditInfo = req.body.email;
			if (!req.oneVPisAdmin || isSysAdmin != 'Admin') {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Project or no Permission'
				});
			}
			logger4js.debug("Post User to VP %s Permission is ok", req.params.vpid);
			var vpUser = new VPUser();
			var eMailMessage = '';
			if (req.body.message) {
				eMailMessage = req.body.message;
			}
			vpUser.email = req.body.email;
			vpUser.role = req.body.role  != "User" &&  req.body.role  != "Admin" ? "User" : req.body.role;

			// check if the user is not member of the group already
			if (req.oneVP.users.filter(users => (users.role == vpUser.role && users.email == vpUser.email)).length != 0) {
				logger4js.debug("Post User to VP %s User is already a member");
				return res.status(400).send({
					state: 'failure',
					message: 'User is already member',
					vp: [req.oneVP]
				});
			}
			// check if the user exists and get the UserId or create the user
			var queryUsers = User.findOne({'email': vpUser.email});
			// queryUsers.select('email');
			queryUsers.exec(function (err, user) {
				if (err) {
					logger4js.fatal("Post User to VP cannot find User, DB Connection %s", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Users for VisboProjects',
						error: err
					});
				}
				if (!user) {
					// create the user and add it to the VP
					user = new User();
					user.email = vpUser.email
					logger4js.debug("Create new User %s for VP as %s", vpUser.email, vpUser.role);
					user.save(function(err, user) {
						if (err) {
							logger4js.error("Add User to VP: Error DB Connection %O", err);
							return res.status(500).send({
								state: "failure",
								message: "database error, failed to create user",
								error: err
							});
						}
						// user exists now, now the VP can be updated
						vpUser.userId = user._id;
						req.oneVP.users.push(vpUser)
						req.oneVP.save(function(err, vp) {
							if (err) {
								logger4js.error("Error Update VisboProject %s  with Error %s", req.oneVP.name, err);
								return res.status(500).send({
									state: "failure",
									message: "database error, failed to update Visbo Project",
									error: err
								});
							}
							req.oneVP = vp;
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
									users: [ vpUser ]
								});
							});
						})
					});
				} else {
					vpUser.userId = user._id;
					req.oneVP.users.push(vpUser)
					req.oneVP.save(function(err, vp) {
						if (err) {
							logger4js.error("Error Update VisboProject %s  with Error %s", req.oneVP.name, err);
							return res.status(500).send({
								state: "failure",
								message: "database error, failed to update Visbo Project",
								error: err
							});
						}
						req.oneVP = vp;
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
								message: "Successfully added User to Visbo Center",
								users: [ vpUser ]
							});
						});
					})
				}
			})
		})

	router.route('/:vpid/user/:userid')

/**
	* @api {delete} /vp/:vpid/user/:userid Delete a User from VP
	* @apiVersion 1.0.0
	* @apiGroup Visbo Project Users
	* @apiName DeleteVisboProjectUser
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Deletes the specified user in the Visbo Project
	*
	* @apiPermission user must be authenticated, user must have admin access to referenced VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp/:vpid/user/:userid
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Visbo Project User deleted"
	* }
	*/

	// Delete Visbo Project User
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
			req.auditDescription = 'Visbo Project User (Delete)';
			req.auditInfo = req.params.userid;

			var userRole = req.query.role || "";
			logger4js.info("DELETE Visbo Project User by userid %s email %s for user %s role %s ", userId, useremail, req.params.userid, userRole);

			var delUser = req.oneVP.users.find(findUserById, req.params.userid)
			if (delUser) req.auditInfo = delUser.email;

			if (!req.oneVPisAdmin) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Project or no Permission'
				});
			}
			var newUserList = req.oneVP.users.filter(users => (!(users.userId == req.params.userid && (users.role == userRole || userRole == "" ))))
			logger4js.debug("DELETE Visbo Project User List Length new %d old %d", newUserList.length, req.oneVP.users.length);
			logger4js.trace("DELETE Visbo Project Filtered User List %O ", newUserList);
			if (newUserList.length == req.oneVP.users.length) {
				return res.status(400).send({
					state: 'failure',
					message: 'User/Role combination not found',
					vp: [req.oneVP]
				});
			}
			logger4js.trace("DELETE Visbo Project Filtered User List %O ", newUserList);
			// Check that there is still an Admin beside the removed one, if we remove a Admin role
			if (newUserList.filter(users => (users.role == "Admin")).length == 0) {
				return res.status(400).send({
					state: 'failure',
					message: 'No Admin User will be left',
					vp: [req.oneVP]
				});
			}
			logger4js.debug("Delete Visbo Project User after premission check %s", req.params.userid);
			req.oneVP.users = newUserList;
			req.oneVP.save(function(err, vp) {
				if (err) {
					logger4js.error("Error Update VisboProject %s with Error %s", req.oneVP.name, err);
					return res.status(500).send({
						state: "failure",
						message: "database error, failed to update Visbo Project",
						error: err
					});
				}
				req.oneVP = vp;
				return res.status(200).send({
					state: "success",
					message: "Successfully removed User from Visbo Project",
					vp: [ vp ]
				});
			})
		})

module.exports = router;
