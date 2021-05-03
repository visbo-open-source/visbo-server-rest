var mongoose = require('mongoose');

var VisboGroup = mongoose.model('VisboGroup');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var logModule = 'USER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Check the GroupId parameter from URL
function getGroupId(req, res, next, groupId) {
	var userId = req.decoded._id;
	var vcid = req.params.vcid ? req.params.vcid : undefined;
	var vpid = req.params.vpid ? req.params.vpid : undefined;

	logger4js.debug('Check GroupId %s for user %s and vcid %s vpid %s ', groupId, userId, vcid, vpid);
	if (!validate.validateObjectId(groupId, false) || !validate.validateObjectId(vcid, true) || !validate.validateObjectId(vpid, true)) {
		logger4js.warn('Groups Bad Parameter groupid %s vcid %s vpid %s', groupId, vcid, vpid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Group'
		});
	}
	var query = {};
	if (vcid) query.vcid = vcid;
	if (vpid)  { query.vpids = vpid; }
	query._id = groupId;
	logger4js.trace('Search VGs %O', query);

	var queryVG = VisboGroup.find(query);
	// queryVG.select('name permission vcid')
	queryVG.exec(function (err, listVG) {
		if (err) {
			errorHandler(err, res, 'DB: Group Find', 'Error getting Groups ');
			return;
		}
		logger4js.trace('Found VGs %d groups %O', listVG.length, listVG);
		// Convert the result to request
		if (listVG.length != 1) {
			logger4js.warn('GroupId %s for VC/VP %s not found', groupId, vcid||vpid);
			// do not accept requests without a group assignement especially to System Group
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Group or no Permission'
			});
		}
		req.oneGroup = listVG[0];
		return next();
	});
}

function checkUserId(req, res, next, userid) {
	logger4js.debug('Check UserID %s user %s for url %s ', userid, req.decoded.email, req.url);
	if (!validate.validateObjectId(userid, false)) {
		logger4js.warn('UserID Bad Parameter %s', userid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid VISBO User'
		});
	}
	return next();
}

// get VP Groups used only for manage restrictions, we need all VP Groups not only the groups where the user is member of
function getVPGroups(req, res, next) {
	var baseUrl = req.url.split('?')[0];
	var urlComponent = baseUrl.split('/');
	logger4js.debug('Check if we need groups %s ', req.url);
	if (req.method != 'POST' || urlComponent.length < 3 || urlComponent[2] != 'restrict') {
		return next();
	}
	var vpid = urlComponent[1];
	logger4js.debug('Get Groups for url %s vpid %s', req.url, vpid);

	var query = {};
	query.vpids = vpid;
	query.groupType = {$in: ['VC', 'VP']};
	logger4js.trace('Get Project Group Query %O', query);
	var queryVCGroup = VisboGroup.find(query);
	queryVCGroup.select('-vpids');
	queryVCGroup.lean();
	queryVCGroup.exec(function (err, listVPGroup) {
		if (err) {
			errorHandler(err, res, `DB: GET VP Groups find ${query}`, 'Error getting Project Groups');
			return;
		}
		logger4js.info('Found %d Groups for VP', listVPGroup.length);
		req.listVPGroup = listVPGroup;
		return next();
	});
}

module.exports = {
	getGroupId: getGroupId,
	checkUserId: checkUserId,
	getVPGroups: getVPGroups
};
