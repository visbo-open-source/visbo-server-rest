var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var lock = require('./../components/lock');
var logging = require('./../components/logging');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var Lock = mongoose.model('Lock');
var VisboProjectVersion = mongoose.model('Project');
var moment = require('moment');

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);

/////////////////
// Visbo Project Versions API
// /vpv
/////////////////

var debuglevel = 9;

router.route('/')

	/**
	* @api {get} /vpv Get Versions
	* @apiVersion 0.0.1
	* @apiGroup Visbo Project Version
	* @apiName GetVisboProjectVersions
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription GET /vpv retruns for all VisboProjects, the user has access permission to, the latest VisboProjectVersion
	* In case of success it delivers an array of VPVs, the array contains in each element a VPV.
	* Instead of delivering the whole VPV document a reduced document is delivered, to get the full document the client
	* has to ask for a specific vpvid with get vpv/:vpvid.
	* With an additional query paramteter ?vpid=vp5aaf992 the system restricts the list of VPV to the specified VP.
	* If no vpid is delivered as query parameter only the latest version of each VP is delivered
	* With an additional parameter refdate only the latest version before the reference date for each selected project is delivered.
	* In case a refdate is specified the full blown project version is delivered otherwise a reduced list only
	* @apiPermission user must be authenticated, user must have access to related VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vpv?vpid=vp5c754feaa
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Returned Visbo Project Versions",
	*   "vpv":[{
	*     "_id":"vpv5c754feaa",
	*     "name":"Project Name",
	*     "vpid": "vp5c754feaa",
	*     "timestamp": "2018-01-01",
	*     "Erloes": "100",
	*     "endDate": "2018-12-31",
	*     "variantName": ""
	*   }]
	* }
	*/
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		var queryvp = {'users.email': useremail, 'users.role':{$in:['Admin','User']}};
		var queryvpv = {};
		var latestOnly = false;
		var nowDate = new Date();
		if (req.query && req.query.vpid)
			queryvp._id = req.query.vpid;
		else {
			latestOnly = true //no project specified show latest only project version of all projects
		}
		if (req.query && req.query.refdate){
			queryvpv.timestamp =  {$lt: Date(req.query.refdate)};
			latestOnly = true;
		} else {
			queryvpv.timestamp =  {$lt: nowDate }
		}
		debuglog(debuglevel, 1, "Get Project Versions for user %s with VP %s and timestamp %O latestOnly %s", userId, queryvp._id, queryvpv.timestamp, latestOnly);
		var queryVP = VisboProject.find(queryvp)
		queryVP.select('_id name');
		queryVP.exec(function (err, listVP) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			};
			debuglog(debuglevel, 5, "Filter ProjectVersions to %s Projects", listVP.length);
			var vpArray = [];
			var vp;
			for (vp in listVP) {
				vpArray.push(listVP[vp]._id);
			}
			debuglog(debuglevel, 9, "Filter Projects %O", vpArray);
			queryvpv.vpid = {$in: vpArray};
			debuglog(debuglevel, 5, "VPV query string %s", JSON.stringify(queryvpv));
			var queryVPV = VisboProjectVersion.find(queryvpv);
			if (latestOnly == false) {
				// deliver only the short info about project versions
				queryVPV.select('_id vpid name timestamp Erloes startdate endDate ampelStatus variantName');
			}
			queryVPV.sort('vpid name variantName -timestamp')
			queryVPV.exec(function (err, listVPV) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Internal Server Error with DB Connection',
						error: err
					});
				};
				debuglog(debuglevel, 2, "Found %d Project Versions", listVPV.length);
				// if latestonly, reduce the list and deliver only the latest version of each project and variant
				if (listVPV.length > 1 && latestOnly){
					var listVPVfiltered = [];
					listVPVfiltered.push(listVPV[0]);
					for (let i = 1; i < listVPV.length; i++){
						//compare current ite with previous and ignore if it is the same vpid & variantname
						debuglog(debuglevel, 9, "compare: :%s: vs. :%s:", JSON.stringify(listVPV[i].vpid), JSON.stringify(listVPV[i-1].vpid), JSON.stringify(listVPV[i].variantName), JSON.stringify(listVPV[i-1].variantName) );
						if (JSON.stringify(listVPV[i].vpid) != JSON.stringify(listVPV[i-1].vpid)
						|| JSON.stringify(listVPV[i].variantName) != JSON.stringify(listVPV[i-1].variantName) ) {
							listVPVfiltered.push(listVPV[i])
							debuglog(debuglevel, 9, "compare unequal: ", listVPV[i].vpid != listVPV[i-1].vpid);
						}
					}
					debuglog(debuglevel, 2, "Found %d Project Versions after Filtering", listVPVfiltered.length);
					return res.status(200).send({
						state: 'success',
						message: 'Returned Visbo Project Versions',
						vpv: listVPVfiltered
					});
				} else {
					return res.status(200).send({
						state: 'success',
						message: 'Returned Visbo Project Versions',
						vpv: listVPV
					});
				}
			});
		});
	})

	/**
	 * @api {post} /vpv Create a Version
	 * @apiVersion 0.0.1
	 * @apiGroup Visbo Project Version
	 * @apiName CreateVisboProjectVersions
	 * @apiDescription POST /vpv creates a new Visbo Project Version.
	 * The user needs to have Admin permission in the Referenced Project.
	 * Visbo Project Version Properties like _id, name and timestamp are overwritten by the system
	 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	 * @apiError NoPermission No permission to create a VisboProjectVersion HTTP 403
	 * @apiError Duplicate VisboProjectVersion does already exist HTTP 409
	 * @apiError HTTP-404 VisboCenter does not exist or user does not have permission to create project Version
	 * @apiPermission user must be authenticated and user must have permission to create a VP (MS Todo)
	 * @apiHeader {String} access-key User authentication token.
	 * @apiExample Example usage:
	 *   url: http://localhost:3484/vpv
	 * {
	 *  "vpid": "vp5c754feaa"
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
	 *   "_id":"vpv5c754feaa",
	 *	 "name":"My first Visbo Project Version",
	 *   "vpid": "vp5c754feaa"
	 *   "allOthers": "all properties of visbo project version"
	 *  }]
	 * }
	 */
	.post(function(req, res) {
		var userId = req.decoded._id;
		var useremail  = req.decoded.email;
		var vpid = ( !req.body && !req.body.vpid ) ? null : req.body.vpid
		debuglog(debuglevel, 1, "Post a new Visbo Project Version for user %s with name %s in VisboProject %s", useremail, req.body.name, vpid);		// MS Log
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
											}, function (err, oneVP) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			}
			if (!oneVP) {
				return res.status(404).send({
					state: 'failure',
					message: 'Visbo Project not found or no Admin'
				});
			};
			debuglog(debuglevel, 5, "User has permission to create a Version in  %s", oneVP.name);
			// check if the version is locked
			if (lock.lockedVP(oneVP, useremail, req.body.variantName)) {
				return res.status(401).send({
					state: 'failure',
					message: 'Visbo Project locked',
					vp: [oneVP]
				});
			}
			// keep unchangable attributes
			newVPV.name = oneVP.name;
			newVPV.vpid = oneVP._id;
			// copy all attributes
			newVPV.variantName = req.body.variantName;
			newVPV.variantDescription = req.body.variantDescription;
			newVPV.Risiko = req.body.Risiko;
			newVPV.StrategicFit = req.body.StrategicFit;
			newVPV.customDblFields = req.body.customDblFields;
			newVPV.customStringFields = req.body.customStringFields;
			newVPV.customBoolFields = req.body.customBoolFields;
			newVPV.Erloes = req.body.Erloes;
			newVPV.leadPerson = req.body.leadPerson;
			newVPV.tfSpalte = req.body.tfSpalte;
			newVPV.tfZeile = req.body.tfZeile;
			newVPV.startDate = req.body.startDate;
			newVPV.endDate = req.body.endDate;
			newVPV.earliestStart = req.body.earliestStart;
			newVPV.earliestStartDate = req.body.earliestStartDate;
			newVPV.latestStart = req.body.latestStart;
			newVPV.latestStartDate = req.body.latestStartDate;
			newVPV.status = req.body.status;
			newVPV.ampelStatus = req.body.ampelStatus;
			newVPV.ampelErlaeuterung = req.body.ampelErlaeuterung;
			newVPV.farbe = req.body.farbe;
			newVPV.Schrift = req.body.Schrift;
			newVPV.Schriftfarbe = req.body.Schriftfarbe;
			newVPV.VorlagenName = req.body.VorlagenName;
			newVPV.Dauer = req.body.Dauer;
			newVPV.AllPhases = req.body.AllPhases;
			newVPV.hierarchy = req.body.hierarchy;
			newVPV.volumen = req.body.volumen;
			newVPV.complexity = req.body.complexity;
			newVPV.description = req.body.description;
			newVPV.businessUnit = req.body.businessUnit;

			newVPV.timestamp = Date();

			debuglog(debuglevel, 5, "Create VisboProjectVersion in Project %s with Name %s and timestamp %s", newVPV.vpid, newVPV.name, newVPV.timestamp);
			newVPV.save(function(err, oneVPV) {
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
					vpv: [ oneVPV ]
				});
			});
		});
	})

	router.route('/:vpvid')
	 /**
	 	* @api {get} /vpv/:vpvid Get specific Version
	 	* @apiVersion 0.0.1
	 	* @apiGroup Visbo Project Version
	 	* @apiName GetVisboProjectVersion
	 	* @apiHeader {String} access-key User authentication token.
		* @apiDescription GET /vpv/:vpvid retruns a specific VisboProjectVersion the user has access permission to the VisboProject
		* In case of success it delivers an array of VPVs, the array contains 0 or 1 element with a VPV
	 	* @apiPermission user must be authenticated and user must have permission to access the VisboProjectVersion
	 	* @apiError NotAuthenticated no valid token HTTP 401
		* @apiError NoPermission user does not have access to the VisboProjectVersion HTTP 403
	 	* @apiError ServerIssue No DB Connection HTTP 500
	 	* @apiExample Example usage:
	 	*   url: http://localhost:3484/vpv/vpv5aada025
	 	* @apiSuccessExample {json} Success-Response:
	 	* HTTP/1.1 200 OK
	 	* {
	 	*   "state":"success",
	 	*   "message":"Returned Visbo Project Versions",
	 	*   "vpv": [{
	 	*     "_id":"vpv5c754feaa",
  	*     "name":"My new Visbo Project Version",
		*     "updatedAt":"2018-03-19T11:04:12.094Z",
  	*     "createdAt":"2018-03-19T11:04:12.094Z",
  	*     "vpid": "vp5c754feaa"
  	*     "allOthers": "all properties of visbo project version"
	 	*   }]
	 	* }
		*/
		.get(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var queryvp = {'users.email': useremail, 'users.role':{$in:['Admin','User']}};
			var queryvpv = {'_id': req.params.vpvid};
			debuglog(debuglevel, 1, "Get Visbo Project Version for userid %s email %s and vpv %s :%O ", userId, useremail, req.params.vpvid, queryvpv);		// MS Log
			var queryVPV = VisboProjectVersion.findOne(queryvpv);
			queryVPV.exec(function (err, oneVPV) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Internal Server Error with DB Connection',
						error: err
					});
				};
				debuglog(debuglevel, 2, "Found specific Project Versions for Project %O", oneVPV);
				if (!oneVPV){
					return res.status(404).send({
						state: 'failure',
						message: 'Visbo Project Version not found or no Permission',
						error: err
					});
				}
				// check access Permission
				queryvp._id = oneVPV.vpid;
				var queryVP = VisboProject.findOne(queryvp)
				queryVP.select('_id name');
				queryVP.exec(function (err, oneVP) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Internal Server Error with DB Connection',
							error: err
						});
					};
					debuglog(debuglevel, 5, "Found %s Project with Permission", oneVP._id);
					if (!oneVP){
						return res.status(404).send({
							state: 'failure',
							message: 'Visbo Project Version not found or no Permission',
							error: err
						});
					} else {
						return res.status(200).send({
							state: 'success',
							message: 'Returned Visbo Project Version',
							vpv: [oneVPV]
						});
					}
				});
			});
		})

		/**
		 * @ api {put} /vpv/:projectsid Update Version
		 * @ apiVersion 0.0.1
		 * @ apiGroup Visbo Project Version
		 * @ apiName UpdateVisboProjectVersions
		 * @ apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
		 * @ apiError NoPermission No permission to update this VisboProjectVersion HTTP 403
		 * @ apiPermission user must be authenticated and user must have Admin permission for this VP (MS Todo)
		 * @ apiHeader {String} access-key User authentication token.
		 * @ apiExample Example usage:
		 *   url: http://localhost:3484/vpv/vpv5c754feaa
		 * {
		 *   "name":"My first Visbo Project Version Renamed",
		 *   "allOthers": "all properties of visbo project version"
		 * }
		 * @ apiSuccessExample {json} Success-Response:
		 *     HTTP/1.1 200 OK
		 * {
		 *  "state":"success",
		 *  "message":"Successfully updated VisboProjectVersion Renamed",
		 *  "vpv":[{
		 *   "__v":0,
		 *   "_id":"vpv5c754feaa",
		 *   "updatedAt":"2018-03-19T11:04:12.094Z",
		 *   "createdAt":"2018-03-19T11:04:12.094Z",
		 *   "name":"My first Visbo Project Version Renamed",
		 *   "vpid": "vp5c754feaa"
		 *   "allOthers": "all properties of visbo project version"
		 *  }]
		 * }
		 */
/*
		.put(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			debuglog(debuglevel, 1, "PUT/Save Visbo Project Version for userid %s email %s and vpv %s not allowed ", userId, useremail, req.params.vpvid);		// MS Log
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to update a Visbo Project Version',
				error: err
			});
			var queryVPV = VisboProjectVersion.findOne({'_id':req.params.vpvid, 'users.email': useremail, 'users.role' : 'Admin' });
			queryVPV.select('name users updatedAt createdAt');
			queryVPV.exec(function (err, oneVPV) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Visbo Project Versions',
						error: err
					});
				}
				if (!oneVPV) {
					return res.status(500).send({
						state: 'failure',
						message: 'No Visbo Project or no Permission'
					});
				}
				debuglog(debuglevel, 5, "PUT/Save Visbo Project %O ", oneVPV);		// MS Log
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
*/

	/**
		* @api {delete} /vpv/:vpvid Delete specific Versions
		* @apiVersion 0.0.1
		* @apiGroup Visbo Project Version
		* @apiName DeleteVisboProjectVersion
		* @apiHeader {String} access-key User authentication token.
		* @apiPermission user must be authenticated and user must have Admin permission to access the VisboProjectVersion
		* @apiError NotAuthenticated no valid token HTTP 401
		* @apiError NoPermission user does not have access to the VisboProjectVersion as Admin HTTP 403
		* @apiError NotFound VisboProjectVersion does not exist HTTP 404
		* @apiError ServerIssue No DB Connection HTTP 500
		* @apiExample Example usage:
		*   url: http://localhost:3484/vpv/vpv5c754feaa
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   "state":"success",
		*   "message":"Deleted Visbo Project Versions"
		* }
		*/
		.delete(function(req, res) {
			var userId = req.decoded._id;
			var useremail = req.decoded.email;
			var queryvp = {'users.email': useremail, 'users.role':{$in:['Admin']}};
			var queryvpv = {'_id': req.params.vpvid};
			debuglog(debuglevel, 1, "DELETE Visbo Project Version for userid %s email %s and vc %s ", userId, useremail, req.params.vpvid);		// MS Log

			// var queryVPV = VisboProjectVersion.findOne({'_id':req.params.vpvid, 'users.email': useremail, 'users.role' : 'Admin' });
			var queryVPV = VisboProjectVersion.findOne(queryvpv);
			queryVPV.select('_id vpid name');
			queryVPV.exec(function (err, oneVPV) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error getting Visbo Project Versions',
						error: err
					});
				}
				if (!oneVPV) {
					return res.status(404).send({
						state: 'failure',
						message: 'No Visbo Project Version found or no Permission'
					});
				}
				// Project Version found check permission against VP and also the lock of VP
				debuglog(debuglevel, 1, "Delete Visbo Project Check Permission for VP %s", oneVPV.vpid);
				// check access Permission
				queryvp._id = oneVPV.vpid;
				var queryVP = VisboProject.findOne(queryvp)
				queryVP.select('_id name');
				queryVP.exec(function (err, oneVP) {
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Internal Server Error with DB Connection',
							error: err
						});
					};
					if (!oneVP){
						return res.status(404).send({
							state: 'failure',
							message: 'Visbo Project Version not found or no Permission',
							error: err
						});
					} else {
						// check if the project is locked
						if (lock.lockedVP(oneVP, useremail, oneVPV.variantName)) {
							return res.status(401).send({
								state: 'failure',
								message: 'Visbo Project locked',
								vp: [oneVP]
							});
						}
						debuglog(debuglevel, 2, "Delete Visbo Project Version %s %O", req.params.vpvid, oneVPV);
						oneVPV.remove(function(err, empty) {
							if (err) {
								return res.status(500).send({
									state: 'failure',
									message: 'Error deleting Visbo Project Version',
									error: err
								});
							}
							return res.status(200).send({
								state: 'success',
								message: 'Deleted Visbo Project Version',
								result: [oneVPV]
							});
						});
					}
				});
			});
		});

module.exports = router;
