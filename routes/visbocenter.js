var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');


var findUser = function(currentUser) {
		return currentUser == this;
}

var findUserList = function(currentUser) {
		//console.log("compare %s %s", currentUser.email, this);
		return currentUser.email == this;
}

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
	*        "_id":"5aa64e70cde84541c754feab"
	*       },
	*       {
	*        "email":"example2@visbo.de",
	*        "role":"User",
	*        "_id":"5aa64e70cde84541c754feac"
	*       }
	*     ]
	*   }]
	* }
	*/
.get(function(req, res) {
		// no need to check authentication, already done centrally
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		// console.log("Get Visbo Center for user %s", useremail);

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
			// console.log("Found VCs %d", listVC.length);		// MS Log
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
	 *    "_id": "",
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
	 // MS Done: User is authenticated, Check that Visbo Center Name is unique
	 // MS Todo: check that users are known, set the USerIDs for the user correct, Check that there is at least one admin
	 var userId = req.decoded._id;
	 var useremail = req.decoded.email;
	 // console.log("Post a new Visbo Center Req Body: %O Name %s", req.body, req.body.name);		// MS Log
	 // console.log("Post a new Visbo Center with name %s executed by user %s ", req.body.name, useremail);		// MS Log
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
			// console.log("Create Visbo Center (name is already unique) check users");
			var newVC = new VisboCenter();
			newVC.name = req.body.name;
			// Check for Valid User eMail remove non existing eMails

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
			//console.log("Check users if they exist %s", JSON.stringify(vcUsers));
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
				if (listUsers.length != vcUsers.length) console.log("Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vcUsers.length);		// MS Log
				// copy all existing users to newVC
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
					// console.log("No Admin User found add current user as admin");
					newVC.users.push(admin);
					if (!vcUsers.find(findUser, useremail)){
						vcUsers.push(useremail)
					}
				};

				// console.log("Save VisboCenter %s  with Users %O", newVC.name, newVC.users);
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
 	*       "_id":"5aa64e70cde84541c754feab"
 	*      },
 	*      {
 	*       "email":"example2@visbo.de",
 	*       "role":"User",
 	*       "_id":"5aa64e70cde84541c754feac"
 	*      }
 	*     ]
 	*   }]
 	* }
	*/
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		// console.log("Get Visbo Center for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);		// MS Log

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
			// console.log("Found VCs %d %O", listVC.length, listVC);		// MS Log
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
	 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	 * @apiError NoPermission No permission to update this VisboCenter HTTP 403
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
	 *      "_id":null,
	 *      "email":"example@visbo.de",
	 *      "role":"Admin"
	 *     },
	 *     {
	 *      "email":"example2@visbo.de",
	 *      "role":"User",
	 *      "_id":null
	 *     }
	 *    ]
	 *  }]
	 * }
	 */
	.put(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		// console.log("PUT/Save Visbo Center for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);		// MS Log

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
			console.log("PUT/Save Visbo Center %O new Name %s", oneVC, req.body);		// MS Log
			oneVC.name = req.body.name;
			// update users only if users is set in body and check consistency
			var origDate = new Date(req.body.updatedAt), putDate = new Date(oneVC.updatedAt);
			if (origDate - putDate !== 0 && req.body.users.length > 0){
				// PUT Request with change User list, but the original List that was feteched was already changed, return error
				console.log("Error VC PUT: Change User List but VC was already changed afterwards");
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
				//console.log("Check users if they exist %s", JSON.stringify(vcUsers));
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
					if (listUsers.length != vcUsers.length) console.log("Warning: Found only %d of %d Users, ignoring non existing users", listUsers.length, vcUsers.length);		// MS Log
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
						console.log("Error VC PUT: No Admin User found add current user as admin");
						return res.status(409).send({
							state: 'failure',
							message: 'Inconsistent Users for VisboCenters',
							error: err
						});
					};
					console.log("PUT VC: Save VC after user change");
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
							// VisboProject.findOne({'_id':req.params.vcid, 'users.email': useremail, 'users.role': 'Admin'});
							console.log("VC PUT %s: Update SubProjects to %s", oneVC._id, oneVC.name);
							//VisboProject.where({'vcid': oneVC._id}).update({"$set": {"vc.name": oneVC.name}}).exec();
							var updateVP = VisboProject.find({"vcid": oneVC._id})

							updateVP.select('_id name');
							updateVP.exec(function (err, listVP) {
								if (err) {
									return res.status(500).send({
										state: 'failure',
										message: 'Error getting Visbo Projects',
										error: err
									});
								}
								// console.log("Update the following VP: %O", listVP);
								for (let i = 0; i < listVP.length; i++) {
									console.log("Update VP %s", listVP[i].name);
									listVP[i].vc.name = oneVC.name
									listVP[i].save(function(err, vp){
										if (err){
											console.log("Problem updating VP Projects %d %s for VC", i, listVP[i]._id);
											return res.status(500).send({
												state: 'failure',
												message: 'Error updating Visbo Projects',
												error: err
											});
										}
									})
								};
							});
						}
						console.log("PUT VC: all done now return result");
						return res.status(200).send({
							state: 'success',
							message: 'Updated Visbo Center',
							vc: [ oneVC ]
						});
					});
				});
			}

			else {
				// No User Updates just the VC itself

				console.log("PUT VC: no user changes, save now");
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
						// VisboProject.findOne({'_id':req.params.vcid, 'users.email': useremail, 'users.role': 'Admin'});
						console.log("VC PUT %s: Update SubProjects to %s", oneVC._id, oneVC.name);
						//VisboProject.where({'vcid': oneVC._id}).update({"$set": {"vc.name": oneVC.name}}).exec();
						var updateVP = VisboProject.find({"vcid": oneVC._id})

						updateVP.select('_id name');
						updateVP.exec(function (err, listVP) {
							if (err) {
								return res.status(500).send({
									state: 'failure',
									message: 'Error getting Visbo Projects',
									error: err
								});
							}
							// console.log("Update the following VP: %O", listVP);
							for (let i = 0; i < listVP.length; i++) {
								console.log("Update VP %s", listVP[i].name);
								listVP[i].vc.name = oneVC.name
								listVP[i].save(function(err, vp){
									if (err){
										console.log("Problem updating VP Projects %d %s for VC", i, listVP[i]._id);
										return res.status(500).send({
											state: 'failure',
											message: 'Error updating Visbo Projects',
											error: err
										});
									}
								})
							};
						});
					}
					return res.status(200).send({
						state: 'success',
						message: 'Updated Visbo Center',
						vc: [ oneVC ]
					});
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
		// console.log("DELETE Visbo Center for userid %s email %s and vc %s ", userId, useremail, req.params.vcid);		// MS Log

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
			// console.log("Delete Visbo Center %s %O", req.params.vcid, oneVC);		// MS Log

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
