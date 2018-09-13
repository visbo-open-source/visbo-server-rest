var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var moment = require('moment');
var audit = require('./../components/visboAudit');
var VisboAudit = mongoose.model('VisboAudit');

var logModule = "AUDIT";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

function visboAudit(tokens, req, res) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	if (tokens.method(req, res) == "GET") {
		// return;
	}

	var auditEntry = new VisboAudit();
	auditEntry.action = tokens.method(req, res);
	auditEntry.url = tokens.url(req, res);
	if (req.auditDescription) {
		auditEntry.actionDescription = req.auditDescription
	} else {
		auditEntry.actionDescription = auditEntry.action
		var command = auditEntry.url.slice(0, auditEntry.url.indexOf("/", 1));
		command = command.slice(0, command.indexOf("?", 0));
		logger4js.debug("VisboAudit Description %s %s", auditEntry.url, command);
	}
	if (req.auditInfo) {
		auditEntry.actionInfo = req.auditInfo
	}
	auditEntry.user = {};
	if (req.decoded && req.decoded._id) {
		auditEntry.user.userId = req.decoded._id;
		auditEntry.user.email = req.decoded.email;
	} else if (req.body && req.body.email) {
		auditEntry.user.email = req.body.email
	} else {
		auditEntry.user.email = 'Unknown'
	}
	auditEntry.vpv = {};
	if (req.oneVPV) {
			auditEntry.vpv.vpvid = req.oneVPV._id;
			auditEntry.vpv.name = req.oneVPV.name;
			if (!auditEntry.actionInfo) auditEntry.actionInfo = auditEntry.vpv.name
	}
	auditEntry.vp = {};
	if (req.oneVP) {
			auditEntry.vp.vpid = req.oneVP._id;
			auditEntry.vp.name = req.oneVP.name;
			if (auditEntry.action != 'GET') auditEntry.vp.vpjson = JSON.stringify(req.oneVP);
			if (!auditEntry.actionInfo) auditEntry.actionInfo = auditEntry.vp.name
	}
	auditEntry.vc = {};
	if (req.oneVC) {
			auditEntry.vc.vcid = req.oneVC._id;
			auditEntry.vc.name = req.oneVC.name;
			if (auditEntry.action != 'GET') auditEntry.vc.vcjson = JSON.stringify(req.oneVC);
			if (!auditEntry.actionInfo) auditEntry.actionInfo = auditEntry.vc.name
	}

	// set the correct ip in case of NGINX Reverse Proxy
	auditEntry.ip = req.headers["x-real-ip"] || req.headers["X-Real-IP"] || req.ip;
	auditEntry.userAgent = req.get('User-Agent');
	auditEntry.result = {};
	auditEntry.result.time = Math.round(tokens['response-time'](req, res))
	auditEntry.result.status = tokens.status(req, res);
	auditEntry.save(function(err, auditEntryResult) {
		if (err) {
			logger4js.error("VisboAudit failed to save %O", auditEntry);
		}
	});

	logger4js.debug("VisboAudit %s %s", auditEntry.url, auditEntry.result.status);
}

module.exports = {
	visboAudit: visboAudit
};
