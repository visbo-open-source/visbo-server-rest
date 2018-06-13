var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var lock = require('./../components/lock');
var variant = require('./../components/variant');
var verifyVp = require('./../components/verifyVp');
var logging = require('./../components/logging');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var Lock = mongoose.model('Lock');
var Variant = mongoose.model('Variant');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var VisboPortfolio = mongoose.model('VisboPortfolio');
var moment = require('moment');

// find a user in a simple array of user names
var findUser = function(currentUser) {
		return currentUser == this;
}

// find a user in an array of a structured user (name, id, ...)
var findUserList = function(currentUser) {
		//console.log("compare %s %s", currentUser.email, this);
		return currentUser.email == this;
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

var debuglevel = 5;

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
	* @apiVersion 0.0.1
	* @apiGroup Visbo Project
	* @apiName GetVisboProjects
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp retruns all VP the user has access permission to
	* In case of success it delivers an array of VPs, the array contains in each element a VP
	* the lock section is empty if no lock is set
	* with an additional query paramteter ?vcid=vc5aaf992 the system restricts the list of VP to the specified VC
	* @apiParam {String} vcid Deliver only projects for this Visbo Center
	* @apiPermission user must be authenticated
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiDescription Get all Visbo Projects to whom the authenticated user has access. Optional with a query parameter "vcid" in the URL to restrict the results to a specific Visbo Center
	* @apiExample Example usage:
	*   url: http://localhost:3484/vp
	*   url: http://localhost:3484/vp?vcid=vc5aaf992
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
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		debuglog(debuglevel,  1, "Get Project with query parameters");

		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var query = {'users.email': useremail};
		// check if query string is used to restrict to a specific VC
		if (req.query && req.query.vcid) query.vcid = req.query.vcid;
		debuglog(debuglevel,  1, "Get Project for user %s with query parameters %O", userId, query);

		var queryVP = VisboProject.find(query);
		queryVP.exec(function (err, listVP) {

			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			debuglog(debuglevel,  5, "Found %d Projects", listVP.length);
			debuglog(debuglevel,  9, "Found Projects/n", listVP);

			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Projects',
				vp: listVP
			});
		});
	})

	/**
	 * @api {post} /vp Create a Project
	 * @apiVersion 0.0.1
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
	 * @apiError HTTP-404 VisboCenter does not exist or user does not have permission to create project
	 * @apiPermission user must be authenticated and user must have permission to create a VP
	 * @apiExample Example usage:
	 *   url: http://localhost:3484/vp
	 * {
	 *  "name":"My first Visbo Project",
	 *  "vcid": "vc5aaf992",
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
		if (req.body == undefined || req.body.vcid == undefined || req.body.name == undefined) {
				debuglog(debuglevel,  1, "No VCID or Name in Body");
				return res.status(400).send({
				state: 'failure',
				message: 'No VCID or Name in Body'
			});
		}
		var vcid = req.body.vcid
		var vpname = req.body.name
		debuglog(debuglevel,  2, "Post a new Visbo Project for user %s with name %s in VisboCenter %s for %d Users", useremail, req.body.name, vcid, req.body.users.length);
		debuglog(debuglevel,  9, "Post a new Visbo Project body %O", req.body);
		var newVP = new VisboProject();

		VisboCenter.findOne({'_id': vcid,
												'users':{ $elemMatch: {'email': useremail, 'role': 'Admin'}}
											}, function (err, vc) {
			if (err) {
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
			debuglog(debuglevel,  9, "User has permission to create Project %s in  %s", vpname, req.oneVC.name);
			// check duplicate Name
			VisboProject.findOne({'vcid': vcid,
													'name': vpname
												}, function (err, vp) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Internal Server Error with DB Connection',
						error: err
					});
				}
				debuglog(debuglevel,  2, "Duplicate Name check returned %s", vp != undefined);
				if (vp) {
					return res.status(409).send({
						state: 'failure',
						message: 'Project with same name exists'
					});
				};
				var newVP = new VisboProject;
				newVP.name = req.body.name;
				newVP.vcid = vcid;
				if (req.body.vpType == undefined || req.body.vpType < 0 || req.body.vpType > 2) {
					newVP.vpType = 1;
				} else {
					newVP.vpType = req.body.vpType;
				}

				newVP.vpvCount = 0;
				var i;
				var vpUsers = new Array();
				if (req.body.users) {
					for (i = 0; i < req.body.users.length; i++) {
						// build up unique user list vpUsers to check that they exist
						if (!vpUsers.find(findUser, req.body.users[i].email)){
							vpUsers.push(req.body.users[i].email)
						}
					};
				};
				debuglog(debuglevel,  5, "Check users if they exist %s", JSON.stringify(vpUsers));
				var queryUsers = User.find({'email': {'$in': vpUsers}});
				queryUsers.select('email');
				queryUsers.exec(function (err, listUsers) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Error getting Users for VisboCenters',
							error: err
						});
					}
					if (listUsers.length != vpUsers.length)
						debuglog(debuglevel,  2, "Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vpUsers.length);
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
						debuglog(debuglevel,  2, "No Admin User found add current user as admin");
						newVP.users.push(admin);
					};
					// set the VC Name
					newVP.vc.name = vc.name;
					debuglog(debuglevel,  9, "VP Create add VC Name %s %O", vc.name, newVP);
					debuglog(debuglevel,  5, "Save VisboProject %s  with %d Users", newVP.name, newVP.users.length);
					newVP.save(function(err, vp) {
						if (err) {
									debuglog(debuglevel,  5, "Error Save VisboProject %s  with Error %s", newVP.name, err);
									return res.status(500).send({
								state: "failure",
								message: "database error, failed to create visboproject",
								error: err
							});
						}
						req.oneVP = vp;
						debuglog(debuglevel,  5, "Update VC %s with %d Projects ", req.oneVC.name, req.oneVC.vpCount);
						req.oneVC.vpCount = req.oneVC.vpCount == undefined ? 1 : req.oneVC.vpCount + 1;
						req.oneVC.save(function(err, vc) {
							if (err) {
								debuglog(debuglevel,  5, "Error Update VisboCenter %s  with Error %s", req.oneVC.name, err);
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
 	* @apiVersion 0.0.1
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
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "Get Visbo Project for userid %s email %s and vp %s oneVC %s Admin %s", userId, useremail, req.params.vpid, req.oneVP.name, req.oneVPisAdmin);

		// we have found the VP already in middleware
		return res.status(200).send({
			state: 'success',
			message: 'Returned Visbo Projects',
			vp: [req.oneVP]
		});
	})

	/**
	 * @api {put} /vp/:vpid Update Project
	 * @apiVersion 0.0.1
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
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel,  1, "PUT/Save Visbo Project for userid %s email %s and vp %s ", userId, useremail, req.params.vpid);

		if (!req.body) {
			return res.status(409).send({
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
		if (lock.lockedVP(req.oneVP, useremail, undefined).locked) {
			return res.status(401).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [oneVP]
			});
		}
		var vpvPopulate = req.oneVP.name != req.body.name ? true : false;
		req.oneVP.name = req.body.name;
		var putDate = req.body.updatedAt ? new Date(req.body.updatedAt) : new Date();
		var origDate = new Date(req.oneVP.updatedAt);
		if (origDate - putDate != 0 && typeof(req.body.users) != "undefined") {
			// PUT Request with change User list, but the original List that was feteched was already changed, return error
			debuglog(debuglevel,  1, "Error VP PUT: Change User List but VP was already changed afterwards");
			return res.status(409).send({
				state: 'failure',
				message: 'Change User List but Visbo Project was already changed afterwards'
			});
		};
		var vpUsers = new Array();
		if (req.body.users) {
			for (var i = 0; i < req.body.users.length; i++) {
				// build up unique user list vpUsers to check that they exist
				if (!vpUsers.find(findUser, req.body.users[i].email)){
					vpUsers.push(req.body.users[i].email)
				}
			};
			debuglog(debuglevel, 9, "Check users if they exist %s", JSON.stringify(vpUsers));
			var queryUsers = User.find({'email': {'$in': vpUsers}});
			queryUsers.select('email');
			queryUsers.exec(function (err, listUsers) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Users for Visbo Projects',
						error: err
					});
				}
				if (listUsers.length != vpUsers.length) {
					debuglog(debuglevel, 1, "Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vpUsers.length);
				}
				// copy all existing users to newVP
				if (req.body.users) {
					// empty the user list and take the users from the delivered body
					req.oneVP.users = [];
					for (i = 0; i < req.body.users.length; i++) {
						// build up user list for newVP and a unique list of vpUsers
						vpUser = listUsers.find(findUserList, req.body.users[i].email);
						// if user does not exist, ignore the user
						if (vpUsers){
							req.body.users[i].userId = vpUser._id;
							delete req.body.users[i]._id;
							req.oneVP.users.push(req.body.users[i]);
						}
					};
				};
				// check that there is an Admin available, if not add the current user as Admin
				if (req.oneVP.users.filter(users => users.role == 'Admin').length == 0) {
					debuglog(debuglevel,  1, "Error VP PUT: No Admin User found");
					return res.status(409).send({
						state: 'failure',
						message: 'Inconsistent Users for VisboProjects',
						error: err
					});
				};
				debuglog(debuglevel,  9, "PUT VP: Save VP after user change");
				req.oneVP.save(function(err, oneVP) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Error updating Visbo Project',
							error: err
						});
					}
					if (vpvPopulate){
						debuglog(debuglevel, 5, "VP PUT %s: Update Project Versions to %s", oneVP._id, oneVP.name);
						var updateQuery = {"vpid": oneVP._id};
						var updateUpdate = {$set: {"name": oneVP.name}};
						var updateOption = {upsert: false, multi: "true"};
						VisboProjectVersion.update(updateQuery, updateUpdate, updateOption, function (err, result) {
							if (err){
								debuglog(debuglevel, 2, "Problem updating VP Versions for VP %s", oneVP._id);
								return res.status(500).send({
									state: 'failure',
									message: 'Error updating Visbo Project',
									error: err
								});
							}
							debuglog(debuglevel, 5, "Update VP names in VPV found %d updated %d", result.n, result.nModified)
							return res.status(200).send({
								state: 'success',
								message: 'Updated Visbo Project',
								vp: [ oneVP ]
							});
						});
					} else {
						return res.status(200).send({
							state: 'success',
							message: 'Updated Visbo Project',
							vp: [ oneVP ]
						});
					}
				});
			});
		} else {
			// No User Updates just the VP itself
			debuglog(debuglevel, 5, "PUT VP: no user changes, save now");
			req.oneVP.save(function(err, oneVP) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Project',
						error: err
					});
				}
				// Update underlying projects if name has changed
				if (vpvPopulate){
					debuglog(debuglevel, 5, "VP PUT %s: Update Project Versions to %s", oneVP._id, oneVP.name);
					var updateQuery = {"vpid": oneVP._id};
					var updateUpdate = {$set: {"name": oneVP.name}};
					var updateOption = {upsert: false, multi: "true"};
					VisboProjectVersion.update(updateQuery, updateUpdate, updateOption, function (err, result) {
						if (err){
							debuglog(debuglevel, 2, "Problem updating VP Versions for VP %s", oneVP._id);
							return res.status(500).send({
								state: 'failure',
								message: 'Error updating Visbo Project',
								error: err
							});
						}
						debuglog(debuglevel, 5, "Update VP names in VPV found %d updated %d", result.n, result.nModified)
						return res.status(200).send({
							state: 'success',
							message: 'Updated Visbo Project',
							vp: [ oneVP ]
						});
					});
				} else {
					return res.status(200).send({
						state: 'success',
						message: 'Updated Visbo Project',
						vp: [ oneVP ]
					});
				}
			});
		}
	})

/**
	* @api {delete} /vp/:vpid Delete a Project
	* @apiVersion 0.0.1
	* @apiGroup Visbo Project
	* @apiName DeleteVisboProject
	* @apiDescription Deletes a specific Visbo Project.
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission user must be authenticated and user must have Admin permission to access the VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NoPermission user does not have access to the VisboProject as Admin HTTP 403
	* @apiError NotFound VisboProject does not exist HTTP 404
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
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "DELETE Visbo Project for userid %s email %s and vp %s oneVP %s is Admin %s", userId, useremail, req.params.vpid, req.oneVP.name, req.oneVPisAdmin);

		if (!req.oneVPisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Project or no Permission'
			});
		}
		debuglog(debuglevel, 9, "Delete Visbo Project after perm check success %s %O", req.params.vpid, req.oneVP);
		if (lock.lockedVP(req.oneVP, useremail, undefined).locked) {
			return res.status(401).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [req.oneVP]
			});
		}
		req.oneVP.remove(function(err, empty) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error deleting Visbo Project',
					error: err
				});
			}
			var updateQuery = {"_id": req.oneVP.vcid};
			var updateUpdate = {$inc: {"vpCount": -1 }};
			var updateOption = {upsert: false};
			VisboCenter.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
				if (err){
					debuglog(debuglevel, 2, "Problem updating Visbo Centersfor VP %s", req.oneVP._id);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Center',
						error: err
					});
				}
				debuglog(debuglevel, 5, "Update VP names in VPV found %d updated %d", result.n, result.nModified)
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
	 * @apiVersion 0.0.1
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
		debuglog(debuglevel, 1, "POST Lock Visbo Project for userid %s email %s and vp %s ", userId, useremail, req.params.vpid);
		var variantName = req.body.variantName || "";
		var expiredAt = new Date(req.body.expiresAt);
		var dateNow = new Date();

		if (expiredAt == undefined) {
			expiredAt = dateNow
			// set the lock date to 1 hour later
			expiredAt.setHours(expiredAt.getHours() + 1);
		} 

		if (variantName != "" && variant.findVariant(req.oneVP, variantName) < 0) {
			return res.status(401).send({
				state: 'failiure',
				message: 'Visbo Project Variant does not exist',
				lock: req.oneVP.lock
			});
		}

		if (lock.lockedVP(req.oneVP, useremail, variantName).locked) {
			return res.status(403).send({
				state: 'failiure',
				message: 'Visbo Project already locked',
				lock: req.oneVP.lock
			});
		}
		if (expiredAt <= dateNow) {
			debuglog(debuglevel, 8, "POST Lock new Lock already expired %s email %s and vp %s ", expiredAt, useremail, req.params.vpid);
			return res.status(401).send({
				state: 'failiure',
				message: 'New Lock already expired',
				lock: req.oneVP.lock
			});
		}
		var listLockNew = lock.lockCleanupVP(req.oneVP.lock);
		req.oneVP.lock = listLockNew;

		var newLock = new Lock;
		newLock.email = useremail;
		newLock.expiresAt = expiredAt;
		newLock.variantName = variantName;
		newLock.createdAt = Date();
		req.oneVP.lock.push(newLock);
		req.oneVP.save(function(err, oneVP) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error updating Visbo Project Locks',
					error: err
				});
			}
			return res.status(200).send({
				state: 'success',
				message: 'Updated Visbo Project Locks',
				lock: req.oneVP.lock
			});
		});
	})

/**
	* @api {delete} /vp/:vpid/lock Delete Lock
	* @apiVersion 0.0.1
	* @apiGroup Visbo Project Properties
	* @apiName DeleteLock
	* @apiDescription Deletes a lock for a specific project and a specific variantName
	* the user needs to have read access to the Visbo Project and either owns the lock or is an admin in the Visbo Project
	* @apiHeader {String} access-key User authentication token.
	* @apiParam {String} variantName The Variant Name of the Project for the Lock
	* @apiPermission user must be authenticated and user must have permission to access the VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NoPermission user does not have access to the VisboProject as Admin HTTP 403
	* @apiError NotFound VisboProject does not exist HTTP 404
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
.delete(function(req, res) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	var variantName = "";
	variantName = req.query.variantName || "";
	debuglog(debuglevel, 1, "DELETE Visbo Project Lock for userid %s email %s and vp %s variant :%s:", userId, useremail, req.params.vpid, variantName);

	var resultLock = lock.lockedVP(req.oneVP, useremail, variantName);
	if (resultLock.lockindex < 0) {
		debuglog(debuglevel, 5, "Delete Lock for VP :%s: No Lock exists", req.oneVP.name);
		return res.status(400).send({
			state: 'failure',
			message: 'VP no Lock exists for Deletion',
			lock: req.oneVP.lock
		});
	}
	if (resultLock.locked && req.oneVPisAdmin == false) {	// lock from a different user and no Admin, deny to delete
		debuglog(debuglevel, 5, "Delete Lock for VP :%s: Project is locked by another user Locks \n %O", req.oneVP.name, req.oneVP.lock);
		return res.status(403).send({
			state: 'failure',
			message: 'VP locked for another user',
			lock: req.oneVP.lock
		});
	}

	debuglog(debuglevel, 9, "Delete Lock for VP :%s: after perm check has %d Locks", req.oneVP.name, req.oneVP.lock.length);
	req.oneVP.lock.splice(resultLock.lockindex, 1);  // remove the found lock
	var listLockNew = lock.lockCleanupVP(req.oneVP.lock);
	req.oneVP.lock = listLockNew;
	debuglog(debuglevel, 9, "Delete Lock for VP :%s: after Modification has %d Locks", req.oneVP.name, req.oneVP.lock.length);

	req.oneVP.save(function(err, empty) {
		if (err) {
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
	 * @apiVersion 0.0.1
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
	 *  "vp":[{
   *       "_id":"vp541c754feaa",
 	 *      "updatedAt":"2018-03-16T12:39:54.042Z",
 	 *      "createdAt":"2018-03-12T09:54:56.411Z",
 	 *      "name":"My new VisboProject",
 	 *      "vcid": "vc5aaf992"
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
 	 *     "lock": [{
 	 *       "variantName": "",
 	 *       "email": "someone@visbo.de",
 	 *       "createdAt": "2018-04-26T11:04:12.094Z",
 	 *       "expiresAt": "2018-04-26T12:04:12.094Z"
 	 *    }],
 	 *    "variant": [{
 	 *       "variantName": "V1",
 	 *       "email": "someone@visbo.de",
 	 *       "createdAt": "2018-04-26T11:04:12.094Z",
 	 *       "vpvCount": "1"
 	 *    }]
 	 *   }
 	 *  ]
 	 * }
	 */
// Create a Variant inside a Project
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "POST Visbo Project Variant for userid %s email %s and vp %s Variant %O", userId, useremail, req.params.vpid, req.body);

		var variantList = req.oneVP.variant;
		var variantName = req.body.variantName == undefined ? "" : req.body.variantName;

		debuglog(debuglevel, 5, "Variant %s current list %O", variantName, variantList);
		var variantDuplicate = false
		for (i = 0; i < variantList.length; i++) {
			if (variantList[i].variantName == variantName ) {
				variantDuplicate = true;
				break;
			}
		}
		debuglog(debuglevel, 5, "Variant Duplicate %s Variant Name %s", variantDuplicate, variantName);
		if (variantDuplicate || variantName == "") {
			return res.status(401).send({
				state: 'failure',
				message: 'Variant already exists',
				vp: [req.oneVP]
			});
		}
		debuglog(debuglevel, 9, "Variant List %d orig %O ", variantList.length, variantList);
		newVariant = new Variant;
		newVariant.email = useremail;
		newVariant.variantName = variantName;
		newVariant.createdAt = Date();
		newVariant.vpvCount = 0;
		variantList.push(newVariant);
		req.oneVP.variant = variantList;
		debuglog(debuglevel, 9, "Variant List new %O ", variantList);
		req.oneVP.save(function(err, oneVP) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error updating Visbo Project Variants',
					error: err
				});
			}
			return res.status(200).send({
				state: 'success',
				message: 'Created Visbo Project Variant',
				vp: [req.oneVP]
			});
		});
	})

router.route('/:vpid/variant/:vid')

	/**
		* @api {delete} /vp/:vpid/variant/:vid Delete a Variant
		* @apiVersion 0.0.1
		* @apiGroup Visbo Project Properties
		* @apiName DeleteVisboProjectVariant
		* @apiDescription Deletes a specific Variant for a project and also the project Versions
		* the user needs to have read access to the Visbo Project and either owns the Variant or is an admin in the Visbo Project
		* @apiHeader {String} access-key User authentication token.
		* @apiPermission user must be authenticated and user must have permission to access the VisboProject
		* @apiError NotAuthenticated no valid token HTTP 401
		* @apiError NoPermission user does not have access to the VisboProject as Admin HTTP 403
		* @apiError NotFound VisboProject does not exist HTTP 404
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
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var variantId = req.params.vid;
		debuglog(debuglevel, 1, "DELETE Visbo Project Variant for userid %s email %s and vp %s variant :%s:", userId, useremail, req.params.vpid, req.params.vid);

		var variantIndex = variant.findVariantId(req.oneVP, variantId);
		if (variantIndex < 0) {
			return res.status(400).send({
				state: 'failure',
				message: 'Variant does not exists',
				vp: [req.oneVP]
			});
		}
		var variantName = req.oneVP.variant[variantIndex].variantName;
		//variant belongs to a different user and curr. user is not an Admin
		if (req.oneVP.variant[variantIndex].email != useremail && req.oneVPisAdmin == false) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to delete',
				vp: [req.oneVP]
			});
		}
		lockResult = lock.lockedVP(req.oneVP, useremail, variantName);
		if (lockResult.locked) {
			return res.status(401).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [req.oneVP]
			});
		}
		req.oneVP.variant.splice(variantIndex, 1);
		if (lockResult.lockindex >= 0) {
			req.oneVP.lock.splice(lockResult.lockindex, 1);
		}
		debuglog(debuglevel, 9, "DELETE Visbo Project Variant List after %O", req.oneVP.variant);

		// MS TODO Remove the Variant Versions of the Project or mark them as deleted

		req.oneVP.save(function(err, empty) {
			if (err) {
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
	* @apiVersion 0.0.1
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
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		debuglog(debuglevel,  1, "Get Portfolio Versions");

		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var query = {'vpid': req.oneVP._id};
		// check if query string is used to restrict to a specific VC
		// if (req.query && req.query.vcid) query.vcid = req.query.vcid;
		// debuglog(debuglevel,  1, "Get Project for user %s with query parameters %O", userId, query);

		var queryVPF = VisboPortfolio.find(query);
		queryVPF.exec(function (err, listVPF) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			debuglog(debuglevel,  5, "Found %d Portfolios", listVPF.length);
			debuglog(debuglevel,  9, "Found Portfolios/n", listVPF);

			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Portfolios',
				vpf: listVPF
			});
		});
	})

/**
	* @api {post} /vp/:vpid/portfolio Create a Portfolio
	* @apiVersion 0.0.1
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
	*      "name" : "VisboProject Name",
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
		debuglog(debuglevel, 1, "POST Visbo Portfolio for userid %s email %s and vp %s Portfolio %O", userId, useremail, req.params.vpid, req.body);

		debuglog(debuglevel, 9, "Variant %s", variantName);

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
		if (req.oneVP.vpType != 2) {
			return res.status(403).send({
				state: 'failure',
				message: 'Visbo Project is not a Portfolio Project',
				vp: [req.oneVP]
			});
		}
		var newPortfolio = new VisboPortfolio;
		newPortfolio.vpid = req.oneVP._id;
		newPortfolio.variantName = variantName;
		newPortfolio.name = req.oneVP.name;
		newPortfolio.timestamp = req.body.timestamp || Date();

		// check that the vpid exist and user has permission to access
		var listVPid = new Array();
		for (var i = 0; i < req.body.allItems.length; i++) {
			// build up unique project list to check that they exist
			if (!listVPid.find(findVP, req.body.allItems[i].vpid)){
				listVPid.push(req.body.allItems[i].vpid)
			}
		};
		debuglog(debuglevel, 9, "Check vpids if they exist %s", JSON.stringify(listVPid));
		var queryVP = VisboProject.find({'_id': {'$in': listVPid}});
		queryVP.select('_id name');
		queryVP.exec(function (err, listVP) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Projects for Portfolio',
					error: err
				});
			}
			if (listVP.length != listVPid.length) {
				debuglog(debuglevel, 2, "Warning: Found only %d of %d Users, ignoring non existing users", listVP.length, listVPid.length);
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
				newPortfolio.allItems.push(req.body.allItems[i]);
			}
			debuglog(debuglevel, 9, "Replaced in List (%d) correct VP Names %s", newPortfolio.allItems.length, JSON.stringify(newPortfolio.allItems));
			newPortfolio.sortType = req.body.sortType;
			newPortfolio.sortList = req.body.sortList;

			newPortfolio.save(function(err, onePortfolio) {
				if (err) {
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
	* @apiVersion 0.0.1
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
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		debuglog(debuglevel,  1, "Get Portfolio Versions");

		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var query = {'_id': req.params.vpfid};
		// check if query string is used to restrict to a specific VC
		// if (req.query && req.query.vcid) query.vcid = req.query.vcid;
		// debuglog(debuglevel,  1, "Get Project for user %s with query parameters %O", userId, query);

		var queryVPF = VisboPortfolio.find(query);
		queryVPF.exec(function (err, listVPF) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			debuglog(debuglevel,  5, "Found %d Portfolios", listVPF.length);
			debuglog(debuglevel,  9, "Found Portfolios/n", listVPF);

			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Portfolios',
				vpf: listVPF
			});
		});
	})

/**
	* @api {delete} /vp/:vpid/portfolio/:vpfid Delete a Portfolio Version
	* @apiVersion 0.0.1
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
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var vpfid = req.params.vpfid;
		debuglog(debuglevel, 1, "DELETE Visbo Portfolio for userid %s email %s and vp %s variant :%s:", userId, useremail, req.params.vpid, req.params.vpfid);

		if (!req.oneVPisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'Visbo no Permission to delete Portfolio',
				vp: [req.oneVP]
			});
		}
		debuglog(debuglevel, 9, "DELETE Visbo Portfolio in Project %s", req.oneVP.name);
		var queryVPF = VisboPortfolio.findOne({'_id':vpfid});
		queryVPF.exec(function (err, oneVPF) {
			if (err) {
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
			lockResult = lock.lockedVP(req.oneVP, useremail, oneVPF.variantName);
			if (lockResult.locked) {
				return res.status(401).send({
					state: 'failure',
					message: 'Visbo Portfolio Project locked',
					vp: [req.oneVP]
				});
			}
			oneVPF.remove(function(err, empty) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error deleting Visbo Portfolio',
						error: err
					});
				}
				return res.status(200).send({
					state: 'success',
					message: 'Deleted Visbo Portfolio'
				});
			});
		});
	})

module.exports = router;
