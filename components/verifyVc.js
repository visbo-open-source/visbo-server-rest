var mongoose = require('mongoose');
var Const = require('../models/constants')
var constPermSystem = Const.constPermSystem
var constPermVC = Const.constPermVC

var VisboCenter = mongoose.model('VisboCenter');
var VisboGroup = mongoose.model('VisboGroup');

var logModule = "VC";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Generate the Groups where the user is member of System / VC depending on the case
function getAllGroups(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	var baseUrl = req.url.split("?")[0]
	if (baseUrl == '/') {
		// get the VC Groups the user is member of
		// handle sysadmin and systemvc case
		logger4js.trace("Generate VC Groups for user %s for url %s", req.decoded.email, req.url);
		var query = {};
		var acceptEmpty = true;
		query = {'users.userId': userId};	// search for VC groups where user is member
		// Permission check for GET & POST
		if (req.method == "GET") {
			if (req.query.systemvc) {
				query.groupType = 'System';						// search for System Groups only
				query['permission.system'] = { $bitsAllSet: constPermSystem.View }
				// req.query.sysadmin = false; // no special option to get all VCs
			} else if (req.query.sysadmin) {
				query.groupType = 'System';						// search for System Groups only
				query['permission.vc'] = { $bitsAllSet: constPermVC.View }
				acceptEmpty = false;
			} else {
				query.groupType = 'VC';				// search for VC Groups only
				query['permission.vc'] = { $bitsAllSet: constPermVC.View }
			}
		}
		if (req.method == "POST") {
			query.groupType = 'System';						// search for System permission to create a VC
			acceptEmpty = false;
			query['permission.system'] = { $bitsAllSet: constPermSystem.View }
			// query['permission.system'] = { $bitsAllSet: constPermSystem.CreateVC }
		}

		var queryVG = VisboGroup.find(query);
		queryVG.select('name permission vcid')
		queryVG.exec(function (err, listVG) {
			if (err) {
				logger4js.fatal("VC Groups Get DB Connection %O", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting VisboCenters',
					error: err
				});
			}
			logger4js.trace("Found VGs %d", listVG.length);
			// Convert the result to request
			req.permGroups = listVG;
			if (!acceptEmpty && listVG.length == 0) {
				// do not accept requests without a group assignement especially to System Group
				return res.status(403).send({
					state: 'failure',
					message: 'No Visbo Center or no Permission'
				});
			}
			if (req.query.sysadmin) {
				var combinedPerm = {system: 0, vc: 0, vp: 0};
				for (var i=0; i < req.permGroups.length; i++) {
					combinedPerm.system = combinedPerm.system | (req.permGroups[i].permission.system || 0);
					combinedPerm.vc = combinedPerm.vc | (req.permGroups[i].permission.vc || 0);
					combinedPerm.vp = combinedPerm.vp | (req.permGroups[i].permission.vp || 0);
				}
				logger4js.debug("VC Group combined Perm %O", combinedPerm);
				req.combinedPerm = combinedPerm;
			}

			return next();
		});
	} else {
		// not the baseUrl "/" do nothing
		return next();
	}
}

// Generate the Groups where the user is member of System / VC depending on the case
function getVcidGroups(req, res, next, vcid) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	var baseUrl = req.url.split("?")[0]
	var urlComponent = baseUrl.split("/")
	var sysAdmin = req.query.sysadmin ? true : false;

	// get the VC Groups of this VC where the user is member of
	// handle sysadmin case by getting the system groups
	logger4js.debug("Generate VC Groups for vcid %s user %s for url %s sysAdmin %s", vcid, req.decoded.email, req.url, sysAdmin);
	var query = {};
	query = {'users.userId': userId};	// search for VC groups where user is member
	if (sysAdmin) {
		query.groupType = 'System';						// search for System Groups only
		query['permission.system'] = { $bitsAllSet: constPermSystem.View }
		acceptEmpty = false;
	} else {
		query.groupType = 'VC';				// search for VC Groups only
		query['permission.vc'] = { $bitsAllSet: constPermVC.View }
		query.vcid = vcid;
	}
	// if (req.query.systemvc) {
	// 	query.groupType = 'System';						// search for System Groups only
	// 	query['permission.system'] = { $bitsAllSet: constPermSystem.View }
	// 	req.query.sysadmin = false; // no special option to get all VCs
	// }
	logger4js.trace("Search VGs %O", query);

	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid')
	queryVG.exec(function (err, listVG) {
		if (err) {
			logger4js.fatal("VC Groups Get DB Connection %O", err);
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting VisboCenters',
				error: err
			});
		}
		logger4js.debug("Found VGs %d groups %O", listVG.length, listVG);
		// Convert the result to request
		req.permGroups = listVG;
		if (listVG.length == 0) {
			// do not accept requests without a group assignement especially to System Group
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		var checkDeletedVC = false;
		// allow access to GET, PUT & DELETE for VC of deleted VCs if user is sysadmin
		if ((req.method == "GET" || req.method == "DELETE" || req.method == "PUT") &&  urlComponent.length == 2) {
			if (sysAdmin && req.query.deleted) checkDeletedVC = true;
		}
		var query = {};
		// check against the groups
		var vcidList = [];
		var combinedPerm = {system: 0, vc: 0, vp: 0};
		for (var i=0; i < req.permGroups.length; i++) {
			vcidList.push(req.permGroups[i].vcid);
			combinedPerm.system = combinedPerm.system | (req.permGroups[i].permission.system || 0);
			combinedPerm.vc = combinedPerm.vc | (req.permGroups[i].permission.vc || 0);
			combinedPerm.vp = combinedPerm.vp | (req.permGroups[i].permission.vp || 0);
		}
		if (!sysAdmin) delete combinedPerm.system
		logger4js.debug("Get Visbo Center with %d VC Groups Perm Combined %O", vcidList.length, combinedPerm);
		query._id = vcid;
		// query['deleted.deletedAt'] =  {$exists: checkDeletedVC};
		query.deleted =  {$exists: checkDeletedVC};
		var queryVC = VisboCenter.findOne(query);
		// queryVC.select('name users updatedAt createdAt');
		queryVC.exec(function (err, oneVC) {
			if (err) {
				logger4js.fatal("VC Get with ID DB Connection %O", err);
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
			req.oneVC = oneVC
			req.combinedPerm = combinedPerm;

			logger4js.debug("Found VisboCenter %s Access Permission %O", vcid, req.combinedPerm);
			return next();
		});
	});
}

// Generate the Groups where the user is member of System / VC depending on the case
function getSystemGroups(req, res, next) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	// get the System Groups the user is member of
	logger4js.trace("Generate System Groups for user %s for url %s", req.decoded.email, req.url);
	var query = {};

	query = {'users.userId': userId};	// search for VC groups where user is member
	query.groupType = 'System';						// search for System Groups only
	query['permission.system'] = { $bitsAllSet: constPermSystem.View }

	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid')
	queryVG.exec(function (err, listVG) {
		if (err) {
			logger4js.fatal("VC Groups Get DB Connection %O", err);
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting VisboCenters',
				error: err
			});
		}
		logger4js.debug("Found System VGs %d", listVG.length);
		req.permGroups = listVG;
		var combinedPerm = {system: 0, vc: 0, vp: 0};
		for (var i=0; i < req.permGroups.length; i++) {
			combinedPerm.system = combinedPerm.system | (req.permGroups[i].permission.system || 0);
			combinedPerm.vc = combinedPerm.vc | (req.permGroups[i].permission.vc || 0);
			combinedPerm.vp = combinedPerm.vp | (req.permGroups[i].permission.vp || 0);
		}
		logger4js.debug("Get Visbo System Groups Perm Combined %O", combinedPerm);
		// Convert the result to request
		if (listVG.length == 0) {
			// do not accept requests without a group assignement especially to System Group
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to Access System Admin'
			});
		}
		req.combinedPerm = combinedPerm;
		return next();
	});
}

module.exports = {
	// verifyVc: verifyVc,
	getAllGroups: getAllGroups,
	getVcidGroups: getVcidGroups,
	getSystemGroups: getSystemGroups
};
