var mongoose = require('mongoose');
var ConstPerm = require('../models/constPerm');
var constPermVP = ConstPerm.constPermVP;

var VisboProject = mongoose.model('VisboProject');
var VisboGroup = mongoose.model('VisboGroup');
var VisboPortfolio = mongoose.model('VisboPortfolio');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');

var validate = require('./../components/validate');
var verifyVc = require('./../components/verifyVc');
var errorHandler = require('./../components/errorhandler').handler;

var logModule = 'VP';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var VisboPermission = ConstPerm.VisboPermission;

// Generate the Groups where the user is member of and has VP Permission
function getAllGroups(req, res, next) {
	var userId = req.decoded._id;
	var baseUrl = req.originalUrl.split('?')[0];
	var urlComponent = baseUrl.split('/');

	var vpid = undefined;
	var vcid = undefined;
	if (urlComponent.length > 2 && urlComponent[1] == 'vp' ) {
		vpid = urlComponent[2];
	}
	if (req.oneVC) {
		// in case of vc/:vcid/capacity or  vc/:vcid/costtypes we need the VP Groups of the VC
		vcid = req.oneVC._id;
	} else if (req.method == 'GET' && req.query.vcid) {
		// in case of vp get we get the vcid from the query parameter if available
		vcid = req.query.vcid;
	} else if (req.method == 'POST' && req.body.vcid) {
		// in case of vp create we get the vcid from the body
		vcid = req.body.vcid;
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
		if (vcid) {
			query.vcid = vcid;
		}
		// check all VP Groups and non global VC groups
		if (vpid) {
			query['$or'] = [{vpids: vpid}, {global: false, groupType: 'VC'}];
		}
		query.groupType = {$in: ['VC', 'VP']};
	}

	logger4js.debug('Query VGs %s', JSON.stringify(query));
	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid vpids groupType');
	queryVG.lean();
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
		}
		// accept empty group list
		// else if (vcid) {
		// 	if ((listVCPerm.getPerm(vcid).vp & constPermVP.View) == 0) {
		// 		// no View permission for VP
		// 		return res.status(403).send({
		// 			state: 'failure',
		// 			message: 'No valid VISBO Center or no Permission'
		// 		});
		// 	}
		// }
		return next();
	});
}

function getVPGroupsOfVC(req, res, next) {
	var userId = req.decoded._id;
	// get permission groups for Portfolio to include also all VPs of the VC,
	// if the user has already VP Permission through VC we were done, otherwise we have to get all VP groups for the VC
	if (!req.oneVP || (req.listVCPerm.getPerm(req.oneVP.vcid).vp & constPermVP.View)) {
		return next();
	}
	var query = {'users.userId': userId};	// search for VP groups where user is member
	query.vcid = req.oneVP.vcid;
	query.groupType = {$in: ['VC', 'VP']};
	logger4js.debug('Query VGs %s', JSON.stringify(query));
	var queryVG = VisboGroup.find(query);
	queryVG.select('name permission vcid vpids groupType');
	queryVG.lean();
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
			if (permGroup.groupType == 'VC') {
				listVCPerm.addPerm(permGroup.vcid, permGroup.permission);
			}
			if (permGroup.vpids) {
				// Check all VPIDs in Group
				for (var j=0; j < permGroup.vpids.length; j++) {
          listVPPerm.addPerm(permGroup.vpids[j], permGroup.permission);
				}
			}
		}
		req.listVPPerm = listVPPerm;
		req.listVCPerm = listVCPerm;
		return next();
	});
}

function checkVpfid(req, res, next, vpfid) {
	var isSysAdmin = req.query.sysadmin ? true : false;

	logger4js.debug('Check Portfolio ID vpfid %s user %s for url %s as SysAdmin %s', vpfid, req.decoded.email, req.url, isSysAdmin);
	if (!validate.validateObjectId(vpfid, false)) {
		logger4js.warn('checkVpfid Bad Parameter vpfid %s', vpfid);
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
	var isSysAdmin = req.query.sysadmin ? true : false;
	var checkDeleted = req.query.deleted == true;
	var checkView = req.method == 'GET' ? (constPermVP.View + constPermVP.ViewRestricted) : constPermVP.View;

	// get the VP with Perm Check View
	logger4js.debug('Generate VP Groups for vpid %s userId %s for url %s sysadmin %s', vpid, userId, req.url, isSysAdmin);
	if (!validate.validateObjectId(vpid, false)) {
		logger4js.warn('getVP Bad Parameter vpid %s', vpid);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid Project'
		});
	}

	req.auditDescription = 'Project';
	req.auditSysAdmin = isSysAdmin;

	if ((req.listVPPerm.getPerm(isSysAdmin ? 0 : vpid).vp & checkView) == 0) {
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

function squeezePortfolio(req, list) {
	if (!req || !list || !(list.length > 0)) return;
	var projectIDs = req.listVPPerm.getVPIDs(constPermVP.View + constPermVP.ViewRestricted);

	for (var i=0; i< list.length; i++) {
		// process every Portfolio Version in list
		if (list[i].allItems) {
			for (var j=0; j < list[i].allItems.length; j++) {
				var vp = list[i].allItems[j];
				if (projectIDs.findIndex(item => item == vp.vpid.toString()) < 0) {
					// remove item, user does not have permission to the project
					list[i].allItems.splice(j, 1);
					j--;
				}
			}
		}
	}
}

function getVPTemplate(req, res, next) {
	var baseUrl = req.originalUrl.split('?')[0];
	var urlComponent = baseUrl.split('/');

	// evaluate VP Template from query string only for create project
	if (req.method != 'POST'|| urlComponent.length > 2 || req.query.vpid == undefined) {
		return next();
	}
	if (req.body.vpType == 1 || req.body.vpType == 2) {
		return next();
	}
	logger4js.debug('Check if we need VP Template', baseUrl, req.query.vpid);

	var vpTemplateID = req.query.vpid;
	// verify that the vpid is correct
	if (!validate.validateObjectId(vpTemplateID, false)) {
		logger4js.warn('create VP Bad Query Parameter vpid %s', vpTemplateID);
		return res.status(400).send({
			state: 'failure',
			message: 'No valid VISBO Project Template'
		});
	}
	var query = {};
	query._id = vpTemplateID;
	query.vcid = req.body.vcid;
	query.deletedAt =  {$exists: false};	// not deleted
	// Test Ute // 
	// query.vpType = 2; // is a VP Template	

	// prevent that the user gets access to VPs in a later deleted VC. Do not deliver groups from deleted VCs/VPs
	query['vc.deletedAt'] = {$exists: false}; // Do not deliver any VP from a deleted VC

	logger4js.trace('Get Project Query %O', query);
	var queryVP = VisboProject.findOne(query);
	queryVP.exec(function (err, oneVP) {
		if (err) {
			errorHandler(err, res, 'DB: VP Get VP Template', 'Error getting Project Template');
			return;
		}
		if (!oneVP) {
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Project Template or no Permission'
			});
		}
		// vpType is Portfolio. this cannot be a template for a project
		if (oneVP.vpType == 1) {
			return res.status(403).send({
				state: 'failure',
				message: 'No valid Project Template or Project or no Permission'
			});
		}
		req.oneVPTemplate = oneVP;
		logger4js.debug('Found Project Template %s Versions %d', oneVP._id, oneVP.vpvCount);
		if (oneVP.vpvCount > 0) {
			var query2 = {};
			query2.vpid = req.oneVPTemplate._id;
			query2.variantName = '';
			query2.deletedAt = {$exists: false};
			var queryVPV = VisboProjectVersion.findOne(query2);
			queryVPV.sort('-timestamp');
			// queryVPV.lean();
			queryVPV.exec(function (err, oneVPV) {
				if (err) {
					errorHandler(err, res, 'DB: getVPTemplate find', 'Error getting Project Template Version ');
					return;
				}
				if (!oneVPV) {
					return res.status(400).send({
						state: 'failure',
						message: 'No valid Project Template Version found'
					});
				}
				logger4js.debug('Found Project Template Version', oneVPV._id);
				req.oneVPVTemplate = oneVPV;
				return next();
			});
		} else {
			logger4js.debug('Found Project Template %s but no Versions', oneVP._id);
			return next();
		}

	});
}

// Get the organisations for keyMetrics calculation
function getVPOrgs(req, res, next) {
	var baseUrl = req.originalUrl.split('?')[0];
	// fetch the organization in case of POST VP to calculate keyMetrics for the initial version

	let skip = true;
	let withCapa = false;
	if (req.method == 'POST' && baseUrl == '/vp') {	// create VP request
		if (req.query.vpid) { // with a VP Template that requires keyMetrics calculation
			skip = false;
		}
	}
	if (skip) {
		return next();
	}

	if (!req.body.vcid) {
		logger4js.warn('No VISBO Center identified');
		return res.status(400).send({
			state: 'failure',
			message: 'No VISBO Center specified'
		});
	}
	verifyVc.getVCOrganisation(req.body.vcid, withCapa, req, res, next);
}


module.exports = {
	getAllGroups: getAllGroups,
	getVPGroupsOfVC: getVPGroupsOfVC,
	getVP: getVP,
	checkVpfid: checkVpfid,
	squeezePortfolio: squeezePortfolio,
	getVPTemplate: getVPTemplate,
	getVPOrgs: getVPOrgs,
};
