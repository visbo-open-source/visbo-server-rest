var mongoose = require('mongoose');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var VCOrganisation = require('./../models/constOrga').VisboOrga;
var VCOrgaRole = require('./../models/constOrga').VisboOrgaRole;
var VCOrgaCost = require('./../models/constOrga').VisboOrgaCost;

var logModule = 'VC';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

function initOrga(orga, listError) {
	var minDate = new Date('0001-01-01T00:00:00.000Z');
	var maxDate = new Date('2200-01-01');
	var newOrga = new VCOrganisation();
	var isOrgaValid = true;
	if (!orga
		|| !orga.allRoles || orga.allRoles.length == 0
		|| !orga.allCosts
		|| !validate.validateDate(orga.validFrom, true)
	) {
		var errorstring = `Orga bad content in key properties: ${!!orga}, has roles: ${(orga.allRoles || false) && orga.allRoles.length > 0}, has costs: ${!!orga.allCosts}, validFrom: ${orga.validFrom}`
		logger4js.info('InitOrga: ', errorstring);
		listError && listError.push(errorstring);
		return undefined;
	}
	newOrga.validFrom = orga.validFrom;
	// check allRoles
	// MS TODO: Check also subRoleIDs, teamIDs, subCostIds
	newOrga.allRoles = [];
	orga.allRoles.forEach(role => {
		if (validate.validateNumber(role.uid, false) == undefined
			|| !validate.validateName(role.name, false)
			|| !validate.validateDate(role.entryDate, true)
			|| !validate.validateDate(role.exitDate, true)
			|| !validate.validateDate(role.startOfCal, true)
			|| validate.validateNumber(role.tagessatz || role.tagessatzIntern, true) == undefined
		) {
			var errorstring = `Orga Role has bad base structure: uid: ${role.uid}, name?: ${validate.validateName(role.name, false)}`
			listError && listError.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
			return;
		}
		var newRole;
		if (!(role.uid >= 0 && role.name)) {
			var errorstring = `Orga Role has bad content: uid: ${role.uid}`
			listError && listError.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
			return;
		}
		newRole = new VCOrgaRole(role.uid, role.name);
		if (role.isTeam) {
			newRole.isTeam = true;
		}
		newRole.isSummaryRole = role.isSummaryRole || role.subRoleIDs?.length > 0;
		if (role.aliases) {
			newRole.aliases = role.aliases;
		}
		newRole.tagessatz = role.tagessatz || role.tagessatzIntern;
		if (role.exitDate) {
			var exitDate = new Date(role.exitDate);
			if (exitDate.getTime() < maxDate.getTime()) {
				newRole.exitDate = exitDate;
			}
		}
		// set certain property depending if the orga unit is a person or a group/team
		if (newRole.isSummaryRole || newRole.isTeam) {
			// set properties if the role is a group/team role
			newRole.subRoleIDs = [];
			if (role.subRoleIDs && role.subRoleIDs.length > 0) {
				role.subRoleIDs.forEach(item => newRole.subRoleIDs.push({key: validate.convertNumber(item.key), value: validate.convertNumber(item.value)}));
			}
			if (role.isAggregationRole) {
				newRole.isAggregationRole = role.isAggregationRole == true;
			}
			// check Rule2: Group should not have a defaultKapa or defaultDayCapa
			// this is automatically true, as the values are not set for a group
		} else {
			if (role.teamIDs) {
				newRole.teamIDs = [];
				role.teamIDs.forEach(item => newRole.teamIDs.push({key: validate.convertNumber(item.key), value: validate.convertNumber(item.value)}));
			}
			if (role.employeeNr) { newRole.employeeNr = role.employeeNr; }
			if (role.entryDate) {
				var entryDate = new Date(role.entryDate);
				if (entryDate.getTime() > minDate.getTime()) {
					newRole.entryDate = entryDate;
				}
			}
			newRole.isExternRole = role.isExternRole;
			newRole.defaultKapa = role.defaultKapa;
			if (!role.defaultDayCapa && !role.kapazitaet) {
				var errorstring = `Orga Role has no defaultDayCapa & no capacity: uid: ${role.uid}`
				listError && listError.push(errorstring);
				logger4js.info('InitOrga: ', errorstring);
				isOrgaValid = false;
				return;
			}
			newRole.defaultDayCapa = role.defaultDayCapa;
			if (role.kapazitaet && role.startOfCal) {
				var startOfCal = validate.validateDate(role.startOfCal, false);
				if (startOfCal) {
					startOfCal = new Date(startOfCal);
					if (startOfCal.getTime() > minDate.getTime()) {
						newRole.startOfCal = startOfCal;
					}
				}
				newRole.kapazitaet = role.kapazitaet
			}
			newRole.isExternRole = role.isExternRole;
			// check Rule3: persons need to have a tagessatz > 0
			if (!(newRole.tagessatz > 0)) {
				var errorstring = `Orga Role has to have tagessatz: uid: ${newRole.uid}`
				listError && listError.push(errorstring);
				logger4js.info('InitOrga: ', errorstring);
				isOrgaValid = false;
			}
			// check Rule1: internal people need to have capa
			if (!newRole.isExternRole) {
				if (!(newRole.defaultDayCapa >= 0 && newRole.defaultKapa > 0)) {
					var errorstring = `Orga Role Person intern has to have defaultKapa and defaultDayCapa: uid: ${newRole.uid}`
					listError && listError.push(errorstring);
					logger4js.info('InitOrga: ', errorstring);
				}
			}
			newRole.isActDataRelevant = role.isActDataRelevant;
		}
		newOrga.allRoles.push(newRole);
	});
	// check allCosts
	newOrga.allCosts = [];
	orga.allCosts.forEach(cost => {
		if (validate.validateNumber(cost.uid, false) == undefined
			|| !validate.validateName(cost.name, false)
		) {
			var errorstring = `Orga Cost has bad content: uid: ${cost.uid}`
			listError && listError.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
			return;
		}
		if (!(cost.uid >= 0 && cost.name)) {
			var errorstring = `Orga Cost has not accepted uid/name: uid: ${cost.uid}`
			listError && listError.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
			return;
		}
		var newCost = new VCOrgaCost(cost.uid, cost.name);
		newCost.name = cost.name;
		newCost.subCostIDs = [];
		if (cost.subCostIDs && cost.subCostIDs.length > 0) {
			cost.subCostIDs.forEach(item => newCost.subCostIDs.push({key: validate.convertNumber(item.key), value: validate.convertNumber(item.value)}));
		}
		newOrga.allCosts.push(newCost);
	});

	return isOrgaValid ? newOrga : undefined;
}

// gets the maxID for Role or Cost either as a stored property or by calculation of the max value
function getMaxID(orga, type) {
	var result = undefined;
	if (!orga) {
		return result;
	}
	if (type == 1 || type == 2) {
		if (orga.maxRoleID) {
			result = orga.maxRoleID
		} else {
			orga.allRoles.forEach(role => {
				result = Math.max(result || 0, role.uid);
			})
		}
	} else {
		if (orga.maxCostID) {
			result = orga.maxCostID
		} else {
			orga.allCosts.forEach(cost => {
				result = Math.max(result || 0, cost.uid);
			})
		}
	}
	return result;
}

function generateIndexedOrgaRoles(orga) {
	let listOrga = [];
	if (!orga?.allRoles) {
		return listOrga;
	}
	orga.allRoles.forEach(role => {
		listOrga[role.uid] = role;
	});
	return listOrga;
}

function initOrgaReduced(orgaReduced, timestamp, oldOrga, listError) {
	var minDate = new Date('0001-01-01T00:00:00.000Z');
	var maxDate = new Date('2200-01-01');
	var newOrga = new VCOrganisation();
	var isOrgaValid = true;
	var oldOrgaIndexed = generateIndexedOrgaRoles(oldOrga);
	if (!orgaReduced?.length > 0) {
		var errorstring = `Reduced Orga List empty`
		logger4js.info('InitOrgaReduced: ', errorstring);
		listError && listError.push(errorstring);
		return undefined;
	}
	newOrga.validFrom = timestamp;

	// check allRoles
	// MS TODO: Check also subRoleIDs, teamIDs, subCostIds
	newOrga.allRoles = [];
	var uniqueRoleNames = [];
	var uniqueCostNames = [];
	var maxRoleID = getMaxID(oldOrga, 1);
	var maxCostID = getMaxID(oldOrga, 3);
	orgaReduced.forEach(role => {
		if (validate.validateNumber(role.uid, true) == undefined
			|| (validate.validateNumber(role.type, false) == undefined || role.type < 1 || role.type > 3)
			|| !validate.validateName(role.name, false)
			|| !validate.validateName(role.parent, true)
			|| !validate.validateDate(role.entryDate, true)
			|| !validate.validateDate(role.exitDate, true)
			|| validate.validateNumber(role.tagessatz, true) == undefined
		) {
			var errorstring = `Orga Role has bad base structure: uid: ${role.uid}, name?: ${validate.validateName(role.name, false)}`
			listError && listError.push(errorstring);
			logger4js.info('InitOrgaReduced: ', errorstring);
			isOrgaValid = false;
			return;
		}
		if (role.type == 1 || role.type == 2) {
			var newRole;
			if (role.uid == undefined) {
				role.uid = ++maxRoleID;
			}
			newRole = new VCOrgaRole(role.uid, role.name);
			newRole.type = role.type;
			newRole.parent = role.parent;
			newRole.isSummaryRole = role.isSummaryRole;
			if (role.aliases) {
				newRole.aliases = role.aliases;
			}
			newRole.tagessatz = role.tagessatz || 0;
			if (role.exitDate) {
				var exitDate = new Date(role.exitDate);
				if (exitDate.getTime() < maxDate.getTime()) {
					newRole.exitDate = exitDate;
				}
			}
			// set certain property depending if the orga unit is a person or a group/team
			if (newRole.isSummaryRole) {
				// set properties if the role is a group/team role
				newRole.subRoleIDs = [];
				// if (role.subRoleIDs && role.subRoleIDs.length > 0) {
				// 	role.subRoleIDs.forEach(item => newRole.subRoleIDs.push({key: validate.convertNumber(item.key), value: validate.convertNumber(item.value)}));
				// }
				if (role.isAggregationRole) {
					newRole.isAggregationRole = role.isAggregationRole == true;
				}
				// check Rule2: Group should not have a defaultKapa or defaultDayCapa
				// this is automatically true, as the values are not set for a group
			} else {
				// if (role.teamIDs) {
				// 	newRole.teamIDs = [];
				// 	role.teamIDs.forEach(item => newRole.teamIDs.push({key: validate.convertNumber(item.key), value: validate.convertNumber(item.value)}));
				// }
				if (role.employeeNr) { newRole.employeeNr = role.employeeNr; }
				if (role.entryDate) {
					var entryDate = new Date(role.entryDate);
					if (entryDate.getTime() > minDate.getTime()) {
						newRole.entryDate = entryDate;
					}
				}
				newRole.isExternRole = role.isExternRole;
				newRole.defaultKapa = role.defaultKapa;
				if (!(role.defaultDayCapa >= 0)) {
					var errorstring = `Orga Role has no defaultDayCapa: uid: ${role.name}`
					listError && listError.push(errorstring);
					logger4js.info('InitOrgaReduced: ', errorstring);
					isOrgaValid = false;
					return;
				}
				newRole.defaultDayCapa = role.defaultDayCapa;
				newRole.isExternRole = role.isExternRole;
				// check Rule3: persons need to have a tagessatz > 0
				if (!(newRole.tagessatz > 0)) {
					var errorstring = `Orga Role has to have tagessatz: uid: ${newRole.uid}`
					listError && listError.push(errorstring);
					logger4js.info('InitOrgaReduced: ', errorstring);
					isOrgaValid = false;
				}
				// check Rule1: internal people need to have capa
				if (!newRole.isExternRole) {
					if (!(newRole.defaultDayCapa >= 0 && newRole.defaultKapa > 0)) {
						var errorstring = `Orga Role Person intern has to have defaultKapa and defaultDayCapa: uid: ${newRole.uid}`
						listError && listError.push(errorstring);
						logger4js.info('InitOrgaReduced: ', errorstring);
						isOrgaValid = false;
					}
				}
				newRole.isActDataRelevant = role.isActDataRelevant;
			}
			if (role.type == 2 && !role.isSummaryRole) {
				// role is a team member
				if (!uniqueRoleNames[role.name]) {
					var errorstring = `Orga Role Name in Team not found: uid: ${role.uid}, name: ${role.name}`
					listError && listError.push(errorstring);
					logger4js.info('InitOrgaReduced: ', errorstring);
					isOrgaValid = false;
					return;
				}
				newRole.percent = role.percent || 0;
			} else {
				if (uniqueRoleNames[role.name]) {
					var errorstring = `Orga Role Name not unique: uid: ${role.uid}, name: ${role.name}`
					listError && listError.push(errorstring);
					logger4js.info('InitOrgaReduced: ', errorstring);
					isOrgaValid = false;
					return;
				}
				uniqueRoleNames[newRole.name] = newRole;
			}
			// validate against old entry if it exists
			var oldRole = oldOrgaIndexed[newRole.uid]
			if (oldRole) {
				if ((oldRole.isSummaryRole == true) != (newRole.isSummaryRole == true)) {
					var errorstring = `Changed Orga Role isSummaryRole: uid: ${newRole.uid}, name: ${newRole.name}`
					listError && listError.push(errorstring);
					logger4js.info('InitOrgaReduced: ', errorstring);
					isOrgaValid = false;
					return;
				}
				if (oldRole.exitDate?.getTime() != newRole.exitDate?.getTime()) {
					// exit date has changed verify that the new one is greater equal TimeStamp
					if (newRole.exitDate?.getTime() < timestamp.getTime()) {
						var errorstring = `Changed Orga Role exitDate to the past: uid: ${newRole.uid}, name: ${newRole.name}`
						listError && listError.push(errorstring);
						logger4js.info('InitOrgaReduced: ', errorstring);
						isOrgaValid = false;
						return;
					}
				}
			}
			newOrga.allRoles.push(newRole);
		} else if (role.type == 3){
			// handle cost entry
			var newCost;
			if (role.uid == undefined) {
				role.uid = ++maxCostID;
			}
			newCost = new VCOrgaCost(role.uid, role.name);
			newCost.parent = role.parent;
			newCost.type = role.type;

			if (role.isSummaryRole) {
				newCost.isSummaryRole = role.isSummaryRole;
				newCost.subRoleIDs = [];
			}
			if (uniqueCostNames[newCost.name]) {
				var errorstring = `Orga Cost Name not unique: uid: ${newCost.uid}, name: ${newCost.name}`
				listError && listError.push(errorstring);
				logger4js.info('InitOrgaReduced: ', errorstring);
				isOrgaValid = false;
				return;
			}
			uniqueCostNames[newCost.name] = newCost;
			newOrga.allCosts.push(newCost);
		}
	});
	if (isOrgaValid) {
		newOrga.allRoles.forEach(role => {
			// link the parent roles
			var parentRole;
			if (role.parent) {
				//check if parent exists?
				parentRole = uniqueRoleNames[role.parent];
				if (parentRole) {
					// map the item to the parent
					parentRole.subRoleIDs.push(role.uid);
				} else {
					var errorstring = `Orga Role has no valid parent: uid: ${role.uid} parent: ${role.parent}`
					listError && listError.push(errorstring);
					logger4js.info('InitOrgaReduced: ', errorstring);
					isOrgaValid = false;
				}
			}
			// link the teamIDs
			if (role.type == 2 && !role.isSummaryRole && parentRole) {
				var user = newOrga.allRoles.find(item => item.uid == role.uid && item.type == 1);
				if (user) {
					if (user.teamIDs == undefined) {
						user.teamIDs = [];
					}
					user.teamIDs.push({key: parentRole.uid, value: role.percent});
				} else {
					var errorstring = `Orga Team Role not found in orga: uid: ${role.uid} parent: ${role.name}`
					listError && listError.push(errorstring);
					logger4js.info('InitOrgaReduced: ', errorstring);
					isOrgaValid = false;
				}
			}

		});
		newOrga.allCosts.forEach(cost => {
			if (cost.parent) {
				//check if parent exists?
				var parentCost = uniqueCostNames[cost.parent];
				if (parentCost) {
					// map the item to the parent
					parentCost.subRoleIDs.push(cost.uid);
				} else {
					var errorstring = `Orga Cost has no valid parent: uid: ${cost.uid} parent: ${cost.parent}`
					listError && listError.push(errorstring);
					logger4js.info('InitOrgaReduced: ', errorstring);
					isOrgaValid = false;
				}
			}
		});
		newOrga.maxRoleID = maxRoleID;
		newOrga.maxCostID = maxCostID;

		// check that there were no deleted orga units that should not be deleted
		if (!checkOrgaUnitDelete(oldOrga, uniqueRoleNames, listError)) {
			isOrgaValid = false;
		}
	}
	return isOrgaValid ? newOrga : undefined;
}

function checkOrgaUnitDelete(orga, uniqueRoleNames, listError) {
	var isOrgaValid = true;
	var deleteExitDate = new Date();
	deleteExitDate.setDate(1);
	deleteExitDate.setHours(0, 0, 0, 0);
	deleteExitDate.setMonth(deleteExitDate.getMonth() - 3);

	if (!orga?.allRoles || !uniqueRoleNames) {
		var errorstring = `Orga Role Check for Deleted has no valid orga: ${orga?.allRoles?.length} list: ${uniqueRoleNames?.length}`
		listError && listError.push(errorstring);
		logger4js.info('checkOrgaUnitDelete: ', errorstring);
		return false;
	}
	orga.allRoles.forEach(role => {
		if (!uniqueRoleNames[role.name]) {
			// role is missing in new Orga
			if (role.exitDate?.getTime() <= deleteExitDate.getTime()) {
				logger4js.debug('checkOrgaUnitDelete Accepted: ', role.uid, role.name);
			} else {
				var errorstring = `Orga Role Deleted not allowed: ${role.uid} / ${role.name} with exitDate ${role.exitDate?.toISOString()}`
				listError && listError.push(errorstring);
				logger4js.info('checkOrgaUnitDelete: ', errorstring);
				isOrgaValid = false;
			}
		}
	})
	return isOrgaValid;
}

// reduce orga to a flat list with parent reference
function reduceOrga(orga) {
	var organisation = [];
	var minDate = new Date("0001-01-01");
	var maxDate = new Date("2200-11-30");
	if (!orga || !orga.allRoles) {
		return organisation;
	}
	orga.allRoles.forEach(role => {
		if (!organisation[role.uid]) {
			var newRole = {};
			newRole.uid = role.uid;
			newRole.calcid = role.uid;
			newRole.pid = undefined;
			organisation[role.uid] = newRole;
		}
		organisation[role.uid].name = role.name;
		if (role.isSummaryRole) { organisation[role.uid].isSummaryRole = role.isSummaryRole; }
		if (role.isTeam) { organisation[role.uid].isTeam = role.isTeam; }
		if (role.isAggregationRole) { organisation[role.uid].isAggregationRole = role.isAggregationRole; }
		if (role.isExternRole) { organisation[role.uid].isExternRole = role.isExternRole; }
		if (role.defaultKapa) { organisation[role.uid].defaultKapa = role.defaultKapa; }
		if (role.defaultDayCapa) { organisation[role.uid].defaultDayCapa = role.defaultDayCapa; }
		if (role.tagessatz >= 0) { organisation[role.uid].tagessatz = role.tagessatz; }
		if (role.entryDate?.getTime() > minDate.getTime()) {
			organisation[role.uid].entryDate = role.entryDate;
		}
		if (role.exitDate?.getTime() < maxDate.getTime()) {
			organisation[role.uid].exitDate = role.exitDate;
		}
		if (role.aliases) { organisation[role.uid].aliases = role.aliases; }
		if (role.isTeam) {
			organisation[role.uid].type = 2;
			organisation[role.uid].isTeam = true;
		} else {
			organisation[role.uid].type = 1;
		}
		role.subRoleIDs?.forEach(item => {
			const index = Number(item.key);
			if (index < 0) {
				logger4js.info(`Inconsistent Org Structure Role ${role.uid} SubRole ${index}`);
				// something wrong with the numbering
				return;
			}
			if (!organisation[index]) {
				// added by subrole
				var newRole = {};
				newRole.uid = index;
				newRole.calcid = index;
				organisation[index] = newRole;
			} else {
				logger4js.info(`SubRole already exists ${role.uid} SubRole ${index}`);
			}
			if (!organisation[index].pid) {
				organisation[index].pid = role.uid;
			}
		});
	});

	// build team members Information by duplicating users with their percentage
	var maxid = 0;
	orga.allRoles.forEach(element => { maxid = Math.max(element.uid, maxid) });
	logger4js.debug('MaxID: ', maxid);
	orga.allRoles.forEach(role => {
		if (role.isTeam && role.subRoleIDs) {
			for (let j = 0; j < role.subRoleIDs.length; j++) {
				const index = role.subRoleIDs[j].key;
				if (!organisation[index] || organisation[index].isTeam) {
					// nothing to do
					continue;
				}
				const userRole = organisation[index];
				// now it is a user, add a new entry to the team
				maxid += 1;
				organisation[maxid] = {};
				organisation[maxid].uid = index;
				organisation[maxid].calcid = maxid;
				organisation[maxid].type = 2;
				organisation[maxid].pid = role.uid;
				organisation[maxid].name = userRole.name;
				organisation[maxid].parent = role.name;
				if (userRole.employeeNr) { organisation[maxid].employeeNr = userRole.employeeNr; }
				if (userRole.isExternRole) { organisation[maxid].isExternRole = userRole.isExternRole }
				if (userRole.defaultDayCapa >= 0) { organisation[maxid].defaultDayCapa = userRole.defaultDayCapa; }
				if (userRole.defaultKapa >= 0) { organisation[maxid].defaultKapa = userRole.defaultKapa; }
				if (userRole.tagessatz >= 0) { organisation[maxid].tagessatz = userRole.tagessatz; }
				if (userRole.entryDate) { organisation[maxid].entryDate = userRole.entryDate; }
				if (userRole.exitDate) { organisation[maxid].exitDate = userRole.exitDate; }
				if (userRole.aliases) { organisation[maxid].aliases = userRole.aliases; }
				if (userRole.isAggregationRole) { organisation[maxid].isAggregationRole = userRole.isAggregationRole }
				if (userRole.isSummaryRole) { organisation[maxid].isSummaryRole = userRole.isSummaryRole }
				if (userRole.isActDataRelevant) { organisation[maxid].isActDataRelevant = userRole.isActDataRelevant }
				organisation[maxid].percent = Number(role.subRoleIDs[j].value) || 0;
			}
		}
	});

	organisation.forEach(item => calcFullPath(item.calcid, organisation));
	organisation = organisation.filter(item => item.calcid !== undefined);
	organisation.sort(function(a, b) {
		if (a.type != b.type) {
			return a.type - b.type;
		} else {
			return a.path.localeCompare(b.path);
		}
	});

	// build cost Information hierarchy
	var listCost = [];
	orga.allCosts?.forEach(cost => {
		if (!listCost[cost.uid]) {
			listCost[cost.uid] = {}
			listCost[cost.uid].uid = cost.uid;
			listCost[cost.uid].calcid = cost.uid;
			listCost[cost.uid].pid = undefined;
		}
		listCost[cost.uid].name = cost.name;
		listCost[cost.uid].type = 3;
		if (cost.subCostIDs?.length > 0) {
			listCost[cost.uid].isSummaryRole = true;
		}
		cost.subCostIDs?.forEach(item => {
			const index = Number(item.key);
			if (index < 0) {
				logger4js.warn(`Inconsistent Org Structure Cost ${cost.uid} SubCost ${item.key}`);
				// something wrong with the numbering
				return;
			}
			if (!listCost[index]) {
				// added by subCost
				listCost[index] = {};
				listCost[index].uid = index;
				listCost[index].calcid = index;
			} else {
				logger4js.debug(`listCost already exists ${cost.uid} listCost ${index}`);
			}
			listCost[index].pid = cost.uid;
		})
	});

	listCost.forEach(item => calcFullPath(item.calcid, listCost));
	listCost = listCost.filter(item => item.calcid !== undefined);
	listCost.sort(function(a, b) {
		if (a.type != b.type) {
			return a.type - b.type;
		} else {
			return a.path.localeCompare(b.path);
		}
	});
	// add the list to the orga list
	listCost.forEach(item => organisation.push(item));

	organisation.forEach(item => delete item.calcid);
	return organisation;
}

function calcFullPath(id, organisation) {
	if (!organisation || !(id >= 0)) {
		return;
	}
	let path = '';
	let index = id;
	let level = -1;
	if (organisation[index]) {
		const pid = organisation[index] && organisation[index].pid;
		if (pid >= 0) {
			organisation[index].parent = organisation[pid] && organisation[pid].name;
		}
	}
	while (index >= 0 && organisation[index]) {
		path = '/'.concat(organisation[index].name, path);
		index = organisation[index].pid;
		level += 1;
	}
	organisation[id].path = path;
	organisation[id].level = level;
}

// check orga
// compares uid consistency between new & old orga
function verifyOrga(newOrga, oldOrga) {
	if (!newOrga) {
		return false;
	}
	if (!oldOrga) {
		return true;	// nothing to compare
	}
	logger4js.debug('verify Organisations ', newOrga.name, oldOrga.name, oldOrga.timestamp);
	var result = true;
	if ( oldOrga ) {
		var oldTimestamp = validate.validateDate(oldOrga.validFrom, false);
		var newTimestamp = validate.validateDate(newOrga.validFrom, false);
		if ( newTimestamp < oldTimestamp ) {
			logger4js.info('newOrga older as oldOrga: timestamps', newTimestamp , oldTimestamp);
			return false;
		}
		result =  checkUIDs(newOrga, oldOrga);
	}
	return result;
}

function checkUIDs(newOrga, oldOrga) {
	logger4js.trace('checkUIDs: Are all uids of the oldOrga in the newOrga as well? ', newOrga && newOrga.allRoles && newOrga.allRoles.length, oldOrga && oldOrga.allRoles && oldOrga.allRoles.length);
	var i = 0;

	if (!oldOrga || !newOrga) {
		logger4js.warn('Error: either the new organisation or the old organisation or both are undefined');
		return false;
	}

	// check all UIDs of roles - they all have to exist in the newOrga as well
	var allNewRoles = [];
	var resultRoles = true;
	newOrga.allRoles && newOrga.allRoles.forEach(role => {
		allNewRoles[role.uid] = role;
	});
	oldOrga.allRoles && oldOrga.allRoles.forEach(role => {
		if (!allNewRoles[role.uid]) {
			logger4js.info('Error: Role-UID ( %s - %s) is missing in newOrga', role.uid, role.name);
			resultRoles = false;
		}
	});
	if (resultRoles) {
		logger4js.debug('newOrga Roles (%s) includes all old Orga roles' , newOrga.allRoles.length);
	}

	// check all UIDs of costs - they all have to exist in the newOrga as well
	var allNewCosts = [];
	var resultCosts = true;
	newOrga.allCosts && newOrga.allCosts.forEach(cost => {
		allNewCosts[cost.uid] = cost;
	});
	oldOrga.allCosts && oldOrga.allCosts.forEach(cost => {
		if (!allNewCosts[cost.uid]) {
			logger4js.info('Error: Cost-UID ( %s - %s) is missing in newOrga', role.uid, role.name);
			resultCosts = false;
		}
	});
	if (resultCosts) {
		logger4js.debug('newOrga Costs (%s) includes all old Orga costs' , newOrga.allCosts.length);
	}
	return resultCosts && resultRoles;
}

function joinCapacity(orga, capacity) {
	if (!orga?.value?.allRoles || !capacity) {
		logger4js.warn('joinCapacity invalid organisation %d', orga?.value?.allRoles?.length);
		return
	}
	if (!capacity) {
		logger4js.debug('joinCapacity no capacity to join');
		return
	}
	logger4js.trace('joinCapacity %d' , capacity.length);
	var combinedCapacity = combineCapacity(capacity);
	orga.value.allRoles.forEach(role => {
		if (!role.isSummaryRole) {
			newCapa = combinedCapacity.find(item => item.roleID == role.uid);
			if (newCapa) {
				role.kapazitaet = newCapa.capaPerMonth;
				role.startOfCal = newCapa.startOfYear;
			}
		}
	});
}

function combineCapacity(capacity) {
	var combinedCapacity = [];
	capacity.sort(function(a, b) { return a.startOfYear.getTime() - b.startOfYear.getTime(); });
	capacity.forEach(capa => {
		var fullCapa = combinedCapacity.find(item => item.roleID == capa.roleID);
		var startOfNextYear;
		if (!fullCapa) {
			fullCapa = {};
			fullCapa.vcid = capa.vcid;
			fullCapa.roleID = capa.roleID;
			fullCapa.startOfYear = new Date(capa.startOfYear);
			fullCapa.capaPerMonth = [];
			// copy the capa array instead of referencing
			capa.capaPerMonth.forEach(item => fullCapa.capaPerMonth.push(item));
			// new entry, just add the yearly capacity as a new entry
			combinedCapacity.push(fullCapa);
		} else {
			// combine the already existing entry by adding the values to the end but handle potentially gap
			startOfNextYear = new Date(fullCapa.startOfYear);
			startOfNextYear.setMonth(startOfNextYear.getMonth() + fullCapa.capaPerMonth.length);
			// fill the gap
			while (startOfNextYear.getTime() < capa.startOfYear.getTime()) {
				fullCapa.capaPerMonth.push(undefined);
				startOfNextYear.setMonth(startOfNextYear.getMonth() + 1);
			}
			// add the capa for the year
			capa.capaPerMonth.forEach(item => fullCapa.capaPerMonth.push(item));
		}
	})
	return combinedCapacity;
}

module.exports = {
	initOrga: initOrga,
	initOrgaReduced: initOrgaReduced,
	reduceOrga: reduceOrga,
	joinCapacity: joinCapacity,
	verifyOrga: verifyOrga
};
