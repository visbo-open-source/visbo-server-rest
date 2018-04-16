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

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);

/////////////////
// Visbo Project Versions API
// /vpv
/////////////////


router.route('/')

	/**
	* @api {get} /vpv Get Visbo Project Versions
	* @apiVersion 0.0.1
	* @apiGroup VisboProjectVersion
	* @apiName GetVisboProjectVersions
	* @apiHeader {String} access-key User authentication token.
	* @apiPermission user must be authenticated, user must have access to related VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vpv?vpid=5aa1c754feaa
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Project Versions",
	*   "vpv":[
	*    {
	*       "_id":"vpv5aa64e70cde84541c754feaa",
	*   		"allOthers": "all properties of visbo project version"
	*    }
	*  ]
	* }
	*/
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var queryvp = {'users.email': useremail, 'users.role':{$in:['Admin','User']}};
		var query = {};
		if (req.query && req.query.vpid) queryvp._id = req.query.vpid;
		// console.log("%s: Get Project Versions for user %s with VP %s", moment().format('YYYY-MM-DD HH:MM:ss'), userId, queryvp._id);
		var queryVP = VisboProject.find(queryvp)
		queryVP.exec(function (err, listVP) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			// console.log("%s: Filter ProjectVersions to %s Projects", moment().format('YYYY-MM-DD HH:MM:ss'), listVP.length);
			var vpArray = [];
			var vp;
			for (vp in listVP) {
				vpArray.push(listVP[vp]._id);
			}
			// console.log("%s: Filter Projects %O", moment().format('YYYY-MM-DD HH:MM:ss'), vpArray);
			query = {vpid: {$in: vpArray}};
			var queryVPV = VisboProjectVersion.find(query);
			queryVPV.exec(function (err, listVPV) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Internal Server Error with DB Connection',
						error: err
					});
				};
				// console.log("Found %d Project Versions", listVPV.length);

				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Project Versions',
					vpv: listVPV
				});
			});
		});
	})

	/**
	 * @api {post} /vpv Create a Visbo Project
	 * @apiVersion 0.0.1
	 * @apiGroup VisboProjectVersion
	 * @apiName CreateVisboProjectVersions
	 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	 * @apiError NoPermission No permission to create a VisboProjectVersion HTTP 403
	 * @apiError Duplicate VisboProjectVersion does already exist HTTP 409
	 * @apiError HTTP-404 VisboCenter does not exist or user does not have permission to create project
	 * @apiPermission user must be authenticated and user must have permission to create a VP (MS Todo)
	 * @apiHeader {String} access-key User authentication token.
	 * @apiExample Example usage:
	 *   url: http://localhost:3484/vpv
	 * {
	 *  "name":"My first Visbo Project Version",
	 *	"vpid": "vp5aaf992ce2bd3711cf3da025"
	 *  "allOthers": "all properties of visbo project version"
	 * }
	 * @apiSuccessExample {json} Success-Response:
	 *     HTTP/1.1 200 OK
	 * {
	 *  "state":"success",
	 *  "message":"Successfully created new VisboProjectVersion",
	 *  "vpv":[{
	 *   "__v":0,
	 *   "updatedAt":"2018-03-19T11:04:12.094Z",
	 *   "createdAt":"2018-03-19T11:04:12.094Z",
	 *   "_id":"5aaf992ce2bd3711cf3da025",
	 *	 "name":"My first Visbo Project Version",
	 *   "vpid": "vp5aaf992ce2bd3711cf3da025"
	 *   "allOthers": "all properties of visbo project version"
	 *  }]
	 * }
	 */
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail  = req.decoded.email;
		var vpid = ( !req.body && !req.body.vpid ) ? null : req.body.vpid
		var vpname = ( !req.body && !req.body.name ) ? '' : req.body.name
		console.log("Post a new Visbo Project Version for user %s with name %s in VisboProject %s", useremail, req.body.name, vpid);		// MS Log
		var newVPV = new VisboProjectVersion();
		// check that vpid ist set and exists and user has Admin permission
		if (!vpid) {
			return res.status(400).send({
				state: 'failure',
				message: 'No Visbo Project ID defined',
				error: ''
			});
		}
		VisboProject.findOne({'_id': vpid,
												'users.email': useremail,
												'users.role' : 'Admin'
											}, function (err, vp) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			}
			if (!vp) {
				return res.status(404).send({
					state: 'failure',
					message: 'Visbo Project not found or no Admin'
				});
			};
			console.log("User has permission to create a Version %s in  %s", vpname, vp.name);
			// we do not need to check duplicate names as every post creates a new version
			// possible checks could be: set _id to undefined to guarantee that mongo creates its unique id
			// how to copy all attributes from body to the VisboProjectVersion
			var newVPV = new VisboProjectVersion;
			newVPV.name = vp.name;
			newVPV.vpid = vpid;

			console.log("Save VisboProjectVersion %s ", newVPV.name);
			newVPV.save(function(err, vpv) {
				if (err) {
					return res.status(500).send({
						state: "failure",
						message: "database error, failed to create VisboProjectVersion",
						error: err
					});
				}
				return res.status(200).send({
					state: "success",
					message: "Successfully created new Project Version",
					vpv: [ vpv ]
				});
			});
		});
	})

	router.route('/:vpvid')
	 /**
	 	* @api {get} /vpv/:vpvid Get a Visbo Project
	 	* @apiVersion 0.0.1
	 	* @apiGroup VisboProjectVersion
	 	* @apiName GetVisboProject
	 	* @apiHeader {String} access-key User authentication token.
	 	* @apiPermission user must be authenticated and user must have permission to access the VisboProjectVersion
	 	* @apiError NotAuthenticated no valid token HTTP 401
		* @apiError NoPermission user does not have access to the VisboProjectVersion HTTP 403
	 	* @apiError ServerIssue No DB Connection HTTP 500
	 	* @apiExample Example usage:
	 	*   url: http://localhost:3484/vpv/5aada025
	 	* @apiSuccessExample {json} Success-Response:
	 	* HTTP/1.1 200 OK
	 	* {
	 	*   "state":"success",
	 	*   "message":"Returned Visbo Projects",
	 	*   "vpv": [{
	 	*     "_id":"5aa64e70cde84541c754feaa",
  	*     "name":"My new Visbo Project Version",
		*     "updatedAt":"2018-03-19T11:04:12.094Z",
  	*     "createdAt":"2018-03-19T11:04:12.094Z",
  	*     "_id":"5aaf992ce2bd3711cf3da025",
  	*	    "name":"My first Visbo Project",
		*     "vpid": "5aaf992ce2bd3711cf3da025"
  	*     "allOthers": "all properties of visbo project version"
	 	*   }]
	 	* }
		*/
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			console.log("Get Visbo Project for userid %s email %s and vc %s ", userId, useremail, req.params.vpvid);		// MS Log

			var queryVPV = VisboProjectVersion.find({'users.email': useremail, '_id':req.params.vpvid});
			queryVPV.select('name users updatedAt createdAt');
			queryVPV.exec(function (err, listVPV) {
				if (err) {
					return res.status(404).send({
						state: 'failure',
						message: 'Error getting VisboProjectVersions',
						error: err
					});
				}
				// console.log("Found VCs %d %O", listVPV.length, listVPV);		// MS Log
				return res.status(200).send({
					state: 'success',
					message: 'Returned Visbo Projects',
					vpv: listVPV
				});
			});
		})

		/**
		 * @api {put} /vpv/:projectsid Update Visbo Project
		 * @apiVersion 0.0.1
		 * @apiGroup VisboProjectVersion
		 * @apiName UpdateVisboProjectVersions
		 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
		 * @apiError NoPermission No permission to update this VisboProjectVersion HTTP 403
		 * @apiPermission user must be authenticated and user must have Admin permission for this VP (MS Todo)
		 * @apiHeader {String} access-key User authentication token.
		 * @apiExample Example usage:
		 *   url: http://localhost:3484/vpv/5aada025
		 * {
		 *   "name":"My first Visbo Project Renamed",
		 *   "allOthers": "all properties of visbo project version"
		 * }
		 * @apiSuccessExample {json} Success-Response:
		 *     HTTP/1.1 200 OK
		 * {
		 *  "state":"success",
		 *  "message":"Successfully updated VisboProjectVersion Renamed",
		 *  "vpv":[{
		 *   "__v":0,
		 *   "_id":"vpv5aaf992ce2bd3711cf3da025",
		 *   "updatedAt":"2018-03-19T11:04:12.094Z",
		 *   "createdAt":"2018-03-19T11:04:12.094Z",
		 *   "name":"My first Visbo Project Renamed",
		 *   "vpid": "vp5aaf992ce2bd3711cf3da025"
		 *   "allOthers": "all properties of visbo project version"
		 *  }]
		 * }
		 */
		.put(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			console.log("PUT/Save Visbo Project for userid %s email %s and vpv %s ", userId, useremail, req.params.vpvid);		// MS Log

			var queryVPV = VisboProjectVersion.findOne({'_id':req.params.vpvid, 'users.email': useremail, 'users.role' : 'Admin' });
			queryVPV.select('name users updatedAt createdAt');
			queryVPV.exec(function (err, oneVPV) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Visbo Projects',
						error: err
					});
				}
				if (!oneVPV) {
					return res.status(500).send({
						state: 'failure',
						message: 'No Visbo Project or no Permission'
					});
				}
				console.log("PUT/Save Visbo Project %O ", oneVPV);		// MS Log
				oneVPV.name = req.body.name;
				// MS Todo update other properties also

				oneVPV.save(function(err, oneVPV) {
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
						vpv: [ oneVPV ]
					});
				});
			});
		})

	/**
		* @api {delete} /vpv/:vpvid Delete a Visbo Projects
		* @apiVersion 0.0.1
		* @apiGroup VisboProjectVersion
		* @apiName DeleteVisboProject
		* @apiHeader {String} access-key User authentication token.
		* @apiPermission user must be authenticated and user must have Admin permission to access the VisboProjectVersion
		* @apiError NotAuthenticated no valid token HTTP 401
		* @apiError NoPermission user does not have access to the VisboProjectVersion as Admin HTTP 403
		* @apiError NotFound VisboProjectVersion does not exist HTTP 404
		* @apiError ServerIssue No DB Connection HTTP 500
		* @apiExample Example usage:
		*   url: http://localhost:3484/vpv/5aada025
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
			console.log("DELETE Visbo Project for userid %s email %s and vc %s ", userId, useremail, req.params.vpvid);		// MS Log

			var queryVPV = VisboProjectVersion.findOne({'_id':req.params.vpvid, 'users.email': useremail, 'users.role' : 'Admin' });
			queryVPV.select('name users updatedAt createdAt');
			queryVPV.exec(function (err, oneVPV) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Visbo Projects',
						error: err
					});
				}
				if (!oneVPV) {
					return res.status(500).send({
						state: 'failure',
						message: 'No Visbo Project or no Permission'
					});
				}
				console.log("Delete Visbo Project %s %O", req.params.vpvid, oneVPV);		// MS Log

				oneVPV.remove(function(err, empty) {
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
