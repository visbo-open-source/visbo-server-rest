var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var verifyVc = require('./../components/verifyVc');
var logging = require('./../components/logging');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var VCRole = mongoose.model('VCRole');
var VCCost = mongoose.model('VCCost');
var moment = require('moment');

var findUser = function(currentUser) {
		return currentUser == this;
}

var findUserList = function(currentUser) {
		//console.log("compare %s %s", currentUser.email, this);
		return currentUser.email == this;
}

var debuglevel = 9;

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// register the VC middleware to check that the user has access to the VC
router.use('/', verifyVc.verifyVc);

/////////////////
// Visbo Center API
// /vc
/////////////////

router.route('/')
	/**
	* @api {get} /vc Get Visbo Centers
	* @apiVersion 0.0.1
	* @apiGroup Visbo Center
	* @apiName GetVisboCenters
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get retruns all VC where the user has access permission to
	* In case of success it delivers an array of VCs, the array contains in each element a VC
	* @apiPermission user must be authenticated
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	* url: http://localhost:3484/vc
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
	*      "vpCount": "0",
	*      "users": [
	*       {
	*        "email": "example1@visbo.de",
	*        "role": "Admin",
	*        "userId": "us5c754feab"
	*       },
	*       {
	*        "email": "example2@visbo.de",
	*        "role": "User",
	*        "userId": "us5c754feac"
	*       }
	*     ]
	*   }]
	* }
	*/
.get(function(req, res) {
		// no need to check authentication, already done centrally
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "Get Visbo Center for user %s", useremail);

		var queryVC = VisboCenter.find({'users.email': useremail});
		queryVC.select('name users updatedAt createdAt');
		queryVC.exec(function (err, listVC) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenters',
					error: err
				});
			}
			debuglog(debuglevel, 2, "Found VCs %d", listVC.length);
			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Centers',
				vc: listVC
			});
		});
	})

	/**
	 * @api {post} /vc Create a Visbo Center
	 * @apiVersion 0.0.1
	 * @apiGroup Visbo Center
	 * @apiName CreateVisboCenters
	 * @apiDescription Post creates a new VC
	 * with a unique name and the users with their roles as defined in the body.
 	 * If no admin is specified the current user is added as Admin.
	 * In case of success it delivers an array of VCs to be uniform to GET, the array contains as one element the created VC.
	 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	 * @apiError NoPermission No permission to create a VisboCenter HTTP 403
	 * @apiError Duplicate VisboCenter does already exist HTTP 409
	 * @apiPermission user must be authenticated and user must have permission to create a VC (MS Todo)
	 * @apiHeader {String} access-key User authentication token.
	 * @apiExample Example usage:
	 * url: http://localhost:3484/vc
	 * {
	 *  "name":"My first Visbo Center",
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
 .post(function(req, res) {
	 // User is authenticated already
	 var userId = req.decoded._id;
	 var useremail = req.decoded.email;
	 debuglog(debuglevel, 9, "Post a new Visbo Center Req Body: %O Name %s", req.body, req.body.name);
	 debuglog(debuglevel, 5, "Post a new Visbo Center with name %s executed by user %s ", req.body.name, useremail);

	 // check that VC name is unique
	 VisboCenter.findOne({ "name": req.body.name }, function(err, vc) {
			if (err) {
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
			debuglog(debuglevel, 5, "Create Visbo Center (name is already unique) check users");
			var newVC = new VisboCenter();
			newVC.name = req.body.name;
			newVC.vpCount = 0;
			// Check for Valid User eMail remove non existing eMails

			// check the users that they exist already, if not ignore the non existing users
			var i;
			var vcUsers = new Array();
			if (req.body.users) {
				for (i = 0; i < req.body.users.length; i++) {
					// build up unique user list vcUsers to check that they exist
					if (!vcUsers.find(findUser, req.body.users[i].email)){
						vcUsers.push(req.body.users[i].email)
					}
				};
			};
			debuglog(debuglevel, 9, "Check users if they exist %s", JSON.stringify(vcUsers));
			var queryUsers = User.find({'email': {'$in': vcUsers}});
			queryUsers.select('email');
			queryUsers.exec(function (err, listUsers) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Users for VisboCenters',
						error: err
					});
				}
				if (listUsers.length != vcUsers.length)
					debuglog(debuglevel, 2, "Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vcUsers.length);
				// copy all existing users to newVC and set the userId correct.
				if (req.body.users) {
					for (i = 0; i < req.body.users.length; i++) {
						// build up user list for newVC and a unique list of vcUsers
						vcUser = listUsers.find(findUserList, req.body.users[i].email);
						// if user does not exist, ignore the user
						if (vcUser){
							req.body.users[i].userId = vcUser._id;
							delete req.body.users[i]._id;
							newVC.users.push(req.body.users[i]);
						}
					};
				};
				// check that there is an Admin available, if not add the current user as Admin
				if (newVC.users.filter(users => users.role == 'Admin').length == 0) {
					var admin = {userId: userId, email:useremail, role:"Admin"};
					debuglog(debuglevel, 2, "No Admin User found add current user as admin");
					newVC.users.push(admin);
					if (!vcUsers.find(findUser, useremail)){
						vcUsers.push(useremail)
					}
				};

				debuglog(debuglevel, 2, "Save VisboCenter %s with %d Users", newVC.name, newVC.users.length);
 				newVC.save(function(err, vc) {
					if (err) {
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
 	* @apiVersion 0.0.1
 	* @apiGroup Visbo Center
 	* @apiName GetVisboCenter
	* @apiDescription Gets a specific Visbo Center
	* the system checks if the user has access permission to it.
	* In case of success, the system delivers an array of VCs, with one element in the array that is the info about the VC
 	* @apiHeader {String} access-key User authentication token.
 	* @apiPermission user must be authenticated and user must have permission to access the VisboCenter
 	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NoPermission user does not have access to the VisboCenter HTTP 403
 	* @apiError ServerIssue No DB Connection HTTP 500
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
 	*   }]
 	* }
	*/
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "Get Visbo Center for userid %s email %s and vc %s oneVC %s Admin %s", userId, useremail, req.params.vcid, req.oneVC.name, req.oneVCisAdmin);
		// we have found the VC already in middleware
		return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Centers',
				vc: [req.oneVC]
			});
	})

	/**
	 * @api {put} /vc/:vcid Update Visbo Center
	 * @apiVersion 0.0.1
	 * @apiGroup Visbo Center
	 * @apiName UpdateVisboCenters
	 * @apiDescription Put updates a specific Visbo Center.
   * the system checks if the user has access permission to it.
	 *
	 * If no user list is delivered in the body, no updates will be performed to the users.
	 * If the user list is delivered in the body, the system checks that the updatedAt flag from the body equals the updatedAt in the system.
	 * If not equal, the system delivers an error because the VC was updated between the read and write of the user and therefore it might lead to inconsitency.
 	 * In case of success, the system delivers an array of VCs, with one element in the array that is the info about the VC
	 *
	 * If the VC Name is changed, the VC Name is populated to the Visbo Projects.
	 * @apiHeader {String} access-key User authentication token.
	 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	 * @apiError NoPermission No permission to update this VisboCenter HTTP 403
	 * @apiError VC was updated in between HTTP 409
	 * @apiPermission user must be authenticated and user must have Admin permission for this VC (MS Todo)
	 * @apiHeader {String} access-key User authentication token.
	 * @apiExample Example usage:
	 * url: http://localhost:3484/vc/vc5aada025
	 * {
	 *  "name":"My first Visbo Center Renamed",
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
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "PUT/Save Visbo Center for userid %s vc %s oneVC %s is Admin %s ", userId, req.params.vcid, req.oneVC.name, req.oneVCisAdmin);

		if (!req.body) {
			return res.status(409).send({
				state: 'failure',
				message: 'No Body provided for update'
			});
		}
		if (!req.oneVCisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		var vpPopulate = false;
		if (req.body.name && req.oneVC.name != req.body.name ) {
			vpPopulate = true;
		}
		debuglog(debuglevel, 5, "PUT/Save Visbo Center %s Name %s Namechange: %s", req.oneVC._id, req.body.name, vpPopulate);
		req.oneVC.name = req.body.name;
		// update users only if users is set in body and check consistency
		var putDate = req.body.updatedAt ? new Date(req.body.updatedAt) : new Date();
		var origDate = new Date(req.oneVC.updatedAt);
		if (origDate - putDate != 0 && typeof(req.body.users) != "undefined") {
			// PUT Request with change User list, but the original List that was feteched was already changed, return error
			debuglog(debuglevel, 2, "Error VC PUT: Change User List but VC was already changed afterwards", origDate, putDate);
			return res.status(409).send({
				state: 'failure',
				message: 'Change User List but Visbo Center was already changed afterwards'
			});
		};
		var vcUsers = new Array();
		debuglog(debuglevel, 5, "PUT/Save Visbo Center check the users in body");
		if (req.body.users) {
			for (var i = 0; i < req.body.users.length; i++) {
				// build up unique user list vcUsers to check that they exist
				if (!vcUsers.find(findUser, req.body.users[i].email)){
					vcUsers.push(req.body.users[i].email)
				}
			};
			debuglog(debuglevel, 5, "Check users if they exist %s", JSON.stringify(vcUsers));
			var queryUsers = User.find({'email': {'$in': vcUsers}});
			queryUsers.select('email');
			queryUsers.exec(function (err, listUsers) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Users for VisboCenters',
						error: err
					});
				}
				if (listUsers.length != vcUsers.length) {
					debuglog(debuglevel, 2, "Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vcUsers.length);
				}
				// copy all existing users to newVC
				if (req.body.users) {
					// empty the user list and take the users from the delivered body
					req.oneVC.users = [];
					for (var i = 0; i < req.body.users.length; i++) {
						// build up user list for newVC and a unique list of vcUsers
						vcUser = listUsers.find(findUserList, req.body.users[i].email);
						// if user does not exist, ignore the user
						if (vcUser){
							req.body.users[i].userId = vcUser._id;
							delete req.body.users[i]._id;
							req.oneVC.users.push(req.body.users[i]);
						}
					};
				};
				// check that there is an Admin available, if not add the current user as Admin
				if (req.oneVC.users.filter(users => users.role == 'Admin').length == 0) {
					debuglog(debuglevel, 2, "Error VC PUT: No Admin User found");
					return res.status(409).send({
						state: 'failure',
						message: 'Inconsistent Users for VisboCenters',
						error: err
					});
				};
				debuglog(debuglevel, 9, "PUT VC: Save VC after user change");
				req.oneVC.save(function(err, oneVC) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Error updating Visbo Center',
							error: err
						});
					}
					// Update underlying projects if name has changed
					if (vpPopulate){
						debuglog(debuglevel, 5, "VC PUT %s: Update SubProjects to %s", req.oneVC._id, req.oneVC.name);
						var updateQuery = {"vcid": req.oneVC._id};
						var updateUpdate = {$set: {"vc": { "name": req.oneVC.name}}};
						var updateOption = {upsert: false, multi: "true"};
						VisboProject.update(updateQuery, updateUpdate, updateOption, function (err, result) {
							if (err){
								debuglog(debuglevel, 2, "Problem updating VP Projects for VC %s", req.oneVC._id);
								return res.status(500).send({
									state: 'failure',
									message: 'Error updating Visbo Projects',
									error: err
								});
							}
							debuglog(debuglevel, 5, "Update VC names in VP found %d updated %d", result.n, result.nModified)
							return res.status(200).send({
								state: 'success',
								message: 'Updated Visbo Center',
								vc: [ req.oneVC ]
							});
						});
					} else {
						return res.status(200).send({
							state: 'success',
							message: 'Updated Visbo Center',
							vc: [ req.oneVC ]
						});
					}
				});
			});
		} else {
			// No User Updates just the VC itself
			debuglog(debuglevel, 9, "PUT VC: no user changes, save now");
			req.oneVC.save(function(err, oneVC) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating Visbo Center',
						error: err
					});
				}
				// Update underlying projects if name has changed
				if (vpPopulate){
					debuglog(debuglevel, 5, "VC PUT %s: Update SubProjects to %s", oneVC._id, oneVC.name);
					var updateQuery = {"vcid": req.oneVC._id};
					var updateUpdate = {$set: {"vc": { "name": req.oneVC.name}}};
					var updateOption = {upsert: false, multi: "true"};
					VisboProject.update(updateQuery, updateUpdate, updateOption, function (err, result) {
						if (err){
							debuglog(debuglevel, 2, "Problem updating VP Projects for VC %s", oneVC._id);
							return res.status(500).send({
								state: 'failure',
								message: 'Error updating Visbo Projects',
								error: err
							});
						}
						debuglog(debuglevel, 5, "Update VC names in VP found %d updated %d", result.n, result.nModified)
						return res.status(200).send({
							state: 'success',
							message: 'Updated Visbo Center',
							vc: [ oneVC ]
						});
					});
				} else {
					return res.status(200).send({
						state: 'success',
						message: 'Updated Visbo Center',
						vc: [ oneVC ]
					});
				}
			});
		}
	})

	/**
  	* @api {delete} /vc/:vcid Delete a Visbo Centers
  	* @apiVersion 0.0.1
  	* @apiGroup Visbo Center
  	* @apiName DeleteVisboCenter
		* @apiDescription Deletes a specific Visbo Center.
    * the system checks if the user has Admin permission to it.
  	* @apiHeader {String} access-key User authentication token.
  	* @apiPermission user must be authenticated and user must have Admin permission to access the VisboCenter
  	* @apiError NotAuthenticated no valid token HTTP 401
  	* @apiError NoPermission user does not have access to the VisboCenter as Admin HTTP 403
		* @apiError NotFound VisboCenter does not exist HTTP 404
  	* @apiError ServerIssue No DB Connection HTTP 500
  	* @apiExample Example usage:
  	* url: http://localhost:3484/vc/vc5aada025
  	* @apiSuccessExample {json} Success-Response:
  	* HTTP/1.1 200 OK
  	* {
  	*   "state":"success",
  	*   "message":"Deleted Visbo Centers"
  	* }
 	  */
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "DELETE Visbo Center for userid %s email %s and vc %s oneVC %s is Admin %s", userId, useremail, req.params.vcid, req.oneVC.name, req.oneVCisAdmin);

		if (!req.oneVCisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		debuglog(debuglevel, 1, "Delete Visbo Center after premission check %s %O", req.params.vcid, req.oneVC._id);

		req.oneVC.remove(function(err, empty) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error deleting Visbo Center',
					error: err
				});
			}
			return res.status(200).send({
				state: 'success',
				message: 'Deleted Visbo Center'
			});
		});
	});

router.route('/:vcid/role')
	/**
	* @api {get} /vc/:vcid/role Get Roles
	* @apiVersion 0.0.1
	* @apiGroup Visbo Center Properties
	* @apiName GetVisboCenterRole
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Gets all roles of the specified Visbo Center
	*
	* @apiPermission user must be authenticated, user must have access to referenced VisboCenter
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/role
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Project Versions",
	*   "vcrole":[{
	*     "_id":"vcrole5c754feaa",
	*     "name":"Role Name",
	*     "vcid": "vc5c754feaa",
	*     "timestamp": "2018-01-01",
	*     "allOthers": ""
	*   }]
	* }
	*/
	.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			debuglog(debuglevel, 1, "Get Visbo Center Role for userid %s email %s and vc %s oneVC %s Admin %s", userId, useremail, req.params.vcid, req.oneVC.name, req.oneVCisAdmin);

			var queryVCRole = VCRole.find({'vcid': req.oneVC._id});
			// queryVCRole.select('_id vcid name');
			queryVCRole.exec(function (err, listVCRole) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting VisboCenter Roles',
						error: err
					});
				}
				debuglog(debuglevel, 5, "Found %d Roles for VC", listVCRole.length);
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Center Roles',
					vcrole: listVCRole
				});
			});
		})

		/**
		* @api {post} /vc/:vcid/role Create a Role
		* @apiVersion 0.0.1
		* @apiGroup Visbo Center Properties
		* @apiName PostVisboCenterRole
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Post creates a new role inside the Visbo Center
		*
		* User must have Amdin Permission in the VC to create new roles
		* @apiPermission user must be authenticated, user must have admin access to referenced VisboCenter
		* @apiError NotAuthenticated no valid token HTTP 401
		* @apiError ServerIssue No DB Connection HTTP 500
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
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 9, "Post a new Visbo Center Role Req Body: %O Name %s", req.body, req.body.name);
		debuglog(debuglevel, 5, "Post a new Visbo Center Role with name %s executed by user %s ", req.body.name, useremail);

		if (!req.oneVCisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		if (req.body == undefined || req.body.name == undefined ) { //|| req.body.uid == undefined) {
			debuglog(debuglevel, 1, "Body is inconsistent %O", req.body);
			return res.status(404).send({
				state: 'failure',
				message: 'No valid role definition'
			});
		}
		debuglog(debuglevel, 1, "Post Role to VC %s Permission is ok, check unique uid", req.params.vcid);
		var queryVCRole = VCRole.findOne({'vcid': req.params.vcid, 'uid': req.body.uid});
		queryVCRole.select('name uid');
		queryVCRole.exec(function (err, oneVCRole) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Visbo Center Roles',
					error: err
				});
			}
			if (oneVCRole) {
				return res.status(403).send({
					state: 'failure',
					message: 'Visbo Center Role exists already'
				});
			}
			debuglog(debuglevel, 1, "Post Role to VC %s now", req.params.vcid);

			var vcRole = new VCRole();
			vcRole.name = req.body.name;
			vcRole.vcid = req.params.vcid;
			vcRole.uid = req.body.uid;
			vcRole.subRoleIDs = req.body.subRoleIDs;
			vcRole.farbe = req.body.farbe;
			vcRole.defaultKapa = req.body.defaultKapa;
			vcRole.tagessatzIntern = req.body.tagessatzIntern;
			vcRole.tagessatzExtern = req.body.tagessatzExtern;
			vcRole.kapazitaet = req.body.kapazitaet;
			vcRole.externeKapazitaet = req.body.externeKapazitaet;
			vcRole.startOfCal = req.body.startOfCal;
			vcRole.timestamp = req.body.timestamp ? req.body.timestamp : Date();
			vcRole.save(function(err, oneVcRole) {
				if (err) {
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
	* @api {delete} /vc/:vcid/role/:roleid Delete a Role
	* @apiVersion 0.0.1
	* @apiGroup Visbo Center Properties
	* @apiName DeleteVisboCenterRole
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Deletes the specified role in the Visbo Center
	*
	* @apiPermission user must be authenticated, user must have admin access to referenced VisboCenter
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/role/:roleid
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Visbo Center Role deleted"
	* }
	*/
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "DELETE Visbo Center Role for userid %s email %s and vc %s role %s ", userId, useremail, req.params.vcid, req.params.roleid);

		if (!req.oneVCisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		debuglog(debuglevel, 1, "Delete Visbo Center Role after premission check %s", req.params.vcid);
		var queryVCRole = VCRole.findOne({'_id': req.params.roleid, 'vcid': req.params.vcid});
		// queryVCRole.select('_id vcid name');
		queryVCRole.exec(function (err, oneVCRole) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Roles',
					error: err
				});
			}
			if (!oneVCRole) {
				return res.status(401).send({
					state: 'failure',
					message: 'Visbo Center Role not found',
					error: err
				});
			}
			debuglog(debuglevel, 5, "Found the Role for VC");
			oneVCRole.remove(function(err, empty) {
				if (err) {
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
	* @api {put} /vc/:vcid/role/:roleid Update a Role
	* @apiVersion 0.0.1
	* @apiGroup Visbo Center Properties
	* @apiName PutVisboCenterRole
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Put updates a role inside the Visbo Center
	*
	* User must have Amdin Permission in the VC to create new roles
	* @apiPermission user must be authenticated, user must have admin access to referenced VisboCenter
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
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
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "PUT Visbo Center Role for userid %s email %s and vc %s role %s ", userId, useremail, req.params.vcid, req.params.roleid);

		if(!req.oneVCisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		debuglog(debuglevel, 1, "Update Visbo Center Role after premission check %s", req.params.vcid);
		var queryVCRole = VCRole.findOne({'_id': req.params.roleid, 'vcid': req.params.vcid});
		// queryVCRole.select('_id vcid name');
		queryVCRole.exec(function (err, oneVCRole) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Roles',
					error: err
				});
			}
			if (!oneVCRole) {
				return res.status(401).send({
					state: 'failure',
					message: 'Visbo Center Role not found',
					error: err
				});
			}
			debuglog(debuglevel, 5, "Found the Role for VC");
			oneVCRole.name = req.body.name;
			oneVCRole.subRoleIDs = req.body.subRoleIDs;
			oneVCRole.farbe = req.body.farbe;
			oneVCRole.defaultKapa = req.body.defaultKapa;
			oneVCRole.tagessatzIntern = req.body.tagessatzIntern;
			oneVCRole.tagessatzExtern = req.body.tagessatzExtern;
			oneVCRole.kapazitaet = req.body.kapazitaet;
			oneVCRole.externeKapazitaet = req.body.externeKapazitaet;
			oneVCRole.startOfCal = req.body.startOfCal;
			oneVCRole.timestamp = req.body.timestamp ? req.body.timestamp : Date();
			oneVCRole.save(function(err, oneVcRole) {
				if (err) {
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
	* @api {get} /vc/:vcid/cost Get Costs
	* @apiVersion 0.0.1
	* @apiGroup Visbo Center Properties
	* @apiName GetVisboCenterCost
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Gets all costs of the specified Visbo Center
	*
	* @apiPermission user must be authenticated, user must have access to referenced VisboCenter
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vc/:vcid/cost
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Project Versions",
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
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "Get Visbo Center Cost for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);

		var queryVCCost = VCCost.find({'vcid': req.oneVC._id});
		// queryVCCost.select('_id vcid name');
		queryVCCost.exec(function (err, listVCCost) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Costs',
					error: err
				});
			}
			debuglog(debuglevel, 5, "Found %d Costs for VC", listVCCost.length);
			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Center Costs',
				vccost: listVCCost
			});
		});
	})

	/**
	* @api {post} /vc/:vcid/cost Create a Cost Definition
	* @apiVersion 0.0.1
	* @apiGroup Visbo Center Properties
	* @apiName PostVisboCenterCost
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Post creates a new cost inside the Visbo Center
	*
	* User must have Amdin Permission in the VC to create new costs
	* @apiPermission user must be authenticated, user must have admin access to referenced VisboCenter
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
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
	.post(function(req, res) {
		// User is authenticated already
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 9, "Post a new Visbo Center Cost Req Body: %O Name %s", req.body, req.body.name);
		debuglog(debuglevel, 5, "Post a new Visbo Center Cost with name %s executed by user %s ", req.body.name, useremail);

		if (!req.body || !req.body.name) {
			return res.status(404).send({
				state: 'failure',
				message: 'No valid cost definition'
			});
		}
		if (!req.oneVCisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		debuglog(debuglevel, 1, "Post Cost to VC %s Permission is ok", req.params.vcid);
		var vcCost = new VCCost();
		vcCost.name = req.body.name;
		vcCost.vcid = req.params.vcid;
		vcCost.uid = req.body.uid;
		vcCost.farbe = req.body.farbe;
		vcCost.timestamp = Date();
		vcCost.save(function(err, oneVcCost) {
			if (err) {
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
		* @api {delete} /vc/:vcid/cost/:costid Delete a Cost Definition
		* @apiVersion 0.0.1
		* @apiGroup Visbo Center Properties
		* @apiName DeleteVisboCenterCost
		* @apiHeader {String} access-key User authentication token.
		* @apiDescription Deletes the specified cost in the Visbo Center
		*
		* @apiPermission user must be authenticated, user must have admin access to referenced VisboCenter
		* @apiError NotAuthenticated no valid token HTTP 401
		* @apiError ServerIssue No DB Connection HTTP 500
		* @apiExample Example usage:
		*   url: http://localhost:3484/vc/:vcid/cost/:costid
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Visbo Center Cost deleted"
		* }
		*/
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			debuglog(debuglevel, 1, "DELETE Visbo Center Cost for userid %s email %s and vc %s cost %s ", userId, useremail, req.params.vcid, req.params.costid);

			if (!req.oneVCisAdmin) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			debuglog(debuglevel, 1, "Delete Visbo Center Cost after premission check %s", req.params.vcid);
			var queryVCCost = VCCost.findOne({'_id': req.params.costid, 'vcid': req.params.vcid});
			// queryVCCost.select('_id vcid name');
			queryVCCost.exec(function (err, oneVCCost) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting VisboCenter Costs',
						error: err
					});
				}
				if (!oneVCCost) {
					return res.status(401).send({
						state: 'failure',
						message: 'Visbo Center Cost not found',
						error: err
					});
				}
				debuglog(debuglevel, 5, "Found the Cost for VC");
				oneVCCost.remove(function(err, empty) {
					if (err) {
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
	* @api {put} /vc/:vcid/cost/:costid Update a Cost Definition
	* @apiVersion 0.0.1
	* @apiGroup Visbo Center Properties
	* @apiName PutVisboCenterCost
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Put updates a cost definition inside the Visbo Center
	*
	* User must have Amdin Permission in the VC to create new costs
	* @apiPermission user must be authenticated, user must have admin access to referenced VisboCenter
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
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
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(debuglevel, 1, "PUT Visbo Center Cost for userid %s email %s and vc %s cost %s ", userId, useremail, req.params.vcid, req.params.costid);

		if (!req.oneVCisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		debuglog(debuglevel, 1, "Update Visbo Center Cost after premission check %s", req.params.vcid);
		var queryVCCost = VCCost.findOne({'_id': req.params.costid, 'vcid': req.params.vcid});
		// queryVCCost.select('_id vcid name');
		queryVCCost.exec(function (err, oneVCCost) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenter Costs',
					error: err
				});
			}
			if (!oneVCCost) {
				return res.status(401).send({
					state: 'failure',
					message: 'Visbo Center Cost not found',
					error: err
				});
			}
			debuglog(debuglevel, 5, "Found the Cost for VC");
			oneVCCost.name = req.body.name;
			oneVCCost.uid = req.body.uid;
			oneVCCost.farbe = req.body.farbe;
			oneVCCost.timestamp = Date();
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

module.exports = router;
