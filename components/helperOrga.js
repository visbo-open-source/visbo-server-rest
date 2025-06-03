var validate = require('./../components/validate');

var VCOrganisation = require('./../models/constOrga').VisboOrga;
var VCOrgaRole = require('./../models/constOrga').VisboOrgaRole;
var VCOrgaCost = require('./../models/constOrga').VisboOrgaCost;

var logModule = 'VC';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);


/* The initOrga function initializes a new organization (VCOrganisation) by validating and processing role data from an input orga object.
It:
	Validates input data (roles, costs, structure).
	Checks and corrects role properties (e.g., email, daily rate, capacities).
	Ensures data integrity by comparing with the oldOrga (previous organization state).
	Logs and collects errors in listError when inconsistencies are found.
This function ensures that organizational roles and cost structures remain consistent and valid over time. */
/* It returns
	newOrga		The initialized VCOrganisation object (if valid).
	undefined	If validation fails, returns undefined and logs errors.
 */

function initOrga(orga, timestamp, oldOrga, listError) {
	var minDate = new Date('0001-01-01T00:00:00.000Z');
	var maxDate = new Date('2200-01-01');
	var errorstring;
	var newOrga = new VCOrganisation();
	newOrga.validFrom = timestamp;
	var isOrgaValid = true;
	var oldOrgaIndexed = generateIndexedOrgaRoles(oldOrga);
	if (!orga
		|| !orga.allRoles || orga.allRoles.length == 0
		|| !orga.allCosts
	) {
		errorstring = `Orga bad content in key properties: ${!!orga}, has roles: ${(orga.allRoles || false) && orga.allRoles.length > 0}, has costs: ${!!orga.allCosts}`;
		logger4js.info('InitOrga: ', errorstring);
		listError?.push(errorstring);
		return undefined;
	}
	// check allRoles
	// MS TODO: Check also subRoleIDs, teamIDs, subCostIds
	var uniqueRoleNames = [];
	var uniqueCostNames = [];
	var maxRoleID = getMaxID(oldOrga, 1);
	var maxCostID = getMaxID(oldOrga, 3);
	newOrga.allRoles = [];
	orga.allRoles.forEach((role, index) => {
		if (!(role.name || '').trim()) {
			// skip empty entry
			return;
		}
		if (validate.validateNumber(role.uid, false) == undefined
			|| !validate.validateName(role.name, false)
			|| !validate.validateEmail(role.email, true)
			|| !validate.validateDate(role.entryDate, true)
			|| !validate.validateDate(role.exitDate, true)
			|| !validate.validateDate(role.startOfCal, true)
			|| validate.validateNumber(role.dailyRate, true) == undefined
			|| validate.validateNumber(role.defCapaMonth, true) == undefined
			|| validate.validateNumber(role.defCapaDay, true) == undefined
		) {
			errorstring = `${index+2}: Orga Role has bad base structure, uid: ${role.uid || ''}, name: ${role.name}, role: ${JSON.stringify(role)} `;
			listError?.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
			return;
		}
		var newRole;
		if (!(role.uid >= 0 && role.name)) {
			errorstring = `Orga Role has bad content: uid: ${role.uid} name: ${role.name}`;
			listError?.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
			return;
		}
		newRole = new VCOrgaRole(role.uid, role.name);
		maxRoleID = Math.max(maxRoleID, role.uid);
		newRole.type = role.type == 2 ? 2 : 1;
		if (role.isTeam) {
			newRole.type = 2;
			role.isSummaryRole = true;
		}
		newRole.isSummaryRole = role.isSummaryRole || role.subRoleIDs?.length > 0;
		if (role.aliases) {
			newRole.aliases = role.aliases;
		}
		if (role.email) {
			newRole.email = role.email;
		} 
		
		newRole.dailyRate = role.dailyRate;
		// check Rule3: orga units need to have a valid dailyRate
		if (!(newRole.dailyRate >= 0)) {
			errorstring = `Orga Role has to have dailyRate: uid: ${newRole.uid} dailyRate: ${newRole.dailyRate}`;
			listError?.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
		}
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
				newRole.aggregationID = role.uid;
			}
			// check Rule2: Group should not have a defCapaMonth or defCapaDay
			// this is automatically true, as the values are not set for a group
		} else {
			if (role.type == 2 || role.teamIDs?.length > 0) {
				newRole.teamIDs = [];
				role.teamIDs?.forEach(item => newRole.teamIDs.push({key: validate.convertNumber(item.key), value: validate.convertNumber(item.value)}));
			}
			if (role.employeeNr) { newRole.employeeNr = role.employeeNr; }
			if (role.entryDate) {
				var entryDate = new Date(role.entryDate);
				if (entryDate.getTime() > minDate.getTime()) {
					newRole.entryDate = entryDate;
				}
			}
			if (role.isExternRole) { newRole.isExternRole = true; }
			newRole.defCapaMonth = validate.validateNumber(role.defCapaMonth) || 0;
			if (newRole.defCapaMonth < 0) {
				errorstring = `Orga Role has no valid defCapaMonth: uid: ${role.name}`;
				listError?.push(errorstring);
				logger4js.info('InitOrgaList: ', errorstring);
				isOrgaValid = false;
				return;
			}
			newRole.defCapaDay = validate.validateNumber(role.defCapaDay) || 0;
			if (newRole.defCapaDay < 0) {
				errorstring = `Orga Role has no defCapaDay: uid: ${role.name}`;
				listError?.push(errorstring);
				logger4js.info('InitOrgaList: ', errorstring);
				isOrgaValid = false;
				return;
			}

			// check Rule1: internal people need to have capa
			if (!newRole.isExternRole) {
				if (!(newRole.defCapaDay >= 0 && newRole.defCapaMonth >= 0)) {
					errorstring = `Orga Role Person intern has to have defCapaMonth and defCapaDay: uid: ${newRole.uid}`;
					listError?.push(errorstring);
					logger4js.info('InitOrga: ', errorstring);
				}
			}
			// newRole.isActDataRelevant = role.isActDataRelevant;
		}

		if (uniqueRoleNames[role.name]) {
			errorstring = `Orga Role Name not unique: uid: ${role.uid}, name: ${role.name}`;
			listError?.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
			return;
		}
		uniqueRoleNames[newRole.name] = newRole;
		// validate against old entry if it exists
		var oldRole = oldOrgaIndexed[newRole.uid];
		if (oldRole) {
			if ((oldRole.isSummaryRole == true) != (newRole.isSummaryRole == true)) {
				errorstring = `Changed Orga Role isSummaryRole: uid: ${newRole.uid}, name: ${newRole.name}`;
				listError?.push(errorstring);
				logger4js.info('InitOrga: ', errorstring);
				isOrgaValid = false;
				return;
			}
			if (!validate.isSameDay(oldRole.exitDate, newRole.exitDate)) {
				// exit date has changed verify that the new one, if it is set, is greater equal TimeStamp
				if (newRole.exitDate && newRole.exitDate.getTime() < timestamp.getTime()) {
					errorstring = `Changed Orga Role exitDate to the past: uid: ${newRole.uid}, name: ${newRole.name}`;
					listError?.push(errorstring);
					logger4js.info('InitOrga: ', errorstring);
					isOrgaValid = false;
					return;
				}
			}
		}
		newOrga.allRoles.push(newRole);
	});

	if (isOrgaValid) {
		// check that all subRoleIDs exists
		var newOrgaIndexed = generateIndexedOrgaRoles(newOrga);
		newOrga.allRoles.forEach(role => {
			role.subRoleIDs?.forEach(subRole => {
				if (!newOrgaIndexed[subRole.key]) {
					errorstring = `Unknown subRoleID: uid: ${role.uid}, name: ${role.name}, subRole: ${subRole.key}`;
					listError?.push(errorstring);
					logger4js.info('InitOrga: ', errorstring);
					isOrgaValid = false;
				} else if (role.type == 1){
					newOrgaIndexed[subRole.key].pid = role.uid;
				}
			});
			role.teamIDs?.forEach(teamID => {
				if (!newOrgaIndexed[teamID.key]) {
					errorstring = `Unknown teamID: uid: ${role.uid}, name: ${role.name}, teamID: ${teamID.key}`;
					listError?.push(errorstring);
					logger4js.info('InitOrga: ', errorstring);
					isOrgaValid = false;
				}
			});
			if (role.isSummaryRole) {
				// set the aggregationID for the reduction
				role.aggregationID = calcAggregationID(role, newOrgaIndexed);
			}
		});
	}

	// check allCosts
	newOrga.allCosts = [];
	orga.allCosts.forEach(cost => {
		if (validate.validateNumber(cost.uid, false) == undefined
			|| !validate.validateName(cost.name, false)
		) {
			errorstring = `Orga Cost has bad content: uid: ${cost.uid}`;
			listError?.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
			return;
		}
		if (!(cost.uid >= 0 && cost.name)) {
			errorstring = `Orga Cost has not accepted uid/name: uid: ${cost.uid}`;
			listError?.push(errorstring);
			logger4js.info('InitOrga: ', errorstring);
			isOrgaValid = false;
			return;
		}
		var newCost = new VCOrgaCost(cost.uid, cost.name);
		maxCostID = Math.max(maxCostID, cost.uid);
		newCost.name = cost.name;
		newCost.subCostIDs = [];
		cost.subCostIDs?.forEach(item => {
			newCost.subCostIDs.push({key: validate.convertNumber(item.key), value: validate.convertNumber(item.value)});
		});
		if (uniqueCostNames[newCost.name]) {
			errorstring = `Orga Cost Name not unique: uid: ${newCost.uid}, name: ${newCost.name}`;
			listError?.push(errorstring);
			logger4js.info('InitOrgaList: ', errorstring);
			isOrgaValid = false;
			return;
		}
		uniqueCostNames[newCost.name] = newCost;
		newOrga.allCosts.push(newCost);
	});
	newOrga.maxRoleID = maxRoleID;
	newOrga.maxCostID = maxCostID;

	return isOrgaValid ? newOrga : undefined;
}

// calculate the aggregationID for this orga unit for a summary role, either the folder itself or the first parent that has isAggregation set

/* The calcAggregationID function determines the aggregation ID for a given role within an organizational structure.
It:
	Checks if the role is a summary role (isSummaryRole: true).
	Traverses up the hierarchy (pid chain) to find the nearest role marked as isAggregationRole: true.
	Returns the found aggregation role's uid or defaults to the role's own uid if none exists.
This function is used to assign aggregation IDs to roles in hierarchical organizational structures. */

function calcAggregationID(role, indexedOrga) {
		if (!role?.isSummaryRole) {
			return undefined;
		}
		var actRole = role;
		while (actRole.pid && !actRole.isAggregationRole) {
			actRole = indexedOrga[actRole.pid];
		}
		if (actRole.isAggregationRole) {
			// we have found one
			return actRole.uid;
		} else {
			return role.uid;
		}
}

// gets the maxID for Role or Cost either as a stored property or by calculation of the max value

/* The getMaxID function retrieves the highest UID for roles or costs in an organization (orga).
It:
	Validates if orga exists (returns 0 if not provided).
	Determines whether to search for maxRoleID or maxCostID based on type:
	Type 1 or 2 → Search in allRoles.
	Other types → Search in allCosts.
	Returns the maximum ID found, either from maxRoleID/maxCostID or by iterating through the allRoles/allCosts arrays. */

function getMaxID(orga, type) {
	var result = 0;
	if (!orga) {
		return result;
	}
	if (type == 1 || type == 2) {
		if (orga.maxRoleID) {
			result = orga.maxRoleID;
		} else {
			orga.allRoles.forEach(role => {
				result = Math.max(result || 0, role.uid);
			});
		}
	} else {
		if (orga.maxCostID) {
			result = orga.maxCostID;
		} else {
			orga.allCosts.forEach(cost => {
				result = Math.max(result || 0, cost.uid);
			});
		}
	}
	return result;
}

/* The generateIndexedOrgaRoles function creates an indexed dictionary (object) of roles from an organization's allRoles array.
It:
	Validates the input orga object (returns an empty object if invalid).
	Iterates through orga.allRoles and maps each role's uid to the role object.
	Returns the indexed object, allowing faster lookups by uid.

This function is useful for quick role retrieval in hierarchical organization structures. */
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

function getFullPath(role) {
	if (!role?.path) return '';
	return role.path.concat(role.name || '');
}

/* The initOrgaFromList function initializes an organization (VCOrganisation) from a list of roles and costs, ensuring data integrity, 
role hierarchy, and unique identifiers.
It:
	Validates the input organization list (orgaList).
	Processes roles and costs, ensuring correct IDs, hierarchy, and attributes.
	Checks for data integrity, including email validation, duplicate names, and hierarchy consistency.
	Links roles and costs to their respective parents for correct hierarchical relationships.
	Performs final validation checks before returning a new VCOrganisation.
This function ensures that organizational data is properly structured and error-free.
 */
/* Returns
	newOrga		A newly initialized VCOrganisation object (if validation is successful).
	undefined	if validation fails, returns undefined and logs errors. 
*/
function initOrgaFromList(orgaList, timestamp, oldOrga, listError) {
	var minDate = new Date('0001-01-01T00:00:00.000Z');
	var maxDate = new Date('2200-01-01');
	var newOrga = new VCOrganisation();
	var isOrgaValid = true;
	var errorstring;
	var oldOrgaIndexed = generateIndexedOrgaRoles(oldOrga);
	if (!orgaList?.length > 0) {
		errorstring = 'Orga List empty';
		logger4js.info('InitOrgaFromList: ', errorstring);
		listError?.push(errorstring);
		return undefined;
	}
	newOrga.validFrom = timestamp;

	// check allRoles
	newOrga.allRoles = [];
	newOrga.allCosts = [];
	var uniqueRoleNames = [];
	var uniqueCostNames = [];
	var uniqueAliasesNames = [];
	var maxRoleID = getMaxID(oldOrga, 1);
	var maxCostID = getMaxID(oldOrga, 3);
	orgaList.forEach((role, index) => {
		if (!(role.name || '').trim()) {
			// skip empty entry
			return;
		}
		let errorDetails = [];
		if (role.isSummaryRole || role.isExternRole || role.type == 3 || role.type == 2){		// ???? TODO UR	
			if (!validate.validateEmail(role.email, true)) {errorDetails.push(`email not accepted: ${role.email || ''}`);}
		} else {				
			if (!validate.validateEmail(role.email, false)) {errorDetails.push(`Person has to have valid email: ${role.email || ''}`);}
		}		
		if (role.type == undefined) {
			role.type = 1;
		} else {
			role.type = validate.validateNumber(role.type, false);
		}
		role.dailyRate = validate.validateNumber(role.dailyRate, true);
		
		if (validate.validateNumber(role.uid, true) == undefined) {errorDetails.push(`uid not accepted: ${role.uid || ''}`);}
		if (role.type < 1 || role.type > 3) {errorDetails.push(`type not accepted: ${role.type}`);}
		if (!validate.validateName(role.path, true)) {errorDetails.push(`path not accepted: ${role.path || ''}`);}
		var testDate = validate.validateDate(role.entryDate, false, true);
		if (role.entryDate && !testDate) {
			errorDetails.push(`entryDate not accepted: ${role.entryDate || ''}`);
		} else {
			role.entryDate = testDate;
		}
		testDate = validate.validateDate(role.exitDate, false, true);
		if (role.exitDate && !testDate) {
			errorDetails.push(`exitDate not accepted: ${role.exitDate || ''}`);
		} else {
			role.exitDate = testDate;
		}
		if (role.dailyRate == undefined || role.dailyRate < 0) {errorDetails.push(`dailyRate not accepted: ${role.dailyRate || ''}`);}
		var testNumber = validate.validateNumber(role.defCapaMonth, false);
		if (role.defCapaMonth && (isNaN(testNumber) || testNumber < 0 )) {errorDetails.push(`defCapaMonth not accepted: ${role.defCapaMonth || ''}`);}
		testNumber = validate.validateNumber(role.defCapaDay, false);
		if (role.defCapaDay && (isNaN(testNumber) || testNumber < 0 )) {errorDetails.push(`defCapaDay not accepted: ${role.defCapaDay || ''}`);}

		if (errorDetails.length > 0) {
			errorstring = `${index+2}: Orga Role Definition not valid, name: ${role.name} details: ${errorDetails.join(', ')}`;
			listError?.push(errorstring);
			logger4js.info('InitOrgaList: ', errorstring);
			isOrgaValid = false;
			return;
		}
		if (role.type == 1 || role.type == 2) {
			var newRole;
			if (role.uid == undefined) {
				if (role.type == 1 || role.isSummaryRole) {
					// role is either in normal organisation or is a summary role in skills, create a new uid
					role.uid = ++maxRoleID;
				} else {
					// role is a person inside the skill groups, must be found in the normal hierarchy
					var originalRole = newOrga.allRoles.find(item => item.name == role.name);
					role.uid = originalRole?.uid;
					if (!role.uid)  {
						errorstring = `${index+2} Orga Role Team Member not found in orga, name: ${role.name}`;
						listError?.push(errorstring);
						logger4js.info('InitOrgaList: ', errorstring);
						isOrgaValid = false;
					}
				}
			}
			newRole = new VCOrgaRole(role.uid, role.name);
			newRole.email = role.email;
			newRole.type = role.type;
			if (role.type == 1 || role.isSummaryRole) {
				newRole.parent = getParent(role.path, role.name);
			} else if (role.type == 2 && !role.isSummaryRole){
				newRole.teamParent = getParent(role.path, role.name);
			}
			if (role.isSummaryRole) newRole.isSummaryRole = true;
			if (role.aliases && (role.type == 1)) {
				const roleAliases = role.aliases;
				roleAliases.forEach(alias => {
					if ( !uniqueAliasesNames[alias]) {
						uniqueAliasesNames[alias] = alias;
					} else {
						errorstring = `${index+2} Orga Role Aliases not unique in orga, name: ${alias}`;
						listError?.push(errorstring);
						logger4js.info('InitOrgaList: ', errorstring);
						isOrgaValid = false;
					}
				})					
				newRole.aliases = role.aliases;
			}
			newRole.dailyRate = role.dailyRate || 0;
			if (role.exitDate) {
				if (role.exitDate.getTime() < maxDate.getTime()) {
					newRole.exitDate = role.exitDate;
				}
			}
			// set certain property depending if the orga unit is a person or a group/team
			if (newRole.isSummaryRole) {
				// set properties if the role is a group/team role
				newRole.subRoleIDs = [];
				if (role.isAggregationRole) {
					newRole.isAggregationRole = role.isAggregationRole == true;
				}
				// check Rule2: Group should not have a defCapaMonth or defCapaDay
				// this is automatically true, as the values are not set for a group
			} else {				
				if (role.employeeNr) { newRole.employeeNr = role.employeeNr; }

				if (role.entryDate) {
					if (role.entryDate.getTime() > minDate.getTime()) {
						newRole.entryDate = role.entryDate;
					}
				}
				newRole.defCapaDay = role.defCapaDay || 0;
				newRole.defCapaMonth = role.defCapaMonth || 0;
				if (role.isExternRole) newRole.isExternRole = true;
				// check Rule1: internal people need to have capa (to avoid confusion team members get their capa from the real orga unit)
				if (!newRole.isExternRole && newRole.type == 1) {
					if (!(newRole.defCapaDay >= 0 && newRole.defCapaMonth >= 0)) {
						errorstring = `${index+2} Orga Role Person intern has to have defaultCapa, name: ${newRole.name}`;
						listError?.push(errorstring);
						logger4js.info('InitOrgaList: ', errorstring);
						isOrgaValid = false;
					}
				}
				// newRole.isActDataRelevant = role.isActDataRelevant;
			}
			if (role.type == 2 && !role.isSummaryRole) {
				// role is a team member
				if (!uniqueRoleNames[role.name]) {
					errorstring = `${index+2}: Orga Role Name in Team not found, uid: ${role.uid}, name: ${role.name}`;
					listError?.push(errorstring);
					logger4js.info('InitOrgaList: ', errorstring);
					isOrgaValid = false;
					return;
				}
				// nothing else to do, especially no push of this orga unit, the link between team members and teams is done afterwards
				return;
			} else {
				if (uniqueRoleNames[role.name]) {
					errorstring = `${index+2}: Orga Role Name not unique, uid ${role.uid}, name: ${role.name}`;
					listError?.push(errorstring);
					logger4js.info('InitOrgaList: ', errorstring);
					isOrgaValid = false;
					return;
				}
				uniqueRoleNames[newRole.name] = newRole;
			}
			// validate against old entry if it exists
			var oldRole = oldOrgaIndexed[newRole.uid];
			if (oldRole) {
				// check also outdated isTeam Flag for old orgas
				if ((oldRole.isSummaryRole == true || oldRole.isTeam == true) != (newRole.isSummaryRole == true)) {
					errorstring = `${index+2}: Changed Orga Role isSummaryRole, uid: ${newRole.uid}, name: ${newRole.name}`;
					listError?.push(errorstring);
					logger4js.info('InitOrgaList: ', errorstring);
					isOrgaValid = false;
					return;
				}
				if (!validate.isSameDay(oldRole.exitDate, newRole.exitDate)) {
					// exit date has changed verify that the new one is greater equal TimeStamp
					if (newRole.exitDate?.getTime() < timestamp.getTime()) {
						errorstring = `${index+2}: Changed Orga Role exitDate to the past, uid: ${newRole.uid}, name: ${newRole.name}`;
						listError?.push(errorstring);
						logger4js.info('InitOrgaList: ', errorstring);
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
			newCost.parent = getParent(role.path, role.name);
			newCost.type = role.type;

			if (role.isSummaryRole) {
				newCost.isSummaryRole = role.isSummaryRole;
				newCost.subCostIDs = [];
			}
			if (uniqueCostNames[newCost.name]) {
				errorstring = `${index+2}: Orga Cost Name not unique, uid: ${newCost.uid}, name: ${newCost.name}`;
				listError?.push(errorstring);
				logger4js.info('InitOrgaList: ', errorstring);
				isOrgaValid = false;
				return;
			}
			// name of cost may not exist as a role
			if (uniqueRoleNames[newCost.name]) {
				errorstring = `${index+2}: Orga Cost Name also exists in the list of Orga Role Names, uid: ${newCost.uid}, name: ${newCost.name}`;
				listError?.push(errorstring);
				logger4js.info('InitOrgaList: ', errorstring);
				isOrgaValid = false;
				return;
			}
			// name of cost may not exist as an alias of a role
			if (uniqueAliasesNames[newCost.name]) {
				errorstring = `${index+2}: Orga Cost Name also exists in the list of Orga Role Aliases, uid: ${newCost.uid}, name: ${newCost.name}`;
				listError?.push(errorstring);
				logger4js.info('InitOrgaList: ', errorstring);
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
				if (role.type == 2) {
					logger4js.debug('InitOrgaList Team Mapping ', role.name);
				}
				if (parentRole) {
					// map the item to the parent
					if (!parentRole.subRoleIDs) {
						parentRole.subRoleIDs = [];
						parentRole.isSummaryRole = 1;
					}
					parentRole.subRoleIDs.push( {key: role.uid, value: 1});
					role.pid = parentRole.uid;
				} else {
					errorstring = `Orga Role has no valid parent, uid: ${role.uid} parent: ${role.parent}`;
					listError?.push(errorstring);
					logger4js.info('InitOrgaList: ', errorstring);
					isOrgaValid = false;
				}
			}
			if (role.teamParent && role.type == 2) {
				//check if parent exists?
				parentRole = uniqueRoleNames[role.teamParent];
				if (parentRole) {
					// map the item to the parent
					parentRole.subRoleIDs.push( {key: role.uid, value: 1});
				} else {
					errorstring = `Orga Role has no valid parent: uid: ${role.uid} parent: ${role.parent}`;
					listError?.push(errorstring);
					logger4js.info('InitOrgaList: ', errorstring);
					isOrgaValid = false;
				}
			}
		});
		orgaList.forEach(role => {
			// link the teamIDs
			if (role.type == 2 && !role.isSummaryRole) {
				var user = newOrga.allRoles.find(item => item.uid == role.uid && item.type == 1);
				var team = uniqueRoleNames[getParent(role.path, role.name)];
				if (user && team) {
					if (user.teamIDs == undefined) {
						user.teamIDs = [];
					}
					user.teamIDs.push({key: team.uid, value: 1});
					team.subRoleIDs.push({key: user.uid, value: 1});
				} else {
					errorstring = `Orga Team Role not found in orga: uid: ${role.uid} parent: ${role.name}`;
					listError?.push(errorstring);
					logger4js.info('InitOrgaList: ', errorstring);
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
					if (!parentCost.subCostIDs) parentCost.subCostIDs = []; // MS TODO
					parentCost.subCostIDs.push({key: cost.uid, value: 1});
					parentCost.isSummaryRole = true;
					cost.pid = parentCost.uid;
				} else {
					errorstring = `Orga Cost has no valid parent: uid: ${cost.uid} parent: ${cost.parent}`;
					listError?.push(errorstring);
					logger4js.info('InitOrgaList: ', errorstring);
					isOrgaValid = false;
				}
			}
			delete cost.parent;
		});
		newOrga.allRoles.forEach(role => {
			delete role.parent;
			delete role.teamParent;
		});

		newOrga.maxRoleID = maxRoleID;
		newOrga.maxCostID = maxCostID;

		// check that there were no deleted orga units that should not be deleted
		if (!checkOrgaUnitDelete(newOrga, oldOrga, uniqueRoleNames, listError)) {
			isOrgaValid = false;
		}
	}
	return isOrgaValid ? newOrga : undefined;
}

/* The checkOrgaUnitDelete function validates if roles from an old organization (oldOrga) have been improperly deleted in a new organization (newOrga).
It:
	Checks for missing roles in newOrga that were in oldOrga.
	Allows deletion if the role's exitDate is older than three months.
	Allows renaming of roles but ensures the uid remains unchanged.
	Logs errors if roles are deleted without proper justification.
This function prevents unintended role deletions and ensures data integrity in organizational updates. 
*/
/* It returns
	true		If all deletions are valid.
	false		If invalid deletions are found (logged in listError). 
*/
function checkOrgaUnitDelete(newOrga, oldOrga, uniqueRoleNames, listError) {
	var isOrgaValid = true;
	var errorstring;
	var deleteExitDate = new Date();
	deleteExitDate.setDate(1);
	deleteExitDate.setHours(0, 0, 0, 0);
	deleteExitDate.setMonth(deleteExitDate.getMonth() - 3);
	if (!newOrga || !oldOrga) return true;

	if (!oldOrga?.allRoles || !uniqueRoleNames || !newOrga?.allRoles) {
		errorstring = `Orga Role Check for Deleted has no valid oldOrga: ${oldOrga?.allRoles?.length} list: ${uniqueRoleNames?.length}`;
		listError?.push(errorstring);
		logger4js.info('CheckOrgaUnitDelete: ', errorstring);
		return false;
	}
	oldOrga.allRoles.forEach(role => {
		var newRole = uniqueRoleNames[role.name];
		if (!newRole) {
			// role name is missing in new Orga because of rename or delete
			var checkRole;
			newOrga.allRoles.forEach(item => {
				if (item.uid == role.uid && item.type == role.type) {
					logger4js.debug('CheckOrgaUnitDelete: Found ', role.uid);
					checkRole = item;
				}
			});
			if (checkRole) {
				logger4js.debug('CheckOrgaUnitDelete Orga Unit Renamed accepted: ', role.uid, role.name);
			} else if (role.exitDate?.getTime() <= deleteExitDate.getTime()) {
				logger4js.debug('CheckOrgaUnitDelete Accepted: ', role.uid, role.name);
			} else {
				errorstring = `Orga Role Deleted not allowed: ${role.uid} / ${role.name} with exitDate ${role.exitDate?.toISOString()}`;
				listError?.push(errorstring);
				logger4js.info('CheckOrgaUnitDelete: ', errorstring);
				isOrgaValid = false;
			}
		} else {
			// role name found in new orgaList
			if (role.uid != newRole.uid) {
				var errorstring = `Orga Role Changed uid from: ${role.uid} to ${newRole.uid} / ${newRole.name} `;
				listError?.push(errorstring);
				logger4js.info('CheckOrgaUnitChange: ', errorstring);
				isOrgaValid = false;
			}
		}
	});
	return isOrgaValid;
}

// reduce orga to a flat list with parent reference

/* The reduceOrga function processes an organization's roles and costs into a simplified, structured list (allUnits).
It:
	Validates the input organization (orga).
	Extracts roles from orga.allRoles and organizes them into a structured format.
	Links sub-roles, teams, and costs to maintain hierarchy.
	Duplicates team members and assigns them proper attributes.
	Processes orga.allCosts to build a cost hierarchy.
	Sorts the final allUnits list based on type and name.
This function transforms a complex organization structure into a compact, hierarchical format. 
*/
/* It returns
	allUnits	A structured array of roles and costs with parent-child relationships.
	[]			If orga is missing or empty.
 */
function reduceOrga(orga) {
	var allUnits = [];
	var minDate = new Date('0001-01-01');
	var maxDate = new Date('2200-11-30');
	if (!orga || !orga.allRoles) {
		return allUnits;
	}
	orga.allRoles.forEach(role => {
		if (!allUnits[role.uid]) {
			var newRole = {};
			newRole.uid = role.uid;
			newRole.calcid = role.uid;
			allUnits[role.uid] = newRole;
		}
		allUnits[role.uid].name = role.name;
		if (role.email) { allUnits[role.uid].email = role.email; }
		if (role.isSummaryRole) { allUnits[role.uid].isSummaryRole = role.isSummaryRole; }
		if (role.isAggregationRole) { allUnits[role.uid].isAggregationRole = role.isAggregationRole; }
		if (role.isExternRole) { allUnits[role.uid].isExternRole = role.isExternRole; }
		if (role.defCapaMonth) { allUnits[role.uid].defCapaMonth = role.defCapaMonth; }
		if (role.defCapaDay) { allUnits[role.uid].defCapaDay = role.defCapaDay; }
		if (role.dailyRate >= 0) { allUnits[role.uid].dailyRate = role.dailyRate; }
		if (role.employeeNr) { allUnits[role.uid].employeeNr = role.employeeNr; }
		var entryDate = role.entryDate && validate.validateDate(role.entryDate, false, true);
		if (entryDate?.getTime() > minDate.getTime()) {
			allUnits[role.uid].entryDate = entryDate;
		}
		var exitDate = role.exitDate && validate.validateDate(role.exitDate, false, true);
		if (exitDate?.getTime() < maxDate.getTime()) {
			allUnits[role.uid].exitDate = exitDate;
		}
		if (role.aliases) { allUnits[role.uid].aliases = role.aliases; }
		allUnits[role.uid].type = role.type;
		role.subRoleIDs?.forEach(item => {
			const index = Number(item.key);
			if (index < 0) {
				logger4js.info(`Inconsistent Org Structure Role ${role.uid} SubRole ${index}`);
				// something wrong with the numbering
				return;
			}
			if (!allUnits[index]) {
				// added by subrole
				var newRole = {};
				newRole.uid = index;
				newRole.calcid = index;
				allUnits[index] = newRole;
			} else {
				logger4js.trace(`SubRole already exists ${role.uid} SubRole ${index}`);
			}
			if (!allUnits[index].pid) {
				allUnits[index].pid = role.uid;
			}
		});
	});

	// build team members Information by duplicating users with their percentage
	var maxid = 0;
	orga.allRoles.forEach(element => { maxid = Math.max(element.uid, maxid); });
	logger4js.debug('MaxID: ', maxid);
	orga.allRoles.forEach(role => {
		if (role.type == 2 && role.subRoleIDs) {
			for (let j = 0; j < role.subRoleIDs.length; j++) {
				const index = role.subRoleIDs[j].key;
				if (!allUnits[index] || allUnits[index].type == 2) {
					// nothing to do
					continue;
				}
				const userRole = allUnits[index];
				// now it is a user, add a new entry to the team
				maxid += 1;
				allUnits[maxid] = {};
				allUnits[maxid].uid = index;
				allUnits[maxid].calcid = maxid;
				allUnits[maxid].type = 2;
				allUnits[maxid].pid = role.uid;
				allUnits[maxid].name = userRole.name;
				if (userRole.email) { allUnits[maxid].email = userRole.email; }
				if (userRole.employeeNr) { allUnits[maxid].employeeNr = userRole.employeeNr; }
				if (userRole.isExternRole) { allUnits[maxid].isExternRole = userRole.isExternRole; }
				if (userRole.defCapaDay >= 0) { allUnits[maxid].defCapaDay = userRole.defCapaDay; }
				if (userRole.defCapaMonth >= 0) { allUnits[maxid].defCapaMonth = userRole.defCapaMonth; }
				if (userRole.dailyRate >= 0) { allUnits[maxid].dailyRate = userRole.dailyRate; }
				if (userRole.entryDate) { allUnits[maxid].entryDate = userRole.entryDate; }
				if (userRole.exitDate) { allUnits[maxid].exitDate = userRole.exitDate; }
				if (userRole.aliases) { allUnits[maxid].aliases = userRole.aliases; }
				if (userRole.isAggregationRole) { allUnits[maxid].isAggregationRole = userRole.isAggregationRole; }
				if (userRole.isSummaryRole) { allUnits[maxid].isSummaryRole = userRole.isSummaryRole; }
				// if (userRole.isActDataRelevant) { allUnits[maxid].isActDataRelevant = userRole.isActDataRelevant; }
			}
		}
	});

	allUnits.forEach(item => calcFullPath(item.calcid, allUnits));

	// build cost Information hierarchy
	var listCost = [];
	orga.allCosts?.forEach(cost => {
		if (!listCost[cost.uid]) {
			listCost[cost.uid] = {};
			listCost[cost.uid].uid = cost.uid;
			listCost[cost.uid].calcid = cost.uid;
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
		});
	});

	listCost.forEach(item => calcFullPath(item.calcid, listCost));
	// add the list to the allUnits list
	listCost.forEach(item => allUnits.push(item));

	allUnits = allUnits.filter(item => item.calcid !== undefined);
	allUnits.forEach(item => {
		delete item.calcid;
		if (!item.pid) {
			delete item.pid;
		}
	});
	allUnits.sort(function(a, b) {
		if (a.type != b.type) {
			return a.type - b.type;
		} else {
			return getFullPath(a).localeCompare(getFullPath(b));
		}
	});
	return allUnits;
}

/* The convertSettingToOrga function transforms a setting object into an organizational structure (resultOrga).
It:
	Extracts essential metadata (_id, name, timestamp, vcid).
	Formats organizational data based on getListFormat:
	If getListFormat is true → Calls reduceOrga(setting.value) to produce a simplified, structured list.
	Otherwise → Directly copies allRoles and allCosts.
This function is useful for handling organization settings and converting them into different formats.
 */

function convertSettingToOrga(setting, getListFormat) {
	var resultOrga = {};
	resultOrga._id = setting._id;
	resultOrga.name = setting.name;
	resultOrga.timestamp = setting.timestamp;
	resultOrga.vcid = setting.vcid;

	if (getListFormat) {
		resultOrga.allUnits = reduceOrga(setting.value);
	} else {
		resultOrga.allRoles = setting.value.allRoles;
		resultOrga.allCosts = setting.value.allCosts;
	}
	return resultOrga;
}
/* 
The getParent function extracts the direct parent name from a given hierarchical path, ignoring trailing slashes and ensuring the child itself is not returned.
It:
	Splits the path into parts using / as a delimiter.
	Reverses the parts to search from the end.
	Finds the first valid parent name, skipping:
	Empty strings ('') from extra slashes.
	The childName itself.
This function is useful for retrieving hierarchical parent relationships in organizational structures, file paths, or category trees. 
*/
/* Returns
	parentName		The direct parent name from the path.
	''				If no valid parent exists. 
*/
function getParent(path, childName) {
	// get the direct parent from path independent how many slashes were at the end
	if (!path) return '';
	var parts = path.split('/');
	parts.reverse();
	var result = parts.find(item => item != '' && item != childName);
	return result;
}

/* The calcFullPath function calculates the full hierarchical path for an organization unit by traversing up the organizational tree.
It:
	Traverses up the hierarchy starting from the given unit (id).
	Builds the path string by concatenating the names of parent roles.
	Limits the traversal to a maximum level (maxLevel) to prevent infinite loops.
	Stores the resulting path and hierarchical level in the organization's structure.
This function is useful for generating hierarchical paths to represent the full lineage of an organizational role or cost.
*/
/* It returns:
The function does not return a value; it modifies the organisation object in place by adding path and level properties to the specified role.
 */
function calcFullPath(id, organisation) {
	if (!organisation || !organisation[id]) {
		return;
	}
	const maxLevel = 30;
	let path = '';
	let level = 0;
	let index = organisation[id]?.pid;
	while (level < maxLevel && index >= 0 && organisation[index]) {
		path = '/'.concat(organisation[index].name, path);
		index = organisation[index].pid;
		level += 1;
	}
	if (level == maxLevel) {
		organisation[id].path = '';
		organisation[id].level = -1;
	} else {
		organisation[id].path = path.concat('/');
		organisation[id].level = level;
	}
}

// check orga
// compares uid consistency between new & old orga

/* The verifyOrga function validates the integrity and consistency of an updated organization (newOrga) against a previous version (oldOrga).
It:
	Handles missing newOrga or oldOrga cases.
	Compares timestamps to ensure newOrga is not older than oldOrga.
	Calls checkUIDs(newOrga, oldOrga) to verify UID consistency.
	Logs validation checks for debugging.
This function is useful for ensuring that new organization updates are valid and properly timestamped before applying changes. 
*/
/* It returns
	true		If newOrga is valid and newer than oldOrga.
	false		If newOrga is invalid or has an earlier timestamp.
 */
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

/* The checkUIDs function verifies whether all role and cost UIDs from an old organization (oldOrga) exist in the updated organization (newOrga).
It:
	Ensures that newOrga and oldOrga are defined.
	Validates that all UIDs in oldOrga.allRoles exist in newOrga.allRoles.
	Validates that all UIDs in oldOrga.allCosts exist in newOrga.allCosts.
	Logs any missing UIDs and returns false if any are missing.
This function is useful for ensuring that an updated organization retains all previously defined roles and costs, preventing unintended deletions. 
*/
/* It returns
	true		If all role and cost UIDs from oldOrga exist in newOrga.
	false		If any role or cost UID is missing in newOrga. 
*/
function checkUIDs(newOrga, oldOrga) {
	logger4js.trace('checkUIDs: Are all uids of the oldOrga in the newOrga as well? ', newOrga && newOrga.allRoles && newOrga.allRoles.length, oldOrga && oldOrga.allRoles && oldOrga.allRoles.length);

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
			logger4js.info('Error: Cost-UID ( %s - %s) is missing in newOrga', cost.uid, cost.name);
			resultCosts = false;
		}
	});
	if (resultCosts) {
		logger4js.debug('newOrga Costs (%s) includes all old Orga costs' , newOrga.allCosts.length);
	}
	return resultCosts && resultRoles;
}

/* The joinCapacity function merges capacity data into an organization (orga) by assigning capacity values to individual roles.
It:
	Validates the input organization (orga) and capacity data.
	Combines the capacity data using combineCapacity(capacity).
	Iterates over orga.value.allRoles and:
		Finds a matching capacity entry based on role.uid.
		Assigns capaPerMonth and startOfCal to each non-summary role.
	Logs missing data or invalid cases.
This function ensures that each role in the organization has up-to-date capacity information. 
*/
/* Returns
	void (modifies orga in place). 
*/
function joinCapacity(orga, capacity) {
	if (!orga?.value?.allRoles) {
		logger4js.warn('JoinCapacity invalid organisation %s/%s All Roles %d Capacity Length %d', orga?._id, orga?.timestamp?.toISOString(), orga?.value?.allRoles?.length, capacity?.length);
		return;
	}
	if (!capacity) {
		logger4js.debug('JoinCapacity no capacity to join');
		return;
	}
	logger4js.trace('JoinCapacity %d' , capacity.length);
	var combinedCapacity = combineCapacity(capacity);
	orga.value.allRoles.forEach(role => {
		if (!role.isSummaryRole) {
			var newCapa = combinedCapacity.find(item => item.roleID == role.uid);
			if (newCapa) {
				role.capaPerMonth = newCapa.capaPerMonth;
				role.startOfCal = newCapa.startOfYear;
			}
		}
	});
}

/* The compatibilityOldOrga function modifies an organization (setting) to ensure compatibility with an older format.
It:
	Validates that setting is an organization (type === 'organisation').
	Ensures allRoles exists before making modifications.
	Adds missing properties (subRoleIDs, teamIDs) if undefined.
	Updates certain role properties for backward compatibility:
	Converts dailyRate, defCapaMonth, and defCapaDay into their older equivalents (tagessatz, defaultKapa, defaultDayCapa).
	Marks roles with type == 2 and isSummaryRole as isTeam = true.
	Moves capaPerMonth into kapazitaet, ensuring an old-style array format.
This function is useful for ensuring smooth migration between different organization data structures. 
*/
/* Returns
	void (modifies setting in place). 
*/
function compatibilityOldOrga(setting) {
	if (setting?.type != 'organisation' || !setting?.value?.allRoles) {
		logger4js.warn('CompatibilityOldOrga invalid organisation %d', setting?.value?.allRoles?.length);
		return;
	}
	setting.value.allRoles.forEach(role => {
		if (!role.subRoleIDs) { role.subRoleIDs = []; }
		if (!role.teamIDs) { role.teamIDs = []; }
		if (role.type == 2 && role.isSummaryRole) {
			role.isTeam = true;
		}
		if (role.dailyRate >= 0) role.tagessatz = role.dailyRate;
		if (role.defCapaMonth >= 0) role.defaultKapa = role.defCapaMonth;
		if (role.defCapaDay >= 0) role.defaultDayCapa = role.defCapaDay;
		if (role.capaPerMonth) {
			role.kapazitaet = role.capaPerMonth;
			role.kapazitaet.unshift(0); // old arrays had always an empty/null entry  that was not used
			delete role.capaPerMonth;
		}
	});
}

/* The combineCapacity function aggregates and merges capacity data for roles over multiple years, ensuring continuity and filling gaps where necessary.
It:
	Sorts the input capacity data by startOfYear.
	Groups capacity records by roleID.
	Merges consecutive years' capacities:
	If a role's capacity spans multiple years, it appends the new year's capacity while filling any gaps with -1.
	Returns a list of combined capacity records.
This function ensures that all capacity data for a role is stored in a continuous format while preserving chronological order. 
*/
/* It returns
	combinedCapacity	A new array where capacity records for each roleID are merged into a continuous timeline.
 */
function combineCapacity(capacity) {
	var combinedCapacity = [];
	if (!capacity) {
		return combinedCapacity;
	}
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
				fullCapa.capaPerMonth.push(-1);
				startOfNextYear.setMonth(startOfNextYear.getMonth() + 1);
			}
			// add the capa for the year
			capa.capaPerMonth.forEach(item => fullCapa.capaPerMonth.push(item));
		}
	});
	return combinedCapacity;
}

module.exports = {
	initOrga: initOrga,
	initOrgaFromList: initOrgaFromList,
	generateIndexedOrgaRoles: generateIndexedOrgaRoles,
	convertSettingToOrga: convertSettingToOrga,
	joinCapacity: joinCapacity,
	combineCapacity: combineCapacity,
	compatibilityOldOrga: compatibilityOldOrga,
	verifyOrga: verifyOrga
};
