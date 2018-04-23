var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('Project');
var moment = require('moment');

var findUser = function(currentUser) {
		return currentUser == this;
}

var findUserList = function(currentUser) {
		//console.log("compare %s %s", currentUser.email, this);
		return currentUser.email == this;
}
var debuglevel = 5;
var debuglog = function(level, logstring, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
	if (debuglevel >= level ){
		if (arg1 == undefined) arg1 = '';
		if (arg2 == undefined) arg2 = '';
		if (arg3 == undefined) arg3 = '';
		if (arg4 == undefined) arg4 = '';
		if (arg5 == undefined) arg5 = '';
		if (arg6 == undefined) arg6 = '';
		if (arg7 == undefined) arg7 = '';
		if (arg8 == undefined) arg8 = '';
		if (arg9 == undefined) arg9 = '';
		console.log("%s: Level%d VP ".concat(logstring), moment().format('YYYY-MM-DD HH:mm:ss'), level, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9);
	}
};

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);

/////////////////
// Visbo Projects API
// /project
/////////////////


router.route('/')

	/**
	* @api {get} /vp Get Visbo Projects
	* @apiVersion 0.0.1
	* @apiGroup VisboProject
	* @apiName GetVisboProjects
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vp retruns all VP the user has access permission to
	* In case of success it delivers an array of VPs, the array contains in each element a VP
	* with an additional query paramteter ?vcid=vc5aaf992 the system restricts the list of VP to the specified VC
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
	*       "_id":"5aa64e70cde84541c754feaa",
	*      "updatedAt":"2018-03-16T12:39:54.042Z",
	*      "createdAt":"2018-03-12T09:54:56.411Z",
	*      "name":"My new VisobProject",
	*      "vcid": "vc5aaf992"
	*      "users":[
	*       {
	*        "email":"example1@visbo.de",
	*        "role":"Admin",
	*        "userId":"usc754feab"
	*       },
	*       {
	*        "email":"example2@visbo.de",
	*        "role":"User",
	*        "userId":"usc754feac"
	*       }
	*     ]
	*    }
	*  ]
	* }
	*/
	.get(function(req, res) {
		// no need to check authentication, already done centrally
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var query = {'users.email': useremail };
		// check if query string is used to restrict to a specific VC
		if (req.query.vcid) query.vcid = req.query.vcid;
		debuglog(1, "%s: Get Project for user %s with query parameters %O", moment().format('YYYY-MM-DD HH:MM:ss'), userId, query);		// MS Log

		var queryVP = VisboProject.find(query);
		queryVP.exec(function (err, listVP) {

			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			debuglog(5, "Found %d Projects", listVP.length);
			debuglog(9, "Found Projects/n", listVP);

			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Projects',
				vp: listVP
			});
		});
	})

	/**
	 * @api {post} /vp Create a Visbo Project
	 * @apiVersion 0.0.1
	 * @apiGroup VisboProject
	 * @apiName CreateVisboProjects
	 * @apiDescription POST /vp creates a new VP
	 * with a unique name inside VC and the users with their roles as defined in the body.
 	 * If no admin is specified the current user is added as Admin.
	 * In case of success it delivers an array of VPs to be uniform to GET, the array contains as one element the created VP.
	 * @apiHeader {String} access-key User authentication token.
	 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	 * @apiError NoPermission No permission to create a VisboProject HTTP 403
	 * @apiError Duplicate VisboProject does already exist HTTP 409
	 * @apiError HTTP-404 VisboCenter does not exist or user does not have permission to create project
	 * @apiPermission user must be authenticated and user must have permission to create a VP (MS Todo)
	 * @apiExample Example usage:
	 *   url: http://localhost:3484/vp
	 * {
	 *  "name":"My first Visbo Project",
	 *  "vcid": "vc5aaf992",
	 *  "users":[
	 *   {
	 *    "email":"example1@visbo.de",
	 *    "role": "<Admin"
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
	 *   ]
	 *  }]
	 * }
	 */
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail  = req.decoded.email;
		var vcid = ( !req.body && !req.body.vcid ) ? '' : req.body.vcid
		var vpname = ( !req.body && !req.body.name ) ? '' : req.body.name
		debuglog(1, "Post a new Visbo Project for user %s with name %s in VisboCenter %s for Users %O", useremail, req.body.name, vcid, req.body.users);		// MS Log
		var newVP = new VisboProject();

		VisboCenter.findOne({'_id': vcid,
												'users.email': useremail,
												'users.role' : 'Admin'
											}, function (err, vc) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			}
			if (!vc) {
				return res.status(404).send({
					state: 'failure',
					message: 'Visbo Centers not found or no Admin'
				});
			};
			debuglog(9, "User has permission to create Project %s in  %s", vpname, vc.name);
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
				debuglog(2, "Duplicate Name check returned %O", vp);
				if (vp) {
					return res.status(404).send({
						state: 'failure',
						message: 'Project with same name exists'
					});
				};
				var newVP = new VisboProject;
				newVP.name = req.body.name;
				newVP.vcid = vcid;
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
				debuglog(5, "Check users if they exist %s", JSON.stringify(vpUsers));
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
						debuglog(2, "Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vpUsers.length);		// MS Log
					// copy all existing users to newVP and set the userId correct.
					if (req.body.users) {
						for (i = 0; i < req.body.users.length; i++) {
							// build up user list for newVC and a unique list of vpUsers
							vpUser = listUsers.find(findUserList, req.body.users[i].email);
							// if user does not exist, ignore the user
							if (vpUser){
								req.body.users[i].userId = vpUser._id;
								newVP.users.push(req.body.users[i]);
							}
						};
					};
					// check that there is an Admin available, if not add the current user as Admin
					if (newVP.users.filter(users => users.role == 'Admin').length == 0) {
						var admin = {userId: userId, email:useremail, role:"Admin"};
						debuglog(2, "No Admin User found add current user as admin");
						newVP.users.push(admin);
					};
					// set the VC Name
					newVP.vc.name = vc.name;
					debuglog(9, "VP Create add VC Name %s %O", vc.name, newVP);		// MS Log
					debuglog(5, "Save VisboProject %s  with Users %O", newVP.name, newVP.users);
					newVP.save(function(err, vp) {
						if (err) {
							return res.status(500).send({
								state: "failure",
								message: "database error, failed to create visboproject",
								error: err
							});
						}
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
	 	* @api {get} /vp/:vpid Get a Visbo Project
	 	* @apiVersion 0.0.1
	 	* @apiGroup VisboProject
	 	* @apiName GetVisboProject
	 	* @apiHeader {String} access-key User authentication token.
		* @apiDescription GET /vp/:vpid gets a specific VP
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
	 	*    "_id":"vpc754feaa",
	 	*    "updatedAt":"2018-03-16T12:39:54.042Z",
	 	*    "createdAt":"2018-03-12T09:54:56.411Z",
	 	*    "name":"My new Visbo Project",
		*		 "vcid": "vc5aaf992",
	 	*    "users":[
	 	*     {
	 	*      "email":"example1@visbo.de",
	 	*      "role":"Admin",
	 	*      "userId":"usc754feab"
	 	*     },
	 	*     {
	 	*      "email":"example2@visbo.de",
	 	*      "role":"User",
	 	*      "userId":"usc754feac"
	 	*     }
	 	*    ]
	 	*   }]
	 	* }
		*/
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			debuglog(1, "Get Visbo Project for userid %s email %s and vc %s ", userId, useremail, req.params.vpid);		// MS Log

			var queryVP = VisboProject.find({'users.email': useremail, '_id':req.params.vpid});
			queryVP.select('name users vc updatedAt createdAt');
			queryVP.exec(function (err, listVP) {
				if (err) {
					return res.status(404).send({
						state: 'failure',
						message: 'Error getting VisboProjects',
						error: err
					});
				}
				debuglog(5, "Found VCs %d %O", listVP.length, listVP);		// MS Log
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Projects',
					vp: listVP
				});
			});
		})

		/**
		 * @api {put} /vp/:projectid Update Visbo Project
		 * @apiVersion 0.0.1
		 * @apiGroup VisboProject
		 * @apiName UpdateVisboProjects
		 * @apiDescription PUT /vp/:vpid updates a specific VP
	   * the system checks if the user has access permission to it.
		 * If no user list is delivered in the body, no updates will be performed to the users.
		 * if the VP Name is changed, the VP Name is populated to the Visbo Project Versions.
		 * If the user list is delivered in the body, the system checks that the updatedAt flag from the body equals the updatedAt in the system.
		 * If not equal, the system delivers an error because the VP was updated between the read and write of the user and therefore it might lead to inconsitency.
	 	 * In case of success, the system delivers an array of VPs, with one element in the array that is the info about the VP
		 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
		 * @apiError NoPermission No permission to update this VisboProject HTTP 403
		 * @apiPermission user must be authenticated and user must have Admin permission for this VP (MS Todo)
		 * @apiHeader {String} access-key User authentication token.
		 * @apiExample Example usage:
		 *   url: http://localhost:3484/vp/5aada025
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
		 *   "_id":"vpcf3da025",
		 *   "vcid": "vc5aaf992",
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
			debuglog(1, "PUT/Save Visbo Project for userid %s email %s and vp %s ", userId, useremail, req.params.vpid);		// MS Log

			var queryVP = VisboProject.findOne({'_id':req.params.vpid, 'users.email': useremail, 'users.role' : 'Admin' });
			queryVP.select('name users vcid, vc, updatedAt createdAt');
			queryVP.exec(function (err, oneVP) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Visbo Projects',
						error: err
					});
				}
				if (!oneVP) {
					return res.status(500).send({
						state: 'failure',
						message: 'No Visbo Project or no Permission'
					});
				}
				var vpvPopulate = oneVP.name != req.body.name ? true : false;
				oneVP.name = req.body.name;
				var origDate = new Date(req.body.updatedAt), putDate = new Date(oneVP.updatedAt);
				debuglog(5, "PUT/Save Visbo Project %s: time diff %d ", req.params.vpid, origDate - putDate);		// MS Log
				if (origDate - putDate !== 0 && req.body.users.length > 0){
					// PUT Request with change User list, but the original List that was feteched was already changed, return error
					debuglog(1, "Error VP PUT: Change User List but VP was already changed afterwards");
					return res.status(409).send({
						state: 'failure',
						message: 'Change User List but Visbo Project was already changed afterwards',
						error: err
					});
				};
				var i;
				var vpUsers = new Array();
				if (req.body.users) {
					for (i = 0; i < req.body.users.length; i++) {
						// build up unique user list vpUsers to check that they exist
						if (!vpUsers.find(findUser, req.body.users[i].email)){
							vpUsers.push(req.body.users[i].email)
						}
					};
					debuglog(9, "Check users if they exist %s", JSON.stringify(vpUsers));
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
						if (listUsers.length != vpUsers.length) console.log("Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vpUsers.length);		// MS Log
						// copy all existing users to newVP
						if (req.body.users) {
							// empty the user list and take the users from the delivered body
							oneVP.users = [];
							for (i = 0; i < req.body.users.length; i++) {
								// build up user list for newVP and a unique list of vpUsers
								vpUser = listUsers.find(findUserList, req.body.users[i].email);
								// if user does not exist, ignore the user
								if (vpUsers){
									req.body.users[i].userId = vpUser._id;
									oneVP.users.push(req.body.users[i]);
								}
							};
						};
						// check that there is an Admin available, if not add the current user as Admin
						if (oneVP.users.filter(users => users.role == 'Admin').length == 0) {
							debuglog(1, "Error VP PUT: No Admin User found");
							return res.status(409).send({
								state: 'failure',
								message: 'Inconsistent Users for VisboProjects',
								error: err
							});
						};
						debuglog(9, "PUT VP: Save VP after user change");
						oneVP.save(function(err, oneVP) {
							if (err) {
								return res.status(500).send({
									state: 'failure',
									message: 'Error updating Visbo Project',
									error: err
								});
							}
							if (vpvPopulate){
								debuglog(5, "VP PUT %s: Update Project Versions to %s", oneVP._id, oneVP.name);
								var updateQuery = {"vpid": oneVP._id};
								var updateUpdate = {$set: {"name": oneVP.name}};
								var updateOption = {upsert: false, multi: "true"};
								VisboProjectVersion.update(updateQuery, updateUpdate, updateOption, function (err, result) {
									if (err){
										debuglog(2, "Problem updating VP Versions for VP %s", oneVP._id);
										return res.status(500).send({
											state: 'failure',
											message: 'Error updating Visbo Project',
											error: err
										});
									}
									debuglog(5, "Update VP names in VPV found %d updated %d", result.n, result.nModified)
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
					debuglog(5, "PUT VP: no user changes, save now");
					oneVC.save(function(err, oneVP) {
						if (err) {
							return res.status(500).send({
								state: 'failure',
								message: 'Error updating Visbo Project',
								error: err
							});
						}
						// Update underlying projects if name has changed
						if (vpvPopulate){
							debuglog(5, "VP PUT %s: Update Project Versions to %s", oneVP._id, oneVP.name);
							var updateQuery = {"vpid": oneVP._id};
							var updateUpdate = {$set: {"name": oneVP.name}};
							var updateOption = {upsert: false, multi: "true"};
							VisboProjectVersion.update(updateQuery, updateUpdate, updateOption, function (err, result) {
								if (err){
									debuglog(2, "Problem updating VP Versions for VP %s", oneVP._id);
									return res.status(500).send({
										state: 'failure',
										message: 'Error updating Visbo Project',
										error: err
									});
								}
								debuglog(5, "Update VP names in VPV found %d updated %d", result.n, result.nModified)
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
			});
		})

	/**
		* @api {delete} /vp/:vpid Delete a Visbo Projects
		* @apiVersion 0.0.1
		* @apiGroup VisboProject
		* @apiName DeleteVisboProject
		* @apiHeader {String} access-key User authentication token.
		* @apiPermission user must be authenticated and user must have Admin permission to access the VisboProject
		* @apiError NotAuthenticated no valid token HTTP 401
		* @apiError NoPermission user does not have access to the VisboProject as Admin HTTP 403
		* @apiError NotFound VisboProject does not exist HTTP 404
		* @apiError ServerIssue No DB Connection HTTP 500
		* @apiExample Example usage:
		*   url: http://localhost:3484/vp/5aada025
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
			debuglog(1, "DELETE Visbo Project for userid %s email %s and vp %s ", userId, useremail, req.params.vpid);		// MS Log

			var queryVP = VisboProject.findOne({'_id':req.params.vpid, 'users.email': useremail, 'users.role' : 'Admin' });
			queryVP.select('name users updatedAt createdAt');
			queryVP.exec(function (err, oneVP) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Visbo Projects',
						error: err
					});
				}
				if (!oneVP) {
					return res.status(500).send({
						state: 'failure',
						message: 'No Visbo Project or no Permission'
					});
				}
				debuglog(1, "Delete Visbo Project after perm check success %s %O", req.params.vpid, oneVP);		// MS Log

				oneVP.remove(function(err, empty) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Error deleting Visbo Project',
							error: err
						});
					}
					return res.status(200).send({
						state: 'success',
						message: 'Deleted Visbo Project'
					});
				});
			});
		});

module.exports = router;
