var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;

var assert = require('assert');
var auth = require('./../components/auth');
var VisboAudit = mongoose.model('VisboAudit');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifySysAdmin);

/////////////////
// Audit API
// /audit
/////////////////

router.route('/')
	/**
	* @api {get} /vc Get Audit Trail
	* @apiVersion 1.0.0
	* @apiGroup Audit
	* @apiName GetAudit
	* @apiHeader {String} access-key User authentication token.
	* @apiDescription Get retruns a limited number of audit trails
	* @apiPermission user must be authenticated and needs to have System Admin Permission
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError NotPermission user is not member of system Admin HTTP 403
	* @apiError ServerIssue No DB Connection HTTP 500
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
	var sysAdminRole = req.decoded.status ? req.decoded.status.sysAdminRole : undefined;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	req.auditDescription = 'Visbo Audit';
	req.auditInfo = 'System';

	logger4js.info("Get Audit Trail for userid %s email %s Admin %s", userId, useremail, sysAdminRole);

	// now fetch all entries system wide
	var query = {};
	var from, to, maxcount = 1000;
	logger4js.debug("Get Audit Trail DateFilter from %s to %s", req.query.from, req.query.to);
	if (req.query.from && Date.parse(req.query.from)) from = new Date(req.query.from)
	if (req.query.to && Date.parse(req.query.to)) to = new Date(req.query.to)
	if (req.query.maxcount) maxcount = Number(req.query.maxcount);
	// no date is set to set to to current Date and recalculate from afterwards
	if (!from && !to) to = new Date();
	logger4js.trace("Get Audit Trail at least one value is set %s %s", from, to);
	if (!from) {
		from = new Date(to);
		from.setDate(from.getDate()-1)
	}
	if (!to) {
		to = new Date(from);
		to.setDate(to.getDate()+1)
	}
	logger4js.trace("Get Audit Trail DateFilter after recalc from %s to %s", from, to);
	query = {"createdAt": {"$gte": from, "$lt": to}};

	VisboAudit.find(query)
	.limit(maxcount)
	.sort({createdAt: -1})
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
			audit: listVCAudit
		});
	});
})

module.exports = router;
