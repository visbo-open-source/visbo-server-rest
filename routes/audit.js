var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;

var assert = require('assert');
var auth = require('./../components/auth');
var VisboAudit = mongoose.model('VisboAudit');
var verifyVc = require('./../components/verifyVc');

var Const = require('../models/constants')
var constPermSystem = Const.constPermSystem

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// Register the VC middleware to check that the user has access to the System Admin
router.use('/', verifyVc.getSystemGroups);

/////////////////
// Audit API
// /audit
/////////////////

router.route('/')
	/**
	* @api {get} /audit Get Audit Trail
	* @apiVersion 1.0.0
	* @apiGroup Visbo System
	* @apiName GetAudit
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get retruns a limited number of audit trails
	* @apiPermission user must be authenticated and needs to have System Admin Permission
	* @apiParam (Parameter) {Date} [from]  Request Audits with dates >= from Date
	* @apiParam (Parameter) {Date} [to]  Request Audits with dates <= to Date
	* @apiParam (Parameter) {text} [text] Request Audit Trail containing text in Detail.
	* @apiParam (Parameter) {text} [action] Request Audit Trail only for specific ReST Command (GET, POST, PUT DELETE).
	* @apiParam (Parameter) {number} [maxcount] Request Audit Trail maximum entries.
	* @apiError {number} 401 Not Authenticated, no valid token
	* @apiError {number} 403 No Permission, user has no View & Audit Permission
	* @apiError {number} 500 ServerIssue No DB Connection
	* @apiExample Example usage:
	* url: http://localhost:3484/audit
	* url: http://localhost:3484/audit?from="2018-09-01"&to="2018-09-15"
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state": "success",
	*   "message": "Returned Audit Trail",
	*   "audit":[{
	*      "_id": "audit541c754feaa",
	*      "updatedAt": "2018-03-16T12:39:54.042Z",
	*      "createdAt": "2018-03-12T09:54:56.411Z",
	*      "XXXXXXXX": "XXXXXXXX"
	*   }]
	* }
	*/
// Get Audit Trail
.get(function(req, res) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	req.auditDescription = 'Visbo Audit';
	req.auditSysAdmin = true;
	req.auditInfo = 'System';

	logger4js.info("Get Audit Trail for userid %s email %s ", userId, useremail);

	if (!(req.combinedPerm.system & constPermSystem.ViewAudit)) {
		logger4js.debug("No Permission to View System Audit for user %s", userId);
		return res.status(403).send({
			state: 'failure',
			message: 'No Permission to View System Audit'
		});
	}
	// now fetch all entries system wide
	var query = {};
	var from, to, maxcount = 1000, action;
	logger4js.debug("Get Audit Trail DateFilter from %s to %s", req.query.from, req.query.to);
	if (req.query.from && Date.parse(req.query.from)) from = new Date(req.query.from)
	if (req.query.to && Date.parse(req.query.to)) to = new Date(req.query.to)
	if (req.query.maxcount) maxcount = Number(req.query.maxcount) || 10;
	if (req.query.action) action = req.query.action.trim();
	// no date is set to set to to current Date and recalculate from afterwards
	if (!to) to = new Date();
	if (!from) {
		from = new Date(to);
		from.setDate(from.getDate()-7)
	}
	logger4js.trace("Get Audit Trail DateFilter after recalc from %s to %s", from, to);
	query = {"createdAt": {"$gte": from, "$lt": to}};
	if (action) {
		query.action = action;
	}
	var queryListCondition = [];
	if (req.query.text) {
		var textCondition = [];
		var text = req.query.text;
		var expr = new RegExp(text, "i");
		if (mongoose.Types.ObjectId.isValid(req.query.text)) {
			logger4js.debug("Get Audit Search for ObjectID %s", text);
			textCondition.push({"vc.vcid": text});
			textCondition.push({"vp.vpid": text});
			textCondition.push({"vpv.vpvid": text});
			textCondition.push({"user.userId": text});
		} else {
			textCondition.push({"user.email": expr});
			textCondition.push({"vc.name": expr});
			textCondition.push({"vp.name": expr});
			textCondition.push({"vpv.name": expr});
			textCondition.push({"url": expr});
			textCondition.push({"action": expr});
			textCondition.push({"actionInfo": expr});
			textCondition.push({"actionDescription": expr});
			textCondition.push({"userAgent": expr});
		}
		textCondition.push({"vc.vcjson": expr});
		textCondition.push({"vp.vpjson": expr});
		textCondition.push({"url": expr});
		queryListCondition.push({"$or": textCondition})
	}
	var ttlCondition = [];
	ttlCondition.push({"ttl": {$exists: false}});
	ttlCondition.push({"ttl": {$gt: new Date()}});
	queryListCondition.push({"$or": ttlCondition})

	query["$and"] = queryListCondition;
	logger4js.debug("Prepared Audit Query: %s", JSON.stringify(query));

	VisboAudit.find(query)
	.limit(maxcount)
	.sort({createdAt: -1})
	.lean()
	.exec(function (err, listVCAudit) {
		if (err) {
			logger4js.fatal("System Audit Get DB Connection ", err);
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting System Audit',
				error: err
			});
		}
		logger4js.debug("Found VC Audit Logs %d", listVCAudit.length);
		for(var i = 0; i < listVCAudit.length; i++) {
			if (!listVCAudit[i].user || !listVCAudit[i].user.email) {
				listVCAudit[i].user = {"email": "unknown"};
			}
			if (!listVCAudit[i].actionInfo && listVCAudit[i].vpv && listVCAudit[i].vpv.name) listVCAudit[i].actionInfo = listVCAudit[i].vpv.name
			if (!listVCAudit[i].actionInfo && listVCAudit[i].vp && listVCAudit[i].vp.name) listVCAudit[i].actionInfo = listVCAudit[i].vp.name
			if (!listVCAudit[i].actionInfo && listVCAudit[i].vc && listVCAudit[i].vc.name) listVCAudit[i].actionInfo = listVCAudit[i].vc.name
			if (!listVCAudit[i].actionDescription) listVCAudit[i].actionDescription = listVCAudit[i].action

		}
		return res.status(200).send({
			state: 'success',
			message: 'Returned System Audit',
			count: listVCAudit.length,
			audit: listVCAudit
		});
	});
})

module.exports = router;
