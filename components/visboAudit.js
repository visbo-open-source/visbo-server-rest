var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var moment = require('moment');
var audit = require('./../components/visboAudit');
var VisboAudit = mongoose.model('VisboAudit');

var logging = require('./../components/logging');

var debuglevel = 9;

function visboAudit(tokens, req, res) {
	if (tokens.method(req, res) == "GET") {
		return;
	}
	var auditEntry = new VisboAudit();
	auditEntry.user = {};
	if (req.decoded && req.decoded._id) {
		auditEntry.user.userId = req.decoded._id;
		auditEntry.user.email = req.decoded.email;
	}
	auditEntry.vc = {};
	if (req.oneVC) {
			auditEntry.vc.vcid = req.oneVC._id;
			auditEntry.vc.name = req.oneVC.name;
	}
	auditEntry.vp = {};
	if (req.oneVP) {
			auditEntry.vp.vpid = req.oneVP._id;
			auditEntry.vp.name = req.oneVP.name;
	}
	auditEntry.vpv = {};
	if (req.oneVPV) {
			auditEntry.vpv.vpvid = req.oneVPV._id;
			auditEntry.vpv.name = req.oneVPV.name;
	}
	auditEntry.action = tokens.method(req, res);
	auditEntry.url = tokens.url(req, res);
	auditEntry.ip = req.ip;
	auditEntry.userAgent = req.get('User-Agent');
	auditEntry.result = {};
	auditEntry.result.time = Math.round(tokens['response-time'](req, res))
	auditEntry.result.status = tokens.status(req, res);
	auditEntry.save(function(err, auditEntryResult) {
		if (err) {
			debuglog(debuglevel, 0, "VisboAudit failed to save");
		}
	});

	debuglog(debuglevel, 8, "VisboAudit %s %s", auditEntry.url, auditEntry.result.status);
}

module.exports = {
	visboAudit: visboAudit
};
