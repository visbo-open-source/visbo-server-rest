var mongoose = require('mongoose');
var Const = require('../models/constants');
var constPermVP = Const.constPermVP;

var VisboProject = mongoose.model('VisboProject');
var VisboGroup = mongoose.model('VisboGroup');
var VisboPortfolio = mongoose.model('VisboPortfolio');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var logModule = 'VP';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var VisboPermission = Const.VisboPermission;

// Generate the Groups where the user is member of and has VP Permission
function getAllGroups(req, res, next) {
	var userId = req.decoded._id;
	var baseUrl = req.url.split('?')[0];
	var urlComponent = baseUrl.split('/');

	var vpid = undefined;
	var vcid = undefined;
	if (urlComponent.length == 6 && urlComponent[3] == 'portfolio' && urlComponent[5] == 'capacity' ) {
		// we need all groups from VC to check if the user can access  the VPs
		// if we would know the VC already it could be set here
		vpid = undefined;
	} else if (urlComponent.length > 1) {
		vpid = urlComponent[1];
	} else {
		// URL /vp
		if (!vcid && req.method == 'GET' && req.query.vcid) {
			vcid = req.query.vcid;
		}
		if (!vcid && req.method == 'POST' && req.body.vcid) {
			vcid = req.body.vcid;
		}
	}

	if (!validate.validateObjectId(vcid, true)) {
		logger4js.warn('VC Bad Query Parameter vcid %s', vcid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid VISBO Center'
		});
	}
	// get the VP Groups the user is member of
	// handle sysadmin case
	logger4js.debug('Generate VP Groups for user %s for url %s', req.decoded.email, req.url);
	// var checkDeleted = req.query.deleted == true;
	var query = {'users.userId': userId};	// search for VP groups where user is member
	if (req.query.sysadmin) {
		query.groupType = 'System';						// search for System Groups only
		// MS TODO: only if reuqired to show VPs from deleted VCs
		// query['$or'] = [{groupType: 'VC'}, {deletedByParent: {$exists: checkDeleted}}]
	} else {
		if (vcid) query.vcid = vcid;
		query.groupType = {$in: ['VC', 'VP']};				// search for VP Groups only
	}
	if (vpid) {
		query.vpids = vpid;
	}

	logger4js.debug('Query VGs %s', JSON.stringify(query));
	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid vpids groupType');
	queryVG.exec(function (err, listVG) {
		if (err) {
			errorHandler(err, res, 'DB: VP Group all Find', 'Error getting Groups ');
			return;
		}
		logger4js.debug('Found VGs %d', listVG.length);
		// Convert the result to request
		var listVPPerm = new VisboPermission();
		var listVCPerm = new VisboPermission();
		for (var i=0; i < listVG.length; i++) {
			var permGroup = listVG[i];
			if (permGroup.groupType == 'System') {
				listVPPerm.addPerm(0, permGroup.permission);
				listVCPerm.addPerm(0, permGroup.permission);
			} else if (permGroup.groupType == 'VC') {
				listVCPerm.addPerm(permGroup.vcid, permGroup.permission);
			}
			if (permGroup.groupType != 'System' && permGroup.vpids) {
				// Check all VPIDs in Group
				for (var j=0; j < permGroup.vpids.length; j++) {
          listVPPerm.addPerm(permGroup.vpids[j], permGroup.permission);
				}
			}
		}
		req.listVPPerm = listVPPerm;
		req.listVCPerm = listVCPerm;

		if (req.query.sysadmin) {
			// MS TODO: Check if ok for users with sysadmin permission but without View VC
			if ((listVCPerm.getPerm(0).vp & constPermVP.View) == 0) {
				// no View permission for VP
				return res.status(403).send({
					state: 'failure',
					message: 'No valid VISBO Center or no Permission'
				});
			}
		} else if (vcid) {
			if ((listVCPerm.getPerm(vcid).vp & constPermVP.View) == 0) {
				// no View permission for VP
				return res.status(403).send({
					state: 'failure',
					message: 'No valid VISBO Center or no Permission'
				});
			}
		}
		return next();
	});
}

function getVCGroups(req, res, next) {
	return next();
}

function checkVpfid(req, res, next, vpfid) {
	var sysAdmin = req.query.sysadmin ? true : false;

	logger4js.debug('Check Portfolio ID vpfid %s user %s for url %s as SysAdmin %s', vpfid, req.decoded.email, req.url, sysAdmin);
	if (!validate.validateObjectId(vpfid, false)) {
		logger4js.warn('VC Groups Bad Parameter vpid %s', vpfid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Project Portfolio'
		});
	}
	logger4js.debug('VP Portfolio vpid: %s vpfid: ', req.oneVP._id, vpfid);

	var query = {};
	query.vpid = req.oneVP._id;
	query._id = vpfid;
	var queryVPF = VisboPortfolio.findOne(query);
	// queryVP.select('name users updatedAt createdAt');
	queryVPF.exec(function (err, oneVPF) {
		if (err) {
			errorHandler(err, res, 'DB: VP Get VPF List', 'Error getting Project Portfolio List');
			return;
		}
		if (!oneVPF) {
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Project Portfolio or no Permission'
			});
		}
		req.oneVPF = oneVPF;
		logger4js.debug('Found Project Portfolio %s ', vpfid);
		return next();
	});
}

// Get the VP with vpid including View Permission Check and others depending on parameters
function getVP(req, res, next, vpid) {
	var userId = req.decoded._id;
	var sysAdmin = req.query.sysadmin ? true : false;
	var checkDeleted = req.query.deleted == true;
	var checkView = req.method == 'GET' ? (constPermVP.View + constPermVP.ViewRestricted) : constPermVP.View;

	// get the VP with Perm Check View
	logger4js.debug('Generate VP Groups for vpid %s userId %s for url %s sysAdmin %s', vpid, userId, req.url, sysAdmin);
	if (!validate.validateObjectId(vpid, false)) {
		logger4js.warn('getVP Bad Parameter vpid %s', vpid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Project'
		});
	}

	req.auditDescription = 'Project';
	req.auditSysAdmin = sysAdmin;

	if ((req.listVPPerm.getPerm(sysAdmin ? 0 : vpid).vp & checkView) == 0) {
		// do not accept requests without a group assignement especially to System Group
		return res.status(403).send({
			state: 'failure',
			message: 'No valid Project or no Permission'
		});
	}

	var query = {};
	query._id = vpid;
	query.deletedAt =  {$exists: checkDeleted};
	// prevent that the user gets access to VPs in a later deleted VC. Do not deliver groups from deleted VCs/VPs
	query['vc.deletedAt'] = {$exists: false}; // Do not deliver any VP from a deleted VC

	logger4js.trace('Get Project Query %O', query);
	var queryVP = VisboProject.findOne(query);
	// queryVP.select('name users updatedAt createdAt');
	queryVP.exec(function (err, oneVP) {
		if (err) {
			errorHandler(err, res, 'DB: VP Group Get VP', 'Error getting Project');
			return;
		}
		if (!oneVP) {
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Project or no Permission'
			});
		}
		req.oneVP = oneVP;

		logger4js.debug('Found Project %s Access Permission %O', vpid, req.listVPPerm.getPerm(vpid));
		return next();
	});
}

module.exports = {
	getAllGroups: getAllGroups,
	getVCGroups: getVCGroups,
	getVP: getVP,
	checkVpfid: checkVpfid
};
