var mongoose = require('mongoose');

var VisboGroup = mongoose.model('VisboGroup');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var logModule = 'USER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Check the GroupId parameter from URL
/* The getGroupId function is a middleware for an Express.js application. 
   It validates and retrieves a group (VisboGroup) from the database based on a given groupId, vcid (Visbo Center Id), and vpid (Visbo Project Id). 
   The retrieved group is then attached to the request (req.oneGroup) for further processing.

   If the groupId, vcid, or vpid are invalid, or if the group is not found, the function returns an error response.
   		Logs a warning.
		Returns HTTP 400 Bad Request with { state: 'failure', message: 'No valid Group' }.   
  */
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


/* The checkUserId function is an Express.js middleware that validates a given user ID (userid). 
   If the ID is valid, it allows the request to proceed; otherwise,
   it returns HTTP 400 Bad Request    

   This function ensures that only properly formatted MongoDB ObjectIDs are used in user-related requests. 
*/
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

// get VC Groups used for viewing the project manager, we need all VC Groups with the user members
/* The getVCGroups function is an Express.js middleware that retrieves Visbo Center (VC) and Visbo Project (VP) groups from the VisboGroup collection. 
   It only executes if the request matches a specific pattern (GET /:vcid/user). 
   If the conditions are not met, it skips execution and moves to the next middleware.

	The retrieved groups are then attached to req.listVCGroup for later use.
 */
function getVCGroups(req, res, next) {
	var baseUrl = req.url.split('?')[0];
	var urlComponent = baseUrl.split('/');
	logger4js.debug('Check if we need groups %s ', req.url);
	var skip = true;
	if (req.method == 'GET' && urlComponent.length == 3 && urlComponent[2] == 'user') {
		skip = false;
	}
	if (skip) {
		return next();
	}
	var vcid = urlComponent[1];
	logger4js.debug('Get Groups for url %s vcid %s', req.url, vcid);

	var query = {};
	query.vcid = vcid;
	query.groupType = {$in: ['VC', 'VP']};
	logger4js.trace('Get VC Group Query %O', query);
	var queryVCGroup = VisboGroup.find(query);
	queryVCGroup.select('-vpids');
	queryVCGroup.lean();
	queryVCGroup.exec(function (err, listVCGroup) {
		if (err) {
			errorHandler(err, res, `DB: GET VC Groups find ${query}`, 'Error getting VC Groups');
			return;
		}
		logger4js.debug('Found %d Groups for VC', listVCGroup.length);
		req.listVCGroup = listVCGroup;
		return next();
	});
}

// get VP Groups used for manage restrictions and for updating the project manager, we need all VP Groups not only the groups where the user is member of
/* The getVPGroups function is an Express.js middleware that retrieves Visbo Project (VP) groups from the VisboGroup collection. 
   It determines whether the request requires fetching VP groups based on request method (POST, PUT, GET) and URL structure.

   If the request meets the criteria, it fetches groups from the database where vpids matches the given vpid and stores the result in req.listVPGroup for further processing.
*/
function getVPGroups(req, res, next) {
	var baseUrl = req.url.split('?')[0];
	var urlComponent = baseUrl.split('/');
	logger4js.debug('Check if we need groups %s ', req.url);
	var skip = true;
	if (req.method == 'POST' && urlComponent.length >= 3 && urlComponent[2] == 'restrict') {
		skip = false;
	} else if (req.method == 'PUT' && urlComponent.length == 2) {
		skip = false;
	} else if (req.method == 'GET' && urlComponent.length == 3 && urlComponent[2] == 'user') {
		skip = false;
	}
	if (skip) {
		return next();
	}
	var vpid = urlComponent[1];
	logger4js.debug('Get Groups for url %s vpid %s', req.url, vpid);

	var query = {};
	query.vpids = vpid;
	query.groupType = {$in: ['VC', 'VP']};
	logger4js.trace('Get Project Group Query %O', query);
	var queryVPGroup = VisboGroup.find(query);
	queryVPGroup.select('-vpids');
	queryVPGroup.lean();
	queryVPGroup.exec(function (err, listVPGroup) {
		if (err) {
			errorHandler(err, res, `DB: GET VP Groups find ${query}`, 'Error getting Project Groups');
			return;
		}
		logger4js.debug('Found %d Groups for VP', listVPGroup.length);
		req.listVPGroup = listVPGroup;
		return next();
	});
}

module.exports = {
	getGroupId: getGroupId,
	checkUserId: checkUserId,
	getVPGroups: getVPGroups,
	getVCGroups: getVCGroups
};
