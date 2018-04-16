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
	*        "_id":"5aa64e70cde84541c754feab"
	*       },
	*       {
	*        "email":"example2@visbo.de",
	*        "role":"User",
	*        "_id":"5aa64e70cde84541c754feac"
	*       }
	*     ]
	*    }
	*  ]
	* }
	*/
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var query = {'users.email': useremail };
		if (req.query.vcid) query.vcid = req.query.vcid;
		// console.log("%s: Get Project for user %s with query parameters %O %O", moment().format('YYYY-MM-DD HH:MM:ss'), userId, req.query, query);		// MS Log
		var queryVP = VisboProject.find(query);
		queryVP.exec(function (err, listVP) {

			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			// console.log("Found %d Projects", listVP.length);
			// console.log("Found Projects/n", listVP);

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
	 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	 * @apiError NoPermission No permission to create a VisboProject HTTP 403
	 * @apiError Duplicate VisboProject does already exist HTTP 409
	 * @apiError HTTP-404 VisboCenter does not exist or user does not have permission to create project
	 * @apiPermission user must be authenticated and user must have permission to create a VP (MS Todo)
	 * @apiHeader {String} access-key User authentication token.
	 * @apiExample Example usage:
	 *   url: http://localhost:3484/vp
	 * {
	 *  "name":"My first Visbo Project",
	 *  "vcid": "vc5aaf992",
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
	 *     "_id":null, (MS ToDo: Set the correct UserID)
	 *     "email":"example@visbo.de",
	 *     "role":"Admin"
	 *    },
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
		var userId = req.decoded._id;
		var useremail  = req.decoded.email;
		var vcid = ( !req.body && !req.body.vcid ) ? '' : req.body.vcid
		var vpname = ( !req.body && !req.body.name ) ? '' : req.body.name
		// console.log("Post a new Visbo Project for user %s with name %s in VisboCenter %s for Users %O", useremail, req.body.name, vcid, req.body.users);		// MS Log
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
			// console.log("User has permission to create Project %s in  %s", vpname, vc.name);
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
				// console.log("Duplicate Name check returned %O", vp);
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
						// console.log("Add VisboProject User%d: %O", i+1, req.body.users[i]);
						req.body.users[i]._id = null; /* MS Todo: remove id temporarily, replayce by real userid */
						newVP.users.push(req.body.users[i]);
						vpUsers.push(req.body.users[i].email)
					};
				};
				// console.log("Check that Users are defined at all %d %O ", newVP.users.length, newVP);
				// check that there is an Admin available, if not add the current user as Admin
				if (newVP.users.filter(users => users.role == 'Admin').length == 0) {
					var admin = {email:useremail, role:"Admin"};
					console.log("No Admin User found add current user as admin");
					newVP.users.push(admin);
				};

				// console.log("Check users if they exist");
				//var queryUsers = Users.find({'email': {$in:vcUsers.toString()}});
				var queryUsers = User.find({});	//MS Todo: check only the required instead of all
				queryUsers.select('email');
				queryUsers.exec(function (err, listUsers) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Error getting Users for VisboCenters',
							error: err
						});
					}
					// console.log("Found Users %d", listUsers.length);		// MS Log
					newVP.vc.name = vc.name;
					console.log("VP Create add VC Name %s %O", vc.name, newVP);		// MS Log
					// console.log("Save VisboProject %s  with Users %O", newVP.name, newVP.users);
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
	 	*    "_id":"5aa64e70cde84541c754feaa",
	 	*    "updatedAt":"2018-03-16T12:39:54.042Z",
	 	*    "createdAt":"2018-03-12T09:54:56.411Z",
	 	*    "name":"My new Visbo Project",
		*		 "vcid": "vc5aaf992",
	 	*    "users":[
	 	*     {
	 	*      "email":"example1@visbo.de",
	 	*      "role":"Admin",
	 	*      "_id":"5aa64e70cde84541c754feab"
	 	*     },
	 	*     {
	 	*      "email":"example2@visbo.de",
	 	*      "role":"User",
	 	*      "_id":"5aa64e70cde84541c754feac"
	 	*     }
	 	*    ]
	 	*   }]
	 	* }
		*/
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			// console.log("Get Visbo Project for userid %s email %s and vc %s ", userId, useremail, req.params.vpid);		// MS Log

			var queryVP = VisboProject.find({'users.email': useremail, '_id':req.params.vpid});
			queryVP.select('name users updatedAt createdAt');
			queryVP.exec(function (err, listVP) {
				if (err) {
					return res.status(404).send({
						state: 'failure',
						message: 'Error getting VisboProjects',
						error: err
					});
				}
				// console.log("Found VCs %d %O", listVP.length, listVP);		// MS Log
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
		 *   "_id":"5aaf992ce2bd3711cf3da025",
		 *   "vcid": "vc5aaf992",
		 *   "users":[
		 *    {
		 *     "_id":null, (MS ToDo: Set the correct UserID)
		 *     "email":"example@visbo.de",
		 *     "role":"Admin"
		 *    },
		 *    {
		 *     "email":"example2@visbo.de",
		 *     "role":"User",
		 *     "_id":null
		 *    }
		 *   ]
		 *  }]
		 * }
		 */
		.put(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			// console.log("PUT/Save Visbo Project for userid %s email %s and vp %s ", userId, useremail, req.params.vpid);		// MS Log

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
				// console.log("PUT/Save Visbo Project %O ", oneVP);		// MS Log
				oneVP.name = req.body.name;
				var origDate = new Date(req.body.updatedAt), putDate = new Date(oneVP.updatedAt);
				// console.log("PUT/Save Visbo Project %s: time diff %d ", req.params.vpid, origDate - putDate);		// MS Log

				if (origDate - putDate == 0 && req.body.users.length > 0){
						oneVP.users = req.body.users
						console.log("PUT/Save Visbo Project %s: no inbetween changes and users present, update permission ok \n%O ", oneVP._id, oneVP);		// MS Log
				} else {
					console.log("PUT/Save Visbo Project %s: Difference in updatedAt (%d sec) or no Users specified", req.params.vpid, (origDate-putDate)/1000);		// MS Log
				}
				// MS Todo update other properties also

				oneVP.save(function(err, oneVP) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Error updating Visbo Project',
							error: err
						});
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
			// console.log("DELETE Visbo Project for userid %s email %s and vc %s ", userId, useremail, req.params.vpid);		// MS Log

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
				// console.log("Delete Visbo Project %s %O", req.params.vpid, oneVP);		// MS Log

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
