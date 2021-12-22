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
			if (role.exitDate) {
				var exitDate = new Date(role.exitDate);
				if (exitDate.getTime() < maxDate.getTime()) {
					newRole.exitDate = exitDate;
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
		logger4js.warn('joinCapacity invalid organisation %d or capacity %d' , orga?.value?.allRoles?.length, capacity?.length);
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
	joinCapacity: joinCapacity,
	verifyOrga: verifyOrga
};
