var mongoose = require('mongoose');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');

var logModule = 'VPV';
var log4js = require('log4js');
var helperVpv = require('./../components/helperVpv');
var helperOrga = require('./../components/helperOrga');
var timeTracker = require('./../components/timeTracker');
// const { toNamespacedPath } = require('path');
const validate = require('./validate');
const { Int32 } = require('bson');
const { constVPStatus } = require('../models/visboproject');
const { constVTRFailed } = require('../models/timeTracker');

const rootPhaseName = '0§.§';
var logger4js = log4js.getLogger(logModule);

const minStartDate = new Date('2015-01-01');
var refMonth = undefined;

function getColumnOfDate(value) {
	if (!value) {
		// no valid argument
		return 0;
	}
	if (!refMonth) {
		refMonth = minStartDate.getFullYear() * 12;
	}
	var valueMonth = value.getFullYear() * 12 + value.getMonth();
	// logger4js.trace('Calculate Month Column ref %s value %s diff %s ', refMonth, valueMonth, valueMonth - refMonth);
	return valueMonth - refMonth;
}

function addDays(dd, numDays) {
	var inputDate = new Date(dd);
	inputDate.setDate(inputDate.getDate() + numDays);
	return inputDate;
 }

// returns the beginning of current month
function getDateStartOfMonth(dd) {
	var inputDate = dd ? new Date(dd) : new Date();
	inputDate.setDate(1);
	inputDate.setHours(0, 0, 0, 0);
	return inputDate;
}

// returns the date of the end of the previous month
function getDateEndOfPreviousMonth(dd) {
	var inputDate = dd ? new Date(dd) : new Date();
  inputDate.setDate(0);
  return inputDate;
}

// returns the end of the current month
function getDateEndOfMonth(dd) {
	var inputDate = dd ? new Date(dd) : new Date();
	inputDate.setMonth(inputDate.getMonth() + 1);
	inputDate.setDate(0); // day before beginning of month
	inputDate.setHours(23, 59, 59, 0);
  return inputDate;
}

function isOrgaRolePerson(role) {
    return ( role && !role.isSummaryRole && role.subRoleIDs?.length <= 0 );
}

// calculate dailyCapa of orga unit/team in a timezoned orga
function getDailyCapaTZ(uid, capacity, timeZones, index, maxTZ) {
	var dailyCapa;
	index = Math.max(index, 0);
	index = Math.min(index, timeZones.indexMonth.length - 1);
	var orgaIndex = timeZones.indexMonth[index];
	// maxTZ used for baseline calculation, to use only the orga that was valid for the baseline
	if (maxTZ >= 0) {
		orgaIndex = Math.min(orgaIndex, maxTZ);
	}
	var allRoles = timeZones.organisation[orgaIndex].indexedRoles;
	dailyCapa = allRoles[uid]?.defCapaMonth;
	// check if there is a sepcific capa defined
	var capa = capacity[uid];
	if (capa) {
		var capaStartIndex = getColumnOfDate(capa.startOfYear);
		var actIndex = index + timeZones.startIndex - capaStartIndex;
		if (actIndex >= 0 && actIndex < capa.capaPerMonth.length) {
			if (capa.capaPerMonth[actIndex] >= 0) {
				dailyCapa = capa.capaPerMonth[actIndex];
			}
		}
	}
	return dailyCapa;
}

// calculate dailyRate of orga unit/team in a timezoned orga
function getDailyRateTZ(uid, teamID, timeZones, index, maxTZ) {
	var dailyRate;
	index = Math.max(index, 0);
	index = Math.min(index, timeZones.indexMonth.length - 1);
	var orgaIndex = timeZones.indexMonth[index];
	// maxTZ used for baseline calculation, to use only the orga that was valid for the baseline
	if (maxTZ >= 0) {
		orgaIndex = Math.min(orgaIndex, maxTZ);
	}
	var allRoles = timeZones.organisation[orgaIndex].indexedRoles;
	// dailyRate of orga-unit
	dailyRate = allRoles[uid]?.dailyRate;
	// dailyRate of teamID
	if (teamID >= 0) {
		dailyRate = allRoles[teamID] ? allRoles[teamID].dailyRate : dailyRate;
	}
	// set dailyRate of person also if it is member of a team
	if (isOrgaRolePerson(allRoles[uid])) {
		dailyRate = allRoles[uid].dailyRate;
	}
	return dailyRate || 0;
}

// identify the role of orga unit in a timezoned orga for a specific month
function getRoleTZ(role, timeZones, index, maxTZ) {
	index = Math.max(index, 0);
	index = Math.min(index, timeZones.indexMonth.length - 1);
	var orgaIndex = timeZones.indexMonth[index];
	// maxTZ used for baseline calculation, to use only the orga that was valid for the baseline
	if (maxTZ >= 0) {
		orgaIndex = Math.min(orgaIndex, maxTZ);
	}
	// check if the role is a concerningRole for this TSO
	var orga = timeZones.organisation[orgaIndex];
	var concerningRole = orga.concerningRoles?.find(item => item.role.uid == role.uid);
	if (!concerningRole) {
		// role is not concerning for this TSO
		return undefined;
	}
	var roleTZ = orga.indexedRoles[concerningRole.role?.uid];
	if (concerningRole.role?.pid != roleTZ?.pid) {
		return undefined;
	}
	return roleTZ;
}

// calculate personnel cost for the requested project per month
function getAllPersonnelCost(vpv, timeZones, maxTZ) {
	var costValues = [];

	if (!(vpv?.AllPhases?.length > 0) || !timeZones) {
		logger4js.warn('Calculate Personal Cost: inconsistent project %d or organization TS %s', vpv?.AllPhases?.length, timeZones);
		return costValues;
	}

	logger4js.debug('Calculate Personal Cost of Project Version %s start %s end %s', vpv._id, vpv.startDate, vpv.endDate);
	var startCalc = new Date();

	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var duration = endIndex - startIndex + 1;
	var faktor = 1;

	costValues[0] = 0;
	for (var i = 0; i < duration; i++){
		costValues[i] = 0;
	}

	vpv.AllPhases.forEach(phase => {
		var phaseStart = phase.relStart - 1;
		phase.AllRoles?.forEach(role => {
			role.Bedarf?.forEach((item, index) => {
				var dailyRate = getDailyRateTZ(role.RollenTyp, role.teamID, timeZones, phaseStart + index, maxTZ);
				costValues[phaseStart + index] = (costValues[phaseStart + index] || 0) + role.Bedarf[index] * dailyRate * faktor / 1000;
			});
		});
	});
	var endCalc = new Date();
	logger4js.debug('Calculate Personal Cost duration %s ', endCalc.getTime() - startCalc.getTime());
	return costValues;
}

// calculate all other Costs for the requested project per month
function getAllOtherCost(vpv, timeZones) {
	var othercostValues = [];

	if (!(vpv?.AllPhases?.length > 0) || !timeZones) {
		logger4js.warn('Calculate Other Cost: inconsistent project %d or organization TS %s', vpv?.AllPhases?.length, timeZones);
		return othercostValues;
	}

	logger4js.debug('Calculate all other Cost of Project Version %s start %s end %s', vpv._id, vpv.startDate, vpv.endDate);
	var startCalc = new Date();

	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var duration = endIndex - startIndex + 1;
	var faktor = 1;

	othercostValues[0] = 0;
	for (var i = 0; i < duration; i++){
		othercostValues[i] = 0;
	}

	vpv.AllPhases.forEach(phase => {
		var phaseStart = phase.relStart - 1;
		phase.AllCosts?.forEach(cost => {
			cost.Bedarf?.forEach((item, index) => {
				othercostValues[phaseStart + index] = (othercostValues[phaseStart + index] || 0) + cost.Bedarf[index] * faktor;
			});
		});
	});
	var endCalc = new Date();
	logger4js.debug('Calculate all other Cost duration %s ', endCalc.getTime() - startCalc.getTime());
	return othercostValues;
}

// calculate all Invoices for the requested project per month
function getAllInvoices(vpv) {
	var invoiceValues = [];

	if (!(vpv?.AllPhases?.length > 0)) {
		logger4js.warn('Calculate Invoice: inconsistent project %d', vpv?.AllPhases?.length);
		return invoiceValues;
	}

	logger4js.debug('Calculate all Invoices of Project Version %s start %s end %s', vpv._id, vpv.startDate, vpv.endDate);
	var startCalc = new Date();

	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var duration = endIndex - startIndex + 1;

	for (var i = 0; i < duration; i++){
		invoiceValues[i] = 0;
	}

	vpv.AllPhases.forEach(phase => {
		var phaseEnd = phase.relEnde - 1;
		if (phase.invoice) {
			invoiceValues[phaseEnd] += phase.invoice.Key || 0;
		}
		phase.AllResults?.forEach(item => {
			if (item.invoice) {
				var msDate = addDays(vpv.startDate, (phase.startOffsetinDays + item.offset));
				var msIndex = getColumnOfDate(msDate) - startIndex;
				invoiceValues[msIndex] += item.invoice.Key || 0;
			}
		});
	});
	var endCalc = new Date();
	logger4js.debug('Calculate all Invoices duration %s ', endCalc.getTime() - startCalc.getTime());
	return invoiceValues;
}

function calcCosts(vpv, pfv, organisation) {
	var allCostValues = [];
	var allCostValuesIndexed = [];
	var startCalc = new Date();
	var startDate, endDate;
	var len;
	var personnelCost, allOtherCost, allInvoices;

	if ( !(vpv || pfv) || !(organisation?.length > 0) ) {
		logger4js.warn('CalcCost no valid vpv/pfv or organisation');
		return allCostValues;
	}

	if (pfv && vpv) {
		startDate = Math.min(vpv.startDate, pfv.startDate);
		endDate = Math.max(vpv.endDate, pfv.endDate);
	} else if (vpv) {
		startDate = vpv.startDate;
		endDate =  vpv.endDate;
	} else if (pfv) {
		startDate = pfv.startDate;
		endDate = pfv.endDate;
	}

	var timeZones = splitInTimeZones(organisation, startDate, endDate);
	if (!timeZones) {
		return allCostValues;
	}
	if (vpv) {
		var currentDate = getDateStartOfMonth(vpv.startDate);
		logger4js.trace('Calculate Project Costs vpv startDate %s ISO %s currentDate %s', vpv.startDate, vpv.startDate.toISOString(), currentDate.toISOString());
		personnelCost = getAllPersonnelCost(vpv, timeZones);
		allOtherCost = getAllOtherCost(vpv, timeZones);
		allInvoices = getAllInvoices(vpv);
		len = Math.max(personnelCost.length, allOtherCost.length, allInvoices.length);
		for (var j = 0; j < len; j++) {
			allCostValues[currentDate.toISOString()] = {
				'currentCost': (personnelCost[j] || 0) + (allOtherCost[j] || 0),
				'personnelCost': personnelCost[j] || 0,
				'allOtherCost': allOtherCost[j] || 0,
				'currentInvoice': allInvoices[j] || 0
			};
			currentDate.setMonth(currentDate.getMonth() + 1);
		}
	}
	if ( pfv ) {
		currentDate = getDateStartOfMonth(pfv.startDate);
		logger4js.trace('Calculate Project Costs pfv currentDate %s ', currentDate.toISOString());
		var maxTimeZoneIndex = getTimeZoneIndex(timeZones, pfv.timestamp);
		personnelCost = getAllPersonnelCost(pfv, timeZones, maxTimeZoneIndex);
		allOtherCost = getAllOtherCost(pfv, timeZones);
		allInvoices = getAllInvoices(pfv);
		len = Math.max(personnelCost.length, allOtherCost.length, allInvoices.length);
		for (var i = 0 ; i < len; i++) {
			const currentDateISO = currentDate.toISOString();
			if (!allCostValues[currentDateISO]) {
				allCostValues[currentDateISO] = {};
			}
			allCostValues[currentDateISO].baseLineCost = (personnelCost[i] || 0) + (allOtherCost[i] || 0);
			allCostValues[currentDateISO].baseLineInvoice = (allInvoices[i] || 0);
			currentDate.setMonth(currentDate.getMonth() + 1);
		}
	}

	for (var element in allCostValues) {
		allCostValuesIndexed.push({
			'currentDate': element,
			'baseLineCost': allCostValues[element].baseLineCost || 0,
			'currentCost': allCostValues[element].currentCost || 0,
			'personnelCost': allCostValues[element].personnelCost || 0,
			'allOtherCost': allCostValues[element].allOtherCost || 0,
			'baseLineInvoice': allCostValues[element].baseLineInvoice || 0,
			'currentInvoice': allCostValues[element].currentInvoice || 0,
		});
	}
	var endCalc = new Date();
	logger4js.debug('Calculate Project Costs duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return allCostValuesIndexed;
}


function getSummeInvoices(vpv, index) {
	var sumOfInvoices = 0;
	var startDate, endDate;
	var len;
	var allInvoices;

	if ( !vpv ) {
		logger4js.warn('CalcInvoices no valid vpv');
		return sumOfInvoices;
	}	
	startDate = vpv.startDate;
	endDate =  vpv.endDate;

	if (vpv) {
		var currentDate = getDateStartOfMonth(vpv.startDate);
		logger4js.trace('Calculate Project Costs vpv startDate %s ISO %s currentDate %s', vpv.startDate, vpv.startDate.toISOString(), currentDate.toISOString());
		
		allInvoices = getAllInvoices(vpv);
		len = allInvoices.length;		
		len = Math.min(len, index);
		for (var j = 0; j < len; j++) {
			sumOfInvoices += allInvoices[j] || 0;
			} 
		}

	//logger4js.debug('Calculate Project Invoices until month-No %s ', index);
	return sumOfInvoices;
}


function getNamePart(str, part) {
		var result = undefined;
		if (!str || part < 0) {
			return result;
		}
		var compName = str.split('§');
		if (compName.length > part) {
			result = compName[part];
		} else { // gilt für die rootphase - hier ist der Name '.'
			if (compName[compName.length - 1] == '0') {
				result = '.';
			}
		}
		return result;
}

function checkRestricted(restrict, delivery) {
	var pathRestricted, pathActual;
	pathRestricted = restrict.elementPath.join('/');
	if (restrict.inclChildren) {
		var len = restrict.elementPath.length;
		pathActual = delivery.fullPathVPV.slice(0, len).join('/');
	} else {
		pathActual = delivery.fullPathVPV.join('/');
	}

	return pathRestricted == pathActual;
}

function calcDeadlines(vpv, pfv, getAll, restriction) {
	var allDeadlineValuesIndexed = [];
	var startCalc = new Date();

	if (!vpv) {
		logger4js.warn('Calculate Project Deadlines missing vpv');
		return allDeadlineValuesIndexed;
	}

	var hrchy_pfv = convertHierarchy(pfv);
	var hrchy_vpv = convertHierarchy(vpv);
	var allDeadlines = getDeadlines(pfv, hrchy_pfv, undefined);
	allDeadlines = getDeadlines(vpv, hrchy_vpv, allDeadlines, getAll);

	var j = 0, element;
	var listDeadlines = allDeadlines.getAllDeadlines();

	for (element = 0; element < listDeadlines.length; element++) {
		logger4js.trace('Add Project Deadline %s', JSON.stringify(listDeadlines[element]));
		var name = getNamePart(listDeadlines[element].nameID || '§UNDEFINED', 1);
		var changeDays = Math.round((listDeadlines[element].endDateVPV - listDeadlines[element].endDatePFV) / 1000 / 3600 / 24);
		if (!restriction || restriction.findIndex(restrict => checkRestricted(restrict, listDeadlines[element])) >= 0) {
			allDeadlineValuesIndexed[j] = {
				'nameID': listDeadlines[element].nameID,
				'name': name || getNamePart(listDeadlines[element].phasePFV, 1),
				'fullPathPFV': listDeadlines[element].fullPathPFV || undefined,
				'phasePFV': getNamePart(listDeadlines[element].phasePFV, 1),
				'fullPathVPV': listDeadlines[element].fullPathVPV || undefined,
				'phaseVPV': getNamePart(listDeadlines[element].phaseVPV, 1),
				'type': listDeadlines[element].type || undefined,
				'startDatePFV': listDeadlines[element].startDatePFV || undefined,
				'startDateVPV': listDeadlines[element].startDateVPV || undefined,
				'endDatePFV': listDeadlines[element].endDatePFV || undefined,
				'endDateVPV': listDeadlines[element].endDateVPV || undefined,
				'changeDays': isNaN(changeDays) ? undefined : changeDays,
				'percentDone': listDeadlines[element].percentDone || 0,
				'trafficlight': listDeadlines[element].trafficlight || 0,
				'trafficlightDesc': listDeadlines[element].trafficlightDesc,
				'responsible': listDeadlines[element].responsible
			};
			j++;
		}
	}
	var endCalc = new Date();
	logger4js.debug('Calculate Project Deadlines duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return allDeadlineValuesIndexed;
}

function calcDeliverables(vpv, pfv, getAll, restriction) {
	var allDeliveryValuesIndexed = [];
	var startCalc = new Date();

	if (!vpv ) {
		logger4js.warn('Calculate Project Deliveries missing vpv');
		return allDeliveryValuesIndexed;
	}

	var hrchy_pfv = convertHierarchy(pfv);
	var hrchy_vpv = convertHierarchy(vpv);
	var allDeliverables = getAllDeliverables(pfv, hrchy_pfv, undefined);
	allDeliverables = getAllDeliverables(vpv, hrchy_vpv, allDeliverables, getAll);

	var j = 0, element;
	var listDeliveries = allDeliverables.getAllDeliveries();

	for (element = 0; element < listDeliveries.length; element++) {
		logger4js.trace('Add Project Delivery %s', JSON.stringify(listDeliveries[element]));
		var name = getNamePart(listDeliveries[element].nameID || '§UNDEFINED', 1);
		var changeDays = Math.round((listDeliveries[element].endDateVPV - listDeliveries[element].endDatePFV) / 1000 / 3600 / 24);
		if (!restriction || restriction.findIndex(restrict => checkRestricted(restrict, listDeliveries[element])) >= 0) {
			allDeliveryValuesIndexed[j] = {
				'nameID': listDeliveries[element].nameID,
				'name': name,
				'fullPathPFV':  listDeliveries[element].fullPathPFV  || undefined,
				'phasePFV': getNamePart(listDeliveries[element].phasePFV, 1),
				'fullPathVPV':listDeliveries[element].fullPathVPV || undefined,
				'phaseVPV': getNamePart(listDeliveries[element].phaseVPV, 1),
				'description': listDeliveries[element].description || undefined,
				'endDatePFV': listDeliveries[element].endDatePFV || undefined,
				'endDateVPV': listDeliveries[element].endDateVPV || undefined,
				'changeDays': isNaN(changeDays) ? undefined : changeDays,
				'percentDone': listDeliveries[element].percentDone || 0
				// 'trafficlight': listDeliveries[element].trafficlight || 0,
				// 'trafficlightDesc': listDeliveries[element].trafficlightDesc,
				// 'responsible': listDeliveries[element].responsible
			};
			j++;
		}
	}

	var endCalc = new Date();
	logger4js.debug('Calculate Project Deliveries duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return allDeliveryValuesIndexed;
}

function getSummeKosten(vpv, index, timeZones, maxTZ) {
	// calculate the total cost until month of index
	var costSum = 0;

	if (!vpv || !(timeZones?.organisation?.length > 0) || !(index >= 0)) {
		return undefined;
	}

	var personnelCost = getAllPersonnelCost(vpv, timeZones, maxTZ);
	var allOtherCost = getAllOtherCost(vpv, timeZones);

	var len = Math.max(personnelCost.length, allOtherCost.length);
	len = Math.min(len, index);

	for (var i = 0 ; i < len; i++) {
		costSum += (personnelCost[i] || 0) + (allOtherCost[i] || 0);
	}
	return costSum;
}

// Deliverables for the Project combine INfo from baseline and vpv
function VisboDeliverable() {
  this.length = 0;
  this.allDeliverables = {};
  this.addDeliverable = function(id, newDeliverable) {
		if (newDeliverable == undefined) return;
		if (id == undefined) return;
		if (this.allDeliverables[id] == undefined) {
			this.allDeliverables[id] = {};
			this.length += 1;
		}
		if (newDeliverable.nameID) this.allDeliverables[id].nameID =  newDeliverable.nameID;
		if (newDeliverable.phase) this.allDeliverables[id].phasePFV =  newDeliverable.phase;
		if (newDeliverable.description) this.allDeliverables[id].description =  newDeliverable.description;
		if (newDeliverable.fullPathPFV) this.allDeliverables[id].fullPathPFV = newDeliverable.fullPathPFV;
		if (newDeliverable.endDatePFV) this.allDeliverables[id].endDatePFV =  newDeliverable.endDatePFV;
	};
	this.updateDeliverable = function(id, deliverable, insertAll) {
		if (deliverable == undefined) return;
		if (id == undefined) return;
		if (this.allDeliverables[id] == undefined) {
			if (insertAll) {
				this.allDeliverables[id] = {};
				this.length += 1;
			} else {
				return;
			}
		}
		if (!this.allDeliverables[id].nameID) this.allDeliverables[id].nameID =  deliverable.nameID;
		if (deliverable.phase) this.allDeliverables[id].phaseVPV =  deliverable.phase;
		if (deliverable.description) this.allDeliverables[id].description =  deliverable.description;
		if (deliverable.fullPathVPV) this.allDeliverables[id].fullPathVPV = deliverable.fullPathVPV;
		if (deliverable.endDateVPV) this.allDeliverables[id].endDateVPV =  deliverable.endDateVPV;
		if (deliverable.percentDone) this.allDeliverables[id].percentDone =  deliverable.percentDone;
		if (deliverable.trafficlight >= 0) this.allDeadlines[id].trafficlight = deliverable.trafficlight;
		if (deliverable.trafficlightDesc) this.allDeadlines[id].trafficlightDesc = deliverable.trafficlightDesc;
	};
	this.getDelivery = function(id) {
		var result = this.allDeliverables[id] || {};
		return result;
	};
	this.getAllDeliveries = function() {
		var idList = [];
		for (var id in this.allDeliverables) {
			idList.push(this.allDeliverables[id]);
		}
		return idList;
	};
}

// Deadlines for the Project combine Info from baseline and vpv
function VisboDeadlines() {
  this.length = 0;
  this.allDeadlines = {};
  this.addDeadline = function(id,  deadline) {
		if ( deadline == undefined) return;
		if (id == undefined) return;
		if (this.allDeadlines[id] == undefined) {
			this.allDeadlines[id] = {};
			this.length += 1;
		}
		if ( deadline.nameID) this.allDeadlines[id].nameID = deadline.nameID;
		if ( deadline.fullPathPFV) this.allDeadlines[id].fullPathPFV = deadline.fullPathPFV;
		if ( deadline.phasePFV) this.allDeadlines[id].phasePFV = deadline.phasePFV;
		if ( deadline.name) this.allDeadlines[id].name = deadline.name;
		if ( deadline.type) this.allDeadlines[id].type = deadline.type;
		if ( deadline.endDatePFV) this.allDeadlines[id].endDatePFV = deadline.endDatePFV;
		if ( deadline.startDatePFV) this.allDeadlines[id].startDatePFV = deadline.startDatePFV;
	};
	this.updateDeadline = function(id, deadline, insertAll) {
		if (deadline == undefined) return;
		if (id == undefined) return;
		if (this.allDeadlines[id] == undefined) {
			if (insertAll) {
				this.allDeadlines[id] = {};
				this.length += 1;
			} else {
				return;
			}
		}
		if (!this.allDeadlines[id].nameID) this.allDeadlines[id].nameID = deadline.nameID;
		if ( deadline.fullPathVPV) this.allDeadlines[id].fullPathVPV	= deadline.fullPathVPV;
		if ( deadline.name) this.allDeadlines[id].name = deadline.name;
		if ( deadline.type) this.allDeadlines[id].type = deadline.type;
		if ( deadline.phaseVPV) this.allDeadlines[id].phaseVPV = deadline.phaseVPV;
		if ( deadline.endDateVPV) this.allDeadlines[id].endDateVPV = deadline.endDateVPV;
		if ( deadline.startDateVPV) this.allDeadlines[id].startDateVPV = deadline.startDateVPV;
		if ( deadline.percentDone) this.allDeadlines[id].percentDone = deadline.percentDone;
		if ( deadline.trafficlight >= 0) this.allDeadlines[id].trafficlight = deadline.trafficlight;
		if ( deadline.trafficlightDesc) this.allDeadlines[id].trafficlightDesc = deadline.trafficlightDesc;
		if ( deadline.responsible) this.allDeadlines[id].responsible = deadline.responsible;
	};
	this.getDeadline = function(id) {
		var result = this.allDeadlines[id] || {};
		return result;
	};
	this.getAllDeadlines = function() {
		var idList = [];
		for (var id in this.allDeadlines) {
			idList.push(this.allDeadlines[id]);
		}
		return idList;
	};
}

// check if elemId is milestone
function elemIdIsMilestone(elemId) {
	var isElemId = false;

	if (elemId) {
		// is string at the beginning of the nameID
		isElemId = (elemId.indexOf('1§') == 0);
	}

	return isElemId;
}

function getPhaseByID(hrchy, vpv, elemId){
	var phase = undefined;
	var rootKey = '0';
	var rootphaseID = '0§.§';

	if (elemId === rootphaseID){
		elemId = rootKey;
	}
	if (hrchy && hrchy[elemId] && hrchy[elemId].hryNode) {
		var phIndex = hrchy[elemId].hryNode.indexOfElem;
		if (vpv.AllPhases && phIndex > 0 && phIndex <= vpv.AllPhases.length) {
				phase = vpv.AllPhases[phIndex-1];
		}
	}
	logger4js.trace('find the the Phase %s of the project %s ', elemId, vpv.name);
	return phase;
}

function getMilestoneByID(hrchy,vpv, elemId){
	var ms = undefined;

	if (hrchy && hrchy[elemId]) {
		var currentNode = hrchy[elemId].hryNode;
		if (currentNode){
			var phaseID = currentNode.parentNodeKey;
			var phase = getPhaseByID(hrchy,vpv,phaseID);
			var msIndex = currentNode.indexOfElem;

			if (phase && phase.AllResults){
				ms = phase.AllResults[msIndex-1];
			}
		}
	}
	logger4js.trace('find the milestone number %s of the project %s ', elemId, vpv.name);
	return ms;
}

function getMsDate(hrchy, vpv, elemId){
	var msDate = undefined;

	var currentNode = elemId && hrchy[elemId] && hrchy[elemId].hryNode;
	if (currentNode){
		var phaseID = currentNode.parentNodeKey;
		var phase = getPhaseByID(hrchy, vpv, phaseID);

		var msIndex = currentNode.indexOfElem;
		if (phase && phase.name ) {
			var ms = phase.AllResults[msIndex-1];
			if (ms && vpv.startDate && phase.startOffsetinDays >= 0 ) {
				logger4js.trace('get the Date of Milestone %s in %s ', ms.name, phase.name);
				msDate = addDays(vpv.startDate, (phase.startOffsetinDays + ms.offset));
			}
		}
	}
	return msDate;
}

// get endDate of Phase to use also for other elemenst like i.e. Deliveries
function getPhEndDate(vpv, phase){
	var phEndDate = undefined;

	if (phase && phase.name){
		logger4js.trace('find the endDate of the Phase %s start %s offset %s duration %s ', phase.name, vpv.startDate, phase.startOffsetinDays, phase.dauerInDays);
		if (phase.dauerInDays > 0 && phase.startOffsetinDays >= 0) {
			phEndDate = addDays(vpv.startDate, phase.startOffsetinDays + phase.dauerInDays - 1);
		} else {
			phEndDate = addDays(vpv.startDate, phase.startOffsetinDays);
		}
		logger4js.trace('endDate of the Phase %s is %s', phase.name, phEndDate.toISOString());
	}

	return phEndDate;
}

// get endDate of Phase to use also for other elemenst like i.e. Deliveries
function getPhStartDate(vpv, phase){
	var phStartDate = new Date();

	if (phase){
		logger4js.trace('find the startDate of the Phase %s  ', phase.name);
		phStartDate = addDays(vpv.startDate, phase.startOffsetinDays);
	}

	return phStartDate;
}

// Calculate all Deliverables for the requested Project/BaseProject
function getAllDeliverables(vpv, hrchy, allDeliverables, insertAll) {

	logger4js.trace('Calculate all Deliverables of %s  ', vpv && vpv._id);

	if (!vpv || !vpv.AllPhases) {
		return new VisboDeliverable();
	}

	// get all for pfv or if the calculcation is done only for vpv
	var addAll = false;
	if (vpv.variantName == 'pfv' || !allDeliverables ) {
		addAll = true;
		// initialise the deliverables for the project version
		allDeliverables = new VisboDeliverable();
	}

	for (var i = 0; i < vpv.AllPhases.length; i++) {
		var phase = vpv.AllPhases[i];
		if (!phase || !phase.name) {
			// skip empty phase
			continue;
		}
		var nameBC = getBreadCrumb(phase.name, hrchy);
		var endDate = getPhEndDate(vpv, phase);

		// logger4js.trace('Calculate Phase %s Deliverables %s', i, phase.deliverables.length);

		for (var j = 0; phase.deliverables && j < phase.deliverables.length; j++) {
			var id = phase.deliverables[j];

			logger4js.trace('Phase Delivery: Action %s Delivery %s/%s endDate %s', addAll ? 'Add' : 'Update', phase.name, phase.deliverables[j], endDate && endDate.toISOString());
			if (addAll) {
				allDeliverables.addDeliverable(id, {nameID: phase.name, phase: phase.name, description: phase.deliverables[j], fullPathPFV: nameBC, endDatePFV: endDate});
			} else {
				allDeliverables.updateDeliverable(id, {nameID: phase.name, phase: phase.name, description: phase.deliverables[j], fullPathVPV: nameBC, endDateVPV: endDate, percentDone:  (phase && phase.percentDone) || 0}, insertAll);
			}
		}

		for (var k = 0; phase && phase.AllResults && k < phase.AllResults.length; k++){
			var milestone = phase.AllResults[k];
			nameBC = getBreadCrumb(milestone.name, hrchy);
			endDate = getMsDate(hrchy, vpv, milestone.name);

			logger4js.trace('Calculate Milestone %s Deliverables %s with endDate %s', i, phase.AllResults.length, endDate && endDate.toISOString());

			for (var m = 0; milestone && milestone.deliverables && m < milestone.deliverables.length; m++){
				id = milestone.deliverables[m];
				logger4js.trace('Phase Delivery: Action %s Delivery %s/%s/%s endDate %s', addAll ? 'Add' : 'Update', phase.name, milestone.name, milestone.deliverables[m], endDate && endDate.toISOString());
				if (addAll) {
					allDeliverables.addDeliverable(id, {nameID: milestone.name, phase: phase.name, description: milestone.deliverables[m], fullPathPFV: nameBC, endDatePFV: endDate});
				} else {
					allDeliverables.updateDeliverable(id, {nameID: milestone.name, phase: phase.name, description: milestone.deliverables[m], fullPathVPV: nameBC ,endDateVPV: endDate, percentDone: (milestone && milestone.percentDone) || 0}, insertAll);
				}
			}
		}
	}
	return allDeliverables;
}

function getDeliverableCompletionMetric(allDeliverables, refDate){
	var result = {
			deliverableCompletionBaseLastActual: 0,
			deliverableCompletionBaseLastTotal: 0,
			deliverableCompletionCurrentActual: 0,
			deliverableCompletionCurrentTotal: 0
		};
	if (!refDate) { refDate = new Date(); }

	var listDeliveries = allDeliverables.getAllDeliveries();
	for (var element = 0; element < listDeliveries.length; element++) {
		result.deliverableCompletionBaseLastTotal += 1;
		// Item was found in VPV, add it to total
		if (listDeliveries[element].endDateVPV) {
			result.deliverableCompletionCurrentTotal += 1;
		}
		// Item was planned before refDate in baseline
		if (listDeliveries[element].endDatePFV && listDeliveries[element].endDatePFV.getTime() < refDate.getTime()) {
			result.deliverableCompletionBaseLastActual += 1;
		}
		// Item was due in VPV, add it to actual weighted with percentDone
		if (listDeliveries[element].endDateVPV && listDeliveries[element].endDateVPV.getTime() < refDate.getTime()) {
			result.deliverableCompletionCurrentActual += 1 * (listDeliveries[element].percentDone || 0);
		}
	}
	return result;
}

// Calculate all Deadlines for the requested Project/BaseProject
function getDeadlines(vpv, hrchy, allDeadlines, insertAll) {

	if (!vpv || !vpv.hierarchy || !vpv.hierarchy.allNodes || !vpv.AllPhases || !hrchy) {
		return new VisboDeadlines();
	}

	var addAll = false;
	logger4js.trace('Calculate all Deadlines of %s  ', vpv && vpv._id);

	if (vpv.variantName == 'pfv' || !allDeadlines) {
		addAll = true;
		// initialise the deadlines for the project version
		allDeadlines = new VisboDeadlines();
	}

	for (var i = 0; i < vpv.hierarchy.allNodes.length; i++) {
		var hryElement = vpv.hierarchy.allNodes[i];
		var currentNodeID = hryElement.hryNodeKey;
		if (currentNodeID) {
			var isMS = elemIdIsMilestone(currentNodeID);
			var name = currentNodeID;
			var nameBC = getBreadCrumb(currentNodeID, hrchy);
			var phase = getPhaseByID(hrchy, vpv, currentNodeID);
			var startDate, endDate;
			if (isMS) {
				var milestone = getMilestoneByID(hrchy, vpv, currentNodeID);
				var phaseName = hryElement.hryNode && hryElement.hryNode.parentNodeKey;
				endDate = getMsDate(hrchy, vpv, currentNodeID);
				// check if the phase is valid/visible
				if (phaseName && endDate) {
					if (addAll) {
						allDeadlines.addDeadline(currentNodeID, {nameID: currentNodeID, fullPathPFV: nameBC, type: 'Milestone', name: name, phasePFV: phaseName, endDatePFV: endDate});
					} else {
						allDeadlines.updateDeadline(currentNodeID,
							{
								nameID: currentNodeID, fullPathVPV: nameBC, type: 'Milestone',
								name: name, phaseVPV: phaseName, endDateVPV: endDate, percentDone: (milestone && milestone.percentDone) || 0,
								trafficlight: (milestone &&  milestone.bewertungen &&  milestone.bewertungen.length > 0 && milestone.bewertungen[0].bewertung && milestone.bewertungen[0].bewertung.color),
								trafficlightDesc: (milestone &&  milestone.bewertungen &&  milestone.bewertungen.length > 0 && milestone.bewertungen[0].bewertung && milestone.bewertungen[0].bewertung.description)
							},
							insertAll
						);
					}
				}
			} else {


				// currentNode is a phase
				endDate = getPhEndDate(vpv, phase);
				startDate = getPhStartDate(vpv, phase);

				if (name  && endDate) {
					if (addAll) {
						allDeadlines.addDeadline(currentNodeID, {nameID: currentNodeID, fullPathPFV: nameBC, type: 'Phase', name: name, phasePFV: name, endDatePFV: endDate, startDatePFV: startDate});
					} else {
						allDeadlines.updateDeadline(currentNodeID,
							{
								nameID: currentNodeID, fullPathVPV: nameBC, type: 'Phase',
								name: name, endDateVPV: endDate, startDateVPV: startDate, percentDone: (phase && phase.percentDone) || 0,
								trafficlight: (phase && phase.ampelStatus) , trafficlightDesc: (phase && phase.ampelErlaeuterung),
								responsible: (phase && phase.responsible)
							},
							insertAll
						);
					}
				}
			}
		}
	}
	return allDeadlines;
}

function getTimeCompletionMetric(allDeadlines, refDate){
	var result = {
		timeCompletionBaseLastActual: 0,
		timeCompletionBaseLastTotal: 0,
		timeCompletionCurrentActual: 0,
		timeCompletionCurrentTotal: 0
	};
	if (!refDate) { refDate = new Date(); }

	var listDeadlines = allDeadlines.getAllDeadlines();
	for (var element = 0; element < listDeadlines.length; element++) {
		result.timeCompletionBaseLastTotal += 1;
		// Item was found in VPV, add it to total
		if (listDeadlines[element].endDateVPV) {
			result.timeCompletionCurrentTotal += 1;
		}
		// Item was planned before refDate in baseline
		if (listDeadlines[element].endDatePFV && listDeadlines[element].endDatePFV.getTime() < refDate.getTime()) {
			result.timeCompletionBaseLastActual += 1;
		}
		// Item was due in VPV, add it to actual weighted with percentDone
		if (listDeadlines[element].endDateVPV && listDeadlines[element].endDateVPV.getTime() < refDate.getTime()) {
			result.timeCompletionCurrentActual += 1 * (listDeadlines[element].percentDone || 0);
		}
	}
	return result;
}

function getTimeDelayOfDeadlinesMetric(allDeadlines, refDate){
	var result = {
		timeDelayFinished: 0,
		timeDelayUnFinished: 0
	};
	if (!refDate) { refDate = new Date(); }
	var finishedElements = [];
	var unfinishedElements = [];

	var listDeadlines = allDeadlines.getAllDeadlines();
	var f = 0;
	var uf = 0;
	for (var element = 0; listDeadlines && listDeadlines[element] &&
							listDeadlines[element].endDatePFV &&
							listDeadlines[element].endDateVPV &&
							element < listDeadlines.length; element++) {

		if (listDeadlines[element].percentDone === 1) {
			// finished
			if (listDeadlines[element].endDatePFV && listDeadlines[element].endDatePFV.getTime() < refDate.getTime()) {
				// before refdate
				finishedElements[f] = (diffDays(listDeadlines[element].endDateVPV,listDeadlines[element].endDatePFV) || 0);
			} else {
				// in future
				var minFinishedDate = Math.min(listDeadlines[element].endDateVPV, refDate.getTime());
				finishedElements[f] = (diffDays(minFinishedDate, listDeadlines[element].endDatePFV) || 0);
			}
			f++;
			continue;
		}

		// unfinished
		if (listDeadlines[element].endDatePFV && listDeadlines[element].endDatePFV.getTime() < refDate.getTime()) {
			// PFV before refdate
			var maxUnFinishedDate = Math.max(listDeadlines[element].endDateVPV, refDate.getTime());
			unfinishedElements[uf] = (diffDays(maxUnFinishedDate, listDeadlines[element].endDatePFV) || 0);
		} else {
			// PFV in future
			unfinishedElements[uf] = (diffDays(listDeadlines[element].endDateVPV, listDeadlines[element].endDatePFV) || 0);
		}
		uf++;
	}

	// sum of finished
	var wholeDelayFinished = 0;
	for ( f = 0; f < finishedElements.length; f++) {
		wholeDelayFinished += 1 * (finishedElements[f] || 0);
	}
	result.timeDelayFinished = ((wholeDelayFinished / finishedElements.length) || undefined);

	var wholeDelayUnFinished = 0;
	for ( f = 0; f < unfinishedElements.length; f++) {
		wholeDelayUnFinished += 1 * (unfinishedElements[f] || 0);
	}
	result.timeDelayUnFinished = ((wholeDelayUnFinished / unfinishedElements.length) || undefined);

	return result;
}

// determines the difference in days of two dates
function diffDays(date1, date2) {

	var differenceInDays = undefined;
	var oneDay = 24*60*60*1000; // hours*minutes*seconds*milliseconds
	var firstDate = new Date(date1);
	firstDate.setHours(12, 0, 0, 0);
	var secondDate = new Date(date2);
	secondDate.setHours(12, 0, 0, 0);
	// var firstDate = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
	// var secondDate = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
	if (!isNaN(firstDate) && !isNaN(secondDate)) {
		differenceInDays = Math.round((firstDate.getTime() - secondDate.getTime())/(oneDay));
	}
	return differenceInDays;
}

function getBreadCrumb(elemID, hrchy) {
	var breadCrumb = [];
	var rootKey = '0';
	var rootphaseID = '0§.§';

	logger4js.trace('Calculate the path of planelement %s  ', elemID );

	while (elemID && hrchy[elemID] && hrchy[elemID].hryNode) {
		breadCrumb.push(hrchy[elemID].hryNode.elemName || '');
		elemID = hrchy[elemID].hryNode.parentNodeKey;
		if (elemID == rootphaseID) {
			elemID = rootKey;
		}
	}
	breadCrumb.reverse();
	return breadCrumb;
}

function convertHierarchy(vpv) {
	var indexedHrchy = [];
	if (!vpv || !vpv.hierarchy || !vpv.hierarchy.allNodes ) {
		// not a full blown vpv, return empty list
		return indexedHrchy;
	}
	for (var i = 0; i < vpv.hierarchy.allNodes.length; i++) {
		indexedHrchy[vpv.hierarchy.allNodes[i].hryNodeKey] = vpv.hierarchy.allNodes[i];
	}
	return indexedHrchy;
}

function calcKeyMetrics(vpv, pfv, organisation) {
	var keyMetrics = {};
	var startCalc = new Date();

	// we need vpv & pfv and they need to have the correct variantNames
	if (!(vpv && pfv) || vpv?.variantName == 'pfv' || pfv?.variantName != 'pfv') {
		return keyMetrics;
	}

	// Calculate keyMetrics Values here
	keyMetrics = vpv.keyMetrics || {};
	logger4js.debug('Calculate KeyMetrics for %s with pfv %s and organization %s result %s ', vpv && vpv._id, pfv && pfv._id, organisation && organisation[0] && organisation[0]._id, JSON.stringify(keyMetrics));

	if (organisation?.length > 0) {
		var indexTotal = getColumnOfDate(pfv.endDate) - getColumnOfDate(pfv.startDate) + 1;
		// for calculation the actual cost of the baseline: all costs between the start of the project and the month before the timestamp of the vpv
		var endDatePreviousMonthVPV = getDateEndOfPreviousMonth(vpv.timestamp);
		var indexActual = getColumnOfDate(endDatePreviousMonthVPV) - getColumnOfDate(pfv.startDate) + 1;

		var timeZones = splitInTimeZones(organisation, pfv.startDate, pfv.endDate);
		if (timeZones) {
			var maxTimeZoneIndex = getTimeZoneIndex(timeZones, pfv.timestamp);
			var sumCosts = getSummeKosten(pfv, indexTotal, timeZones, maxTimeZoneIndex);
			keyMetrics.costBaseLastTotal = sumCosts && Math.round(sumCosts*1000)/1000; //round to euros
			sumCosts = getSummeKosten(pfv, indexActual, timeZones, maxTimeZoneIndex);
			keyMetrics.costBaseLastActual = sumCosts && Math.round(sumCosts*1000)/1000; //round to euros

			indexTotal = getColumnOfDate(vpv.endDate) - getColumnOfDate(vpv.startDate) + 1;
			indexActual = getColumnOfDate(endDatePreviousMonthVPV) - getColumnOfDate(vpv.startDate) + 1;
			sumCosts = getSummeKosten(vpv, indexTotal, timeZones);
			keyMetrics.costCurrentTotal= sumCosts && Math.round(sumCosts*1000)/1000; //round to euros
			sumCosts = getSummeKosten(vpv, indexActual, timeZones);
			keyMetrics.costCurrentActual= sumCosts && Math.round(sumCosts*1000)/1000; //round to euros
		}
	}

	// prepare hierarchy of pfv for direct access
	var hrchy_pfv = convertHierarchy(pfv);
	// prepare hierarchy of vpv for direct access
	var hrchy_vpv = convertHierarchy(vpv);

	keyMetrics.endDateCurrent= vpv.endDate;
	keyMetrics.endDateBaseLast = pfv.endDate;

	// look for the deadlines of pfv (take all)
	var allDeadlines = getDeadlines(pfv, hrchy_pfv, undefined);
	// update the deadlines with properties of vpv (only those, which are in the pfv too)
	allDeadlines = getDeadlines(vpv, hrchy_vpv, allDeadlines);

	if (allDeadlines?.length > 0){
		var timeKeyMetric = getTimeCompletionMetric(allDeadlines, vpv.timestamp);
		keyMetrics.timeCompletionCurrentActual = timeKeyMetric.timeCompletionCurrentActual;
		keyMetrics.timeCompletionBaseLastActual = timeKeyMetric.timeCompletionBaseLastActual;
		keyMetrics.timeCompletionCurrentTotal = timeKeyMetric.timeCompletionCurrentTotal;
		keyMetrics.timeCompletionBaseLastTotal = timeKeyMetric.timeCompletionBaseLastTotal;

		var timeDelayMetric = getTimeDelayOfDeadlinesMetric(allDeadlines, vpv.timestamp);
		keyMetrics.timeDelayFinished = timeDelayMetric.timeDelayFinished && Math.round(timeDelayMetric.timeDelayFinished*100)/100;
		keyMetrics.timeDelayUnFinished = timeDelayMetric.timeDelayUnFinished && Math.round(timeDelayMetric.timeDelayUnFinished*100)/100;
	}

	// look for the deliverables of pfv (take all)
	var allDeliverables = getAllDeliverables(pfv, hrchy_pfv, undefined);
	// update the deliverables with properties of vpv (only those, which are in the pfv too)
	allDeliverables = getAllDeliverables(vpv, hrchy_vpv, allDeliverables);

	if (allDeliverables?.length > 0){
		var deliverableKeyMetric = getDeliverableCompletionMetric(allDeliverables, vpv.timestamp);
		keyMetrics.deliverableCompletionBaseLastActual = deliverableKeyMetric.deliverableCompletionBaseLastActual;
		keyMetrics.deliverableCompletionBaseLastTotal = deliverableKeyMetric.deliverableCompletionBaseLastTotal;
		keyMetrics.deliverableCompletionCurrentActual = deliverableKeyMetric.deliverableCompletionCurrentActual;
		keyMetrics.deliverableCompletionCurrentTotal = deliverableKeyMetric.deliverableCompletionCurrentTotal;
	}

	keyMetrics.RACBaseLast = pfv.Erloes;
	var sumOfInvoicesBase = getSummeInvoices(pfv, indexActual);
	keyMetrics.RACBaseLastActual = sumOfInvoicesBase && Math.round(sumOfInvoicesBase*1000)/1000; //round to euros
	keyMetrics.RACCurrent = vpv.Erloes;	
	var sumOfInvoicesCurrent = getSummeInvoices(vpv, indexActual);
	keyMetrics.RACCurrentActual = sumOfInvoicesCurrent && Math.round(sumOfInvoicesCurrent*1000)/1000; //round to euros

	var endCalc = new Date();
	logger4js.debug('Calculate KeyMetrics duration %s ms ', endCalc.getTime() - startCalc.getTime());

	return keyMetrics;
}

function calcCapacities(vpvs, pfvs, roleID, parentID, startDate, endDate, organisation, capacity, hierarchy, onlyPT) {
	if (!(vpvs?.length > 0) || !(organisation?.length > 0)) {
		logger4js.warn('Calculate Capacities missing vpvs %d or organisation %d', vpvs?.length, organisation?.length);
		return [];
	}

	if (validate.compareDate(startDate, endDate) > 0 ){
		logger4js.warn('Calculate Capacities startDate %s before endDate %s ', startDate, endDate);
		return [];
	}

	logger4js.debug('Calculate Capacities %s/%s', roleID, parentID);
	var startTimer = new Date();

	if (!startDate) {
		startDate = getDateStartOfMonth();
		startDate.setMonth(startDate.getMonth() - 4);
	}
	var startIndex = getColumnOfDate(startDate);

	if (!endDate) {
		endDate = getDateStartOfMonth();
		endDate.setMonth(endDate.getMonth() + 9);
	}
	var endIndex = getColumnOfDate(endDate);

	var timeZones = splitInTimeZones(organisation, startDate, endDate);
	if (!timeZones) {
		return [];
	}
	var role, teamID;
	if (!roleID) {
		role = timeZones.mergedOrganisation.find(role => role.pid == undefined);
		roleID = role?.uid;
	}
	role = findCurrentRole(timeZones, roleID);
	if (!role) {
		logger4js.warn('Calculate Concerning Roles not found, Role: %d found: %s, Parent: %d', roleID, role != undefined, parentID);
		return [];
	}
	if (!role.isSummaryRole && parentID > 0) {
		// find the parent team for a person in this orga
		var teamRole = findCurrentRole(timeZones, parentID);
		if (teamRole?.type == 2) {
			// if parent is a team set the teamID
			teamID = teamRole.uid;
		}
	}
	mergeCapacity(capacity, timeZones, startDate);

	// reduce the amount of vpvs to the relevant ones in the time between startDate and endDate
	var newvpvs = [];
	for ( var i = 0; vpvs && i < vpvs.length; i++) {
		var vpv = vpvs[i];
		var vpvStartIndex = getColumnOfDate(vpv.startDate);
		var vpvEndIndex = getColumnOfDate(vpv.endDate);
		if (vpvEndIndex < startIndex) continue;
		if (vpvStartIndex > endIndex) continue;
		newvpvs.push(vpv);
	}

	var capaVPV = calcCapacityVPVs(newvpvs, roleID, teamID, timeZones, hierarchy);
	var capaPFV = [];
	var item;

	if (pfvs?.length > 0) {
		// reduce the amount of pfvs to the relevant ones in the time between startDate and endDate
		var newpfvs = [];
		for ( i = 0; pfvs && i < pfvs.length; i++) {
			vpv = pfvs[i];
			vpvStartIndex = getColumnOfDate(vpv.startDate);
			vpvEndIndex = getColumnOfDate(vpv.endDate);
			if (vpvEndIndex < startIndex) continue;
			if (vpvStartIndex > endIndex) continue;
			newpfvs.push(vpv);
		}
		// calc the corresponding of the PFVs
		capaPFV = calcCapacityVPVs(newpfvs, roleID, teamID, timeZones, hierarchy);
		// insert or update capa values
		for (item in capaPFV) {
			if (!capaVPV[item]) {
				// insert new Value
				capaVPV[item] = {};
				capaVPV[item].currentDate = capaPFV[item].currentDate;
				capaVPV[item].roleID = capaPFV[item].roleID;
				capaVPV[item].roleName = capaPFV[item].roleName;
				capaVPV[item].actualCost_PT = 0;
				capaVPV[item].plannedCost_PT = 0;
				capaVPV[item].actualCost = 0;
				capaVPV[item].plannedCost = 0;
				capaVPV[item].internCapa_PT = (capaPFV[item].internCapa_PT || 0);
				capaVPV[item].externCapa_PT = (capaPFV[item].externCapa_PT || 0);
				capaVPV[item].internCapa = (capaPFV[item].internCapa || 0);
				capaVPV[item].externCapa = (capaPFV[item].externCapa || 0);
			}
			capaVPV[item].baselineCost = (capaPFV[item].actualCost || 0) + (capaPFV[item].plannedCost || 0);
			capaVPV[item].baselineCost_PT = (capaPFV[item].actualCost_PT || 0) + (capaPFV[item].plannedCost_PT || 0);
		}
	}

	var capa = [];
	for (item in capaVPV) {
		if (onlyPT) {
			capa.push({
				'month': capaVPV[item].currentDate,
				'roleID' : capaVPV[item].roleID.toString(),
				'roleName' : capaVPV[item].roleName,
				'actualCost_PT': capaVPV[item].actualCost_PT || 0,
				'plannedCost_PT': capaVPV[item].plannedCost_PT || 0,
				'otherActivityCost_PT':capaVPV[item].otherActivityCost_PT || 0,
				'internCapa_PT': capaVPV[item].internCapa_PT || 0,
				'externCapa_PT' : capaVPV[item].externCapa_PT || 0,
				'baselineCost_PT': capaVPV[item].baselineCost_PT || 0
			});
		} else {
			capa.push({
				'month': capaVPV[item].currentDate,
				'roleID' : capaVPV[item].roleID.toString(),
				'roleName' : capaVPV[item].roleName,
				'actualCost_PT': capaVPV[item].actualCost_PT || 0,
				'plannedCost_PT': capaVPV[item].plannedCost_PT || 0,
				'otherActivityCost_PT': capaVPV[item].otherActivityCost_PT || 0,
				'internCapa_PT': capaVPV[item].internCapa_PT || 0,
				'externCapa_PT' : capaVPV[item].externCapa_PT || 0,
				'actualCost': capaVPV[item].actualCost || 0,
				'plannedCost': capaVPV[item].plannedCost || 0,
				'otherActivityCost': capaVPV[item].otherActivityCost || 0,
				'internCapa': capaVPV[item].internCapa || 0,
				'externCapa': capaVPV[item].externCapa || 0,
				'baselineCost': capaVPV[item].baselineCost || 0,
				'baselineCost_PT': capaVPV[item].baselineCost_PT || 0
			});
		}
	}

	var endTimer = new Date();
	logger4js.trace('Calculate Capacities duration: ', endTimer.getTime() - startTimer.getTime());

	return capa;
}

function calcCapacitiesPerProject(vpvs, pfvs, roleID, parentID, startDate, endDate, organisation, capacity, onlyPT) {
	if (!vpvs || vpvs.length == 0 || !(organisation?.length > 0)) {
		logger4js.warn('Calculate Capacities missing vpvs or organisation ');
		return [];
	}

	if (!startDate) {
		startDate = getDateStartOfMonth();
		startDate.setMonth(startDate.getMonth() - 4);
	}
	var startIndex = getColumnOfDate(startDate);

	if (!endDate) {
		endDate = getDateStartOfMonth();
		endDate.setMonth(endDate.getMonth() + 9);
	}
	var endIndex = getColumnOfDate(endDate);

	// divide the complete time from startdate to enddate in parts of time, where in each part there is only one organisation valid
	logger4js.trace('divide the complete time from calcC_startdate to calcC_enddate in parts of time, where in each part there is only one organisation valid');
	var timeZones = splitInTimeZones(organisation, startDate, endDate);
	if (!timeZones) {
		return [];
	}
	var role, teamID;
	if (!roleID) {
		role = timeZones.mergedOrganisation.find(role => role.pid == undefined);
		roleID = role?.uid;
	}
	role = findCurrentRole(timeZones, roleID);
	if (!role) {
		logger4js.warn('Calculate Concerning Roles not found, Role: %d found: %s, Parent: %d', roleID, role != undefined, parentID);
		return [];
	}
	if (!role.isSummaryRole && parentID > 0) {
		// find the parent team for a person in this orga
		var teamRole = findCurrentRole(timeZones, parentID);
		if (teamRole.type == 2) {
			// if parent is a team set the teamID
			teamID = teamRole.uid;
		}
	}
	mergeCapacity(capacity, timeZones, startDate);

	// reduce the amount of pfvs to the relevant ones in the time between startDate and endDate
	var newvpvs = [];
	for (i = 0; vpvs && i < vpvs.length; i++) {
		var vpv = vpvs[i];
		var vpvStartIndex = getColumnOfDate(vpv.startDate);
		var vpvEndIndex = getColumnOfDate(vpv.endDate);
		if (vpvEndIndex < startIndex) continue;
		if (vpvStartIndex > endIndex) continue;
		newvpvs.push(vpv);
	}

	// calc the capacity for every project/vpv individual
	var capaVPV = [];
	newvpvs.forEach(vpv => {
		var capaTempVPV = calcCapacityVPVs([vpv], roleID, teamID, timeZones, false);
		for (var index in capaTempVPV) {
			var element = capaTempVPV[index];
			var id = element.currentDate + vpv.vpid.toString();
			element.vpid = vpv.vpid;
			element.name = vpv.name;
			element.variantName = vpv.variantName;
			element.baselineCost = 0;
			element.baselineCost_PT = 0;
			capaVPV[id] = element;
		}
	});

	var capaPFV = [];
	var item;

	if (pfvs) {
		// reduce the amount of pfvs to the relevant ones in the time between startDate and endDate
		var newpfvs = [];
		for ( var i = 0; pfvs && i < pfvs.length; i++) {
			vpv = pfvs[i];
			vpvStartIndex = getColumnOfDate(vpv.startDate);
			vpvEndIndex = getColumnOfDate(vpv.endDate);
			if (vpvEndIndex < startIndex) continue;
			if (vpvStartIndex > endIndex) continue;
			newpfvs.push(vpv);
		}

		// calc the capacity of the pfvs
		newpfvs.forEach(vpv => {
			var capaTempVPV = calcCapacityVPVs([vpv], roleID, teamID, timeZones, false);
			for (var index in capaTempVPV) {
				var element = capaTempVPV[index];
				var id = element.currentDate + vpv.vpid.toString();
				element.vpid = vpv.vpid;
				element.name = vpv.name;
				element.variantName = '';
				capaPFV[id] = element;
			}
		});

		// combine vpv & pfv values, insert or update capa values
		for (item in capaPFV) {
			if (!capaVPV[item]) {
				// insert new Value
				logger4js.trace('Insert Capa Value', item, JSON.stringify(capaPFV[item]));
				capaVPV[item] = {};
				capaVPV[item].vpid = capaPFV[item].vpid;
				capaVPV[item].name = capaPFV[item].name;
				capaVPV[item].currentDate = capaPFV[item].currentDate;
				capaVPV[item].roleID = capaPFV[item].roleID;
				capaVPV[item].roleName = capaPFV[item].roleName;
				capaVPV[item].actualCost_PT = 0;
				capaVPV[item].plannedCost_PT = 0;
				capaVPV[item].otherActivityCost_PT = 0;
				capaVPV[item].actualCost = 0;
				capaVPV[item].plannedCost = 0;
				capaVPV[item].otherActivityCost = 0;
				capaVPV[item].internCapa_PT = (capaPFV[item].internCapa_PT || 0);
				capaVPV[item].externCapa_PT = (capaPFV[item].externCapa_PT || 0);
				capaVPV[item].internCapa = (capaPFV[item].internCapa || 0);
				capaVPV[item].externCapa = (capaPFV[item].externCapa || 0);
			}
			capaVPV[item].baselineCost = (capaPFV[item].actualCost || 0) + (capaPFV[item].plannedCost || 0);
			capaVPV[item].baselineCost_PT = (capaPFV[item].actualCost_PT || 0) + (capaPFV[item].plannedCost_PT || 0);
		}
	}

	// generate the cumulative number per months across all projects
	for (item in capaVPV) {
		const currentDate = capaVPV[item].currentDate;
		if (capaVPV[item].vpid) {
			if (!capaVPV[currentDate]) {
				capaVPV[currentDate] = {};
				capaVPV[currentDate].currentDate = capaVPV[item].currentDate;
				capaVPV[currentDate].roleID = capaVPV[item].roleID;
				capaVPV[currentDate].roleName = capaVPV[item].roleName;
				capaVPV[currentDate].name = 'All';
				capaVPV[currentDate].actualCost_PT = 0;
				capaVPV[currentDate].plannedCost_PT = 0;
				capaVPV[currentDate].otherActivityCost_PT = 0;
				capaVPV[currentDate].actualCost = 0;
				capaVPV[currentDate].plannedCost = 0;
				capaVPV[currentDate].otherActivityCost = 0;
				capaVPV[currentDate].baselineCost = 0;
				capaVPV[currentDate].baselineCost_PT = 0;
				capaVPV[currentDate].internCapa_PT = capaVPV[item].internCapa_PT;
				capaVPV[currentDate].externCapa_PT = capaVPV[item].externCapa_PT;
				capaVPV[currentDate].internCapa = capaVPV[item].internCapa;
				capaVPV[currentDate].externCapa = capaVPV[item].externCapa;
			}
			capaVPV[currentDate].actualCost_PT += capaVPV[item].actualCost_PT;
			capaVPV[currentDate].plannedCost_PT += capaVPV[item].plannedCost_PT;
			capaVPV[currentDate].otherActivityCost_PT += capaVPV[item].otherActivityCost_PT;
			capaVPV[currentDate].actualCost += capaVPV[item].actualCost;
			capaVPV[currentDate].plannedCost += capaVPV[item].plannedCost;
			capaVPV[currentDate].otherActivityCost += capaVPV[item].otherActivityCost;
			capaVPV[currentDate].baselineCost = (capaVPV[currentDate].baselineCost || 0) + capaVPV[item].baselineCost;
			capaVPV[currentDate].baselineCost_PT = (capaVPV[currentDate].baselineCost_PT || 0) + capaVPV[item].baselineCost_PT;
		}
	}

	// generate an array from an index list with holes
	var capa = [];
	for (item in capaVPV) {
		if (onlyPT) {
			capa.push({
				'month': capaVPV[item].currentDate,
				'roleID' : capaVPV[item].roleID,
				'roleName' : capaVPV[item].roleName,
				'vpid' : capaVPV[item].vpid,
				'name' : capaVPV[item].name,
				'variantName' : capaVPV[item].variantName,
				'actualCost_PT': capaVPV[item].actualCost_PT || 0,
				'plannedCost_PT': capaVPV[item].plannedCost_PT || 0,
				'otherActivityCost_PT': capaVPV[item].otherActivityCost_PT || 0,
				'internCapa_PT': capaVPV[item].internCapa_PT || 0,
				'externCapa_PT' : capaVPV[item].externCapa_PT || 0,
				'baselineCost_PT': capaVPV[item].baselineCost_PT || 0
			});
		} else {
			capa.push({
				'month': capaVPV[item].currentDate,
				'roleID' : capaVPV[item].roleID,
				'roleName' : capaVPV[item].roleName,
				'vpid' : capaVPV[item].vpid,
				'name' : capaVPV[item].name,
				'variantName' : capaVPV[item].variantName,
				'actualCost_PT': capaVPV[item].actualCost_PT || 0,
				'plannedCost_PT': capaVPV[item].plannedCost_PT || 0,
				'otherActivityCost_PT': capaVPV[item].otherActivityCost_PT || 0,
				'internCapa_PT': capaVPV[item].internCapa_PT || 0,
				'externCapa_PT' : capaVPV[item].externCapa_PT || 0,
				'actualCost': capaVPV[item].actualCost || 0,
				'plannedCost': capaVPV[item].plannedCost || 0,
				'otherActivityCost': capaVPV[item].otherActivityCost || 0,
				'internCapa': capaVPV[item].internCapa || 0,
				'externCapa': capaVPV[item].externCapa || 0,
				'baselineCost': capaVPV[item].baselineCost || 0,
				'baselineCost_PT': capaVPV[item].baselineCost_PT || 0
			});
		}
	}
	capa.sort(function(a, b) { return (new Date(a.month)).getTime() - (new Date(b.month)).getTime(); });
	return capa;
}

function calcCapacityVPVs(vpvs, roleID, teamID, timeZones, hierarchy) {

	var allCalcCapaValues = [];
	var allCalcCapaValuesIndexed = [];
	var roleIDs = [];

	// startCalc is defined for time-measuring
	var startCalc = new Date();
	logger4js.trace('Calculate Capacities and Cost of Role %s startDate %s currentDate %s', roleID, timeZones.startDate.toISOString());

	if (!(vpvs?.length > 0) || timeZones.duration <= 0 ) {
		return 	allCalcCapaValuesIndexed;
	}
	var role = findCurrentRole(timeZones, roleID, teamID);
	if (!role) {
		return allCalcCapaValuesIndexed;
	}
	roleIDs.push({uid: roleID, teamID: teamID, roleName: role.name}); // Main role
	if (hierarchy && role.isSummaryRole) {
		role.subRoleIDs?.forEach(item => {
			var subrole = findCurrentRole(timeZones, item.key);
			if (!subrole) {
				return;
			}
			roleIDs.push({uid: subrole.uid, roleName: subrole.name}); // Sub role
		});
	}
	logger4js.debug('calculate for the role & subrole', JSON.stringify(roleIDs));

	roleIDs.forEach(roleItem => {
		// calculate the concerning roles for every role from the roleIDs list. Getting roles, which are connected with roleID in the given organisation
		calcConcerningRoles(timeZones, roleItem.uid, roleItem.teamID);

		logger4js.debug('calculate capacity for Role %s', roleItem.uid);
		var monthlyNeeds = getCapacityFromTimeZone(vpvs, roleItem.uid, roleItem.teamID, timeZones);
		monthlyNeeds?.forEach((item, index) => {
			var currentDate = new Date(timeZones.startDate);
			currentDate.setMonth(currentDate.getMonth() + index);
			const currentIndex = currentDate.toISOString().concat('_', roleItem.uid);
			allCalcCapaValues[currentIndex] = {
				'currentDate': currentDate.toISOString(),
				'roleID': roleItem.uid,
				'roleName': roleItem.roleName,
				'actualCost_PT': monthlyNeeds[index].actCost_PT || 0,
				'plannedCost_PT': monthlyNeeds[index].plannedCost_PT || 0 ,
				'otherActivityCost_PT':monthlyNeeds[index].otherActivityCost_PT || 0,
				'internCapa_PT': monthlyNeeds[index].internCapa_PT,
				'externCapa_PT': monthlyNeeds[index].externCapa_PT,
				'actualCost': monthlyNeeds[index].actCost  || 0,
				'plannedCost': monthlyNeeds[index].plannedCost  || 0,
				'otherActivityCost':monthlyNeeds[index].otherActivityCost || 0,
				'internCapa': monthlyNeeds[index].internCapa  || 0,
				'externCapa': monthlyNeeds[index].externCapa  || 0
			};
		});
	});
	var endCalc = new Date();
	logger4js.debug('Calculate Capacity VPVs duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return allCalcCapaValues;
}

function splitInTimeZones(organisation, startDate, endDate) {
	if (!(organisation?.length > 0) || !startDate || !endDate) {
		logger4js.warn('SplitInTimeZones not allowed parameters', organisation?.length, startDate, endDate);
		return undefined;
	}

	var split = {};
	split.organisation = [];
	split.startDate = getDateStartOfMonth(startDate);
	split.endDate = getDateEndOfMonth(endDate);
	split.indexMonth = [];

	split.startIndex = getColumnOfDate(split.startDate);
	split.endIndex = getColumnOfDate(split.endDate);
	split.duration = split.endIndex - split.startIndex + 1;

	organisation.sort(function(a, b) { return validate.compareDate(a.timestamp, b.timestamp); });

	// reduce all orgas before startDate except one, reduce all orgas after endDate
	// search the first organisation we need
	var index;
	if (getColumnOfDate(organisation[0].timestamp) >= split.startIndex) {
		// ealriset organisation starts after the startIndex, take this for the past also
		split.organisation.push(organisation[0]);
		index = 1;
	} else {
		index = organisation.findIndex(orga => getColumnOfDate(orga.timestamp) >= split.startIndex);
		index = index <= 0 ? organisation.length - 1 : index - 1;
	}

	// add all organisations from first to the last we need to split.organisation list
	for (; index < organisation.length; index++) {
		if (getColumnOfDate(organisation[index].timestamp) <= split.endIndex) {
			split.organisation.push(organisation[index]);
		}
	}

	var orgaIndex = 0;
	var maxIndexMonth;
	// set the maxIndex to the last month where this orga is valid (for the next month a new orga is valid)
	if (orgaIndex + 1 < split.organisation.length) {
		maxIndexMonth = getColumnOfDate(split.organisation[orgaIndex + 1].timestamp);
	} else {
		maxIndexMonth = split.endIndex + 1;
	}
	for (var i = split.startIndex; i <= split.endIndex; i++) {
		// set the maxIndex to the last month where this orga is valid (for the next month a new orga is valid)
		if (i >= maxIndexMonth) {
			orgaIndex++;
			if (orgaIndex + 1 < split.organisation.length) {
				maxIndexMonth = getColumnOfDate(split.organisation[orgaIndex + 1].timestamp);
			} else {
				maxIndexMonth = split.endIndex + 1;
			}
		}
		// set orga[orgaIndex] active for the month
		split.indexMonth.push(orgaIndex);
	}
	// prepare roles & costs for direct access
	split.organisation.forEach(orga => {
		orga.indexedRoles = [];
		orga.value?.allRoles?.forEach(role => {
			orga.indexedRoles[role.uid] = role;
		});
		orga.indexedCosts = [];
		orga.value?.allCosts?.forEach(cost => {
			orga.indexedCosts[cost.uid] = cost;
		});
	});

	// calculate the merged orga with all roles in one list
	var mergedUID = [];
	var mergedOrganisation = [];
	split.organisation.forEach(orga => {
		orga.value?.allRoles?.forEach(role => {
			if (!mergedOrganisation[role.uid]) {
				mergedUID.push(role.uid);
			}
			mergedOrganisation[role.uid] = role;
		});
	});
	split.mergedOrganisation = mergedOrganisation;
	split.mergedUID = mergedUID;

	return split;
}

// returns the index for the relevant organisation for the timestamp
function getTimeZoneIndex(timeZones, timestamp) {
	var result = 0;
	if (!(timeZones?.organisation?.length > 0)) {
		return undefined;
	}
	logger4js.debug('GetTimeZoneIndex ', timeZones.organisation.length, timestamp);
	if (timestamp) {
		while (result + 1 < timeZones.organisation.length) {
			if (timestamp.getTime() < timeZones.organisation[result + 1].timestamp.getTime()) {
				logger4js.debug('GetTimeZoneIndex Index %s ts %s orga.ts %s', result, timestamp.getTime(), timeZones.organisation[result + 1].timestamp.getTime());
				break;
			}
			result++;
		}
	} else {
		result = timeZones.organisation.length - 1;
	}
	return result;
}

function getCapacityFromTimeZone(vpvs, roleID, teamID, timeZones) {
	// var allTeams = timeZones.mergedOrganisation.filter(item => item.type == 2 && item.isSummaryRole);
	var role = findCurrentRole(timeZones, roleID, teamID);
	if (!role) {
		// given roleID isn't defined in this organisation
		return undefined;
	}

	logger4js.debug('getting capacities for the related roleID/teamID given organisation %s/%s',  roleID, teamID);
	var capaValues = getCapaValues(timeZones);

	var costValues = [];
	for (var i = 0 ; i < timeZones.duration; i++){
		var costElem = {};
		costElem.internCapa = capaValues[i].internCapa;
		costElem.internCapa_PT = capaValues[i].internCapa_PT;
		costElem.externCapa = capaValues[i].externCapa;
		costElem.externCapa_PT = capaValues[i].externCapa_PT;
		costElem.actCost_PT = 0;
		costElem.actCost = 0;
		costElem.plannedCost_PT = 0;
		costElem.plannedCost = 0;
		costElem.otherActivityCost_PT = 0;
		costElem.otherActivityCost = 0;
		costValues[i] = costElem;
	}

	vpvs.forEach(vpv => {
		logger4js.trace('Calculate Personal Cost of RoleID %s of Project Version %s', roleID, vpv._id);
		var oneVPVcostValues = getRessourcenBedarfe(role, teamID, vpv, timeZones);
		oneVPVcostValues?.forEach((cost, index) => {
			costValues[index].actCost_PT += cost.actCost_PT || 0;
			costValues[index].plannedCost_PT += cost.plannedCost_PT || 0;
			costValues[index].actCost += cost.actCost || 0;
			costValues[index].plannedCost += cost.plannedCost || 0;
			costValues[index].otherActivityCost_PT += cost.otherActivityCost_PT || 0;
			costValues[index].otherActivityCost += cost.otherActivityCost || 0;
		});
	});
	return costValues;
}

function addCostValues(vpv, calcTeam, timeZones, costValues) {
	var maxTimeZoneIndex;
	if (vpv.variantName == 'pfv') {
		maxTimeZoneIndex = getTimeZoneIndex(timeZones, vpv.timestamp);
	}
	var vpvStartIndex = getColumnOfDate(vpv.startDate);
	var actualDataIndex = getColumnOfDate(vpv.actualDataUntil) + 1;

	logger4js.trace('Calculate Cost Phases Phases %s', vpv.AllPhases?.length);
	vpv.AllPhases?.forEach(phase => {
		var phaseStart = vpvStartIndex + phase.relStart - 1;
		phase.AllRoles?.forEach(rolePhase => {
			if (rolePhase.Bedarf) {
				var dimension = rolePhase.Bedarf.length;
				var maxStart = Math.max(phaseStart, timeZones.startIndex);
				var minEnd = Math.min(phaseStart + dimension, timeZones.endIndex + 1);
				for (var l = maxStart; l < minEnd ; l++) {
					var cRole = isConcerningRole(rolePhase.RollenTyp, l, timeZones);
					if (l == maxStart) {
						logger4js.debug('Calculate Phases roleID %s calcTeam %s Bedarf %s/%s', cRole?.role?.uid, calcTeam, rolePhase.RollenTyp, rolePhase.teamID);
					}
					var otherActivity = false;
					if (!cRole) {
						// if role not found in concerning roles but teamID is set, check if the team is in concerning role and add this entry
						if (rolePhase.teamID > 0) {
							cRole = isConcerningRole(rolePhase.teamID, l, timeZones);
						}
						if (!cRole) {
							continue;
						}
						// team is part of concerning role means no other activities
					} else {
						// role is a concerning Role
						if (calcTeam) {
							otherActivity = cRole.teamIDs.findIndex(item => item == rolePhase.teamID) < 0;
						}
					}
					// result in euro and in personnel day
					var dailyRate = getDailyRateTZ(rolePhase.RollenTyp, - 1, timeZones, l - timeZones.startIndex, maxTimeZoneIndex);
					var bedarf = rolePhase.Bedarf[l - phaseStart];
					if (l < actualDataIndex) {
						costValues[l - timeZones.startIndex].actCost += bedarf * dailyRate / 1000;
						costValues[l - timeZones.startIndex].actCost_PT += bedarf;
					} else if (otherActivity) {
						costValues[l - timeZones.startIndex].otherActivityCost += bedarf * dailyRate / 1000;
						costValues[l - timeZones.startIndex].otherActivityCost_PT += bedarf;
					} else {
						costValues[l - timeZones.startIndex].plannedCost += bedarf * dailyRate / 1000;
						costValues[l - timeZones.startIndex].plannedCost_PT += bedarf;
					}
				}
			}
		});
	});
}

function isConcerningRole(roleID, month, timeZones) {
	var orgaIndex = timeZones.indexMonth[month - timeZones.startIndex];
	var cRole = timeZones.organisation[orgaIndex]?.concerningRoles.find(item => item.role?.uid == roleID);
	return cRole;
}

function getRessourcenBedarfe(role, teamID, vpv, timeZones) {
	var costValues = [];
	if (!role) return costValues;
	logger4js.trace('Calculate all RessourceBedarfe and Capacities of VPV %s for RoleID %d ', vpv._id, role.uid);

	for (var i = 0; i < timeZones.duration; i++) {
		var costElem = {};
		costElem.actCost_PT = 0;
		costElem.actCost = 0;
		costElem.plannedCost_PT = 0;
		costElem.plannedCost = 0;
		costElem.otherActivityCost_PT = 0;
		costElem.otherActivityCost = 0;
		costValues[i] = costElem;
	}

	if (!vpv.AllPhases) {
		return costValues;
	}
	logger4js.trace('Combine Capacity Values for Project Version %s',  vpv._id);
	var calcTeam = timeZones.role.type == 2 || teamID > 0;
	addCostValues(vpv, calcTeam, timeZones, costValues);
	return costValues;
}

function getCapaValues(timeZones) {
	var capaValues = [];

	for (var i=0 ; i < timeZones.duration; i++){
		var capaElem = {};
		capaElem.internCapa_PT = 0;
		capaElem.externCapa_PT = 0;
		capaElem.internCapa = 0;
		capaElem.externCapa = 0;
		capaValues[i] = capaElem;
	}

	// Calculate the Capacities of this Role
	timeZones.allConcerningRoles?.forEach(cr => {
		if (!cr?.role) {
			// skip empty roles
			return;
		}
		for (var mon = 0; mon < timeZones.duration; mon++) {
			var role = getRoleTZ(cr.role, timeZones, mon);
			if (!role || role.isSummaryRole) {
				continue;
			}
			var dailyRate = role.dailyRate;
			var roleIsExtern = role.isExternRole;
			var capaMonth = timeZones.mergedCapacity[role.uid]?.capacityPerMonth;
			var capaPT = capaMonth[mon + 1] || 0;
			if (roleIsExtern) {
				capaValues[mon].externCapa_PT += capaPT;
				capaValues[mon].externCapa += capaPT * dailyRate / 1000;
			} else {
				capaValues[mon].internCapa_PT += capaPT;
				capaValues[mon].internCapa += capaPT * dailyRate / 1000;
			}
		}
	});
	return capaValues;
}

// find the latest role definition in the orgas that have roleID & teamID if specified
function findCurrentRole(timeZones, roleID, teamID) {
	var role;
	var actDate = new Date();
	if (roleID >= 0) {
		timeZones?.organisation?.forEach(orga => {
			if (orga.timestamp.getTime() > actDate.getTime()) {
				// orga of the future
				return;
			}
			var tzRole = orga.indexedRoles[roleID];
			if (tzRole) {
				if (teamID > 0) {
					// check if roleID is Team Member
					var tzTeam = orga.indexedRoles[teamID];
					if (tzTeam?.type == 2) {
						if (tzTeam.subRoleIDs.find(item => item.key == tzRole.uid)) {
							// team member found
							role = tzRole;
						}
					}
				} else {
					// no teamID is specified i.e. normal role
					role = tzRole;
				}
			}
		});
	}
	logger4js.trace('Find Role', roleID, teamID, JSON.stringify(role));
	return role;
}

// find all intern subroles of a list of roles including the roles of the list
function filterAllSubRoles(list, orga) {
    const subRolesList = [];
    let listSubRoles = [];
    let subRolesFound = [];
    let listOrga = helperOrga.generateIndexedOrgaRoles(orga);
    
    list.forEach(uid => {
		const item = listOrga[uid];		
        if (item.isSummaryRole === true ) {
            const hSubRoles = item.subRoleIDs;
            hSubRoles.forEach( hsr => listSubRoles.push(listOrga[hsr.key]));
            checkallSubroles(listSubRoles, listOrga, subRolesFound);
        }
		subRolesFound.push(item);
    })

    function checkallSubroles(subRoleslist, listOrga, srFound) {        
        let srlist = [];
        subRoleslist?.forEach( sr => {
            let role = listOrga[sr.uid];
            if (timeTracker.isOrgaRoleinternPerson(role))
            {
                if (!subRolesFound.includes(role)) {
                    subRolesFound.push(role)
                }
            } else {
				// intern summary roles belongs to the subroles
				if (!role.isExternRole) {					
					if (!subRolesFound.includes(role)) {
						subRolesFound.push(role)
					}
				}
                const hSub = role.subRoleIDs;
                hSub?.forEach(hsr => srlist.push(listOrga[hsr.key]));                
            }                    
        })
        srFound = srFound.concat(subRolesFound);  
        if (srlist.length > 0) {             
            checkallSubroles(srlist, listOrga, srFound);
        } 
    } 
    return subRolesFound;
}

/* Calculate the related/concerning Roles that belong to this role, means the role itself and all Children
 * With TSO this can be different for every organisation, so the concerning Roles were calculated per Orga
 * and stored in the timeZone Structure for easy access
 * in addition the root role that is used for the calculation is also stored to allow distinction between teams and normal orga units
 */
function calcConcerningRoles(timeZones, roleID, teamID) {
	var allConcerningRoles = [];
	// var allTeams = timeZones.mergedOrganisation.filter(item => item.type == 2 && item.isSummaryRole);

	function findConcerningRoles(orga, roles, value, parentRole) {
		//value is the Id of one subrole
		var hroleID = value.key;
		var crElem = allConcerningRoles[hroleID];
		if (!crElem) {
			crElem = {};
			crElem.role = roles[hroleID];
			crElem.teamID = -1;
			crElem.teamIDs = [];
			crElem.faktor = 1.0;
			// collect all uids of concerning roles
		}
		orga.concerningRoles.push(crElem);

		if (parentRole.type == 2) {
			for (var t = 0 ; t < crElem.role.teamIDs?.length; t++) {
				var team = crElem.role.teamIDs[t];
				if (parentRole.uid != team.key) { continue; }
				crElem.teamID = team.key;
				crElem.teamIDs.push(team.key);
				crElem.faktor = team.value;
			}
		}
		allConcerningRoles[hroleID] = crElem;

		var newParent = crElem.role;
		if (newParent?.subRoleIDs?.length > 0){
			var shroles = newParent.subRoleIDs;
			for (var sr = 0; shroles && sr < shroles.length; sr++) {
				findConcerningRoles(orga, roles, shroles[sr], newParent);
			}
		}
	}

	// find the role in the latest organisation
	timeZones.role = findCurrentRole(timeZones, roleID, teamID);

	// find all roles corresponding to this one roleID all over the organisation - result in concerningRoles
	timeZones.allConcerningRoles = [];
	timeZones.organisation.forEach(orga => {
		var allRoles = orga.indexedRoles;
		orga.concerningRoles = [];
		var role = allRoles[roleID];
		if (role) {
			var crElem = {};
			crElem.role = role;
			crElem.teamID = teamID || -1;
			crElem.teamIDs = [];
			if (teamID) crElem.teamIDs.push(teamID);
			crElem.faktor = 1;
			// MS TODO:check if it was already added?
			orga.concerningRoles.push(crElem);
			allConcerningRoles[role.uid] = crElem;
			role.subRoleIDs?.forEach(subrole => {
				findConcerningRoles(orga, allRoles, subrole, role);
			});
		}
	});
	timeZones.allConcerningRoles = allConcerningRoles;
}
//************* */
function mergeCosttypes(costtypes, timeZones, startDate) {
	if ( !timeZones || !timeZones.mergedOrganisation || !timeZones.mergedUID ) {
		return undefined;
	}
	var startCalc = new Date();

	logger4js.debug('Merge Costtypes and generate costinfo array for all orga units persons for 240 months, len', timeZones.mergedUID.length);
	var combinedCostInfo = helperOrga.combineCostInfo(costInfo);

	var indexedcostInfo = [], mergedcostInfo = [];
	combinedcostInfo.forEach(item => {
		indexedcostInfo[item.costID] = item;
	});

	timeZones.mergedUID.forEach(roleID => {
		var cost = timeZones.mergedOrganisation[costID];
		if (!cost) {
			logger4js.warn('Merge Capacities role not found', costID);
			return;
		}
		if (cost.isSummaryRole) {
			logger4js.trace('Merge Capacities skip summaryRole', costID);
			return;
		}
		var costtypesPerMonth = [];
		var startIndex = 0;
		var endIndex;
		// set capaPerMonth to 0 for all months before entry date
		if (cost.entryDate) {
			logger4js.debug('Merge Cost Info cost with entry date', costID, cost.entryDate.toISOString());
			endIndex = getColumnOfDate(cost.entryDate) - timeZones.startIndex;
			for (; startIndex < endIndex && startIndex < timeZones.duration; startIndex++) {
				costtypesPerMonth.push(0);
			}
		}
		// set capaPerMonth before exit date to either defaulCapacity or if defined to the user capacity for the months
		endIndex = timeZones.duration;
		if (cost.exitDate) {
			logger4js.debug('Merge Cost Info cost with exit date', costID, cost.exitDate.toISOString());
			endIndex = getColumnOfDate(cost.exitDate) - timeZones.startIndex; 
			endIndex = Math.min(endIndex, timeZones.duration);
		}

		logger4js.debug('Merge Cost Info with timeZones', costID, timeZones.length);
		// set either the default or a specific capa values for each orga unit related to the timeZones duration
		for (var index = startIndex; index < endIndex; index++) {
			var capa = getDailyCapaTZ(cost.uid, indexedcostInfo, timeZones, index);
			costtypesPerMonth.push(capa);
		}
		for (; endIndex < timeZones.duration; endIndex++) {
			costtypesPerMonth.push(0);
		}
		// business logic uses array 1 - 240 instead of 0 - 239
		costtypesPerMonth.unshift(0);
		mergedcostInfo[costID] = {
			startDate: startDate,
			costtypesPerMonth: costtypesPerMonth
		};
		logger4js.debug('Merge Cost Info cost done', roleID, costtypesPerMonth.length);
	});
	timeZones.mergedcostInfo = mergedcostInfo;
	var endCalc = new Date();
	logger4js.debug('Merge Cost Info duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return;
}
// **************

function mergeCapacity(capacity, timeZones, startDate) {
	if ( !timeZones || !timeZones.mergedOrganisation || !timeZones.mergedUID ) {
		return undefined;
	}
	var startCalc = new Date();

	logger4js.debug('Merge Capacities and generate capacity array for all orga units persons for 240 months, len', timeZones.mergedUID.length);
	var combinedCapacity = helperOrga.combineCapacity(capacity);

	var indexedCapacity = [], mergedCapacity = [];
	combinedCapacity.forEach(item => {
		indexedCapacity[item.roleID] = item;
	});

	timeZones.mergedUID.forEach(roleID => {
		var role = timeZones.mergedOrganisation[roleID];
		if (!role) {
			logger4js.warn('Merge Capacities role not found', roleID);
			return;
		}
		if (role.isSummaryRole) {
			logger4js.trace('Merge Capacities skip summaryRole', roleID);
			return;
		}
		var capacityPerMonth = [];
		var startIndex = 0;
		var endIndex;
		// set capaPerMonth to 0 for all months before entry date
		if (role.entryDate) {
			logger4js.debug('Merge Capacities role with entry date', roleID, role.entryDate.toISOString());
			endIndex = getColumnOfDate(role.entryDate) - timeZones.startIndex;
			for (; startIndex < endIndex && startIndex < timeZones.duration; startIndex++) {
				capacityPerMonth.push(0);
			}
		}
		// set capaPerMonth before exit date to either defaulCapacity or if defined to the user capacity for the months
		endIndex = timeZones.duration;
		if (role.exitDate) {
			logger4js.debug('Merge Capacities role with exit date', roleID, role.exitDate.toISOString());
			endIndex = getColumnOfDate(role.exitDate) - timeZones.startIndex; // MS TODO: Check if it is the correct one or +/- 1
			endIndex = Math.min(endIndex, timeZones.duration);
		}

		logger4js.debug('Merge Capacities with timeZones', roleID, timeZones.length);
		// set either the default or a specific capa values for each orga unit related to the timeZones duration
		for (var index = startIndex; index < endIndex; index++) {
			var capa = getDailyCapaTZ(role.uid, indexedCapacity, timeZones, index);
			capacityPerMonth.push(capa);
		}
		for (; endIndex < timeZones.duration; endIndex++) {
			capacityPerMonth.push(0);
		}
		// business logic uses array 1 - 240 instead of 0 - 239
		capacityPerMonth.unshift(0);
		mergedCapacity[roleID] = {
			startDate: startDate,
			capacityPerMonth: capacityPerMonth
		};
		logger4js.debug('Merge Capacities role done', roleID, capacityPerMonth.length);
	});
	timeZones.mergedCapacity = mergedCapacity;
	var endCalc = new Date();
	logger4js.debug('Merge Capacity duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return;
}

function cleanupRestrictedVersion(vpv) {
	if (!vpv) return;
	vpv.customDblFields = undefined;
	vpv.customStringFields = undefined;
	vpv.Risiko = undefined;
	vpv.StrategicFit = undefined;
	vpv.actualDataUntil = undefined;
	vpv.Erloes = undefined;
	vpv.earliestStart = undefined;
	vpv.earliestStartDate = undefined;
	vpv.latestStart = undefined;
	vpv.latestStartDate = undefined;
	vpv.ampelStatus = undefined;
	vpv.ampelErlaeuterung = undefined;
	vpv.complexity = undefined;
	vpv.AllPhases = undefined;
	vpv.hierarchy = undefined;
	vpv.keyMetrics = undefined;
	vpv.vpStatus = undefined;
}

function reduceVPV(originalVPV, level) {
	var reducedVPV = originalVPV;
	if (level > 0) {
		// reduce the level of the new PFV to max levels
		reducedVPV = helperVpv.initVPV(originalVPV);
		var hry = convertHierarchy(originalVPV), reducedHry;
		var allNodes = originalVPV?.hierarchy?.allNodes;
		if (allNodes) {
			// cleanup hierarchy
			reducedVPV.hierarchy.allNodes = [];
			allNodes.forEach( node => {
				var breadCrumb = getBreadCrumb(node.hryNodeKey, hry);
				var checkLevel = elemIdIsMilestone(node.hryNodeKey) ? level + 1 : level;
				if (breadCrumb && breadCrumb.length <= checkLevel) {
					var newNode = {};
					newNode.hryNodeKey = node.hryNodeKey;
					newNode.hryNode = {};
					newNode.hryNode.elemName = node.hryNode.elemName;
					newNode.hryNode.origName = node.hryNode.origName;
					// newNode.hryNode.indexOfElem = node.hryNode.indexOfElem;
					newNode.hryNode.parentNodeKey = node.hryNode.parentNodeKey;
					newNode.hryNode.childNodeKeys = node.hryNode.childNodeKeys;
					if (breadCrumb.length == checkLevel) {
						// only Milestones as Childs
						newNode.hryNode.childNodeKeys = [];
						node.hryNode.childNodeKeys.forEach(item => {
							if (elemIdIsMilestone(item)) {
								logger4js.debug('Add Milestone (Name/Level):', item, breadCrumb.length, breadCrumb);
								newNode.hryNode.childNodeKeys.push(item);
							}
						});
					}
					reducedVPV.hierarchy.allNodes.push(newNode);
				}
			});
			logger4js.debug('generate reduced VPV hierarchy from/to', allNodes.length, reducedVPV.hierarchy.allNodes.length);
		}
		reducedHry = convertHierarchy(reducedVPV);

		// reduce the Phases and Milestones/Results
		var allPhases = originalVPV?.AllPhases;
		if (allPhases) {
			reducedVPV.AllPhases = [];
			allPhases.forEach(item => {
				if (reducedHry[item.name] || (item.name == '0§.§' && reducedHry['0'])) {
					logger4js.debug('Add Phase to reducedPFV', item.name);
					reducedVPV.AllPhases.push(item);
				}
			});
			logger4js.debug('generate reduced VPV Phase from/to', allPhases.length, reducedVPV.AllPhases.length);
		}
	}
	reducedVPV = createIndices(reducedVPV);
	return reducedVPV;
}

function convertVPV(oldVPV, oldPFV, orga, level) {
	// this function converts an oldVPV to a newVPV and returns it to the caller
	// if an orga is delivered all individual roles will be replaced by the parent orga unit
	// if an oldPFV is delivered, the newVPV is squeezed to the Phases/Deadlines&Deliveries from the oldPFV
	// if a level is specified, the new pfv is reduced to the top hierarchy max levels deep

	logger4js.debug('ConvertVPV:  ', oldVPV._id, oldPFV != undefined, orga != undefined, level);

	var newPFV = new VisboProjectVersion();

	// check the existence of the orga
	// if ( !orga || orga.length < 1 ) {
	// 	logger4js.debug('creation of new PFV is going wrong because of no valid orga');
	// 	return undefined;
	// }

	var newestOrga, orgaList;
	if (orga?.length > 0) {	// convert the newest organisation
		var listError = [];
		newestOrga = helperOrga.initOrga(orga[0].value, orga[0].timestamp, undefined, listError);
		if (newestOrga) {
			orgaList = helperOrga.generateIndexedOrgaRoles(newestOrga);
		} else {
			logger4js.warn('Convert Orga failed', listError);
		}
		// var orgalist = buildOrgaList(newestOrga);
		logger4js.debug('generate new PFV %s out of VPV %s ', oldPFV?.name, oldVPV?.name + oldVPV?.variantName);
	}

	// check the existence of oldVPV, which will be the base of the newPFV
	if ( !oldVPV ) {
		logger4js.debug('creation of new PFV is going wrong because of no valid old VPV');
		return undefined;
	} else {
		// keep unchangable attributes
		newPFV.name = oldVPV.name;
		newPFV.vpid = oldVPV.vpid;
		newPFV.variantName = 'pfv';
		if (oldVPV.timestamp && Date.parse(oldVPV.timestamp)) {
			newPFV.timestamp = new Date(oldVPV.timestamp);
		} else {
			newPFV.timestamp = new Date();
		}
		// copy all attributes
		newPFV.variantDescription = oldVPV.variantDescription;
		newPFV.Risiko = oldVPV.Risiko;
		newPFV.StrategicFit = oldVPV.StrategicFit;
		newPFV.customDblFields = oldVPV.customDblFields;
		newPFV.customStringFields = oldVPV.customStringFields;
		newPFV.customBoolFields = oldVPV.customBoolFields;
		// ? newPFV.actualDataUntil = oneVPV.actualDataUntil;
		newPFV.Erloes = oldVPV.Erloes;
		newPFV.startDate = oldVPV.startDate;
		newPFV.endDate = oldVPV.endDate;
		newPFV.earliestStart = oldVPV.earliestStart;
		newPFV.earliestStartDate = oldVPV.earliestStartDate;
		newPFV.latestStart = oldVPV.latestStart;
		newPFV.latestStartDate = oldVPV.latestStartDate;
		newPFV.vpStatus = oldVPV.vpStatus;
		newPFV.ampelStatus = oldVPV.ampelStatus;
		newPFV.ampelErlaeuterung = oldVPV.ampelErlaeuterung;
		newPFV.VorlagenName = oldVPV.VorlagenName;
		newPFV.Dauer = oldVPV.Dauer;
		newPFV.hierarchy = oldVPV.hierarchy;
		newPFV.volumen = oldVPV.volumen;
		newPFV.complexity = oldVPV.complexity;
		newPFV.description = oldVPV.description;
		newPFV.businessUnit = oldVPV.businessUnit;

		// variables to calc the sum of Invoices
		var sumOfInvoices = 0;

		// newPFV.AllPhases have to be created new ones	and the ressources will be aggregated to sumRoles
		newPFV.AllPhases = [];
		oldVPV.AllPhases?.forEach(phase => {
			var onePhase = {};
			if (orgaList) {
				logger4js.trace('aggregate allRoles of the one phase %s in the given VPV and the given orga %s to generate a newPFV ', phase.nameID);
				onePhase.AllRoles  = aggregateRoles(phase, orgaList);
			} else {
				onePhase.AllRoles = phase.AllRoles;
			}

			onePhase.AllCosts = [];
			phase.AllCosts?.forEach(cost => {
				var oneCost = {};
				oneCost.KostenTyp = cost.KostenTyp;
				oneCost.name = cost.name;
				oneCost.Bedarf = cost.Bedarf;
				onePhase.AllCosts.push(oneCost);
			});

			onePhase.AllResults = [];
			phase.AllResults?.forEach(milestone => {
				var oneResult = {};
				oneResult.bewertungen = milestone.bewertungen ;
				oneResult.name = milestone.name ;
				oneResult.verantwortlich = milestone.verantwortlich ;
				oneResult.offset = milestone.offset ;
				oneResult.alternativeColor = milestone.alternativeColor ;
				oneResult.shortName = milestone.shortName ;
				oneResult.originalName = milestone.originalName;
				oneResult.appearance = milestone.appearance ;
				oneResult.percentDone = milestone.percentDone ;
				oneResult.invoice = milestone.invoice ;
				sumOfInvoices = sumOfInvoices + (milestone?.invoice?.Key || 0);
				oneResult.penalty = milestone.penalty ;
				oneResult.deliverables = [];
				milestone.deliverables?.forEach(item => {
					oneResult.deliverables.push(item);
				});
				onePhase.AllResults.push(oneResult);
			});

			// AllBewertungen keep as they are
			onePhase.AllBewertungen = phase.AllBewertungen;

			onePhase.deliverables = [];
			phase.deliverables?.forEach(item => {
				onePhase.deliverables.push(item);
			});

			onePhase.percentDone= phase.percentDone;
			onePhase.invoice= phase.invoice;
			sumOfInvoices = sumOfInvoices + (phase?.invoice?.Key || 0);
			onePhase.penalty= phase.penalty;
			onePhase.responsible= phase.responsible;
			onePhase.ampelStatus= phase.ampelStatus;
			onePhase.ampelErlaeuterung= phase.ampelErlaeuterung;
			onePhase.earliestStart= phase.earliestStart;
			onePhase.latestStart= phase.latestStart;
			onePhase.minDauer= phase.minDauer;
			onePhase.maxDauer= phase.maxDauer;
			onePhase.relStart= phase.relStart;
			onePhase.relEnde= phase.relEnde;
			onePhase.startOffsetinDays= phase.startOffsetinDays;
			onePhase.dauerInDays= phase.dauerInDays;
			onePhase.name= phase.name;
			onePhase.shortName= phase.shortName;
			onePhase.originalName= phase.originalName;
			onePhase.appearance= phase.appearance;
			newPFV.AllPhases.push(onePhase);
		});
		if (sumOfInvoices > 0) { 
			newPFV.Erloes = sumOfInvoices; 
		};
	}

	var reducedPFV = oldPFV || newPFV;
	if (level > 0) {
		// generate the new PFV from the oldVPV reduced to a specific level
		reducedPFV = reduceVPV(oldVPV, level);
	}
	reducedPFV.variantName = 'pfv';
	if (!ensureValidVPV(reducedPFV)) {
		logger4js.warn('generated a newPFV is inconsistent');
		// return undefined;
	}

	if ( oldVPV && reducedPFV  ) {
		// oldVPV is to be squeezed to the deadlines and deliveries of the reducedPFV
		logger4js.debug('generate a newPFV based on the given VPV; deadlines and deliveries reduced to the same as in the reducedVPV');

		newPFV = checkAndChangeDeliverables(oldVPV, reducedPFV, newPFV);
		newPFV = checkAndChangeDeadlines(oldVPV, reducedPFV, newPFV);
		newPFV = createIndices(newPFV);
	}

	logger4js.debug('creation of a new PFV based on a special VPV:  ', JSON.stringify(newPFV).substr(0,300));
	return newPFV;
}

function checkAndChangeDeliverables(oldVPV, oldPFV, newPFV) {

	logger4js.debug('adapt all deliverables of the newPFV to the oldPFV');

	if (oldVPV && oldPFV && newPFV){
		logger4js.debug('look for the deliverables of  existing pfv');
		var hrchy_pfv = convertHierarchy(oldPFV);
		var allPFVDeliverables = getAllDeliverables(oldPFV, hrchy_pfv, undefined);

		logger4js.debug('look for the deliverables of actual vpv');
		var hrchy_vpv = convertHierarchy(oldVPV);
		var allnewDeliverables = getAllDeliverables(oldVPV, hrchy_vpv, undefined);
		var listDeliveries = allnewDeliverables.getAllDeliveries();

		var DelivToDelete = [];
		var fittingDeliv = [];
		logger4js.debug('find the deliverables, which are only in the vpv and should be deleted for a new PFV');
		for (var element = 0; element < listDeliveries.length; element++) {
			var actDeliv = listDeliveries[element];
			if ( allPFVDeliverables && allPFVDeliverables.allDeliverables && !allPFVDeliverables.allDeliverables[actDeliv.description] ) {
				DelivToDelete.push(actDeliv);
			} else {
				fittingDeliv.push(actDeliv);
			}
		}
		logger4js.debug('delete the deliverables found out');
		for ( var del = 0; del < DelivToDelete.length; del++) {
			actDeliv = DelivToDelete[del];
			var newDelivs = [];
			var elemID = actDeliv.nameID;
			var relevElem = {};
			if (elemIdIsMilestone(elemID)) {
				relevElem = getMilestoneByID(hrchy_vpv, newPFV, elemID);
			} else {
				relevElem = getPhaseByID(hrchy_vpv, newPFV,elemID);
			}
			for (var i = 0; relevElem && relevElem.deliverables && i < relevElem.deliverables.length; i++){
				if (relevElem.deliverables[i] != actDeliv.description) {
					newDelivs.push(relevElem.deliverables[i]);
				}
			}
			relevElem.deliverables = newDelivs;
		}
	}
	return newPFV;
}

function checkAndChangeDeadlines(oldVPV, oldPFV, newPFV) {
	logger4js.debug('adapt all deadlines of the newPFV to the oldPFV');
	var hrchy_pfv = convertHierarchy(oldPFV);
	// look for the deadlines of pfv (take all)
	var allPFVDeadlines = getDeadlines(oldPFV, hrchy_pfv, undefined);

	var hrchy_vpv = convertHierarchy(oldVPV);
	// change the deadlines of the oldVPV
	var allnewDeadlines = getDeadlines(newPFV, hrchy_vpv, undefined);
	var listDeadlines = allnewDeadlines.getAllDeadlines();

	var DeadlineToDelete = [];
	var fittingDeadline = [];
	logger4js.debug('find the deadlines, which are only in the vpv and should be deleted for a new PFV');
	for (var element = 0; element < listDeadlines.length; element++) {
		var actDeadline = listDeadlines[element];
		if ( allPFVDeadlines && allPFVDeadlines.allDeadlines && !allPFVDeadlines.allDeadlines[actDeadline.nameID] ) {
			DeadlineToDelete.push(actDeadline);
		} else {
			fittingDeadline.push(actDeadline);
		}
	}

	logger4js.debug('delete the deadlines found out');
	var remPhaseList={};
	// sort the list of Deadlines (first the milestones then the phases - alphabethically descending)
	DeadlineToDelete.sort(function(a, b){return b.nameID.localeCompare(a.nameID);});

	for ( var dl = 0; dl < DeadlineToDelete.length; dl++) {

		actDeadline = DeadlineToDelete[dl];
		if (actDeadline && actDeadline.type === 'Milestone') {
			newPFV = deleteMSFromVPV(hrchy_vpv, newPFV, actDeadline);
		}
		if (actDeadline && actDeadline.type === 'Phase') {
			var remPhase = deletePhaseFromVPV(hrchy_vpv, newPFV, actDeadline);
			remPhaseList[actDeadline.nameID]= remPhase;
		}
	}
	logger4js.trace('remove the phases in remPhaseList AllPhases');
	var newPhaseList = [];
	for (var j=0; newPFV && newPFV.AllPhases && j < newPFV.AllPhases.length; j++) {
		if (remPhaseList[newPFV.AllPhases[j].name]){
			continue;
		} else {
			newPhaseList.push(newPFV.AllPhases[j]);
		}
	}
	// now cleaned AllPhases
	newPFV.AllPhases = newPhaseList;
	return newPFV;
}

function createIndices(newPFV) {
	logger4js.debug('Create the needed property "indexOfElem" in the hierarchy for all phases and milestones');
	var rootKey = '0';
	var rootphaseID = '0§.§';

	if (!newPFV){
		return newPFV;
	}
	var indexHrchy = [];
	indexHrchy = convertHierarchy(newPFV);
	for (var i = 0; newPFV && newPFV.AllPhases && newPFV.AllPhases[i] && i < newPFV.AllPhases.length; i++) {
		var phase = newPFV.AllPhases[i];
		if (phase) {
			// special treatment of rootphase
			if (phase.name === rootphaseID){
				var phaseName = rootKey;
			} else {
				phaseName = phase.name;
			}
			if (indexHrchy[phaseName]) {
				indexHrchy[phaseName].hryNode.indexOfElem = i + 1;
				for (var j = 0; phase.AllResults && j < phase.AllResults.length; j++){
					if (indexHrchy[phase.AllResults[j].name]) {
						indexHrchy[phase.AllResults[j].name].hryNode.indexOfElem = j + 1;
					} else {
						logger4js.warn('phaseName %s is not included in the hierarchy of newVPV', phase.AllResults[j].name);
					}
				}
			} else {
				logger4js.warn('phaseName %s is not included in the hierarchy of newVPV', phaseName);
			}
		}
	}

	var allNodes = newPFV.hierarchy.allNodes;
	for (i = 0; allNodes && i < allNodes.length; i++) {
		allNodes[i].hryNode.indexOfElem = indexHrchy[allNodes[i].hryNodeKey].hryNode.indexOfElem;
	}
	newPFV.hierarchy.allNodes = allNodes;
	return newPFV;
}

function deleteMSFromVPV(hrchy_vpv, newPFV, elem) {
	logger4js.trace('Delete one Milestone from Phase of VPV');
	var elemID = elem ? elem.nameID : undefined;
	// var relevElem = getMilestoneByID(hrchy_vpv, newPFV, elemID);
	var parentElem = elem ? elem.phasePFV: undefined;

	// if there is no parent, keep the newPFV as it is
	if ( !parentElem ) {
		return newPFV;
	}

	var parPhase = getPhaseByID(hrchy_vpv, newPFV, parentElem);
	var newResults = [];
	for ( var ar = 0; parPhase && parPhase.AllResults && ar < parPhase.AllResults.length; ar++) {
		if (parPhase.AllResults[ar].name != elemID) {
			newResults.push(parPhase.AllResults[ar]);
		}
	}
	parPhase.AllResults = newResults;
	logger4js.trace('Delete one Milestone from hierarchy of VPV');
	var vpvHrchyNodes = newPFV.hierarchy.allNodes;
	newPFV.hierarchy.allNodes = deleteElemIDFromHrchy(hrchy_vpv, vpvHrchyNodes, elemID);
	return newPFV;
}

function deletePhaseFromVPV(hrchy_vpv, newPFV, elem) {
	if ( !hrchy_vpv || !newPFV || !elem) {
		return newPFV;
	}
	logger4js.trace('Delete the phase %s from VPV and if there are milestones in the phase, put them in the phase´s parent', elem.nameID);
	var elemID = elem.nameID;
	var phase = getPhaseByID(hrchy_vpv, newPFV, elemID);
	var parentID = (hrchy_vpv && hrchy_vpv[elemID]) ? hrchy_vpv[elemID].hryNode.parentNodeKey: undefined;
	var parent = getPhaseByID(hrchy_vpv, newPFV, parentID);
	if (!parent) {
		// there is nothing to do, because elem is the rootphase. this will not be removed ever.
		return newPFV;
	}

	// look for milestones in the phase, which is to remove and insert them into the parentPhase
	if ( phase.AllResults.length > 0 ) {
		// change the parent of the milestones
		for (var ms = 0; phase && phase.AllResults && ms < phase.AllResults.length; ms++){
			// milestone parent now the parent of the phase
			parent.AllResults.push(phase.AllResults[ms]);
			var msElemID = phase.AllResults[ms].name;
			var vpvHrchyNodes = newPFV.hierarchy.allNodes;
			newPFV.hierarchy.allNodes = changeParentInHrchy(parentID, msElemID, vpvHrchyNodes);
			hrchy_vpv[parentID].hryNode.childNodeKeys.push(msElemID);
			hrchy_vpv[msElemID].hryNode.parentNodeKey = parentID;
		}
		// delete the milestones in the phase
		phase.AllResults = [];
	}

	logger4js.trace('take the needs of the phase %s and add them into the parentPhase %s ', phase.name, parent.name);

	newPFV = moveTheNeeds(newPFV, phase, parent);
	newPFV = moveTheCosts(newPFV, phase, parent);

	logger4js.debug('remove the phase %s from hierarchy', elemID);
	vpvHrchyNodes = newPFV.hierarchy.allNodes;
	newPFV.hierarchy.allNodes = deleteElemIDFromHrchy(hrchy_vpv, vpvHrchyNodes,elemID);


	return phase;
}

function changeParentInHrchy(parentID, elemID, origHrchyNodes) {
	origHrchyNodes.forEach( node => {
		if (node.hryNodeKey == parentID) { node.hryNode.childNodeKeys.push(elemID);}
		if (node.hryNodeKey == elemID) { node.hryNode.parentNodeKey = parentID;}
	});
	return origHrchyNodes;
}

function deleteElemIDFromHrchy(hrchy_vpv, origHrchyNodes, elemID){
	var rootKey = '0';
	var rootphaseID = '0§.§';

	if (elemID === rootphaseID ) {
		logger4js.trace('elemID %s may not be deleted from hierarchy of VPV', elemID);
		return origHrchyNodes;
	}

	// elemID has to be removed from Hierarchy.allNodes and from childNodeKeys-Array of the parent
	var hrchy_node = hrchy_vpv[elemID];
	if (hrchy_node) {
		var parentNode = hrchy_node.hryNode.parentNodeKey;
		if (parentNode === rootphaseID){
			parentNode = rootKey;
		}
	}
	// now in call-parameters : var origHrchyNodes = newPFV.hierarchy.allNodes;
	var newHryAllNodes = [];
	// in the allNodes-Array at the beginning there are the phases and then follow the milestones.
	for (var an = 0; origHrchyNodes && an < origHrchyNodes.length; an++){
		if (origHrchyNodes[an].hryNodeKey === parentNode) {
			var relevantPhaseChildren = origHrchyNodes[an].hryNode.childNodeKeys;
			var newChildNodeKeys = [];

			for ( var ch = 0; relevantPhaseChildren && ch < relevantPhaseChildren.length; ch++){
				if (relevantPhaseChildren[ch] != elemID) {
					newChildNodeKeys.push(relevantPhaseChildren[ch]);
				}
			}
			origHrchyNodes[an].hryNode.childNodeKeys = newChildNodeKeys;
		}
		if (origHrchyNodes[an].hryNodeKey != elemID) {
			newHryAllNodes.push(origHrchyNodes[an]);
		}
	}
	return newHryAllNodes;
}

function moveTheNeeds (newPFV, phase, parent) {
	logger4js.trace('Move the needs from phase %s to its parent %s', phase.name, parent.name);

	logger4js.trace('Check startdates and enddates of the phase and the parent phase');
	if (!(parent.relStart <= phase.relStart) && (parent.relEnde <= phase.relEnde)) {
		logger4js.error('parent %s isn not the parent of phase %s', parent.name, phase.name);
		return newPFV;
	}
	for (var ar = 0; phase && phase.AllRoles && ar < phase.AllRoles.length; ar++) {
		var role = phase.AllRoles[ar];
		// search the same role in parent
		var found = false;
		for (var i = 0; parent && parent.AllRoles && i < parent.AllRoles.length; i++) {
			if ( !(parent.AllRoles[i].RollenTyp == role.RollenTyp) && (parent.AllRoles[i].teamID == role.teamID))  { continue; }
			logger4js.debug( 'move needs of %s in his parent %s', role.RollenTyp, parent.name);
			var parentNeeds = parent.AllRoles[i].Bedarf;
			for ( var n = 0; n < role.Bedarf.length && n < parentNeeds.length; n++){
				var index = phase.relStart - parent.relStart;
				var parentNeed = (parentNeeds[index + n]) ? parentNeeds[index + n] : 0;
				var phaseNeed = (role.Bedarf[n]) ? role.Bedarf[n] : 0;
				parentNeeds[ index + n] = parentNeed + phaseNeed;
				found = true;
			}
		}
		// parent didn't have any needs for this role
		if (!found) {
			// insert the whole role and their needs
			parentNeeds = [];
			for ( var p = parent.relStart; p < phase.relStart ; p++){
				parentNeeds.push(0);
			}
			for ( n = 0; n < role.Bedarf.length; n++){
				parentNeeds.push(role.Bedarf[n]);
			}
			for ( p = phase.relEnde; p < parent.relEnde; p++){
				parentNeeds.push(0);
			}
			role.Bedarf = parentNeeds;
			parent.AllRoles.push(role);
		}
	}
	return newPFV;
}

function moveTheCosts (newPFV, phase, parent) {
	logger4js.trace('Move the costss from phase to its parent');
	logger4js.trace('Check startdates and enddates of the phase and the parent phase');
	if (!(parent.relStart <= phase.relStart) && (parent.relEnde <= phase.relEnde)) {
		logger4js.error('parent %s isn not the parent of phase %s', parent.name, phase.name);
		return newPFV;
	}
	for (var ar = 0; phase && phase.AllCosts && ar < phase.AllCosts.length; ar++) {
		var cost = phase.AllCosts[ar];
		// search the same role in parent
		var found = false;
		for (var i = 0; parent && parent.AllCosts && i < parent.AllCosts.length; i++) {
			if ( !(parent.AllCosts[i].KostenTyp == cost.KostenTyp))  { continue; }
			logger4js.debug( 'move costs of %s in his parent %s', cost.KostenTyp, parent.name);
			var parentCosts = parent.AllCosts[i].Bedarf;
			for ( var n = 0; n < cost.Bedarf.length && n < parentCosts.length; n++){
				parentCosts[phase.relStart - parent.relStart + n] = parentCosts[phase.relStart - parent.relStart + n] + cost.Bedarf[n];
				found = true;
			}
		}
		// parent didn't have any needs for this role
		if (!found) {
			// insert the whole role and their needs
			parentCosts = [];
			for ( var p = parent.relStart; p < phase.relStart ; p++){
				parentCosts.push(0);
			}
			for ( n = 0; n < cost.Bedarf.length; n++){
				parentCosts.push(cost.Bedarf[n]);
			}
			for ( p = phase.relEnde; p < parent.relEnde; p++){
				parentCosts.push(0);
			}
			cost.Bedarf = parentCosts;
			parent.AllCosts.push(cost);
		}
	}
	return newPFV;
}

function aggregateRoles(phase, orgalist){
	var newAllRoles = [];
	if (orgalist.length <= 0) {
		return phase.AllRoles;
	}
	for ( var ir = 0; phase && phase.AllRoles && ir < phase.AllRoles.length; ir++){
		var oneRole = {};
		var role = phase.AllRoles[ir];
		// Step one: replace the role with its parent with uid = pid, if role is a person
		var roleSett = orgalist[role.RollenTyp];

		if (!roleSett) {
			if (role.RollenTyp){
				logger4js.warn('aggregateRoles Role not found %s', role.RollenTyp);
			} else {
				logger4js.warn('aggregateRoles Role not found');
			}			
			continue;
		}
		if (roleSett.isSummaryRole) {
			if (!roleSett.aggregationID || roleSett.aggregationID == role.RollenTyp) {
				// roleSett is a summary role but does not have an aggregation Role or is an aggregation role itself
				oneRole.RollenTyp = role.RollenTyp;
				oneRole.teamID = role.teamID;
				oneRole.Bedarf = role.Bedarf;
				newAllRoles.push(oneRole);
				continue;
			} else {
				oneRole.RollenTyp = roleSett.aggregationID;
				oneRole.teamID = role.teamID;
			}
		} else { // no summary role
			oneRole.RollenTyp = roleSett.pid;
			oneRole.teamID = role.teamID;
		}

		if (( role.teamID === -1 ) || ( !role.teamID)) {
			// Badarf has to be adopted in € according to the defaultDayCost of the role
			// therefore it will be considered the relation between dailyRate of each person versus the dailyRate of the summaryRole
			// and the PT will be calculated in the same relation.
			oneRole.Bedarf = [];
			var newDailyRate = orgalist && orgalist[oneRole.RollenTyp] && orgalist[oneRole.RollenTyp].dailyRate;
			var actDailyRate = roleSett ? roleSett.dailyRate : newDailyRate;
			var ptFaktor = newDailyRate > 0 ? actDailyRate/newDailyRate : 1;
			for (var ib = 0; role && ib < role.Bedarf.length; ib++) {
				oneRole.Bedarf.push(role.Bedarf[ib] * ptFaktor);
			}
		} else {
			// the needs for teams are always calculated with the dailyRate of the team
			oneRole.Bedarf = role.Bedarf;
		}
		newAllRoles.push(oneRole);
	}

	var groupBy = function (xs, key1, key2) {
		return xs.reduce(function (rv, x) {
			(rv[x[key1] + ',' + x[key2]] = rv[x[key1] + ',' + x[key2]] || []).push(x);
			return rv;
		}, {});
	};
	// group the used roles
	var groupedRoles = groupBy(newAllRoles, 'RollenTyp','teamID');

	// make an array of the grouped roles
	const arrayOfGroupedRoles = Object.entries(groupedRoles);

	// sum the needs of the groupedRoles
	var resultNewRoles = [];
	if (!arrayOfGroupedRoles || arrayOfGroupedRoles.length <= 0)	{
		return resultNewRoles;
	}
	for (var iarr= 0; iarr < arrayOfGroupedRoles.length; iarr++) {
		var elem = arrayOfGroupedRoles[iarr];
		var aggrRole = elem[1];			// there is the role and their ressources in the second member
		var sumRole = {};
		for (ir= 0; aggrRole && ir < aggrRole.length; ir++) {
				sumRole.RollenTyp = aggrRole[ir].RollenTyp;
				sumRole.teamID = aggrRole[ir].teamID;
				if (!sumRole.Bedarf) {
					sumRole.Bedarf = [];
					for (var m = 0; aggrRole[ir] && m < aggrRole[ir].Bedarf.length; m++) {
						sumRole.Bedarf.push(aggrRole[ir].Bedarf[m]);
					}
				} else {
					for (m = 0; aggrRole[ir] && m < aggrRole[ir].Bedarf.length; m++) {
						sumRole.Bedarf[m] = sumRole.Bedarf[m] +aggrRole[ir].Bedarf[m];
					}
				}
		}
		resultNewRoles.push(sumRole);
	}
	return resultNewRoles;
}

// function calculates the distribution of values in a array
function calcPhArValues(arStartDate, arEndDate, arSum) {
	// check if valid invocation
	if (typeof arStartDate !== 'object' || typeof arEndDate !== 'object' || typeof arSum !== 'number' ) {
		logger4js.warn('calcPhArValues:  typeof startDate: ', typeof arStartDate, 'typeof arEndDate: ', typeof arEndDate, 'typeof arSum: ', typeof arSum);
		return undefined;
	}

	// make corrections, if dates are switched ..
	if (arStartDate > arEndDate) {
		let tmpDate = arStartDate;
		arStartDate = arEndDate;
		arEndDate = tmpDate;
	}
	let anzDaysPMonth = [];
	let startyear = arStartDate.getFullYear();
	let endyear = arEndDate.getFullYear();
	
	anzDaysPMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	// if the start- and enddate are in one year with a leap year
	if (((startyear % 4 == 0) && (arStartDate.getMonth() <= 1)) || ((endyear % 4 == 0) && (arEndDate.getMonth() > 1))) {
		anzDaysPMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	}

	// now do the calculation: determine the number of months covered , then distribute values such that fraction of start-Month and end-Month is taken into account
	// i.e 30.5 - 3.7 : may and july may only contain a fraction of the sum, not hjust evenly distributed
	let arResult = [];
	let arIxA = getColumnOfDate(arStartDate);
	let arIxE = getColumnOfDate(arEndDate);
	let totalNrOfDays = diffDays(arEndDate, arStartDate) + 1;
	let arLength = arIxE - arIxA + 1;

	let anzDays1 = 0;
	let anzDaysN = 0;
	let fraction1 = 0;
	let fractionX = 0;
	let fractionN = 0;

	anzDays1 = anzDaysPMonth[arStartDate.getMonth()] - arStartDate.getDate() + 1;
	anzDaysN = arEndDate.getDate();

	fraction1 = anzDays1 / totalNrOfDays;
	if (arLength > 2) {
		fractionX = ((1/(arLength-2)) * (totalNrOfDays-(anzDays1 + anzDaysN)))/totalNrOfDays;
	}
	fractionN = anzDaysN / totalNrOfDays;

	switch(arLength) {
		case 1:
			arResult.push(arSum);
			break;
		case 2:
			arResult.push(arSum * fraction1);
			arResult.push(arSum * fractionN);
			break;
		default:
			arResult.push(arSum * fraction1);
			for (var i = 1; i < arLength - 1; i++) {
				arResult.push(arSum * fractionX);
			}
			arResult.push(arSum * fractionN);
	};
    // it in some really rare situations, when the division is not the exactly same sum, the give it the last month
	const newSum = arResult.reduce(sumOF);
	const diffSum = arSum - newSum;
	if (diffSum != 0) {
		arResult[arResult.length-1] = arResult[arResult.length-1] + diffSum; 
	}
	return arResult;
}

function calcNewBedarfe(oldPhStartDate, oldPhEndDate, newPhStartDate, newPhEndDate, oldArray, scaleFactor, separatorIndex) {
	// function does calculate a new Array, length is defined by columns(newStartDate), columns(newEndDate)
	// if separatorIndex is given, function does keep all values before the separatorIndex unchanged
	// only values starting with separatorIndex are changed according scaleFactor
	// if similarCharacteristics then the distribution of values over the various months is maintained

	let ar1 = undefined;
	let ar2 = oldArray;
	let resultArray = [];

	// if number of covered months are equal and day of start and day of end are almost equal, i.e +/-2 days then
	// consider it similar characteristic
	// example: oldPhase 6.3 - 17.5 and newPhase 4.6 - 19.8 are considered similarCharacteristics
	let similarCharacteristics = false;
	if (oldPhStartDate !== undefined && oldPhEndDate !== undefined) {
		let sameLengthInMonths =  ((getColumnOfDate(oldPhEndDate) - getColumnOfDate(oldPhStartDate)) == (getColumnOfDate(newPhEndDate) - getColumnOfDate(newPhStartDate)));
		let similar1 = ((Math.abs((oldPhStartDate.getDate() - newPhStartDate.getDate())) <=2) && (Math.abs((oldPhEndDate.getDate() - newPhEndDate.getDate())) <=2));
		let similar2 = ((Math.abs((oldPhStartDate.getDate() - newPhStartDate.getDate())) <=4) && (Math.abs((diffDays(newPhEndDate, newPhStartDate) - diffDays(oldPhEndDate, oldPhStartDate)))<=2));
		similarCharacteristics = sameLengthInMonths && (similar1 || similar2);
	}

	let calcStartDate = new Date(newPhStartDate);
	if (separatorIndex && separatorIndex > 0) {
		// ar1 now holds the actualData, which should not be changed
		ar1 = oldArray.slice(0,separatorIndex);
		// ar2 holds the part of the array which is in the future, starting with separatorIndex
		ar2 = oldArray.slice(separatorIndex);
		calcStartDate.setDate(1);
		calcStartDate.setMonth(calcStartDate.getMonth() + separatorIndex);
	}

	if (similarCharacteristics) {
		ar2 = ar2.map(x => x * scaleFactor);
	} else {
		let arSum = ar2.reduce(sumOF);
		// calculate the new future-value array ...
		ar2 = calcPhArValues(calcStartDate, newPhEndDate, arSum*scaleFactor);
	}
	// if necessary, combine actual data and new future values
	if (separatorIndex && separatorIndex > 0) {
		resultArray = ar1.concat(ar2);
	} else {
		resultArray = ar2;
	}
	return resultArray;
}

function ensureValidVPV(myVPV) {
	// function checks whether consistency criterias of a vpv are fulfilled respectively can be healed without harm
	//
	// if enforceHealing is set to true, then array lengths/values of roles / costs are healed as well: sumOfValues remains the same, but there is a new distribution of values over time!		//
	// currently: enforceHealing is set to true. we should discuss whether we provide that as an (optional) parameter or whether we treat it as the standard way
	// Exception: enforceHealing is automatically set to false, if actualDataUntil > VPV.StartDate
	//
	//
	// Violation handling:
	// each violated 'stop criterium' will cause 'return false' and is documented via trace.warn
	// each violated 'can be healed criterium' will be healed and documented via trace.warn; a healed criterium will not cause 'return false'
	//
	// List of Validity Criterias:
	// check on minimum requirements1 (stop criterium): existence of myVPV, startDate, endDate, name
	// check on minimum requirements2 (can be healed criterium): startDate <= endDate, startDate >= startOfCalendar=1.1.2015
	// C0 (can be healed)  : is Dauer eq. Number of covered months of the project, i.e checks consistency between VPV.startDate, VPV.endDate and Dauer ?
	// C1 (can be healed)  : does rootPhase = '0§.§' exist and are startDate and endDate of project and rootPhase identical ?
	// C2 (stop criterium) : does no Phase is having a start-Date earlier than project startdate ?
	// C3 (stop criterium) : does no Phase is having a end-Date later than project endDate ?
	// C3 (can be healed, enforceHealing=true)
	// C4 (only information): is no Milestone-Date earlier than parent-phase start and not later than parent phase endDate ?
	// C4 (only information, no healing , no abort criterium) :
	// before C5 check (can be healed): are relStart and relEnde corresponding to phaseStartDate and phaseEndDate?
	// C5 (stop criterium) : are array lengths of each role identical to relEnde-relStart + 1 of the phase ?
	// C5 (can be healed, enforceHealing=true)
	// C6 (stop criterium) : is each value in a role array >= 0 ?
	// C7 (stop criterium) : are array lengths of each cost identical to relEnde-relstart + 1 of the phase ?
	// C7 (can be healed, enforceHealing=true)
	// C8 (stop criterium) : is each value in a cost array >= 0 ?
	// C9 (can be healed)  : is strategicFit either undefined or having a numeric value >= 0 and <= 10?
	// C10 (can be healed) : is Risiko either undefined or having a numeric value >= 0 and <= 10 ?
	// C11 (stop criterium): is number of milestones / phases in hierarchy eq. to number of phases/milestones when traversed in the list?
	// C12 (stop criterium): is each name of a phase / milestone listed in the hierarchy
	// C13 (stop criterium): are indices given in the hierarchy referencing phases / milestones in their AllPhases / AllResults Array correctly,
	// C13 .. continued    : i.e: are indices in hierarchyNode consistent with relative position of elements in AllPhases / AllResults ?

	// if enforceHealing is set to true, then violations regarding offsets, array lengths of roles , of costs are healed
	// sumOfValues remains the same, but value distribution is of course different
	let enforceHealing = true;
	let startOfCalendar = new Date(minStartDate);

	// check on minimum requirements: existence of myVPV, name, startDate, endDate
	if  (!(myVPV && myVPV.startDate && myVPV.endDate && myVPV.name && myVPV.name != '')) {
		logger4js.warn('ensureValidVPV:  myVPV, startDate, endDate do not exist: (myVPV exists/StartDate/EndDate)',
		myVPV === undefined, !(myVPV && myVPV.startDate), !(myVPV && myVPV.endDate));
		return false;
	}

	// check on minimum requirements, might be healed: is startDate <= endDate, then: is startDate >= start Of Calendar
	if (myVPV.startDate > myVPV.endDate) {
		// heal it, document it
		logger4js.info('ensureValidVPV healed:  startDate after endDate  (vpvId: %s, startDate: %s, EndDate: %s)',
		myVPV._id, myVPV.StartDate, myVPV.endDate);
		let correctStartDate = myVPV.endDate;
		myVPV.endDate = myVPV.startDate;
		myVPV.startDate = correctStartDate;
	}

	if (myVPV.startDate < startOfCalendar) {
		// heal it, document it
		logger4js.info('ensureValidVPV healed:  startDate before startOfCalendar: (vpvId: %s, StartDate: %s, Start OF Calendar: %s)',
		myVPV._id, myVPV.StartDate, startOfCalendar);

		let numberOfDays = diffDays(startOfCalendar, myVPV.startDate);
		if (numberOfDays > 0) {
			myVPV.startDate = addDays(myVPV.startDate, numberOfDays);
			myVPV.endDate = addDays(myVPV.endDate, numberOfDays);
		}
	}

	// if actualData exists: set enforceHealing to false , because this would possibly change actualData values
	// and if actualDataDate is a valid one: >= startDate tk changed: 13.06.21
	//
	if (myVPV.actualDataUntil) {
		if (myVPV.actualDataUntil < myVPV.startDate) {
			// then it is not a valid, reasonable ActualDataUntil
			// may stem form Excel Client, because for a Date there is no undefined, it will always be Date.MinDate
			myVPV.actualDataUntil = undefined;
		} else {
			//enforceHealing = true;	
			enforceHealing = false;
		}
	}

	// variable criterias is a array of boolean values, indicating which validity criterias are fulfilled / not fulfilled
	// all criterias which are violated but can be healed, will be healed, and it will be documented in the logger.warn
	// all criterias which are stop criterias will lead to return false
	let criterias = [];
	let projectDurationInDays = diffDays(myVPV.endDate, myVPV.startDate) + 1;

	// Criterium
	// C0: is Dauer eq. Number of covered months of the project ?
	let c0 = (myVPV.Dauer && myVPV.Dauer == (getColumnOfDate(myVPV.endDate) - getColumnOfDate(myVPV.startDate) + 1));

	if (!c0) {
		// heal it:
		myVPV.Dauer = getColumnOfDate(myVPV.endDate) - getColumnOfDate(myVPV.startDate) + 1;
		logger4js.info('ensureValidVPV healed C0: project months-coverage (vpvId: %s, Month coverage: %s, StartDate: %s, EndDate: %s)',
		myVPV._id, myVPV.Dauer, myVPV.startDate, myVPV.endDate);
		c0 = true;
	}

	// Criterium
	// C1: does rootPhase = '0§.§' exist and are start-Date and endDate of project and rootPhase identical ?
	let c1 = false;

	if (!myVPV.AllPhases || myVPV.AllPhases.length < 1 ) {
		// there are no phases at all, but one Phase have to exist, so this is now corrected
		// the AllPhases[0] Element always corresponds to the project startDate and endDate
		let phObject = {
			AllRoles: [],
			AllCosts: [],
			AllResults: [],
			AllBewertungen: [],
			percentDone: 0,
			invoice: undefined,
			penalty: undefined,
			responsible: '',
			deliverables: [],
			ampelStatus: 0,
			ampelErlaeuterung: '',
			earliestStart: 0,
			latestStart: 0,
			minDauer: projectDurationInDays,
			maxDauer: projectDurationInDays,
			relStart: 1,
			relEnde: myVPV.Dauer,
			startOffsetinDays: 0,
			dauerInDays: projectDurationInDays,
			name: rootPhaseName,
			shortName: '',
			originalName: '',
			appearance: ''
		};

		myVPV.AllPhases = [];
		myVPV.AllPhases.push(phObject);

		// in this case the hierarchy only consists of one single Element
		myVPV.hierarchy.allNodes = [];

		let hryNodeObject = {
			elemName: rootPhaseName,
			origName: '',
			indexOfElem: 1,
			parentNodeKey: '',
			childNodeKeys: []
		};
		let hryObject = {
			hryNodeKey: '0',
			hryNode: hryNodeObject
		};
		myVPV.hierarchy.allNodes.push(hryObject);
	}

	if (myVPV.AllPhases && myVPV.AllPhases[0]) {
		c1 = (myVPV.AllPhases[0].name == rootPhaseName &&
				myVPV.AllPhases[0].dauerInDays == projectDurationInDays);
	}

	// used for enforceHealing, when it comes to modify phase offsets, durations and milestone offsets
	let timeScalingCorrectionFactor = 1.0;

	if (!c1) {
		// heal it:
		// pre-condition is now granted: existence of AllPhases[0]
		myVPV.AllPhases[0].name = rootPhaseName;
		if ((myVPV.AllPhases[0].dauerInDays != projectDurationInDays) && enforceHealing) {
			if (myVPV.AllPhases[0].dauerInDays > 0) {
				timeScalingCorrectionFactor = projectDurationInDays / myVPV.AllPhases[0].dauerInDays;
			}
		}
		myVPV.AllPhases[0].dauerInDays = projectDurationInDays;

		logger4js.info('ensureValidVPV healed C1: rootPhase did not correspond to project duration or name requirements (vpvId: %s, name: %s, dauerinDays: %s)',
						myVPV._id,
						myVPV.AllPhases && myVPV.AllPhases[0] && myVPV.AllPhases[0].name,
						myVPV.AllPhases && myVPV.AllPhases[0] && myVPV.AllPhases[0].dauerInDays);
		c1 = true;
	}

	let c2 = true;
	let c3 = true;
	let c4 = true;
	let c5 = true;
	let c6 = true;
	let c7 = true;
	let c8 = true;

	// Criterium
	let c9 = !myVPV.StrategicFit || (myVPV.StrategicFit >= 0 && myVPV.StrategicFit <= 10);
	if (!c9) {
		// heal it: if a value exists, but is <0 or > 10 then set it to 0
		// heal it: if it is undefined, ignore it, i.e leave it as is
		if (myVPV.StrategicFit) {
			myVPV.StrategicFit = 0;
		}
		logger4js.info('ensureValidVPV healed/ignored C9: strategic fit (vpvId: %s, strategicFit: %s)',
		myVPV._id, myVPV.StrategicFit);
		c9 = true;
	}

	// Criterium
	let c10 = !myVPV.Risiko || (myVPV.Risiko && myVPV.Risiko >= 0 && myVPV.Risiko <= 10);
	if (!c10) {
		// heal it: if a value exists, but is <0 or >10 then set it to 0
		// heal it: if it is undefined, ignore it, i.e leave it as is
		if (myVPV.Risiko) {
			myVPV.Risiko = 0;
		}
		logger4js.info('ensureValidVPV healed/ignored C10: Risiko (vpvId: %s, Risk: %s)',
		myVPV._id, myVPV.Risiko);
		c10 = true;
	}

	let c11 = true;
	let c12 = true;
	let c13 = true;
	let anzPlanElements = 0;
	let phaseIX = 0;

	// Criterium
	// to play it safe, it is again checked that myVPV.hierarchy exists and has a length of at least 1
	// otherwise c11 is set to false: is number of phase/milestone elements eq. to number of hierarchy entries
	c11 = (myVPV.hierarchy && myVPV.hierarchy.allNodes && myVPV.hierarchy.allNodes.length > 0 );
	if (!c11) {
		logger4js.warn('ensureValidVPV severe violation C11: hierarchy either does not exist or has a length of 0 (vpvId: %s)',
		myVPV._id);
		return false;
	}

	// now convert to indexed hierarchy for all subsequent checks
	let myHrchy = convertHierarchy(myVPV);

	myVPV.AllPhases.forEach(phase => {

		phaseIX = phaseIX + 1;
		anzPlanElements = anzPlanElements + 1;

		// check existence and validity in hierarchy
		let nodeItem = undefined;
		if ( phaseIX == 1) {
			nodeItem = myHrchy['0'] ? myHrchy['0'].hryNode : undefined;
		} else {
			nodeItem = myHrchy[phase.name] ? myHrchy[phase.name].hryNode : undefined;
		}
		let c13tmp = (nodeItem && nodeItem.indexOfElem == phaseIX);
		c13 = c13 && c13tmp;
		if (!c13tmp) {
			logger4js.warn('ensureValidVPV severe violation C13: Index of Phase does not match with hierarchy information (vpvId: %s, phase-Name: %s, Index: %s)',
			myVPV._id, phase.name, phaseIX);
		}

		// Criterium
		c2 = c2 && (phase.startOffsetinDays >= 0);
		if (!(phase.startOffsetinDays >= 0)) {
			logger4js.warn('ensureValidVPV severe violation C2: Phase-Start Offset (vpvId: %s, phase-Name: %s, startOffset: %s)',
			myVPV._id, phase.name, phase.startOffsetinDays);
		}

		// now check whether there need to be a correction in offset and duration
		if (enforceHealing && (timeScalingCorrectionFactor != 1.0) && phase.startOffsetinDays && phase.dauerInDays) {
			// heal it , trunc just to avoid that becaue of rounding phase ends after project ...
			let newOffset = Math.trunc(phase.startOffsetinDays * timeScalingCorrectionFactor);
			let newDauer = Math.trunc(phase.dauerInDays * timeScalingCorrectionFactor);

			logger4js.info('ensureValidVPV enf-healed C3: Phase-End (vpvId: %s, phase-Name: %s, old start-Offset: %s, old duration: %s, new startoffset: %s, new duration: %s)',
							myVPV._id, phase.name, phase.startOffsetinDays, phase.dauerInDays, newOffset, newDauer);

			phase.startOffsetinDays = newOffset;
			phase.dauerInDays = newDauer;
		}

		// Criterium
		let c3tmp = (phase.startOffsetinDays !== undefined && phase.dauerInDays !== undefined && (phase.startOffsetinDays + phase.dauerInDays  <= projectDurationInDays));
		c3 = c3 && c3tmp;
		if (!c3tmp) {
			logger4js.warn('ensureValidVPV severe violation C3: Phase-End (vpvId: %s, phase-Name: %s, Offset: %s, Duration: %s, project Duration: %s)',
							myVPV._id, phase.name, phase.startOffsetinDays, phase.dauerInDays, projectDurationInDays);
		}

		// now check here whether relEnde and relStart fit to phStartDate and phEndDate, if not correct relStart and relEnde
		// this can easily be done, because the constituting data is startOffset, durationInDays
		let vpvStartColumn = getColumnOfDate(myVPV.startDate);
		let phStartDate = addDays(myVPV.startDate, phase.startOffsetinDays);
		let phEndDate = addDays(myVPV.startDate, phase.startOffsetinDays + phase.dauerInDays - 1);

		let chkRelStart = getColumnOfDate(phStartDate) - vpvStartColumn + 1;
		let chkRelEnde = getColumnOfDate(phEndDate) - vpvStartColumn + 1;
		let correctionNecessary = ((chkRelStart != phase.relStart) || (chkRelEnde != phase.relEnde));
		if (correctionNecessary) {
			// now protocoll, that is has been corrected ...
			phase.relStart = chkRelStart;
			phase.relEnde = chkRelEnde;
			logger4js.info('ensureValidVPV healed relEnde and relStart (vpvId: %s, phase-Name: %s, StartDate: %s, EndDate: %s, new relStart: %s, new relEnde %s)',
			myVPV._id, phase.name, phStartDate, phEndDate, chkRelStart, chkRelEnde );
		}
		let phLength = phase.relEnde - phase.relStart + 1;
		phase.AllRoles.forEach(role => {
			let c5tmp = (role.Bedarf && (role.Bedarf.length == phLength));
			if (!c5tmp) {
				if (enforceHealing) {
					let beforeSum = 0;
					if (role.Bedarf && role.Bedarf !== null && role.Bedarf.reduce(sumOF) > 0 ) {
						beforeSum = role.Bedarf.reduce(sumOF);
						role.Bedarf = calcNewBedarfe(undefined, undefined, phStartDate, phEndDate, role.Bedarf, 1.0, -1);
					} else {
						role.Bedarf = [];
						role.Bedarf.push(0);
						role.Bedarf = calcNewBedarfe(undefined, undefined, phStartDate, phEndDate, role.Bedarf, 1.0, -1);
					}

					let afterSum = 	role.Bedarf.reduce(sumOF);
					if (Math.round(Math.abs(beforeSum - afterSum)*1000)/1000 != 0) {
						logger4js.warn('ensureValidVPV enf-healing calculation failed C5: Role Array length (vpvId: %s, phase: %s, roleId: %s, beforeSum: %s, aftersum: %s)',
						myVPV._id, phase.name, role.RollenTyp, beforeSum, afterSum);
					} else {
						logger4js.info('ensureValidVPV enf-healed C5: Role Array length (vpvId: %s, phase: %s, roleId: %s, new arLength: %s, new phLength: %s)',
						myVPV._id, phase.name, role.RollenTyp, role.Bedarf.length, phLength);
						c5tmp = true;
					}
				} else {
					logger4js.warn('ensureValidVPV severe violation C5 no enf-heal: Role Array length (vpvId: %s, phase: %s, roleId: %s, array-Length: %s, ph-Length: %s, ActualDataUntil: %s) ',
					myVPV._id, phase.name, role.RollenTyp, role.Bedarf.length, phLength, myVPV.actualDataUntil);
				}
				c5 = c5 && c5tmp;
			}

			// Criterium
			// checks whether all elements of an array are >= 0
			if (role.Bedarf.length != 0) {
				let c6tmp = (role.Bedarf && role.Bedarf.map(value => value >= 0).reduce((accumulator, currentValue) => accumulator && currentValue));
				c6 = c6 && c6tmp;
				if (!c6tmp) {
					logger4js.warn('ensureValidVPV severe violation C6: Role Array with negative values (vpvId: %s, phase: %s, RoleId: %s) ',
					myVPV._id, phase.name, role.RollenTyp);
				}
			}			
		});

		phase.AllCosts.forEach(cost => {
			// Criterium
			let c7tmp = (cost.Bedarf && (cost.Bedarf.length == phLength));
			if (!c7tmp) {
				if (enforceHealing) {
					let beforeSum = 0;
					// if (role.Bedarf && role.Bedarf !== null && role.Bedarf.reduce(sumOF) > 0 ) {
					if (cost.Bedarf  && cost.Bedarf !== null && cost.Bedarf.reduce(sumOF) > 0 ) {
						beforeSum = cost.Bedarf.reduce(sumOF);
						cost.Bedarf = calcNewBedarfe(undefined, undefined, phStartDate, phEndDate, cost.Bedarf, 1.0, -1);
					} else {
						cost.Bedarf = [];
						cost.Bedarf.push(0);
						cost.Bedarf = calcNewBedarfe(undefined, undefined, phStartDate, phEndDate, cost.Bedarf, 1.0, -1);
					}
					let afterSum = 	cost.Bedarf.reduce(sumOF);
					if (Math.round(Math.abs(beforeSum - afterSum)*1000)/1000 != 0) {
						logger4js.warn('ensureValidVPV enf-healing calculation failed C7: Cost Array length (vpvId: %s, phase: %s, costId: %s, beforeSum: %s, aftersum: %s',
						myVPV._id, phase.name, cost.KostenTyp, beforeSum, afterSum);
					} else {
						logger4js.info('ensureValidVPV enf-healed C7: Cost Array length (vpvId: %s, phase: %s, costId: %s, new arLength: %s, new phLength: %s)',
						myVPV._id, phase.name, cost.KostenTyp, cost.Bedarf.length, phLength);
						c7tmp = true;
					}
				} else {
					logger4js.warn('ensureValidVPV severe violation C7 No enf-Heal: Cost Array length (vpvId: %s, phase: %s, costId: %s, arLength: %s, phLength: %s, ActualDataUntil: %s) ',
					myVPV._id, phase.name, cost.KostenTyp, cost.Bedarf.length, phLength, myVPV.actualDataUntil);
				}
				c7 = c7 && c7tmp;
			}

			// Criterium
			// checks whether all elements of an array are >= 0
			let c8tmp = (cost.Bedarf && cost.Bedarf.map(value => value >= 0).reduce((accumulator, currentValue) => accumulator && currentValue));
			c8 = c8 && c8tmp;
			if (!c8tmp) {
				logger4js.warn('ensureValidVPV severe violation C8: Cost Array with negative values (vpvId: %s, phase: %s, costId: %s)',
				myVPV._id, phase.name, cost.uid);
			}
		});

		let mileStoneIX = 0;
		phase.AllResults.forEach(result => {
			mileStoneIX = mileStoneIX + 1;
			anzPlanElements = anzPlanElements + 1;

			// Criterium
			// C13: check existence and validity in hierarchy
			let nodeItem = myHrchy[result.name] ? myHrchy[result.name].hryNode : undefined ;
			let c13tmp = nodeItem && (nodeItem.indexOfElem == mileStoneIX) && (((nodeItem.parentNodeKey == phase.name) || (nodeItem.parentNodeKey == '0')));
			c13 = c13 && c13tmp;
			if (!c13tmp) {
				logger4js.warn('ensureValidVPV severe violation C13: Index of Milestone does not match with hierarchy information (vpvId: %s, phase-Name: %s, phase-Index: %s)',
				myVPV._id, phase.name, phaseIX);
			}
			if (enforceHealing && (timeScalingCorrectionFactor != 1.0) && result.offset && result.offset >= 0) {
				// heal it , trunc just to avoid that because of rounding results ends after project/phase ...
				let newOffset = Math.trunc(result.offset * timeScalingCorrectionFactor);
				logger4js.info('ensureValidVPV enf-healed C4: Milestone Offet (vpvId: %s, phase: %s, milestone-Name: %s, old Offset: %s, new Offset: %s)',
								myVPV._id, phase.name, result.name, result.offset, newOffset);
				result.offset = newOffset;
			}

			// Criterium is only info, not any more restirction
			let c4tmp = ((result.offset >= 0) &&
						((phase.startOffsetinDays + result.offset) <= projectDurationInDays) &&
						(result.offset <= phase.dauerInDays));
			c4 = c4 && c4tmp;
			if (!c4tmp) {
				logger4js.info('ensureValidVPV warning C4: Milestone not within phase limits: (vpvId: %s, milestone-Name: %s, phase-Name: %s, milestone offset: %s, phase-offset: %s, phase-duration: %s, project-duration: %s) ',
				myVPV._id, result.name, phase.name, result.offset, phase.startOffsetinDays, phase.dauerInDays, projectDurationInDays);
				c4 = true;
			}

			// Criterium c12
			let c12tmp = !(myHrchy[result.name] === undefined);
			c12 = c12 && c12tmp;
			if (!c12tmp) {
				logger4js.warn('ensureValidVPV severe violation C12: Milestone not in hierarchy: (vpvId: %s, phase: %s, milestone-Name: %s)', myVPV._id, phase.name, result.name);
			}
		});

		if (!(phase.name == rootPhaseName)) {
			// check auf rootPhaseName ist bereits in c1 abgeprüft ..

			// Criterium
			let c12tmp = !(myHrchy[phase.name] === undefined);
			c12 = c12 && c12tmp;
			if (!c12tmp) {
				logger4js.warn('ensureValidVPV severe violation C12: Phase not in hierarchy: (vpvId: %s, phase-Name: %s) ', myVPV._id, phase.name);
			}
		}
	});

	// Criterium
	c11 = (myHrchy && (myVPV.hierarchy && myVPV.hierarchy.allNodes && (myVPV.hierarchy.allNodes.length == anzPlanElements)));
	if (!c11) {
		logger4js.warn('ensureValidVPV severe violation C11: Number of hierarchy elements does not match number of plan-Elements (vpvId: %s, nr Elements in hierarchy: %s, nr Elements in List: %s)',
		myVPV._id, myVPV.hierarchy && myVPV.hierarchy.allNodes && myVPV.hierarchy.allNodes.length, anzPlanElements);
	}

	criterias.push(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13);

	// now returns true , if all criterias are fulfilled, false if at least one criteria is not fulfilled
	return criterias.reduce((accumulator, currentValue) => accumulator && currentValue);

}

function sumOF(accumulator, currentValue) {
	return accumulator + currentValue;
}

function scaleVPV(oldVPV, newVPV, scaleFactor) {
	// this function converts an oldVPV to a modified oldVPV and returns it to the caller
	// the function scales the oldVPV (valid vpv) that contains old start & endDate and Bedarfe
	// the newVPV contains nothing but the new start & endDate (not necessarily a valid vpv)
	// the newVPV.actualDataUntil is the scaleFromDate, from this month on, including this month all resource and cost needs are being scaled, i.e changed
	// the oldVPV-Values are changed according to the values in newVPV resp scaleFactor
	//
	// the scaleFactor defines the scale for the total costs, the distribution has to be calculated from prpject range from oldVPV to the newVPV

	if (!oldVPV || !newVPV || scaleFactor < 0) {
		return undefined;
	}
	logger4js.debug('scaleVPV:  ', oldVPV._id, 'newVPV', newVPV._id, 'scaleFactor', scaleFactor);

	

	// here the date shall be provided from where on the scaling should take place. Can be provided by parameter
	// scaleFromDate should always be the first of a month. From this month on , including this month all items are being scaled, i.e changed
	// all other dates and resource/cost values being before thet scaleFromDate, will remain unchanged
	//let scaleFromDate = new Date(2021, 7, 1);

	// determin the scaleFromDate
	let scaleFromDate = undefined;

	// there is no actualdata, but newVPV provides a ScaleFromDate
	if (!oldVPV.actualDataUntil && newVPV.actualDataUntil) {
				scaleFromDate = new Date(newVPV.actualDataUntil);
				newVPV.actualDataUntil = undefined;
	}
	if (oldVPV.actualDataUntil && !newVPV.actualDataUntil) {
		// there is actualDataUntil, but noScaleFromDate was given
		// take the oldVPV.actualDataUntil and add one month for scaleFromDate
		scaleFromDate = new Date (oldVPV.actualDataUntil);
		scaleFromDate.setDate(15);
		scaleFromDate.setMonth(scaleFromDate.getMonth() + 1);
		scaleFromDate.setDate(1);
		newVPV.actualDataUntil = new Date(oldVPV.actualDataUntil);
	} else {
		if (oldVPV.actualDataUntil && newVPV.actualDataUntil) {
			// there was given a actualDataUntil and a scaleFromDate
			const diffActualScale = diffDays(oldVPV.actualDataUntil, newVPV.actualDataUntil)
			if (diffActualScale >= 0) {
				scaleFromDate = new Date(oldVPV.actualDataUntil);
				scaleFromDate.setDate(15);
				scaleFromDate.setMonth(scaleFromDate.getMonth() + 1);
				scaleFromDate.setDate(1);
			} 
			if (diffActualScale > 0) {				
				newVPV.actualDataUntil = new Date(scaleFromDate);
			}

			if (diffActualScale < 0) {
				// scaleFromDate is later than actualDataUntil, then it is just ok
				scaleFromDate = new Date(newVPV.actualDataUntil);
				// because scaleFromDate was provided in newVPV.actualDataUntil it now needs to be set
				// to the real value which needs to be the same than oldVPV.actualDataUntil
				newVPV.actualDataUntil = new Date(oldVPV.actualDataUntil);
			}
		}
	}
	let scaleFromDateColumn = -1;
	if (!newVPV) {
		return undefined;
	}

	// if a scaleFromDate has been provided: startDates have to be the same ...
	// use case preserve actualData : in this case a project must not start later or earlier -
	// this would make all actualData information Nonsense.

	// in this case this must be true: oldVPV.StartDate = newVPV.StartDate .. otherwise Exit
	if ((oldVPV.actualDataUntil) && (diffDays(oldVPV.startDate, newVPV.startDate) != 0)) {
		logger4js.warn('scaleVPV: when scaleFromDate is given start-Dates of oldVPV and newVPV need to be identical ', oldVPV.startDate, 'vs. newVPV:', newVPV.startDate);
		return undefined;
	}
	if (scaleFromDate) {
		scaleFromDateColumn = getColumnOfDate(scaleFromDate);
		// check whether anything needs to be done
		if (scaleFromDate < oldVPV.startDate) {
			// same as if scaleFromDate === undefined
			scaleFromDate = undefined;
			scaleFromDateColumn = -1;
		}

		// check whether nothing should be scaled
		if (scaleFromDate && (scaleFromDate > oldVPV.endDate)) {
			logger4js.warn('no action: scaleFromDate is after endDate of Project: ', oldVPV.endDate, ' scale From Date:', scaleFromDate);
			return undefined;
		}
	}
	let oldDauerInDays = diffDays(oldVPV.endDate, oldVPV.startDate) + 1;
	let newDauerInDays = diffDays(newVPV.endDate, newVPV.startDate) + 1;
	// a phase starting and ending on the same day has duration 1, a phase ending one day after the start has duration 2, and so on
	if (oldDauerInDays == 0 || newDauerInDays <= 0 ) {
		logger4js.warn('scaleVPV: oldDauerInDays = 0 or newDauerInDays = 0  ', oldDauerInDays, 'vs. duration newVPV:', newDauerInDays);
		return undefined;
	}
	let timeScalingFactor = newDauerInDays / oldDauerInDays;
	let sumOfInvoices = 0;
	
	// determin the oldVPV_sumOfInvoices saved in oldVPV.Erloes, which will be used to calculate the relation between all existing Invoices
	helperVpv.setErloesWithSumOfInvoice(oldVPV);
	let oldVPV_sumOfInvoices = oldVPV.Erloes;

	oldVPV.AllPhases.forEach(phase => {
		// if not scaleFromDate, no special handling necessary
		// if scaleFromDate , then
		// check: dont do anything if phase is completely in Past , i.e timeFrame before scaleFromDate
		// check: check: if oldStart in Past: don't change oldStart, check where newEnd will be  if oldPhase and newPhase are both completely in future and
		// check: if oldPhase and newPhase is in future then perform as if no scaleFromDate
		// somethingToDo gets false, when ScaleFromDate is given and phase in consideration is completey before scaleFromDate
		let somethingToDo = true;

		let oldPhStartDate =  getPhStartDate(oldVPV, phase);
		let oldPhEndDate = getPhEndDate(oldVPV, phase);
		let separatorIndex = -1;
		let oldPhaseStartColumn = getColumnOfDate(oldPhStartDate);
		let oldPhaseEndColumn = getColumnOfDate(oldPhEndDate);

		if (oldPhaseStartColumn < scaleFromDateColumn && scaleFromDateColumn <= oldPhaseEndColumn ) {
			// separatorIndex is needed when calling calcNewBedarfe to ensure that actualData remains unchanged
			separatorIndex = scaleFromDateColumn - oldPhaseStartColumn;
		}

		// make sure that because of rounding it does not go beyond
		let newOffsetInDays = Math.trunc(timeScalingFactor * phase.startOffsetinDays);
		let newDauerInDays = Math.trunc(timeScalingFactor * phase.dauerInDays);
		let newPhStartDate =  addDays(newVPV.startDate, newOffsetInDays);
		let newPhEndDate = addDays(newPhStartDate, newDauerInDays - 1);

		// find out whether newOffsetInDays and newDauerInDays are valid or need to be changed ..
		// this check is only necessary in case there was provided a scaleFromDate
		if (scaleFromDate) {
			// save the dates - because oldVPVP.Phase is changed over the courese
			let oldOffsetInDays = phase.startOffsetinDays;
			let oldDauerInDays = phase.dauerInDays;
			// do the checkings and necessary adjustments for newOffsetInDays with regard to scaleFromDate
			if (oldPhaseStartColumn < scaleFromDateColumn) {
				// not allowed to change a start in the Past resp. before scaleFromDate
				newOffsetInDays = oldOffsetInDays;
				// if oldEndDate is before then leave old phase completely unchanged ..
				if (oldPhEndDate < scaleFromDate) {
					newDauerInDays = oldDauerInDays;
					somethingToDo = false;
				} else {
					// newPhStartDate = addDays(newVPV.startDate, newOffsetInDays);
					newPhEndDate = addDays(newVPV.startDate, newOffsetInDays + newDauerInDays - 1);
					// will the ne phaseEnd land before scaleFromDate?
					if (newPhEndDate < scaleFromDate) {
						// adjust dauerInDays so that newPhEndDate is the last Day of the month of scaleFromDate
						// this is very important : otherwise there would be no array Element left to hold the new values
						let betterPhEndDate = getDateEndOfMonth(scaleFromDate);
						let difference = diffDays(betterPhEndDate, newPhEndDate);
						newDauerInDays = newDauerInDays + difference;
					}
				}
			} else {
				// old Phase Start is after scaleFromDate , where is the new phase Start?
				if (newPhStartDate < scaleFromDate) {
					// adjust offsetinDays so that newPhStartDate = scaleFromDate
					let betterPhStartDate = scaleFromDate;
					let difference = diffDays(betterPhStartDate, newPhStartDate);
					newOffsetInDays = newOffsetInDays + difference;
				}
			}
		}	


		// determin the sum of Invoices all over the project
		if (phase.invoice) {
			if (oldVPV_sumOfInvoices != 0) { 
				const invoiceQuotient = phase.invoice.Key / oldVPV_sumOfInvoices; 
				phase.invoice.Key = newVPV.Erloes * invoiceQuotient;
			}
			sumOfInvoices += phase?.invoice?.Key || 0;
		}

		phase.AllResults.forEach(result => {					
			if (result.invoice){					
				if (oldVPV_sumOfInvoices != 0) { 
					const invoiceQuotient = result.invoice.Key / oldVPV_sumOfInvoices; 
					result.invoice.Key = newVPV.Erloes * invoiceQuotient;
				}
				sumOfInvoices += result?.invoice?.Key || 0;
			}	
		});	

	
		if (somethingToDo == true) {
			// now it has been checked that values are valid
			phase.startOffsetinDays = newOffsetInDays;
			phase.dauerInDays = newDauerInDays;
			// calculate, because in case when scaleFromDate has been provided, values may have changed
			newPhStartDate = getPhStartDate(newVPV, phase);
			newPhEndDate = getPhEndDate(newVPV, phase);
			// for sake of consistency
			phase.relStart = getColumnOfDate(newPhStartDate) - getColumnOfDate(newVPV.startDate) + 1;
			phase.relEnde = getColumnOfDate(newPhEndDate) - getColumnOfDate(newVPV.startDate) + 1;
			

			// now - do calculate the new values ..
			// each role, each cost will have the same length for the 'Bedarf" array
			// provide oldDates and newDates so that method can find out, whether or not the 'characteristic of distribution' should be preserved
			phase.AllRoles.forEach(role => {
				if (role.Bedarf && role.Bedarf !== null) {
					role.Bedarf = calcNewBedarfe(oldPhStartDate, oldPhEndDate,
											newPhStartDate, newPhEndDate, role.Bedarf, scaleFactor, separatorIndex);
				}
			});

			phase.AllCosts.forEach(cost => {
				if (cost.Bedarf && cost.Bedarf !== null) {
					cost.Bedarf = calcNewBedarfe(oldPhStartDate, oldPhEndDate,
						newPhStartDate, newPhEndDate, cost.Bedarf, scaleFactor, separatorIndex);
				}
			});

			phase.AllResults.forEach(result => {
				let newMsOffset = Math.trunc(result.offset*timeScalingFactor);
				if (scaleFromDate) {
					let newMsDate = addDays(newPhStartDate, newMsOffset);
					if (newMsDate < scaleFromDate) {
						let betterMsDate = scaleFromDate;
						let difference = diffDays(betterMsDate, newMsDate);
						newMsOffset = newMsOffset + difference;
					}
				}
				result.offset = newMsOffset;
		
			});
			
		}
	});

	// an existing RAC will be put in the invoice of the first phase
	if (newVPV.Erloes > 0 && sumOfInvoices == 0) {
		if (oldVPV.AllPhases[0].invoice) {
			oldVPV.AllPhases[0].invoice.Key = newVPV.Erloes;
		} else {
			var h_invoice = {};
			h_invoice.Key = newVPV.Erloes;
			h_invoice.Value = 0;
			oldVPV.AllPhases[0].invoice = h_invoice;
		}
	}
	// existing sum of Invoices will be the new Erloes/RAC
	if (sumOfInvoices > 0 && sumOfInvoices !== newVPV.Erloes) {		
		logger4js.warn('scaleVPV: given RAC = %s and sumOfInvoices = %s  ', newVPV.Erloes, sumOfInvoices);
		newVPV.Erloes = sumOfInvoices;
	}
	
	// now copy by reference to allPhases of oldVPV
	newVPV.AllPhases = oldVPV.AllPhases;
	newVPV.Dauer = getColumnOfDate(newVPV.endDate) - getColumnOfDate(newVPV.startDate) + 1;

	return ensureValidVPV(newVPV) ? newVPV : undefined;
}

function resetStatusVPV(oldVPV) {
	// this function resets all status information inside the VPV.
	// this applies to trafficlight & explanation, status, %done, bewertungen, ...
	// Use-Case 1 : aus template projekt-vpv machen
	// Use-Case 2: aus projekt-vpv eine pfv machen
	// suggestions is to provide this variable as parameter
	// it can make a lot of sense to have the same deliverables defined as in the oldVPV
	// that is the case when a project environment is based on standardized processes where it is agreed that at certain points in time
	// certain deliverables are expected.

	// may be provided as parameter later on, for now Deliverables are kept unchanged
	let keepDeliverables = true;
	// maybe provided as parameter later on,
	// for now it is assumed that a pfv is created from a vpv
	let useCase = 2;

	if (!oldVPV) {
		return undefined;
	}
	logger4js.debug('resetStatusVPV:  ', oldVPV._id);
	// customFields - keep all defined keys, but reset value of string and double Fields
	// keep the same value in all boolean field , because either value is as good as the other one
	// so just make sure vpv contains same number and type of customFields
	if (useCase == 1) {
		oldVPV.customDblFields.forEach(customfield => {
			customfield.dbl = undefined;
		});
		oldVPV.customStringFields.forEach(customfield => {
			customfield.strvalue = '';
		});
	}

	// 0 = without ampelstatus
	oldVPV.ampelStatus = 0;
	oldVPV.ampelErlaeuterung = '';

	const emptyBewertung = { 'color': 0, 'description':'', 'deliverables':'', 'bewerterName':'', 'datum':new Date().toISOString() };
	let bKey = '#' + new Date().toLocaleString('de-DE');
	let bItem = {key: bKey, bewertung: emptyBewertung};

	oldVPV.AllPhases.forEach(phase => {
		// adress all the contained milestones
		phase.AllResults.forEach(result => {
			result.bewertungen = [];
			result.bewertungen.push(bItem);
			result.verantwortlich='';
			if (!keepDeliverables) {
				result.deliverables = [];
			}
			if (useCase == 1) {
				result.invoice = undefined;
				result.penalty = undefined;
				result.originalName = '';
			}
			result.percentDone = 0;
		});

		// now reset bewertungen , set the first element of bewertungen
		phase.AllBewertungen = [];
		phase.AllBewertungen.push(bItem);
		phase.percentDone = 0;

		// if a pfv is created from a vpv, the invoices and penalties need to be unchanged
		if (useCase == 1 ) {
			phase.invoice = undefined;
			phase.penalty = undefined;
			phase.originalName = '';
		}
		phase.responsible = '';

		if (!keepDeliverables) {
			phase.deliverables = [];
		}
		phase.ampelStatus = 0;
		phase.ampelErlaeuterung = '';
	});
	return oldVPV;
}

function deleteNeedsOfVPV(vpv, fromDate, toDate, rolesToSetZero) {
	if (!vpv || rolesToSetZero.length <= 0) {
		return false;
	}
	
	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var duration = endIndex - startIndex + 1;
	var actFromIndex = getColumnOfDate(fromDate);
	var actToIndex = getColumnOfDate(toDate);
	var actualDataIndex = getColumnOfDate(vpv.actualDataUntil);

	if (actFromIndex > actToIndex)  {
		return false;
	}

	if (startIndex > actFromIndex) {
		actFromIndex = startIndex;
	}

	if (actToIndex > endIndex) {
		actToIndex = endIndex;
	}

	if ((startIndex <= actFromIndex) && (actToIndex <= endIndex)  ) {

		if ((actualDataIndex > 0) && (actualDataIndex >= actFromIndex) && (actualDataIndex <= actToIndex)){
			
			// set the months from this project from actualDataIndex til actToIndex to null
			vpv?.AllPhases.forEach( phase => {
				
					phase?.AllRoles.forEach( role => {
					
						if (rolesToSetZero[role.RollenTyp] ) {
							// delete the forecast
							for (var i = actFromIndex ; i <= actToIndex; i++) {	
								if ((i - startIndex + 1 - phase.relStart) >= 0 && (i - startIndex + 1 - phase.relStart) <= role.Bedarf.length -1)	{
									role.Bedarf[i - startIndex  - phase.relStart] = 0;
								} else {
									logger4js.info('Delete the forecast values with error: phase %s : roleUID %s  ', phase.name, role.RollenTyp);
								}
							}
						}
					})	
			})
		} 

		if (actualDataIndex <= 0) {
			// no actualDataUntil set => set all months of this project from startIndex til actToIndex to null
			vpv?.AllPhases.forEach( phase => {
				phase?.AllRoles.forEach( role => {			
					if (rolesToSetZero[role.RollenTyp] ) {
						// delete the forecast
						for (var i = startIndex; i <= actToIndex; i++) {	
							if ((i - startIndex + 1 - phase.relStart) >= 0 && (i - startIndex + 1 - phase.relStart) <= role.Bedarf.length -1)	{
								role.Bedarf[i - (startIndex  + phase.relStart - 1)] = 0;
							} else {
								logger4js.info('Delete the forecast values with error: phase %s : roleUID %s  ', phase.name, role.RollenTyp);
							}
						}
					}
				})
			})
		}  else {
			// set the months from this project from actualDataIndex+1 til actToIndex to null
			vpv?.AllPhases.forEach( phase => {			
				phase?.AllRoles.forEach( role => {				
					if (rolesToSetZero[role.RollenTyp] ) {
						// delete the forecast
						for (var i = actualDataIndex + 1 ; i <= actToIndex; i++) {	
							if ((i - startIndex + 1 - phase.relStart) >= 0 && (i - startIndex + 1 - phase.relStart) <= role.Bedarf.length -1)	{
								role.Bedarf[i - startIndex + 1 - phase.relStart] = 0;
							} else {
								logger4js.info('Delete the forecast values with error: phase %s : roleUID %s  ', phase.name, role.RollenTyp);
							}
						}
					}
				})		
			})
		}
	

	} else {
		// protokoll for not processed vpv
		// make entries into the MongoDB TimeRecord
	}	
	return vpv
}


function importNeedsOfVPV(vpv, fromDate, toDate, indexedTimeRecords) {
	if (!vpv || !indexedTimeRecords) {
		return undefined;
	}	
	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var duration = endIndex - startIndex + 1;
	var actFromIndex = getColumnOfDate(fromDate);
	var actToIndex = getColumnOfDate(toDate);

	// find all timerecords for this vpid
	var htimerecs = indexedTimeRecords[vpv.vpid] || [];
	// look for the different Roles in the list of timerecords for vpid
	var diffRoles = [];
	htimerecs.forEach( rec => {
		if (!diffRoles.includes(rec.roleId)) {
			diffRoles.push(rec.roleId)
		}
	})
	// find the timerecords for vpid and uid
	diffRoles.forEach(uid => {
		// find all timeRecords with roleId = uid
		const specialTimerecs = htimerecs.filter(item => item.roleId == uid);
		// the actualData will be entered into the rootphase of a VPV
		var rootPhase = vpv.AllPhases[0];
		var index = rootPhase.AllRoles.findIndex(role => (role.RollenTyp == uid))
		if (index < 0 ) {
			// there doesn't exist the role with id = uid in the rootPhase
			// a new roleUID-element must be pushed to allRoles in the rootPhase
			var roleUID = {};
			roleUID.RollenTyp = uid;
			roleUID.Bedarf = [];				
			for (i = 0; i < duration; i++) {
				roleUID.Bedarf[i] = 0;
			}
			roleUID.teamID = -1;
			specialTimerecs.forEach( trec => {
				const hours = +trec.time.toString();
				const actDataIndex = getColumnOfDate(trec.date) - startIndex;
				const trecDateIndex = getColumnOfDate(trec.date);
				if ((trecDateIndex <= endIndex) && (trecDateIndex >= startIndex)) {
					roleUID.Bedarf[actDataIndex] += (hours/8);
					if (trec.failed){
						trec.failed = undefined;
						const newTrec =  timeTracker.updateTimeEntry(trec._id, trec);
					}
				} else {				
					logger4js.info('TimeRecord for Role %s : roleUID %s : date %s   not between StartDate and Enddate of %s', trec.name, trec.roleId, trec.date.toISOString(), vpv.name);	
					
					if (trecDateIndex < startIndex) {
						trec.failed = constVTRFailed[1];
					}
					if (trecDateIndex > endIndex) {
						trec.failed =  constVTRFailed[2];
					}								
					const newTrec =  timeTracker.updateTimeEntry(trec._id, trec);				
				}
			})
			rootPhase.AllRoles.push(roleUID);

		} else {
			var roleUID = rootPhase.AllRoles[index];
			// perhaps it exists another role/team-combination, then take the one with teamID = -1
			if (roleUID.teamID != -1) {
				// is there another role-entry with teamId = -1 then take this (indexNew)
				var indexNew = rootPhase.AllRoles.findIndex(role => ((role.RollenTyp == uid) && (role.teamID == -1)));
				if (indexNew != -1) {
					roleUID = rootPhase.AllRoles[indexNew];
				}
			}
			specialTimerecs.forEach( trec => {
				const hours = +trec.time.toString();
				const actDataIndex = getColumnOfDate(trec.date) - startIndex;
				const trecDateIndex = getColumnOfDate(trec.date);
				if ((trecDateIndex <= endIndex) && (trecDateIndex >= startIndex)) {
					roleUID.Bedarf[actDataIndex] += (hours/8);
					if (trec.failed){
						trec.failed = undefined;
						const newTrec =  timeTracker.updateTimeEntry(trec._id, trec);
					}
				} else {					
					logger4js.info('TimeRecord for Role %s : roleUID %s : date %s   not between StartDate and Enddate of %s', trec.name, trec.roleId, trec.date.toISOString(), vpv.name);	
					
					if (trecDateIndex < startIndex) {
						trec.failed = constVTRFailed[1];
					}
					if (trecDateIndex > endIndex) {
						trec.failed =  constVTRFailed[2];
					}			
					const newTrec =  timeTracker.updateTimeEntry(trec._id, trec);
				}
			})
		}		
	})		
	return vpv;
}

function calcTimeRecords(timerecordList, orga, rolesActDataRelevant, vpvList, userId, fromDate, toDate) {

	// check, if all timerecords have an uid defined in orga as a person
	const indexedOrgaRoles = helperOrga.generateIndexedOrgaRoles(orga);
	var missingRolesId = [];
	var missingRolesName = [];

	timerecordList.forEach(item => {
		if (!indexedOrgaRoles[item.roleId]) {			
			missingRolesId[item.roleId] = item.name;
			missingRolesName[item.name] = item.roleId;
		}
	}) 
	
	// check, if all persons of the orga have an entry in the timerecordList
	const indexedTimeRecords = timeTracker.generateIndexedTimeRecords(timerecordList, false);	
	var missingInVtr = [];
	const allRoles = orga.allRoles;
	for (var i = 0; i < allRoles.length; i++) {
		const role = allRoles[i];
		if (!timeTracker.isOrgaRoleinternPerson(role)) {
			// role no Person
			continue;	
		}	
		if ((timerecordList.findIndex(ele1=> ele1.roleId == role.uid) < 0 ) && (missingInVtr.findIndex(ele2 => ele2 == role.uid) < 0)) {
			missingInVtr.push(role.uid)
		}		
	};
	
	// calc all relevant roles to set them to zero	
	var rolesToSetZero = [];	
	rolesToSetZero = filterAllSubRoles(rolesActDataRelevant, orga);
	
	// indexed array
	var rolesToSetZeroIndexed = [];
	rolesToSetZero.forEach( item => {
		rolesToSetZeroIndexed[item.uid] = item;
	});
	var newvpvList = [];	
	for (let i = 0; i < vpvList.length; i++) {
		var vpv = vpvList[i];
		// // don't call deleteNeedsOfVPV and importNeedsOfVPV if not any timeRecord for vpid exists
		// if (!indexedTimeRecords[vpv.vpid])  {
		// 	continue;
		// }		
		// Call of deleteNeedsOfVPV
		const vpvnew = deleteNeedsOfVPV(vpv, fromDate, toDate, rolesToSetZeroIndexed);
		if (!vpvnew) {
			// there were some erros while deleting the planned ressourceNeeds or the timespam was defined with errors
			logger4js.debug('Error while deleting the planned ressource needs or the defined timespam was wrong %s : %s', fromDate, toDate);
		} else {
			// put the new hours work into the vpv's
			const vpvnew1 = importNeedsOfVPV(vpvnew, fromDate, toDate, indexedTimeRecords);	
			if (!vpvnew1) {
				// only the vpv with the deleted forecast
				// ??? oder soll vpv beibehalten werden TODO ur
				newvpvList.push(vpvnew);		
			} else {
				// vpv with the actualData imported
				newvpvList.push(vpvnew1);	
			}		
		}
		
	}	
	return newvpvList;
}

function calcCosttypes(vpvs, pfvs, costID, startDate, endDate, organisation, costInfo, hierarchy, onlyPT) {
	if (!(vpvs?.length > 0) || !(organisation?.length > 0)) {
		logger4js.warn('Calculate Cost Information missing vpvs %d or organisation %d', vpvs?.length, organisation?.length);
		return [];
	}

	if (validate.compareDate(startDate, endDate) > 0 ){
		logger4js.warn('Calculate Cost Information startDate %s before endDate %s ', startDate, endDate);
		return [];
	}

	logger4js.debug('Calculate Cost Information %s', costID);
	var startTimer = new Date();

	if (!startDate) {
		startDate = getDateStartOfMonth();
		startDate.setMonth(startDate.getMonth() - 4);
	}
	var startIndex = getColumnOfDate(startDate);

	if (!endDate) {
		endDate = getDateStartOfMonth();
		endDate.setMonth(endDate.getMonth() + 9);
	}
	var endIndex = getColumnOfDate(endDate);

	
	var timezones = [];	
	var tsItem = {};
	tsItem.organisation = [];
	tsItem.organisation.push(organisation[0]);
	tsItem.startDate = startDate;
	tsItem.endDate = endDate;
	tsItem.startIndex = startIndex;
	tsItem.endIndex = endIndex;
	tsItem.duration = endIndex - startIndex + 1;
	timezones.push(tsItem)
	
	// prepare roles & costs for direct access
	var orga = timezones[0].organisation[0];	
	orga.indexedRoles = [];
	orga.value?.allRoles?.forEach(role => {
		orga.indexedRoles[role.uid] = role;
	});
	orga.indexedCosts = [];
	orga.value?.allCosts?.forEach(cost => {
		orga.indexedCosts[cost.uid] = cost;
	});

	// var timeZones = splitInTimeZones(organisation, startDate, endDate);
	// if (!timeZones) {
	// 	return [];
	// }
	// var role, teamID;
	// if (!roleID) {
	// 	role = timeZones.mergedOrganisation.find(role => role.pid == undefined);
	// 	roleID = role?.uid;
	// }
	cost = timezones[0].organisation[0].indexedCosts[costID];
	if (!cost) {
		logger4js.warn('Calculate Concerning Costtype not found, cost: %d found: %s', costID, cost != undefined);
		return [];
	}
	
	var newvpvs = vpvs;
	var costInfoVPV = calcCosttypesVPVs(newvpvs, costID, timezones, hierarchy);
	var costInfoPFV = [];
	var item;

	if (pfvs?.length > 0) {		
		// calc the corresponding of the PFVs
		var newpfvs = pfvs;
		costInfoPFV = calcCosttypesVPVs(newpfvs, costID, timezones,hierarchy);
		// insert or update cost values
		for (item in costInfoPFV) {
			if (!costInfoVPV[item]) {
				// insert new Value
				costInfoVPV[item] = {};
				costInfoVPV[item].currentDate = costInfoPFV[item].currentDate;
				costInfoVPV[item].costID = costInfoPFV[item].costID;
				costInfoVPV[item].costName = costInfoPFV[item].costName;
				costInfoVPV[item].currentCost = 0;
				costInfoVPV[item].baselineCost = 0;
			}
			costInfoVPV[item].baselineCost = (costInfoPFV[item].baselineCost || 0);
		}
	}

	var capa = [];
	for (item in costInfoVPV) {		
		capa.push({
			'month': costInfoVPV[item].currentDate,
			'costID' : costInfoVPV[item].costID.toString(),
			'costName' : costInfoVPV[item].costName,
			'currentCost': costInfoVPV[item].currentCost || 0,
			'baselineCost': costInfoVPV[item].baselineCost || 0
		});		
	}

	var endTimer = new Date();
	logger4js.trace('Calculate Cost Information duration: ', endTimer.getTime() - startTimer.getTime());

	return capa;
}


function calcCosttypesPerProject(vpvs, pfvs, costID, startDate, endDate, organisation, costInfo, onlyPT) {
	if (!vpvs || vpvs.length == 0 || !(organisation?.length > 0)) {
		logger4js.warn('Calculate Cost Information missing vpvs or organisation ');
		return [];
	}

	if (!startDate) {
		startDate = getDateStartOfMonth();
		startDate.setMonth(startDate.getMonth() - 4);
	}
	var startIndex = getColumnOfDate(startDate);

	if (!endDate) {
		endDate = getDateStartOfMonth();
		endDate.setMonth(endDate.getMonth() + 9);
	}
	var endIndex = getColumnOfDate(endDate);

	// divide the complete time from startdate to enddate in parts of time, where in each part there is only one organisation valid
	logger4js.trace('divide the complete time from calcC_startdate to calcC_enddate in parts of time, where in each part there is only one organisation valid');
	
	
	var timezones = [];	
	var tsItem = {};
	tsItem.organisation = [];
	tsItem.organisation.push(organisation[0]);
	tsItem.startDate = startDate;
	tsItem.endDate = endDate;
	tsItem.startIndex = startIndex;
	tsItem.endIndex = endIndex;
	tsItem.duration = endIndex - startIndex + 1;
	timezones.push(tsItem)
	
	// prepare roles & costs for direct access
	var orga = timezones[0].organisation[0];	
	orga.indexedRoles = [];
	orga.value?.allRoles?.forEach(role => {
		orga.indexedRoles[role.uid] = role;
	});
	orga.indexedCosts = [];
	orga.value?.allCosts?.forEach(cost => {
		orga.indexedCosts[cost.uid] = cost;
	});

	cost = timezones[0].organisation[0].indexedCosts[costID];
	if (!cost) {
		logger4js.warn('Calculate Concerning Costtype not found, cost: %d found: %s', costID, cost != undefined);
		return [];
	}

	// reduce the amount of pfvs to the relevant ones in the time between startDate and endDate
	var newvpvs = [];
	for (i = 0; vpvs && i < vpvs.length; i++) {
		var vpv = vpvs[i];
		var vpvStartIndex = getColumnOfDate(vpv.startDate);
		var vpvEndIndex = getColumnOfDate(vpv.endDate);
		if (vpvEndIndex < startIndex) continue;
		if (vpvStartIndex > endIndex) continue;
		newvpvs.push(vpv);
	}

	// calc the cost Info for every project/vpv individual
	var capaVPV = [];
	newvpvs.forEach(vpv => {
		var costTempVPV = calcCosttypesVPVs([vpv], costID,  timezones, false);
		for (var index in costTempVPV) {
			var element = costTempVPV[index];
			var id = element.currentDate + vpv.vpid.toString();
			element.vpid = vpv.vpid;
			element.name = vpv.name;
			element.variantName = vpv.variantName;
			element.baseLineCost = 0;
			capaVPV[id] = element;
		}
	});

	var capaPFV = [];
	var item;

	if (pfvs) {
		// reduce the amount of pfvs to the relevant ones in the time between startDate and endDate
		var newpfvs = [];
		for ( var i = 0; pfvs && i < pfvs.length; i++) {
			vpv = pfvs[i];
			vpvStartIndex = getColumnOfDate(vpv.startDate);
			vpvEndIndex = getColumnOfDate(vpv.endDate);
			if (vpvEndIndex < startIndex) continue;
			if (vpvStartIndex > endIndex) continue;
			newpfvs.push(vpv);
		}

		// calc the cost Info of the pfvs
		newpfvs.forEach(vpv => {
			var capaTempVPV = calcCosttypesVPVs([vpv], costID, timezones, false);
			for (var index in capaTempVPV) {
				var element = capaTempVPV[index];
				var id = element.currentDate + vpv.vpid.toString();
				element.vpid = vpv.vpid;
				element.name = vpv.name;
				element.variantName = '';
				capaPFV[id] = element;
			}
		});

		// combine vpv & pfv values, insert or update capa values
		for (item in capaPFV) {
			if (!capaVPV[item]) {
				// insert new Value
				logger4js.trace('Insert Capa Value', item, JSON.stringify(capaPFV[item]));
				capaVPV[item] = {};
				capaVPV[item].vpid = capaPFV[item].vpid;
				capaVPV[item].name = capaPFV[item].name;
				capaVPV[item].currentDate = capaPFV[item].currentDate;
				capaVPV[item].costID = capaPFV[item].costID;
				capaVPV[item].costName = capaPFV[item].costName;
			}
			capaVPV[item].baselineCost = (capaPFV[item].baselineCost || 0);
			
		}
	}

	// generate the cumulative number per months across all projects
	for (item in capaVPV) {
		const currentDate = capaVPV[item].currentDate;
		if (capaVPV[item].vpid) {
			if (!capaVPV[currentDate]) {
				capaVPV[currentDate] = {};
				capaVPV[currentDate].currentDate = capaVPV[item].currentDate;
				capaVPV[currentDate].costID = capaVPV[item].costID;
				capaVPV[currentDate].costName = capaVPV[item].costName;
				capaVPV[currentDate].name = 'All';
				capaVPV[currentDate].currentCost = 0;
				capaVPV[currentDate].baselineCost = 0;
			}
			capaVPV[currentDate].currentCost += capaVPV[item].currentCost;
			capaVPV[currentDate].baselineCost = (capaVPV[currentDate].baselineCost || 0) + capaVPV[item].baselineCost;
		}
	}

	// generate an array from an index list with holes
	var capa = [];
	for (item in capaVPV) {		
			capa.push({
				'month': capaVPV[item].currentDate,
				'costID' : capaVPV[item].costID,
				'costName' : capaVPV[item].costName,
				'vpid' : capaVPV[item].vpid,
				'name' : capaVPV[item].name,
				'variantName' : capaVPV[item].variantName,
				'currentCost' : capaVPV[item].currentCost,
				'baselineCost': capaVPV[item].baselineCost || 0
			});
		}	
	capa.sort(function(a, b) { return (new Date(a.month)).getTime() - (new Date(b.month)).getTime(); });
	return capa;
}

function calcCosttypesVPVs(vpvs, costID, timeZones, hierarchy) {

	var allCalcCostValues = [];
	var allCalcCostValuesIndexed = [];
	var costIDs = [];

	// startCalc is defined for time-measuring
	var startCalc = new Date();
	logger4js.trace('Calculate Cost Information of Cost %s startDate %s currentDate %s', costID, timeZones[0].startDate.toISOString());

	if (!(vpvs?.length > 0) ) {
		return 	allCalcCostValuesIndexed;
	}
	
	var cost = timeZones[0].organisation[0].indexedCosts[costID];
	if (!cost) {
		return allCalcCostValuesIndexed;
	}
	costIDs.push({uid: costID, costName: cost.name}); // Main cost

	if (hierarchy) {
		cost.subCostIDs?.forEach(item => {
			var subcost = timeZones[0].organisation[0].indexedCosts[item.key];
			if (!subcost) {
				return;
			}
			costIDs.push({uid: subcost.uid, costName: subcost.name}); // Sub role
		});
	}
	logger4js.debug('calculate for the cost & subcost', JSON.stringify(costIDs));

	costIDs.forEach(costItem => {
		// calculate the concerning roles for every role from the roleIDs list. Getting roles, which are connected with roleID in the given organisation
		calcConcerningCosttypes(timeZones, costItem.uid);

		logger4js.debug('calculate cost information for Cost type %s', costItem.uid);
		var monthlyCosts = getCosttypesFromTimeZone(vpvs, costItem.uid, timeZones);
		monthlyCosts?.forEach((item, index) => {
			var currentDate = new Date(timeZones[0].startDate);
			currentDate.setMonth(currentDate.getMonth() + index);
			const currentIndex = currentDate.toISOString().concat('_', costItem.uid);
			allCalcCostValues[currentIndex] = {
				'currentDate': currentDate.toISOString(),
				'costID': costItem.uid,
				'costName': costItem.costName,
				'currentCost': monthlyCosts[index].currentCost  || 0,
				'baselineCost': monthlyCosts[index].baselineCost  || 0
			};
		});
	});
	var endCalc = new Date();
	logger4js.debug('Calculate Cost Information VPVs duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return allCalcCostValues;
}

/* Calculate the related/concerning Roles that belong to this role, means the role itself and all Children
 * With TSO this can be different for every organisation, so the concerning Roles were calculated per Orga
 * and stored in the timeZone Structure for easy access
 * in addition the root role that is used for the calculation is also stored to allow distinction between teams and normal orga units
 */
function calcConcerningCosttypes(timeZones, costID ) {
	var allConcerningCosts = [];
	// var allTeams = timeZones.mergedOrganisation.filter(item => item.type == 2 && item.isSummaryRole);

	function findConcerningCosttypes(orga, costs, value, parentCost) {
		//value is the Id of one subrole
		var hcostID = value.key;
		var crElem = allConcerningCosts[hcostID];
		if (!crElem) {
			crElem = {};
			crElem.cost = costs[hcostID];			
		}
		orga.concerningCosts.push(crElem);		
		allConcerningCosts[hcostID] = crElem;

		var newParent = crElem.cost;
		if (newParent?.subCostIDs?.length > 0){
			var shcosts = newParent.subCostIDs;
			for (var sc = 0; shcosts && sc < shcosts.length; sc++) {
				findConcerningCosttypes(orga, costs, shcosts[sc], newParent);
			}
		}
	}

	// find the cost in the latest organisation
	cost = timeZones[0].organisation[0].indexedCosts[costID];

	// find all  costtypes corresponding to this one costID all over the organisation - result in concerningRoles
	// var allConcerningCosts = [];
	var orga = timeZones[0].organisation[0];
	var allCosts = orga.indexedCosts;
	orga.concerningCosts = [];
	var cost = allCosts[costID];
	if (cost) {
		var crElem = {};
		crElem.cost = cost;	
		orga.concerningCosts.push(crElem);
		allConcerningCosts[cost.uid] = crElem;
		cost.subCostIDs?.forEach(subcost => {
			findConcerningCosttypes(orga, allCosts, subcost, cost);
		});
	};
	timeZones[0].allConcerningCosts = allConcerningCosts;
}

function getCosttypesFromTimeZone(vpvs, costID, timeZones) {
	
	var cost = timeZones[0].organisation[0].indexedCosts[costID];	
	if (!cost) {
		// given costID isn't defined in this organisation
		return undefined;
	}

	logger4js.debug('getting cost information for the related costID given organisation %s',  costID);
	
	var costValues = [];
	for (var i = 0 ; i < timeZones[0].duration; i++){
		var costElem = {};		
		costElem.currentCost = 0;
		costElem.baselineCost = 0;
		costValues[i] = costElem;
	}

	vpvs.forEach(vpv => {
		logger4js.trace('Calculate Cost Information of CostID %s of Project Version %s', costID, vpv._id);
		var oneVPVcostValues = getCostInformation(cost, vpv, timeZones);
		oneVPVcostValues?.forEach((cost, index) => {
			costValues[index].currentCost += cost.currentCost || 0;
			costValues[index].baselineCost += cost.baselineCost || 0;
		});
	});
	return costValues;
}
function getCostInformation(cost,  vpv, timeZones) {
	var costValues = [];
	if (!cost) return costValues;
	logger4js.trace('Calculate all Cost Information of VPV %s for CostID %d ', vpv._id, cost.uid);

	for (var i = 0; i < timeZones[0].duration; i++) {
		var costElem = {};		
		costElem.currentCost = 0;
		costElem.baselineCost = 0;
		costValues[i] = costElem;
	}

	if (!vpv.AllPhases) {
		return costValues;
	}
	logger4js.trace('Combine Cost Information Values for Project Version %s',  vpv._id);
	//var calcTeam = timeZones.role.type == 2 || teamID > 0;
	addCosttypeValues(vpv, timeZones, costValues);
	return costValues;
}

function addCosttypeValues(vpv, timeZones, costValues) {
	var maxTimeZoneIndex;
	if (vpv.variantName == 'pfv') {
		maxTimeZoneIndex = getTimeZoneIndex(timeZones, vpv.timestamp);
	}
	var vpvStartIndex = getColumnOfDate(vpv.startDate);
	//var actualDataIndex = getColumnOfDate(vpv.actualDataUntil) + 1;

	logger4js.trace('Calculate Cost Information of whole project %s', vpv.AllPhases?.length);
	vpv.AllPhases?.forEach(phase => {
		var phaseStart = vpvStartIndex + phase.relStart - 1;
		phase.AllCosts?.forEach(costPhase => {
			if (costPhase.Bedarf) {
				var dimension = costPhase.Bedarf.length;
				var maxStart = Math.max(phaseStart, timeZones[0].startIndex);
				var minEnd = Math.min(phaseStart + dimension, timeZones[0].endIndex + 1);
				for (var l = maxStart; l < minEnd ; l++) {
					var cCost = isConcerningCosttype(costPhase.KostenTyp, l, timeZones);
					if (!cCost) {
						continue;
					}
					if (l == maxStart) {
						logger4js.debug('Calculate Phases costID %s Bedarf %s', cCost?.cost?.uid,  costPhase.KostenTyp);
					}
					
					// result in T€ 
					var bedarf = costPhase.Bedarf[l - phaseStart];
					// if (l < actualDataIndex) {
					// 	costValues[l - timeZones.startIndex].actCost += bedarf * dailyRate / 1000;
					// 	costValues[l - timeZones.startIndex].actCost_PT += bedarf;
					// } else if (otherActivity) {
					// 	costValues[l - timeZones.startIndex].otherActivityCost += bedarf * dailyRate / 1000;
					// 	costValues[l - timeZones.startIndex].otherActivityCost_PT += bedarf;
					// } else {
					
					if (vpv.variantName == 'pfv') {
						costValues[l - timeZones[0].startIndex].baselineCost += bedarf;	
					} else {
						costValues[l - timeZones[0].startIndex].currentCost += bedarf;
					}
				}
			}
		});
	});
}

function isConcerningCosttype(costID, month, timeZones) {
	// var orgaIndex = timeZones.indexMonth[month - timeZones.startIndex];
	var cCost = timeZones[0].organisation[0]?.concerningCosts.find(item => item.cost?.uid == costID);
	return cCost;
}


module.exports = {
	calcKeyMetrics: calcKeyMetrics,
	calcCosts: calcCosts,
	calcDeliverables: calcDeliverables,
	calcDeadlines: calcDeadlines,
	calcCapacities: calcCapacities,
	calcCapacitiesPerProject: calcCapacitiesPerProject,
	calcCosttypes: calcCosttypes,
	calcCosttypesPerProject: calcCosttypesPerProject,
	calcTimeRecords: calcTimeRecords,
	cleanupRestrictedVersion: cleanupRestrictedVersion,
	convertVPV: convertVPV,
	ensureValidVPV: ensureValidVPV,
	scaleVPV: scaleVPV,
	resetStatusVPV: resetStatusVPV
};
