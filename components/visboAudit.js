var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var moment = require('moment');
var audit = require('./../components/visboAudit');
var VisboAudit = mongoose.model('VisboAudit');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

function saveAuditEntry(tokens, req, res, factor) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	var auditEntry = new VisboAudit();
	auditEntry.action = tokens.method(req, res);
	auditEntry.url = tokens.url(req, res);
	if (req.auditSysAdmin) auditEntry.sysAdmin = true;
	var baseUrl = auditEntry.url.split("?")[0]
	var urlComponent = baseUrl.split("/")
	var addJSON = undefined;
	if (auditEntry.action != "GET") {
		if (urlComponent.length >= 2) addJSON = urlComponent[1];
		if (urlComponent.length >= 4 && urlComponent[3] == 'group') addJSON = urlComponent[3];
		if (urlComponent.length >= 4 && urlComponent[3] == 'portfolio') addJSON = urlComponent[3];
		if (urlComponent.length >= 4 && urlComponent[3] == 'setting') addJSON = urlComponent[3];
	} else {
		var setTTL = req.auditNoTTL ? false : true;
		if (setTTL) {
			auditEntry.ttl = new Date();
			auditEntry.ttl.setDate(auditEntry.ttl.getDate() + 30)
		}
	}

	if (req.auditDescription) {
		auditEntry.actionDescription = req.auditDescription
	} else {
		auditEntry.actionDescription = auditEntry.action
	}
	logger4js.trace("VisboAudit Description %s url add %s %s %O", auditEntry.url, addJSON, urlComponent.length, urlComponent);
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
	auditEntry.vp = {};
	auditEntry.vc = {};
	if (req.oneVPV) {
			auditEntry.vpv.vpvid = req.oneVPV._id;
			auditEntry.vp.vpid = req.oneVPV.vpid;
			auditEntry.vpv.name = req.oneVPV.name;
			auditEntry.vp.name = req.oneVPV.name;
			if (!auditEntry.actionInfo) {
				auditEntry.actionInfo = req.oneVPV.timestamp ? req.oneVPV.timestamp.toISOString() : auditEntry.vpv.name;
			}
	}
	if (req.oneVP) {
			auditEntry.vp.vpid = req.oneVP._id;
			auditEntry.vc.vcid = req.oneVP.vcid;
			auditEntry.vp.name = req.oneVP.name;
			auditEntry.vc.name = req.oneVP.vc.name;
			if (addJSON == 'vp') auditEntry.vp.vpjson = JSON.stringify(req.oneVP);
			if (addJSON == 'group') auditEntry.vp.vpjson = JSON.stringify(req.oneGroup);
			if (addJSON == 'portfolio') auditEntry.vp.vpjson = JSON.stringify(req.oneVPF);
			if (!auditEntry.actionInfo) auditEntry.actionInfo = auditEntry.vp.name
	}
	if (req.oneVC) {
			auditEntry.vc.vcid = req.oneVC._id;
			auditEntry.vc.name = req.oneVC.name;
			if (addJSON == 'vc') auditEntry.vc.vcjson = JSON.stringify(req.oneVC);
			if (addJSON == 'group') auditEntry.vc.vcjson = JSON.stringify(req.oneGroup);
			if (addJSON == 'setting') auditEntry.vc.vcjson = JSON.stringify(req.oneVCSetting);
			if (!auditEntry.actionInfo) auditEntry.actionInfo = auditEntry.vc.name
	}

	// set the correct ip in case of NGINX Reverse Proxy
	auditEntry.ip = req.headers["x-real-ip"] || req.ip;
	auditEntry.userAgent = req.get('User-Agent');
	auditEntry.result = {};
	auditEntry.result.time = Math.round(Number(tokens['response-time'](req, res))/factor)
	auditEntry.result.status = tokens.status(req, res);
	auditEntry.result.size = Math.round(Number(tokens.res(req, res, 'content-length')||0)/factor);
	auditEntry.save(function(err, auditEntryResult) {
		if (err) {
			logger4js.error("Save VisboAudit failed to save %O", auditEntry);
		}
	});

	logger4js.trace("saveVisboAudit %s %s", auditEntry.url, auditEntry.result.status);
}

function visboAudit(tokens, req, res) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	if (tokens.method(req, res) == "GET" && req.listVPV) {
		if (req.query.longList != undefined) {
			// generate multiple audit entries per VisboProjectVersion
			// and save it to the project Audit
			req.auditInfo = undefined;
			logger4js.debug("saveVisboAudit Multiple Audits for VPVs %s", req.listVPV.length);
			for (var i = 0; i < req.listVPV.length; i++) {
				req.oneVPV = req.listVPV[i];
				req.oneVP = {_id: req.oneVPV.vpid, name: req.oneVPV.name, vc: {}};
				saveAuditEntry(tokens, req, res, req.listVPV.length);
			}
		} else {
			// save it to the VC is only one is specified
			if (req.query.vcid) {
				req.oneVC = {_id: req.query.vcid, name: ''}
			}
			saveAuditEntry(tokens, req, res, 1);
		}
	} else {
		saveAuditEntry(tokens, req, res, 1);
	}
}

module.exports = {
	visboAudit: visboAudit
};
