var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var moment = require('moment');

var findUser = function(currentUser) {
		return currentUser == this;
}

var findUserList = function(currentUser) {
		//console.log("compare %s %s", currentUser.email, this);
		return currentUser.email == this;
}

var debuglevel = 9;
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
		console.log("%s: Level%d VC ".concat(logstring), moment().format('YYYY-MM-DD HH:mm:ss'), level, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9);
	}
};

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);

/////////////////
// Visbo Center API
// /vc
/////////////////

router.route('/')
	/**
	* @api {get} /vc Get Visbo Centers
	* @apiVersion 0.0.1
	* @apiGroup VisboCenter
	* @apiName GetVisboCenters
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vc retruns all VC the user has access permission to
	* In case of success it delivers an array of VCs, the array contains in each element a VC
	* @apiPermission user must be authenticated
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	* url: http://localhost:3484/vc
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Centers",
	*   "vc":[{
	*      "_id":"5aa64e70cde84541c754feaa",
	*      "updatedAt":"2018-03-16T12:39:54.042Z",
	*      "createdAt":"2018-03-12T09:54:56.411Z",
	*      "name":"My new VisobCenter",
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
	*   }]
	* }
	*/
.get(function(req, res) {
		// no need to check authentication, already done centrally
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(1, "Get Visbo Center for user %s", useremail);

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
			debuglog(2, "Found VCs %d", listVC.length);		// MS Log
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
	 * @apiGroup VisboCenter
	 * @apiName CreateVisboCenters
	 * @apiDescription POST /vc creates a new VC
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
	 *    "_id":"5aaf992ce2bd3711cf3da025",
	 *    "users":[
	 *     {
	 *      "_id":null, (MS ToDo: Set the correct UserID)
	 *      "email":"example@visbo.de",
	 *      "role":"Admin"
	 *     },
	 *    {
	 *     "email":"example2@visbo.de",
	 *     "role":"User",
	 *     "_id":null
	 *    }
	 *   ]
	 *  }]
	 * }
	 */
 .post(function(req, res) {
	 // User is authenticated already
	 var userId = req.decoded._id;
	 var useremail = req.decoded.email;
	 debuglog(9, "Post a new Visbo Center Req Body: %O Name %s", req.body, req.body.name);		// MS Log
	 debuglog(5, "Post a new Visbo Center with name %s executed by user %s ", req.body.name, useremail);		// MS Log

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
				return res.status(500).send({
					state: "failure",
					message: "Visbo Center already exists"
				});
			}
			debuglog(5, "Create Visbo Center (name is already unique) check users");
			var newVC = new VisboCenter();
			newVC.name = req.body.name;
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
			debuglog(9, "Check users if they exist %s", JSON.stringify(vcUsers));
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
					debuglog(2, "Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vcUsers.length);		// MS Log
				// copy all existing users to newVC and set the userId correct.
				if (req.body.users) {
					for (i = 0; i < req.body.users.length; i++) {
						// build up user list for newVC and a unique list of vcUsers
						vcUser = listUsers.find(findUserList, req.body.users[i].email);
						// if user does not exist, ignore the user
						if (vcUser){
							req.body.users[i].userId = vcUser._id;
							newVC.users.push(req.body.users[i]);
						}
					};
				};
				// check that there is an Admin available, if not add the current user as Admin
				if (newVC.users.filter(users => users.role == 'Admin').length == 0) {
					var admin = {userId: userId, email:useremail, role:"Admin"};
					debuglog(2, "No Admin User found add current user as admin");
					newVC.users.push(admin);
					if (!vcUsers.find(findUser, useremail)){
						vcUsers.push(useremail)
					}
				};

				debuglog(2, "Save VisboCenter %s  with Users %O", newVC.name, newVC.users);
				newVC.save(function(err, vc) {
					if (err) {
						return res.status(500).send({
							state: "failure",
							message: "database error, failed to create visbocenter",
							error: err
						});
					}
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
 	* @apiGroup VisboCenter
 	* @apiName GetVisboCenter
	* @apiDescription GET /vc/:vcid gets a specific VC
	* the system checks if the user has access permission to it.
	* In case of success, the system delivers an array of VCs, with one element in the array that is the info about the VC
 	* @apiHeader {String} access-key User authentication token.
 	* @apiPermission user must be authenticated and user must have permission to access the VisboCenter
 	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NoPermission user does not have access to the VisboCenter HTTP 403
 	* @apiError ServerIssue No DB Connection HTTP 500
 	* @apiExample Example usage:
 	* url: http://localhost:3484/vc/5aada025
 	* @apiSuccessExample {json} Success-Response:
 	* HTTP/1.1 200 OK
 	* {
 	*   "state":"success",
 	*   "message":"Returned Visbo Centers",
 	*   "vc": [{
 	*     "_id":"5aa64e70cde84541c754feaa",
 	*     "updatedAt":"2018-03-16T12:39:54.042Z",
 	*     "createdAt":"2018-03-12T09:54:56.411Z",
 	*     "name":"My new VisobCenter",
 	*     "users":[
 	*      {
 	*       "email":"example1@visbo.de",
 	*       "role":"Admin",
 	*       "userId":"usc754feab"
 	*      },
 	*      {
 	*       "email":"example2@visbo.de",
 	*       "role":"User",
 	*       "userId":"usc754feac"
 	*      }
 	*     ]
 	*   }]
 	* }
	*/
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		debuglog(1, "Get Visbo Center for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);		// MS Log

		var queryVC = VisboCenter.find({'users.email': useremail, '_id':req.params.vcid});
		queryVC.select('name users updatedAt createdAt');
		queryVC.exec(function (err, listVC) {
			if (err) {
				return res.status(404).send({
					state: 'failure',
					message: 'Error getting VisboCenters',
					error: err
				});
			}
			debuglog(1, "Found VCs %d %O", listVC.length, listVC);		// MS Log
			return res.status(200).send({
				state: 'success',
				message: 'Returned Visbo Centers',
				vc: listVC
			});
		});
	})

	/**
	 * @api {put} /vc/:vcid Update Visbo Center
	 * @apiVersion 0.0.1
	 * @apiGroup VisboCenter
	 * @apiName UpdateVisboCenters
	 * @apiDescription PUT /vc/:vcid updates a specific VC
   * the system checks if the user has access permission to it.
	 * If no user list is delivered in the body, no updates will be performed to the users.
	 * if the VC Name is changed, the VC Name is populated to the Visbo Projects.
	 * If the user list is delivered in the body, the system checks that the updatedAt flag from the body equals the updatedAt in the system.
	 * If not equal, the system delivers an error because the VC was updated between the read and write of the user and therefore it might lead to inconsitency.
 	 * In case of success, the system delivers an array of VCs, with one element in the array that is the info about the VC
	 * @apiHeader {String} access-key User authentication token.
	 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	 * @apiError NoPermission No permission to update this VisboCenter HTTP 403
	 * @apiError VC was updated in between HTTP 409
	 * @apiPermission user must be authenticated and user must have Admin permission for this VC (MS Todo)
	 * @apiHeader {String} access-key User authentication token.
	 * @apiExample Example usage:
	 * url: http://localhost:3484/vc/5aada025
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
	 *    "_id":"5aaf992ce2bd3711cf3da025",
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
		debuglog(1, "PUT/Save Visbo Center for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);		// MS Log

		var queryVC = VisboCenter.findOne({'_id':req.params.vcid, 'users.email': useremail, 'users.role': 'Admin'});
		queryVC.select('name users updatedAt createdAt');
		queryVC.exec(function (err, oneVC) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Visbo Centers',
					error: err
				});
			}
			if (!oneVC) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			var vpPopulate = oneVC.name != req.body.name ? true : false;
			debuglog(2, "PUT/Save Visbo Center %O new Name %s", oneVC, req.body);		// MS Log
			oneVC.name = req.body.name;
			// update users only if users is set in body and check consistency
			var origDate = new Date(req.body.updatedAt), putDate = new Date(oneVC.updatedAt);
			if (origDate - putDate !== 0 && req.body.users.length > 0){
				// PUT Request with change User list, but the original List that was feteched was already changed, return error
				debuglog(2, "Error VC PUT: Change User List but VC was already changed afterwards");
				return res.status(409).send({
					state: 'failure',
					message: 'Change User List but Visbo Center was already changed afterwards',
					error: err
				});
			};
			var i;
			var vcUsers = new Array();
			if (req.body.users) {
				for (i = 0; i < req.body.users.length; i++) {
					// build up unique user list vcUsers to check that they exist
					if (!vcUsers.find(findUser, req.body.users[i].email)){
						vcUsers.push(req.body.users[i].email)
					}
				};
				debuglog(5, "Check users if they exist %s", JSON.stringify(vcUsers));
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
						debuglog(2, "Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vcUsers.length);		// MS Log
					// copy all existing users to newVC
					if (req.body.users) {
						// empty the user list and take the users from the delivered body
						oneVC.users = [];
						for (i = 0; i < req.body.users.length; i++) {
							// build up user list for newVC and a unique list of vcUsers
							vcUser = listUsers.find(findUserList, req.body.users[i].email);
							// if user does not exist, ignore the user
							if (vcUser){
								req.body.users[i].userId = vcUser._id;
								oneVC.users.push(req.body.users[i]);
							}
						};
					};
					// check that there is an Admin available, if not add the current user as Admin
					if (oneVC.users.filter(users => users.role == 'Admin').length == 0) {
						debuglog(2, "Error VC PUT: No Admin User found");
						return res.status(409).send({
							state: 'failure',
							message: 'Inconsistent Users for VisboCenters',
							error: err
						});
					};
					debuglog(9, "PUT VC: Save VC after user change");
					oneVC.save(function(err, oneVC) {
						if (err) {
							return res.status(500).send({
								state: 'failure',
								message: 'Error updating Visbo Center',
								error: err
							});
						}
						// Update underlying projects if name has changed
						if (vpPopulate){
							debuglog(5, "VC PUT %s: Update SubProjects to %s", oneVC._id, oneVC.name);
							var updateQuery = {"vcid": oneVC._id};
							var updateUpdate = {$set: {"vc": { "name": oneVC.name}}};
							var updateOption = {upsert: false, multi: "true"};
							VisboProject.update(updateQuery, updateUpdate, updateOption, function (err, result) {
								if (err){
									debuglog(2, "Problem updating VP Projects for VC %s", oneVC._id);
									return res.status(500).send({
										state: 'failure',
										message: 'Error updating Visbo Projects',
										error: err
									});
								}
								debuglog(5, "Update VC names in VP found %d updated %d", result.n, result.nModified)
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
				});
			}
			else {
				// No User Updates just the VC itself
				debuglog(9, "PUT VC: no user changes, save now");
				oneVC.save(function(err, oneVC) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Error updating Visbo Center',
							error: err
						});
					}
					// Update underlying projects if name has changed
					if (vpPopulate){
						debuglog(5, "VC PUT %s: Update SubProjects to %s", oneVC._id, oneVC.name);
						var updateQuery = {"vcid": oneVC._id};
						var updateUpdate = {$set: {"vc": { "name": oneVC.name}}};
						var updateOption = {upsert: false, multi: "true"};
						VisboProject.update(updateQuery, updateUpdate, updateOption, function (err, result) {
							if (err){
								debuglog(2, "Problem updating VP Projects for VC %s", oneVC._id);
								return res.status(500).send({
									state: 'failure',
									message: 'Error updating Visbo Projects',
									error: err
								});
							}
							debuglog(5, "Update VC names in VP found %d updated %d", result.n, result.nModified)
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
		});
	})


	/**
  	* @api {delete} /vc/:vcid Delete a Visbo Centers
  	* @apiVersion 0.0.1
  	* @apiGroup VisboCenter
  	* @apiName DeleteVisboCenter
  	* @apiHeader {String} access-key User authentication token.
  	* @apiPermission user must be authenticated and user must have Admin permission to access the VisboCenter
  	* @apiError NotAuthenticated no valid token HTTP 401
  	* @apiError NoPermission user does not have access to the VisboCenter as Admin HTTP 403
		* @apiError NotFound VisboCenter does not exist HTTP 404
  	* @apiError ServerIssue No DB Connection HTTP 500
  	* @apiExample Example usage:
  	* url: http://localhost:3484/vc/5aada025
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
		debuglog(1, "DELETE Visbo Center for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);		// MS Log

		var queryVC = VisboCenter.findOne({'_id':req.params.vcid, 'users.email': useremail, 'users.role': 'Admin'});
		queryVC.select('name users updatedAt createdAt');
		queryVC.exec(function (err, oneVC) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting Visbo Centers',
					error: err
				});
			}
			if (!oneVC) {
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			debuglog(1, "Delete Visbo Center after premission check %s %O", req.params.vcid, oneVC);		// MS Log

			oneVC.remove(function(err, empty) {
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
	});

module.exports = router;
