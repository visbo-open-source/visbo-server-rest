var mongoose = require('mongoose');
var VisboAudit = mongoose.model('VisboAudit');
var validate = require('./../components/validate');
var os = require('os');

var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var errorHandler = require('./../components/errorhandler').handler;

function cleanupAudit(task, finishedTask) {
	logger4js.debug('cleanupAudit Execute %s', task && task._id);
	if (!task || !task.value) finishedTask(task, false);
	var queryaudit = {ttl: {$lt: new Date()}};
	VisboAudit.deleteMany(queryaudit, function (err, result) {
		if (err){
			errorHandler(err, undefined, 'DB: DELETE Expired Audits', undefined);
			task.value.taskSpecific = {result: -1, resultDescription: 'Err: DB: Delete Audit'};
			finishedTask(task, false);
			return;
		}
		task.value.taskSpecific = {result: result.deletedCount, resultDescription: `Deleted ${result.deletedCount} expired Audit Entries`};

		logger4js.debug('Task: cleanupAudit Result %O', result);
		finishedTask(task, false);
	});

	logger4js.debug('cleanupAudit Done %s', task._id);
}

function squeezeDelete(squeezeEntry, lastDate) {
	logger4js.trace('squeezeDelete Execute %s Count %s', squeezeEntry._id.vpvid, squeezeEntry.count);
	var queryaudit = {
		createdAt: {$gt: squeezeEntry.first, $lt: lastDate},
		action: 'GET',
		'vpv.vpvid': squeezeEntry._id.vpvid,
		'user.email': squeezeEntry._id.user
	};
	VisboAudit.deleteMany(queryaudit, function (err, result) {
		if (err){
			errorHandler(err, undefined, 'DB: DELETE Squeezed Audits', undefined);
		}
		logger4js.debug('Task: squeezeDelete Result %O', result);
	});
}

function squeezeAudit(task, finishedTask) {
	logger4js.debug('squeezeAudit Execute %s', task && task._id);
	if (!task || !task.value) finishedTask(task, false);
	var startSqueeze = new Date('2018-01-01');

	if (!task.value.taskSpecific) task.value.taskSpecific = {};
	if (validate.validateDate(task.value.taskSpecific.lastMonth, false)) {
		startSqueeze = new Date(task.value.taskSpecific.lastMonth);
	}
	var endSqueeze = new Date(startSqueeze);
	endSqueeze.setMonth(endSqueeze.getMonth() + 1);
	var latestSqueeze = new Date();
	var resultFinished = {};
	latestSqueeze.setDate(latestSqueeze.getDate() - (task.value.skipDays || 30));

	if (latestSqueeze < endSqueeze) endSqueeze = latestSqueeze;
	// set it to beginning of Month
	endSqueeze.setDate(1);
	endSqueeze.setHours(0);
	endSqueeze.setMinutes(0);
	endSqueeze.setSeconds(0);
	endSqueeze.setMilliseconds(0);
	resultFinished.lastMonth = endSqueeze;
	if (startSqueeze >= endSqueeze) {
		logger4js.debug('squeezeAudit Nothing to Execute %s: Start %s End %s', task._id, startSqueeze.toISOString(), endSqueeze.toISOString());
		resultFinished.result = 0;
		resultFinished.resultDescription = 'Nothing to squeeze';
		task.value.taskSpecific = resultFinished;
		finishedTask(task, false);
		return;
	}
	logger4js.debug('squeezeAudit Execute %s: Start %s End %s', task._id, startSqueeze.toISOString(), endSqueeze.toISOString());

	// get all ReST Calls Type 'GET' in a defined period and group them by vpvid and user
	// aggregate the count and the minimum createdAt time and filter only entries with a certain amount of duplicates
	var aggregateQuery = [
		{$match: {createdAt: {$gt: startSqueeze, $lt: endSqueeze}, action: 'GET', vpv: {$exists: true}}},
		{$group: {_id: {action: '$action', 'vpvid' : '$vpv.vpvid', 'user': '$user.email'}, count : { '$sum' : 1 }, first: {'$min': '$createdAt'} } },
		{$match: {count: {$gt: 3 }}},
		{$sort: {count: -1}}
	];
	var querySqueezeAudit = VisboAudit.aggregate(aggregateQuery);
	querySqueezeAudit.exec(function (err, listAudits) {
		if (err) {
			errorHandler(err, undefined, 'DB: GET squeeze Audit', undefined);
			resultFinished.lastMonth = task.value.lastMonth; // stay in same interval and try again
			resultFinished.result = -1;
			resultFinished.resultDescription = 'Err: DB Get Squeeze Audit';
			task.value.taskSpecific = resultFinished;
			finishedTask(task, false);
			return;
		}
		logger4js.info('Task: squeezeAudit Result %s Audit Groups', listAudits.length);
		// now delete the duplicate rows, loop through all groups and delete all but one
		var squeezeCount = 0;
		for (var i=0; i<listAudits.length; i++) {
			squeezeCount += listAudits[i].count - 1;
			logger4js.debug('Check vpvid %s user %s Count %s First %s', listAudits[i]._id.vpvid, listAudits[i]._id.user, listAudits[i].count, listAudits[i].first);
			squeezeDelete(listAudits[i], endSqueeze);
		}
		// Without wait for the Delete to finish??
		resultFinished.lastMonth = endSqueeze;
		resultFinished.result = squeezeCount;
		resultFinished.resultDescription = `Squeezed ${squeezeCount} Entries for Month ${endSqueeze.toISOString()}`;
		task.value.taskSpecific = resultFinished;
		finishedTask(task, false);
	});
	logger4js.debug('squeezeAudit Done %s', task._id);
}

function saveAuditEntry(tokens, req, res, factor) {
	var auditEntry = new VisboAudit();

	auditEntry.action = tokens.method(req, res);
	auditEntry.url = tokens.url(req, res);
	auditEntry.host = os.hostname().split('.')[0];
	if (req.auditSysAdmin) auditEntry.sysAdmin = true;
	var baseUrl = auditEntry.url.split('?')[0];
	var urlComponent = baseUrl.split('/');
	var addJSON = undefined;
	if (auditEntry.action != 'GET') {
		if (urlComponent.length >= 2) addJSON = urlComponent[1];
		if (urlComponent.length >= 4 && urlComponent[3] == 'group') addJSON = urlComponent[3];
		if (urlComponent.length >= 6 && urlComponent[3] == 'group' && urlComponent[5] == 'user') addJSON = undefined;
		// if (urlComponent.length >= 4 && urlComponent[3] == 'portfolio') addJSON = urlComponent[3];
		if (urlComponent.length >= 4 && urlComponent[3] == 'setting') addJSON = urlComponent[3];
	} else {
		if (req.auditTTLMode > 0) {
			auditEntry.ttl = new Date();
			if (req.auditTTLMode == 4) auditEntry.ttl.setMinutes(auditEntry.ttl.getMinutes() + 5);		// 5 Minutes
			else if (req.auditTTLMode == 3) auditEntry.ttl.setHours(auditEntry.ttl.getHours() + 1);	// 1 Hour
			else if (req.auditTTLMode == 2) auditEntry.ttl.setDate(auditEntry.ttl.getDate() + 1);		// 1 Day
			else auditEntry.ttl.setDate(auditEntry.ttl.getDate() + 30)	;														// 30 Days
		}
	}

	if (req.auditDescription) {
		auditEntry.actionDescription = req.auditDescription;
	} else {
		auditEntry.actionDescription = auditEntry.action;
	}
	logger4js.trace('VisboAudit Description %s url add %s %s %O', auditEntry.url, addJSON, urlComponent.length, urlComponent);
	if (req.auditInfo) {
		auditEntry.actionInfo = req.auditInfo;
	}
	auditEntry.user = {};
	if (req.decoded && req.decoded._id) {
		auditEntry.user.userId = req.decoded._id;
		auditEntry.user.email = req.decoded.email;
	} else if (req.body && req.body.email) {
		auditEntry.user.email = req.body.email;
	} else {
		auditEntry.user.email = 'Unknown';
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
		// if (addJSON == 'portfolio') auditEntry.vp.vpjson = JSON.stringify(req.oneVPF);
		if (!auditEntry.actionInfo) auditEntry.actionInfo = auditEntry.vp.name;
	}
	if (req.oneVC) {
		auditEntry.vc.vcid = req.oneVC._id;
		auditEntry.vc.name = req.oneVC.name;
		if (addJSON == 'vc') auditEntry.vc.vcjson = JSON.stringify(req.oneVC);
		if (addJSON == 'group') {
			if (req.oneGroup && req.oneGroup.vpids) req.oneGroup.vpids = []; // to reduce audit size
			auditEntry.vc.vcjson = JSON.stringify(req.oneGroup);
		}
		if (addJSON == 'setting' && req.oneVCSetting) auditEntry.vc.vcjson = JSON.stringify(req.oneVCSetting).substr(0, 512);
		if (!auditEntry.actionInfo) auditEntry.actionInfo = auditEntry.vc.name;
	}

	// set the correct ip in case of NGINX Reverse Proxy
	auditEntry.ip = req.headers['x-real-ip'] || req.ip;
	auditEntry.userAgent = req.get('User-Agent');
	auditEntry.result = {};
	auditEntry.result.time = Math.round(Number((tokens['response-time'](req, res)) || 0)/factor);
	var status = tokens.status(req, res) || 0;
	auditEntry.result.status = status;
	if (status == 200) auditEntry.result.statusText = 'Success';
	if (status == 304) auditEntry.result.statusText = 'Success';
	if (status == 400) auditEntry.result.statusText = 'Bad Request';
	if (status == 401) auditEntry.result.statusText = 'Not Authenticated';
	if (status == 403) auditEntry.result.statusText = 'Permission Denied';
	if (status == 404) auditEntry.result.statusText = 'URL not found';
	if (status == 409) auditEntry.result.statusText = 'Conflict';
	if (status == 423) auditEntry.result.statusText = 'Locked';
	if (status == 500) auditEntry.result.statusText = 'Server Error';

	auditEntry.result.size = Math.round(Number(tokens.res(req, res, 'content-length')||0)/factor);
	auditEntry.save(function(err) {
		if (err) {
			logger4js.error('Save VisboAudit failed to save %O', err);
		}
	});

	logger4js.trace('saveVisboAudit %s %s', auditEntry.url, auditEntry.result.status);
}

function visboAudit(tokens, req, res) {
	if (req.auditIgnore) return;
	if (tokens.method(req, res) == 'GET' && req.listVPV) {
		if (req.query.longList != undefined) {
			// generate multiple audit entries per VisboProjectVersion
			// and save it to the project Audit
			req.auditInfo = undefined;
			logger4js.debug('saveVisboAudit Multiple Audits for VPVs %s', req.listVPV.length);
			for (var i = 0; i < req.listVPV.length; i++) {
				req.oneVPV = req.listVPV[i];
				req.oneVP = {_id: req.oneVPV.vpid, name: req.oneVPV.name, vc: {}};
				saveAuditEntry(tokens, req, res, req.listVPV.length);
			}
		} else {
			// save it to the VC if only one is specified
			if (req.query.vcid && mongoose.Types.ObjectId.isValid(req.query.vcid)) {
				req.oneVC = {_id: req.query.vcid, name: ''};
			}
			saveAuditEntry(tokens, req, res, 1);
		}
	} else {
		saveAuditEntry(tokens, req, res, 1);
	}
}

module.exports = {
	visboAudit: visboAudit,
	cleanupAudit: cleanupAudit,
	squeezeAudit: squeezeAudit
};
