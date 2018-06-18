var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var lock = require('./../components/lock');
var variant = require('./../components/variant');
var verifyVpv = require('./../components/verifyVpv');
var User = mongoose.model('User');
var VisboCenter = mongoose.model('VisboCenter');
var VisboProject = mongoose.model('VisboProject');
var Lock = mongoose.model('Lock');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');

var logging = require('./../components/logging');
var logModule = "VPV";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// register the VPV middleware to check that the user has access to the VPV
router.use('/', verifyVpv.verifyVpv);

/////////////////
// Visbo Project Versions API
// /vpv
/////////////////

router.route('/')

	/**
	* @api {get} /vpv Get Versions
	* @apiVersion 0.0.1
	* @apiGroup Visbo Project Version
	* @apiName GetVisboProjectVersions
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get versions returns for all VisboProjects, the user has access permission to, the latest VisboProjectVersion
	*
	* In case of success it delivers an array of VPVs, the array contains in each element a VPV.
	* Instead of delivering the whole VPV document a reduced document is delivered, to get the full document the client
	* has to specify the query parameter longList.
	*
	* With an additional parameter refDate only the latest version before the reference date for each selected project is delivered,
	* in case refDate ist not specified the current date&time is used.
	*
	* With an additional query paramteter vpid=vp5aaf992 the system restricts the list of versions to the specified VP,
	* if no refDate is specified the system delivers all versions of this project.
	*
	* With an additional query paramteter variantName the system restricts the list of versions to the specified VariantName,
	* to query only the main version of a project, use variantName= in the query string.
	*
	* @apiParam {Date} refDate Deliver only the latest Version of the project before the reference date
	* @apiParam {String} vpid Deliver only versions for the specified project
	* @apiParam {String} variantName Deliver only versions for the specified variant
	* @apiParam {String} longList if set deliver all details instead of a short version info for the project version
	* In case a refDate is specified the full blown project version is delivered otherwise a reduced list only
	* @apiPermission user must be authenticated, user must have access to related VisboProject
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/vpv
	*   url: http://localhost:3484/vpv?vpid=vp5c754feaa&refDate=2018-01-01&variantName=Variant1&longList
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
	*     "startDate": "2018-01-01",
	*     "endDate": "2018-12-31",
	*     "ampelStatus": "2",
	*     "variantName": ""
	*   }]
	* }
	*/
	// Get Visbo Project Versions
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		var queryvp = {'users':{ $elemMatch:{'email': useremail, 'role': {$in:['Admin','User']}}}};
		var queryvpv = {};
		var latestOnly = true; 	// as default show latest only project version of all projects
		var longList = false;		// show only specific columns instead of all
		var nowDate = new Date();
		queryvpv.timestamp =  {$lt: nowDate };
		queryvp.deleted = {$exists: false};
		queryvpv.deleted = {$exists: false};
		if (req.query) {
			if (req.query.vpid) {
				queryvp._id = req.query.vpid;
				latestOnly = false // if project is specified show all project versions
			}
			if (req.query.refDate){
				var refDate = new Date(req.query.refDate);
				queryvpv.timestamp =  {$lt: refDate};
				latestOnly = true;
			}
			if (req.query.variantName != undefined){
				logger4js.debug("Variant Query String :%s:", req.query.variantName);
				queryvpv.variantName = req.query.variantName
			}
			if (req.query.longList != undefined){ // user can specify to get the long list with all details for a project version
				longList = true;
			}
		}
		logger4js.info("Get Project Versions for user %s with VP %s/%s, timestamp %O latestOnly %s", userId, queryvp._id, queryvpv.variantName, queryvpv.timestamp, latestOnly);
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
			logger4js.debug("Filter ProjectVersions to %s Projects", listVP.length);
			var vpArray = [];
			var vp;
			for (vp in listVP) {
				vpArray.push(listVP[vp]._id);
			}
			logger4js.trace("Filter Projects %O", vpArray);
			queryvpv.vpid = {$in: vpArray};
			logger4js.debug("VPV query string %s", JSON.stringify(queryvpv));
			var queryVPV = VisboProjectVersion.find(queryvpv);
			if (!longList) {
				// deliver only the short info about project versions
				queryVPV.select('_id vpid name timestamp Erloes startDate endDate status ampelStatus variantName');
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
				logger4js.debug("Found %d Project Versions", listVPV.length);
				// if latestonly, reduce the list and deliver only the latest version of each project and variant
				if (listVPV.length > 1 && latestOnly){
					var listVPVfiltered = [];
					listVPVfiltered.push(listVPV[0]);
					for (let i = 1; i < listVPV.length; i++){
						//compare current item with previous and ignore if it is the same vpid & variantname
						logger4js.debug("compare: :%s: vs. :%s:", JSON.stringify(listVPV[i].vpid), JSON.stringify(listVPV[i-1].vpid), JSON.stringify(listVPV[i].variantName), JSON.stringify(listVPV[i-1].variantName) );
						if (JSON.stringify(listVPV[i].vpid) != JSON.stringify(listVPV[i-1].vpid)
						|| JSON.stringify(listVPV[i].variantName) != JSON.stringify(listVPV[i-1].variantName) ) {
							listVPVfiltered.push(listVPV[i])
							logger4js.debug("compare unequal: ", listVPV[i].vpid != listVPV[i-1].vpid);
						}
					}
					logger4js.debug("Found %d Project Versions after Filtering", listVPVfiltered.length);
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
	 * @apiDescription Post creates a new Visbo Project Version.
	 * The user needs to have Admin permission in the Referenced Project.
	 * Visbo Project Version Properties like _id, name and timestamp are overwritten by the system
	 * @apiError NotAuthenticated Not Authenticated The <code>access-key</code> was not delivered or is outdated HTTP 401
	 * @apiError NoPermission No permission to create a VisboProjectVersion HTTP 403
	 * @apiError Duplicate VisboProjectVersion does already exist HTTP 409
	 * @apiError HTTP-404 VisboCenter does not exist or user does not have permission to create project Version
	 * @apiPermission user must be authenticated and user must have permission to create a VP
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
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		var vpid = req.body.vpid || 0;
		var variantName = req.body.variantName || "";
		var variantIndex = -1;

		logger4js.info("Post a new Visbo Project Version for user %s with name %s in VisboProject %s", useremail, req.body.name, vpid);
		var newVPV = new VisboProjectVersion();
		// check that vpid ist set and exists and user has Admin permission
		if (!vpid) {
			return res.status(400).send({
				state: 'failure',
				message: 'No Visbo Project ID defined'
			});
		}
		VisboProject.findOne({'_id': vpid, 'users.email': useremail}, function (err, oneVP) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Internal Server Error with DB Connection',
					error: err
				});
			}
			if (!oneVP) {
				return res.status(403).send({
					state: 'failure',
					message: 'Visbo Project not found or no Permission'
				});
			}
			req.oneVP = oneVP;
			var allowPost = false
			var variantExists = true;

			if (variantName != "") {
				// check that the Variant exists
				variantExists = false;
				variantIndex = variant.findVariant(req.oneVP, variantName)
				if (variantIndex < 0) {
					return res.status(401).send({
						state: 'failure',
						message: 'Visbo Project variant does not exist',
						vp: [req.oneVP]
					});
				};
			}
			// check if the version is locked
			if (lock.lockedVP(oneVP, useremail, req.body.variantName).locked) {
				return res.status(401).send({
					state: 'failure',
					message: 'Visbo Project locked',
					vp: [req.oneVP]
				});
			}
			// user does not have admin permission and does not own the variant
			if (req.oneVPisAdmin == false && variantName != "" && req.oneVP.variant[variantIndex].email != useremail) {
				return res.status(403).send({
					state: 'failure',
					message: 'Visbo Project Version no permission to update',
					vp: [req.oneVP]
				});
			}
			logger4js.debug("User has permission to create a new Version in %s Variant :%s:", oneVP.name, variantName);

			// keep unchangable attributes
			newVPV.name = oneVP.name;
			newVPV.vpid = oneVP._id;
			newVPV.variantName = variantName;
			newVPV.timestamp = req.body.timestamp || Date();

			// copy all attributes
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

			logger4js.debug("Create VisboProjectVersion in Project %s with Name %s and timestamp %s", newVPV.vpid, newVPV.name, newVPV.timestamp);
			newVPV.save(function(err, oneVPV) {
				if (err) {
					return res.status(500).send({
						state: "failure",
						message: "database error, failed to create VisboProjectVersion",
						error: err
					});
				}
				req.oneVPV = oneVPV;
				// update the version count of the base version or the variant
				if (variantName == "") {
					req.oneVP.vpvCount = req.oneVP.vpvCount == undefined ? 1 : req.oneVP.vpvCount + 1;
				} else {
					req.oneVP.variant[variantIndex].vpvCount += 1;
				}
				logger4js.debug("Update VisboProject %s count %d %O", req.oneVP.name, req.oneVP.vpvCount, req.oneVP.variant);
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
					return res.status(200).send({
						state: "success",
						message: "Successfully created new Project Version",
						vpv: [ oneVPV ]
					});
				})
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
	* @apiDescription Get returns a specific VisboProjectVersion the user has access permission to the VisboProject
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
	// Get a specific Visbo Project Version
	.get(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		logger4js.info("Get Visbo Project Version for userid %s email %s and vpv %s :%O ", userId, useremail, req.params.vpvid);
		return res.status(200).send({
			state: 'success',
			message: 'Returned Visbo Project Version',
			vpv: [req.oneVPV]
		});
	})

/**
	* @api {delete} /vpv/:vpvid Delete specific Version
	* @apiVersion 0.0.1
	* @apiGroup Visbo Project Version
	* @apiName DeleteVisboProjectVersion
	* @apiDescription Deletes a specific Visbo Project Version.
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
	*   "message":"Deleted Visbo Project Version"
	* }
	*/
	// delete a Visbo Project Version
	.delete(function(req, res) {
		var userId = req.decoded._id;
		var useremail = req.decoded.email;
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		logger4js.info("DELETE Visbo Project Version for userid %s email %s and vc %s ", userId, useremail, req.params.vpvid);

		logger4js.debug("DELETE Visbo Project Version DETAILS ", req.oneVPV._id, req.oneVPV.name, req.oneVPV.variantName);
		var variantExists = false;
		if (variantName != "") {
			for (var variantIndex = 0; variantIndex < req.oneVP.variant.length; variantIndex++) {
				if (req.oneVP.variant[variantIndex].variantName == variantName && (req.oneVP.variant[variantIndex].email != useremail || req.oneVPisAdmin == false)) {
					variantExists = true;
					break;
				}
			}
		}
		// MS TODO Improve the Check that the User can delete his variant
		if (!req.oneVPisAdmin) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Admin Permission',
				vp: [req.oneVP]
			});
		}
		// check if the project is locked
		if (lock.lockedVP(req.oneVP, useremail, req.oneVPV.variantName).locked) {
			return res.status(401).send({
				state: 'failure',
				message: 'Visbo Project locked',
				vp: [req.oneVP]
			});
		}
		logger4js.debug("Delete Visbo Project Version %s %s", req.params.vpvid, req.oneVPV._id);
		var variantName = req.oneVPV.variantName;

		req.oneVPV.deleted = {deletedAt: Date(), byParent: false }
		req.oneVPV.save(function(err, oneVPV) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error deleting Visbo Project Version',
					error: err
				});
			}
			req.oneVPV = oneVPV;
			if (variantName == "") {
				req.oneVP.vpvCount = req.oneVP.vpvCount == undefined ? 0 : req.oneVP.vpvCount - 1;
			} else if (variantExists) {
				req.oneVP.variant[variantIndex].vpvCount -= 1;
			}

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
				return res.status(200).send({
					state: "success",
					message: "Successfully deleted Project Version",
					vp: [ req.oneVP ]
				});
			})
		});
	})

module.exports = router;
