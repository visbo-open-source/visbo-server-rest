var mongoose = require('mongoose');
var VisboAudit = mongoose.model('VisboAudit');
var validate = require('./../components/validate');
var os = require('os');

var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var errorHandler = require('./../components/errorhandler').handler;

/* The cleanupAudit function is responsible for deleting expired audit log entries from the VisboAudit collection based on a time-to-live (ttl) expiration date. 
   This function is executed as a background task and logs the number of deleted audit entries.
   Key Features:
		- Deletes expired audit logs (ttl < current date). 
		- Handles database errors gracefully.
		- Logs results to help with debugging.
		- Updates the task.value.taskSpecific field with the deletion result.
		- Invokes finishedTask(task, false) upon completion.
 */
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
}

/* The squeezeDelete function is responsible for deleting "squeezed" audit log entries from the VisboAudit collection. 
   It removes redundant GET audit logs for a specific Visbo Project Version (VPV) and user within a time range.
   Key Features
		- Deletes GET audit logs for a specific VPV and user.
		- Filters audit logs within a defined time range (squeezeEntry.first to lastDate).
		- Handles database errors gracefully.
		- Logs the deletion result for debugging. 
*/
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

/* The squeezeAudit function is responsible for removing redundant GET audit log entries for a given time period by aggregating 
   duplicate requests based on Visbo Project Version (vpvid) and user email. 
   It identifies audit log clusters where the same GET request has been executed multiple times and retains only the earliest request, deleting the rest.
   Key Features
		- Determines the time range for squeezing audits based on lastMonth or defaults to 2018-01-01.
		- Groups GET audit entries by vpvid and user within the selected period.
		- Identifies duplicates (count > 3) and retains only the earliest entry.
		- Deletes redundant entries while keeping track of the total count.
		- Logs execution details for debugging.
		- Handles errors and ensures safe task completion. 
*/
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
	endSqueeze.setHours(0, 0, 0, 0);
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
	logger4js.trace('VISBOAudit Description %s url add %s %s %O', auditEntry.url, addJSON, urlComponent.length, urlComponent);
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
			auditEntry.actionInfo = req.oneVPV.timestamp ? req.oneVPV.timestamp.toISOString() : '';
			if (req.oneVPV && req.oneVPV.variantName) {
				auditEntry.actionInfo = req.oneVPV.variantName.concat('/', auditEntry.actionInfo);
			}
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
		// if (!auditEntry.actionInfo) auditEntry.actionInfo = auditEntry.vp.name;
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
			logger4js.error('Save Audit failed to save %O', err);
		}
	});

	logger4js.trace('saveAudit %s %s', auditEntry.url, auditEntry.result.status);
}
/* The systemStartUp function is responsible for logging an audit entry when the REST server starts up. It records system startup details, including:
		- System host information.
		- User identity (System).
		- Action (GET request to /).
		- Audit log structure including Visbo Center (VC) details.
		- Result status (200 for success, 500 for failure).
	Key Features
	✔️ Creates an audit entry for system startup events.
	✔️ Logs the system hostname.
	✔️ Includes Visbo Center (VC) details if provided.
	✔️ Records success (200) or failure (500) status.
	✔️ Handles errors while saving the audit entry. 
*/
function systemStartUp(systemVC, result = true) {
	var auditEntry = new VisboAudit();

	auditEntry.action = 'GET';
	auditEntry.host = os.hostname().split('.')[0];
	auditEntry.sysAdmin = true;
	auditEntry.url = '/';
	auditEntry.actionDescription = 'GET';
	auditEntry.actionInfo = 'ReST Server Started';
	auditEntry.user = {};
	auditEntry.user.email = 'System';

	auditEntry.vpv = {};
	auditEntry.vp = {};
	auditEntry.vc = {};
	if (systemVC) {
		auditEntry.vc.vcid = systemVC._id;
		auditEntry.vc.name = systemVC.name;
	}
	auditEntry.result = {};
	auditEntry.result.time = 0;
	var status = result ? 200 : 500;
	auditEntry.result.status = status;
	auditEntry.result.statusText = result ? 'Success' : 'Server Error';
	auditEntry.result.size = 0;
	auditEntry.save(function(err) {
		if (err) {
			logger4js.error('Save Audit failed to save %O', err);
		}
	});
}

function savePropertyEntry(tokens, req, res, property) {
	var auditEntry = new VisboAudit();

	auditEntry.action = tokens.method(req, res);
	auditEntry.url = tokens.url(req, res);
	auditEntry.host = os.hostname().split('.')[0];
	if (req.auditSysAdmin) auditEntry.sysAdmin = true;

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
	if (req.oneVP) {
		auditEntry.vp.vpid = req.oneVP._id;
		auditEntry.vc.vcid = req.oneVP.vcid;
		auditEntry.vp.name = req.oneVP.name;
		auditEntry.vc.name = req.oneVP.vc.name;
	}
	if (req.oneVC) {
		auditEntry.vc.vcid = req.oneVC._id;
		auditEntry.vc.name = req.oneVC.name;
	}

	auditEntry.actionDescription = property.action;
	var name = property.name;
	if (name.indexOf('_') == 0) {
		name = name.substring(1);
	}
	auditEntry.actionInfo = name + ': ';
	if (property.newValue && property.oldValue) {
		auditEntry.actionInfo += property.oldValue + ' => ' + property.newValue;
	} else {
		auditEntry.actionInfo += (property.oldValue || property.newValue);
	}

	// set the correct ip in case of NGINX Reverse Proxy
	auditEntry.ip = req.headers['x-real-ip'] || req.ip;
	auditEntry.userAgent = req.get('User-Agent');
	auditEntry.result = {};
	auditEntry.result.time = 0;
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

	auditEntry.result.size = 0;
	auditEntry.save(function(err) {
		if (err) {
			logger4js.error('Save Property Audit failed to save %O', err);
		}
	});

	logger4js.trace('savePropertyAudit %s %s', auditEntry.url, auditEntry.result.status);
}
/* The savePropertyEntry function is responsible for logging property changes to the audit log (VisboAudit) whenever a user modifies a property in the system. 
   It captures essential details such as:
		- Request method, URL, and hostname.
		- User details (userId, email).
		- Visbo Project (VP) and Visbo Center (VC) associations.
		- Action description and property changes (old → new values).
		- IP address and user agent for tracking.
		- HTTP response status and corresponding status text.
	Key Features
	✔️ Logs all property modifications.
	✔️ Includes user and project context (VP and VC).
	✔️ Stores both old and new property values.
	✔️ Captures HTTP request details (URL, method, IP, User-Agent).
	✔️ Handles different HTTP status codes and assigns appropriate descriptions.
	✔️ Saves audit logs to VisboAudit collection. 
*/
function visboAudit(tokens, req, res) {
	if (req.auditIgnore) return;
	if (tokens.method(req, res) == 'GET' && req.listVPV) {
		if (req.query.longList != undefined) {
			// generate multiple audit entries per Project Version
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
		if (req.auditProperty) {
			req.auditProperty.forEach(item => savePropertyEntry(tokens, req, res, item));
		}
	}
}

module.exports = {
	visboAudit: visboAudit,
	cleanupAudit: cleanupAudit,
	squeezeAudit: squeezeAudit,
	systemStartUp: systemStartUp
};
