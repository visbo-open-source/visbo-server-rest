var mongoose = require('mongoose');
var Const = require('../models/constants')
var permSystem = Const.permSystem
var permVC = Const.permVC

var VisboGroup = mongoose.model('VisboGroup');

var logModule = "USER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Check the GroupId parameter from URL
function getGroupId(req, res, next, groupId) {
	var userId = req.decoded._id;
	var useremail = req.decoded.email;
	var vcid = req.oneVC._id;
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	// TODO: handle sysadmin case, handle sysVC
	logger4js.debug("Check GroupId %s for vcid %s ", groupId, vcid);
	var query = {};
	query.vcid = vcid;
	query._id = groupId
	logger4js.trace("Search VGs %O", query);

	var queryVG = VisboGroup.find(query);
	// queryVG.select('name permission vcid')
	queryVG.exec(function (err, listVG) {
		if (err) {
			logger4js.fatal("Group Param check Get DB Connection %O", err);
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting VisboGroups',
				error: err
			});
		}
		logger4js.trace("Found VGs %d groups %O", listVG.length, listVG);
	 	// Convert the result to request
		if (listVG.length != 1) {
			logger4js.warn("GroupId %s for VC %s not found", groupId, vcid);
			// do not accept requests without a group assignement especially to System Group
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Group or no Permission'
			});
		}
		req.oneGroup = listVG[0];
		return next();
 	});
}

module.exports = {
	getGroupId: getGroupId
};
