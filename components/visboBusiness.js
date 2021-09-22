var mongoose = require('mongoose');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');

var logModule = 'VPV';
var log4js = require('log4js');
const { toNamespacedPath } = require('path');
const { validateDate } = require('./validate');
const { validateNumber } = require('./validate');
const { min } = require('moment');
const { any } = require('bluebird');
const rootPhaseName = '0§.§';
var logger4js = log4js.getLogger(logModule);

var refMonth = undefined;

function getColumnOfDate(value) {
	if (!value) {
		// no valid argument
		return 0;
	}
	if (!refMonth) {
		var d = new Date ('2015-01-01');
		refMonth = d.getFullYear() * 12;
	}
	var valueMonth = value.getFullYear() * 12 + value.getMonth();
	logger4js.trace('Calculate Month Column ref %s value %s diff %s ', refMonth, valueMonth, valueMonth - refMonth);
	return valueMonth - refMonth;
}

function visboCmpDate(first, second) {
	let result = 0;
	if (first === undefined) { first = new Date(-8640000000000000); }
	if (second === undefined) { second = new Date(-8640000000000000); }
	if (first < second) {
		result = -1;
	} else if (first > second) {
		result = 1;
	}
	return result;
  }

function addDays(dd, numDays) {
	var inputDate = new Date(dd);
	inputDate.setDate(inputDate.getDate() + numDays);
	return inputDate;
 }

// returns the date of the end of the previous month
function getDateEndOfPreviousMonth(dd) {
	var inputDate = new Date(dd);
	var numDays = inputDate.getDate();
    inputDate.setDate(inputDate.getDate() - numDays);
    return inputDate;
  }

// returns the end of the current month
function getDateEndOfCurrentMonth(dd) {
	let inputDate = new Date(dd);
	// set to first day in month
	inputDate.setDate(1); // adding 31 days makes sure to definitely land in next month
	let myDate = getDateEndOfPreviousMonth(addDays(inputDate, 31));
    return myDate;
  }


// calculate cost of personal for the requested project per month
function getAllPersonalKosten(vpv, organisation) {
	var costValues = [];

	logger4js.debug('Calculate Personal Cost of Project Version %s start %s end %s organisation TS %s', vpv._id, vpv.startDate, vpv.endDate, organisation.timestamp);
	var startCalc = new Date();

	// prepare organisation for direct access to uid
	var allRoles = [];
	for (var i = 0; organisation && organisation.value && organisation.value.allRoles && i < organisation.value.allRoles.length; i++) {
		allRoles[organisation.value.allRoles[i].uid] = organisation.value.allRoles[i];
	}
	var endCalc = new Date();
	logger4js.trace('Calculate Personal Cost Convert ', endCalc.getTime() - startCalc.getTime());

	startCalc = new Date();
	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var dauer = endIndex - startIndex + 1;
	var faktor = 1;

	for (i=0 ; i < dauer; i++){
		costValues[i] = 0;
	}

	if (dauer > 0) {
		//for (var x = 0; x < 1; x++) { // for performance Test do it several times
			for (i = 0; vpv && vpv.AllPhases && i < vpv.AllPhases.length; i++) {
				var phase = vpv.AllPhases[i];
				var phasenStart = phase.relStart - 1;

				for (var j = 0; phase && phase.AllRoles && j < phase.AllRoles.length; j++) {
					// logger4js.trace('Calculate Phase %s Roles %s', i, phase.AllRoles.length);
					var role = phase.AllRoles[j];
					// look for the tagessatz
					var actRoleID = role.RollenTyp;
					logger4js.trace('Calculate Intersect %s Role %s', i, actRoleID);
					var teamID = role.teamID;
					// tagessatz of orga-unit
					var tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					// tagessatz of teamID
					if (teamID && teamID != -1) {
						tagessatz = allRoles[teamID] ? allRoles[teamID].tagessatz : tagessatz;
					}
					// tagessatz of person
					if (allRoles[actRoleID] && allRoles[actRoleID].subRoleIDs && allRoles[actRoleID].subRoleIDs.length <= 0) {
						tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					}
					// var tagessatz = allRoles[role.RollenTyp] ? allRoles[role.RollenTyp].tagessatz : 0;

					// logger4js.trace('Calculate Bedarf of Role %O', role.Bedarf);
					if (role &&  role.Bedarf) {
						var dimension = role.Bedarf.length;
						for (var k = phasenStart; k < phasenStart + dimension; k++) {
							// if costValue[i] is not set yet use 0
							costValues[k] = (costValues[k] || 0) + role.Bedarf[k - phasenStart] * tagessatz * faktor / 1000;
						}
					}
				}
			}
		//}
	}
	else {
		costValues[0] = 0;
	}
	endCalc = new Date();
	logger4js.debug('Calculate Personal Cost duration %s ', endCalc.getTime() - startCalc.getTime());
	return costValues;
}


// calculate all other Costs for the requested project per month
function getAllOtherCost(costID, vpv, organisation) {
	var othercostValues = [];

	logger4js.debug('Calculate all other Cost of Project Version %s start %s end %s organisation TS %s', vpv._id, vpv.startDate, vpv.endDate, organisation.timestamp);
	var startCalc = new Date();

	// prepare organisation for direct access to uid
	var allCosts = [];
	for (var i = 0; organisation && organisation.value && organisation.value.allRoles && i < organisation.value.allCosts.length; i++) {
		allCosts[organisation.value.allCosts[i].uid] = organisation.value.allCosts[i];
	}
	var endCalc = new Date();
	logger4js.debug('Calculate all other Cost Convert Organisation %s ', endCalc.getTime() - startCalc.getTime());

	startCalc = new Date();
	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var dauer = endIndex - startIndex + 1;
	var faktor = 1;

	for (i=0 ; i < dauer; i++){
		othercostValues[i] = 0;
	}

	if (dauer > 0) {

			for (i = 0; vpv && vpv.AllPhases && i < vpv.AllPhases.length; i++) {
				var phase = vpv.AllPhases[i];
				var phasenStart = phase.relStart - 1;
				// logger4js.trace('Calculate Phase %s Costs %s', i, phase.AllCosts.length);
				for (var j = 0; phase && phase.AllCosts && j < phase.AllCosts.length; j++) {
					var cost = phase.AllCosts[j];
					var costTyp = cost.KostenTyp;
					if ((costTyp === costID) || (costID == '')) {
						// logger4js.trace('Calculate Bedarf of Cost %O', cost.Bedarf);
						if (cost.Bedarf) {
							var dimension = cost.Bedarf.length;
							for (var k = phasenStart; k < phasenStart + dimension; k++) {
								// if OthercostValue[i] is not set yet use 0
								othercostValues[k] = (othercostValues[k] || 0) + cost.Bedarf[k - phasenStart] * faktor; // dieser Wert ist bereits in T € und muss nicht dividiert durch 1000
							}
						}
					}

				}
			}
		//}
	} else {
		othercostValues[0] = 0;
	}
	//var endCalc = new Date();
	//logger4js.warn('Calculate all other Cost duration %s ', endCalc.getTime() - startCalc.getTime());
	return othercostValues;

}

function calcCosts(vpv, pfv, organisations) {
	var allCostValues = [];
	var allCostValuesIndexed = [];
	var startCalc = new Date();
	var calcStartDate = undefined;
	var calcEndDate = undefined;

	if ( (vpv || pfv) && organisations && organisations.length > 0 ) {

		if (pfv && vpv) {
			calcStartDate = Math.min(vpv.startDate, pfv.startDate);
			calcEndDate = Math.max(vpv.endDate, pfv.endDate);
		}
		if (!pfv && vpv) {
			calcStartDate = vpv.startDate;
			calcEndDate =  vpv.endDate;
		}
		if (pfv && !vpv) {
			calcStartDate = pfv.startDate;
			calcEndDate = pfv.endDate;
		}

		var timeZones = splitInTimeZones(organisations, calcStartDate, calcEndDate);
		// convert only the needed organisations
		timeZones.forEach( tz => {
			let newOrga = convertOrganisation(tz.orga);
			tz.orga = newOrga;
		});

		if  (vpv){
			logger4js.trace('Calculate Project Costs vpv startDate %s ISO %s ', vpv.startDate, vpv.startDate.toISOString());
			var currentDate = new Date(vpv.startDate);
			logger4js.trace('Calculate Project Costs vpv startDate %s ISO %s currentDate %s', vpv.startDate, vpv.startDate.toISOString(), currentDate.toISOString());
			currentDate.setDate(1);
			currentDate.setHours(0, 0, 0, 0);
			logger4js.trace('Calculate Project Costs vpv currentDate %s ', currentDate.toISOString());
			var startIndex = getColumnOfDate(vpv.startDate);
			// var endIndex = getColumnOfDate(vpv.endDate);

			for ( var tz = 0; timeZones && tz < timeZones.length; tz++) {
				var personalCost = getAllPersonalKosten(vpv, timeZones[tz].orga);
				var allOtherCost = getAllOtherCost('', vpv, timeZones[tz].orga);

				var tzStartIndex = timeZones[tz].startIndex;
				var tzStartDate = timeZones[tz].startdate;
				var tzEndIndex = timeZones[tz].endIndex;
				var zoneDauer = tzEndIndex - timeZones[tz].startIndex + 1;
				var tzStartDiff = tzStartIndex - startIndex;

				currentDate = new Date (tzStartDate);
				currentDate.setMonth(currentDate.getMonth());
				currentDate.setDate(1);
				currentDate.setHours(0, 0, 0, 0);
				// Teilabschnitte übernehmen
				for (var i = 0 ; i < zoneDauer; i++){
					const currentDateISO = currentDate.toISOString();
					allCostValues[currentDateISO] = { 'currentCost': personalCost[i + tzStartDiff] + allOtherCost[i + 	tzStartDiff] };
					currentDate.setMonth(currentDate.getMonth() + 1);
				}
			}
		}

		if ( pfv ) {

			// ur: 04.08.2020: wird nur noch für PFV und VPV  1 x gemacht
			// timeZones = splitInTimeZones(organisations, pfv.startDate, pfv.endDate);

			currentDate = new Date(pfv.startDate);
			currentDate.setDate(1);
			currentDate.setHours(0, 0, 0, 0);
			logger4js.trace('Calculate Project Costs pfv currentDate %s ', currentDate.toISOString());
			startIndex = getColumnOfDate(pfv.startDate);
			// endIndex = getColumnOfDate(pfv.endDate);
			// var dauer = endIndex - startIndex + 1;

			for ( tz = 0; timeZones && tz < timeZones.length; tz++) {
				personalCost = getAllPersonalKosten(pfv, timeZones[tz].orga);
				allOtherCost = getAllOtherCost('', pfv, timeZones[tz].orga);

				tzStartIndex = timeZones[tz].startIndex;
				tzStartDate = timeZones[tz].startdate;
				tzEndIndex = timeZones[tz].endIndex;
				zoneDauer = tzEndIndex - timeZones[tz].startIndex + 1;
				tzStartDiff = tzStartIndex - startIndex;

				currentDate = new Date (tzStartDate);
				currentDate.setMonth(currentDate.getMonth());
				currentDate.setDate(1);
				currentDate.setHours(0, 0, 0, 0);
				// take the calculated cost of this part of time
				for ( i = 0 ; i < zoneDauer; i++ ){
					const currentDateISO = currentDate.toISOString();
					if (!allCostValues[currentDateISO]) {
						allCostValues[currentDateISO] = {};
					}
					allCostValues[currentDateISO].baseLineCost = personalCost[i + tzStartDiff] + allOtherCost[i + 	tzStartDiff];
					currentDate.setMonth(currentDate.getMonth() + 1);
				}
			}
		}

		var j = 0, element;
		for (element in allCostValues) {
			allCostValuesIndexed[j] = {
				'currentDate': element,
				'baseLineCost': allCostValues[element].baseLineCost || 0,
				'currentCost': allCostValues[element].currentCost || 0
			};
			j++;
		}
	}
	var endCalc = new Date();
	logger4js.debug('Calculate Project Costs duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return allCostValuesIndexed;
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


function getSummeKosten(vpv, timeZones, index){
	// calculate the total cost until index-month
	var costSum = undefined;

	if (vpv && timeZones && timeZones.length > 0 && (index>=0)){
		var allCostValues = {};
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;

		for ( var tz = 0; timeZones && tz < timeZones.length; tz++) {
			var personalCost = getAllPersonalKosten(vpv, timeZones[tz].orga);
			var allOtherCost = getAllOtherCost('', vpv, timeZones[tz].orga);

			var tzStartIndex = timeZones[tz].startIndex;
			var tzStartDate = timeZones[tz].startdate;
			var tzEndIndex = timeZones[tz].endIndex;
			var zoneDauer = tzEndIndex - timeZones[tz].startIndex + 1;
			var tzStartDiff = tzStartIndex - startIndex;

			var currentDate = new Date (tzStartDate);
			currentDate.setMonth(currentDate.getMonth());
			// take the calculated cost of this part of time
			for (var i = 0 ; i < zoneDauer; i++){
				const currentDateISO = currentDate.toISOString();
				if (!allCostValues[currentDateISO]) {
					allCostValues[currentDateISO] = {};
				}
				allCostValues[currentDateISO] = { 'thisCost': personalCost[i + tzStartDiff] + allOtherCost[i + 	tzStartDiff] };
				currentDate.setMonth(currentDate.getMonth() + 1);
			}
		}

		if (index > dauer - 1){
			index = dauer - 1;
		}
		var j = 0, element;
		var newPartValues = [];
		for (element in allCostValues) {
			newPartValues[j] = allCostValues[element].thisCost || 0;
			j++;
		}
		costSum = 0;
		for ( i = 0 ; newPartValues && index < newPartValues.length && i <= index; i++){
			costSum += newPartValues[i];
		}
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
			if (ms && vpv.startDate && phase.startOffsetinDays >= 0 && ms.offset >= 0) {
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

	if (!vpv || !vpv._id || dauer <= 0 || !vpv.AllPhases) {
		return new VisboDeliverable();
	}

	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var dauer = endIndex - startIndex + 1;
	var addAll = false;

	// get all for pfv or if the calculcation is done only for vpv
	if (vpv.variantName == 'pfv'
	|| !allDeliverables ) {
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
	var secondDate = new Date(date2);
	if (!isNaN(firstDate) && !isNaN(secondDate)) {
		// differenceInDays = Math.round(Math.abs((firstDate.getTime() - secondDate.getTime())/(oneDay)));
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

function calcKeyMetrics(vpv, pfv, organisations) {
	var keyMetrics = {};
	var startCalc = new Date();

	if (vpv && pfv){

		// Calculate keyMetrics Values here
		keyMetrics = vpv.keyMetrics || {};
		logger4js.debug('Calculate KeyMetrics for %s with pfv %s and organization %s result %s ', vpv && vpv._id, pfv && pfv._id, organisations && organisations[0] && organisations[0]._id, JSON.stringify(keyMetrics));

		if (vpv.variantName != 'pfv'){

			if (organisations && organisations.length > 0){

				// conversion of the all given organisations
				var organisations_new = [];
				organisations.forEach( orga => {
					organisations_new.push(convertOrganisation(orga))
				});

				var indexTotal = getColumnOfDate(pfv.endDate) - getColumnOfDate(pfv.startDate);
				// for calculation the actual cost of the baseline: all costs between the start of the project and the month before the timestamp of the vpv
				var endDatePreviousMonthVPV = getDateEndOfPreviousMonth(vpv.timestamp);
				var indexActual = getColumnOfDate(endDatePreviousMonthVPV) - getColumnOfDate(pfv.startDate);

				var timeZonesPFV = splitInTimeZones(organisations_new, pfv.startDate, pfv.endDate);
				keyMetrics.costBaseLastActual = getSummeKosten(pfv, timeZonesPFV, indexActual);
				keyMetrics.costBaseLastTotal = getSummeKosten(pfv, timeZonesPFV, indexTotal);

				indexTotal = getColumnOfDate(vpv.endDate) - getColumnOfDate(vpv.startDate);
				indexActual = getColumnOfDate(endDatePreviousMonthVPV) - getColumnOfDate(vpv.startDate);
				var timeZonesVPV = splitInTimeZones(organisations_new, vpv.startDate, vpv.endDate);
				keyMetrics.costCurrentTotal= getSummeKosten(vpv, timeZonesVPV, indexTotal);
				keyMetrics.costCurrentActual= getSummeKosten(vpv, timeZonesVPV, indexActual);
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

			if (allDeadlines && allDeadlines.length > 0){
				var timeKeyMetric = getTimeCompletionMetric(allDeadlines, vpv.timestamp);
				keyMetrics.timeCompletionCurrentActual = timeKeyMetric.timeCompletionCurrentActual;
				keyMetrics.timeCompletionBaseLastActual = timeKeyMetric.timeCompletionBaseLastActual;
				keyMetrics.timeCompletionCurrentTotal = timeKeyMetric.timeCompletionCurrentTotal;
				keyMetrics.timeCompletionBaseLastTotal = timeKeyMetric.timeCompletionBaseLastTotal;
			}

			if (allDeadlines && allDeadlines.length > 0){
				var timeDelayMetric = getTimeDelayOfDeadlinesMetric(allDeadlines, vpv.timestamp);
				keyMetrics.timeDelayFinished = timeDelayMetric.timeDelayFinished;
				keyMetrics.timeDelayUnFinished = timeDelayMetric.timeDelayUnFinished;
			}

			// look for the deliverables of pfv (take all)
			var allDeliverables = getAllDeliverables(pfv, hrchy_pfv, undefined);
			// update the deliverables with properties of vpv (only those, which are in the pfv too)
			allDeliverables = getAllDeliverables(vpv, hrchy_vpv, allDeliverables);

			if (allDeliverables && allDeliverables.length > 0){
				var deliverableKeyMetric = getDeliverableCompletionMetric(allDeliverables, vpv.timestamp);
				keyMetrics.deliverableCompletionBaseLastActual = deliverableKeyMetric.deliverableCompletionBaseLastActual;
				keyMetrics.deliverableCompletionBaseLastTotal = deliverableKeyMetric.deliverableCompletionBaseLastTotal;
				keyMetrics.deliverableCompletionCurrentActual = deliverableKeyMetric.deliverableCompletionCurrentActual;
				keyMetrics.deliverableCompletionCurrentTotal = deliverableKeyMetric.deliverableCompletionCurrentTotal;
			}
		}
	}

	var endCalc = new Date();
	logger4js.debug('Calculate KeyMetrics duration %s ms ', endCalc.getTime() - startCalc.getTime());

	return keyMetrics;
}

function calcCapacities(vpvs, pfvs, roleIdentifier, parentID, startDate, endDate, organisations, hierarchy, onlyPT) {
	const minStartDate = new Date('2015-01-01');
	const maxEndDate = new Date('2050-12-01');

	if (!vpvs || vpvs.length == 0 || !organisations || organisations.length == 0) {
		logger4js.warn('Calculate Capacities missing vpvs or organisation ');
		return [];
	}

	if (visboCmpDate(new Date(startDate), new Date(endDate)) > 0 ){
		logger4js.warn('Calculate Capacities startDate %s before endDate %s ', startDate, endDate);
		return [];
	}

	logger4js.debug('Calculate Capacities %s/%s', roleIdentifier, parentID);
	var startTimer = new Date();

	parentID = validateNumber(Number(parentID), false);
	if (parentID == 0){
		parentID = undefined;
	}

	startDate = validateDate(startDate,false);
	if (!startDate) {
		startDate = new Date();
		startDate.setMonth(startDate.getMonth() - 4);
		startDate.setDate(1);
		startDate.setHours(0, 0, 0, 0);
	}
	if (visboCmpDate(new Date(startDate), minStartDate) < 0){
		startDate = new Date(minStartDate);
		startDate.setDate(1);
		startDate.setHours(0, 0, 0, 0);
	}
	startDate = new Date(startDate);
	var startIndex = getColumnOfDate(startDate);

	endDate = validateDate(endDate,false);
	if (!endDate) {
		endDate = new Date();
		endDate.setMonth(endDate.getMonth() + 9);
		endDate.setDate(1);
		endDate.setHours(0, 0, 0, 0);
	}
	if (visboCmpDate(new Date(endDate), maxEndDate) > 0){
		endDate = new Date(maxEndDate);
		endDate.setDate(1);
		endDate.setHours(0, 0, 0, 0);
	}
	endDate = new Date(endDate);
	var endIndex = getColumnOfDate(endDate);

	// divide the complete time from startdate to enddate in parts of time, where in each part there is only one organisation valid
	logger4js.trace('divide the complete time from calcC_startdate to calcC_enddate in parts of time, where in each part there is only one organisation valid');
	var timeZones = splitInTimeZones(organisations, startDate, endDate);
	timeZones.forEach( tz => {
		let newOrga = convertOrganisation(tz.orga);
		tz.orga = newOrga;
	});

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

	var capaVPV = calcCapacityVPVs(newvpvs, roleIdentifier, parentID, startDate, endDate, timeZones, hierarchy);
	var capaPFV = [];
	var item;

	if (pfvs && pfvs.length > 0 && pfvs[0] !== null) {
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
		capaPFV = calcCapacityVPVs(newpfvs, roleIdentifier, parentID, startDate, endDate, timeZones, hierarchy);
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

function calcCapacitiesPerProject(vpvs, pfvs, roleIdentifier, parentID, startDate, endDate, organisations, onlyPT) {
	if (!vpvs || vpvs.length == 0 || !organisations || organisations.length == 0) {
		logger4js.warn('Calculate Capacities missing vpvs or organisation ');
		return [];
	}

	if (!startDate) {
		startDate = new Date();
		startDate.setMonth(startDate.getMonth() - 4);
		startDate.setDate(1);
		startDate.setHours(0, 0, 0, 0);
	}
	startDate = new Date(startDate);
	var startIndex = getColumnOfDate(startDate);

	if (!endDate) {
		endDate = new Date();
		endDate.setMonth(endDate.getMonth() + 9);
		endDate.setDate(1);
		endDate.setHours(0, 0, 0, 0);
	}
	endDate = new Date(endDate);
	var endIndex = getColumnOfDate(endDate);

	// divide the complete time from startdate to enddate in parts of time, where in each part there is only one organisation valid
	logger4js.trace('divide the complete time from calcC_startdate to calcC_enddate in parts of time, where in each part there is only one organisation valid');
	var timeZones = splitInTimeZones(organisations, startDate, endDate);
	timeZones.forEach( tz => {
		let newOrga = convertOrganisation(tz.orga);
		tz.orga = newOrga;
	});

	// reduce the amount of pfvs to the relevant ones in the time between startDate and endDate
	var newvpvs = [];
	for ( i = 0; vpvs && i < vpvs.length; i++) {
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
		var capaTempVPV = calcCapacityVPVs([vpv], roleIdentifier, parentID, startDate, endDate, timeZones, false);
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
			var capaTempVPV = calcCapacityVPVs([vpv], roleIdentifier, parentID, startDate, endDate, timeZones, false);
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

function calcCapacityVPVs(vpvs, roleIdentifier, parentID, startDate, endDate, timeZones, hierarchy) {

	var allCalcCapaValues = [];
	var allCalcCapaValuesIndexed = [];

	var roleID = '';

	// startCalc is defined for time-measuring
	var startCalc = new Date();

	var calcC_startDate = new Date(startDate);
	var calcC_startIndex = getColumnOfDate(calcC_startDate);
	var calcC_endDate = new Date(endDate);
	var calcC_endIndex = getColumnOfDate(calcC_endDate);
	var calcC_dauer = calcC_endIndex - calcC_startIndex + 1;


	var currentDate = new Date(calcC_startDate);
	logger4js.trace('Calculate Capacities and Cost of Role %s startDate %s ISO currentDate %s', roleID, calcC_startDate, currentDate.toISOString());
	currentDate.setDate(1);
	currentDate.setHours(0, 0, 0, 0);
	logger4js.trace('Calculate Capacities and Cost of Role currentDate %s ', currentDate.toISOString());

	if (vpvs.length <= 0 || calcC_dauer <= 0 ) {
		return 	allCalcCapaValuesIndexed;
	}
	// ur:17.03.2021
	// // divide the complete time from calcC_startdate to calcC_enddate in parts of time, where in each part there is only one organisation valid
	// logger4js.trace('divide the complete time from calcC_startdate to calcC_enddate in parts of time, where in each part there is only one organisation valid');
	// var timeZones = splitInTimeZones(organisations, calcC_startDate, calcC_endDate);

	var roleIDs = [];
	var allRoles = (timeZones && timeZones[timeZones.length - 1] && timeZones[timeZones.length - 1].orga
									&& timeZones[timeZones.length - 1].orga.value && timeZones[timeZones.length - 1].orga.value.allRoles) || [];
	var role = allRoles.find(item => item.uid == roleIdentifier);
	if (!role) {
		return allCalcCapaValuesIndexed;
	}
	roleIDs.push({uid: role.uid, roleName: role.name}); // Main role
	if (hierarchy) {
		if (role && role.subRoleIDs) {
			for (var j=0; j < role.subRoleIDs.length; j++) {
				var subrole = allRoles.find(item => item.uid == role.subRoleIDs[j].key);
				if (!subrole) {
					continue;
				}
				roleIDs.push({uid: subrole.uid, roleName: subrole.name}); // Main role
			}
		}
	}
	logger4js.debug('calculate for the role & subrole', JSON.stringify(roleIDs));

	for ( var roleIndex = 0; roleIndex < roleIDs.length; roleIndex++) {
		roleID = roleIDs[roleIndex].uid;
		var roleName = roleIDs[roleIndex].roleName;
		logger4js.debug('calculate for the different timeZones');
		for ( var tz = 0; timeZones && tz < timeZones.length; tz++) {
			var monthlyNeeds = [];
			// get Capacities for the different timeZones, in which always only one organisation is valid
			logger4js.debug('get Capacities for the different timeZones; timeZone %s - %s', timeZones[tz].startdate, timeZones[tz].enddate);

			monthlyNeeds = getCapacityFromTimeZone(vpvs, roleID, parentID, timeZones[tz]);
			if (monthlyNeeds) {
				var tzStartIndex = timeZones[tz].startIndex;
				var zoneDauer = timeZones[tz].endIndex - tzStartIndex + 1;
				currentDate = new Date (timeZones[tz].startdate);
				currentDate.setMonth(currentDate.getMonth());
				currentDate.setDate(1);
				currentDate.setHours(0, 0, 0, 0);

				// append the monthlyNeeds of the actual timezone at the result-Arry allCalcCapaValues
				for ( var i = 0 ; i < zoneDauer; i++){
					const currentIndex = currentDate.toISOString().concat('_', roleID);
					if (monthlyNeeds[i + tzStartIndex]) {
						allCalcCapaValues[currentIndex] = {
							'currentDate': currentDate.toISOString(),
							'roleID': roleID,
							'roleName': roleName,
							'actualCost_PT': monthlyNeeds[i + tzStartIndex].actCost_PT || 0,
							'plannedCost_PT': monthlyNeeds[i + tzStartIndex].plannedCost_PT || 0 ,
							'otherActivityCost_PT':monthlyNeeds[i + tzStartIndex].otherActivityCost_PT || 0 ,
							'internCapa_PT': monthlyNeeds[i + tzStartIndex].internCapa_PT ,
							'externCapa_PT': monthlyNeeds[i + tzStartIndex].externCapa_PT ,
							'actualCost': monthlyNeeds[i + tzStartIndex].actCost  || 0,
							'plannedCost': monthlyNeeds[i + tzStartIndex].plannedCost  || 0,
							'otherActivityCost':monthlyNeeds[i + tzStartIndex].otherActivityCost || 0 ,
							'internCapa': monthlyNeeds[i + tzStartIndex].internCapa  || 0,
							'externCapa': monthlyNeeds[i + tzStartIndex].externCapa  || 0
						};
					}
					currentDate.setMonth(currentDate.getMonth() + 1);
				}
			}
		}
	}
	var endCalc = new Date();
	logger4js.debug('Calculate Capacity Costs duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return allCalcCapaValues;
}


function splitInTimeZones(organisations, calcC_startDate, calcC_endDate) {
	var timeZones = [];
	var organisation_converted = {};

	if (!organisations || organisations.length <= 0 || !calcC_startDate || !calcC_endDate) {
		return timeZones;
	}

	// divide the complete time from calcC_startdate to calcC_enddate in parts of time, where in each part there is only one organisation valid
	var intervallStart = new Date(calcC_startDate);
	var intervallEnd = new Date(calcC_endDate);

	if (organisations.length === 1) {
		var timeZoneElem = {};
		// ur:210302 -organisation_converted = convertOrganisation(organisations[0]);
		organisation_converted = organisations[0];
		timeZoneElem.orga = organisation_converted;
		timeZoneElem.startdate = new Date(intervallStart);
		timeZoneElem.startIndex = getColumnOfDate(timeZoneElem.startdate);
		timeZoneElem.enddate = new Date (intervallEnd);
		timeZoneElem.endIndex = getColumnOfDate(timeZoneElem.enddate);
		timeZones.push(timeZoneElem);
	} else {
		// organisations are not sorted surely
		// sort them ascending
		organisations.sort(function(a, b) { return visboCmpDate(a.timestamp, b.timestamp); });
		// determine for all organisations the beginning on the first day of month of the timestamp
		for ( var o = 0;  o < organisations.length; o++) {
			organisations[o].timestamp.setDate(1);
			organisations[o].timestamp.setHours(0,0,0,0);
	}

		for ( o = 0; intervallStart && organisations && organisations[o] && o < organisations.length; o++) {
			timeZoneElem = {};
			if (organisations[o+1]) {
				if ( (intervallStart >= organisations[o].timestamp) && (intervallStart >= organisations[o+1].timestamp) ) { continue;}
				if (  (intervallStart < organisations[o+1].timestamp) ) {
					// prepare organisation: change the new modelling of capacities into the old version for calculation
					// ur:210302 -organisation_converted = convertOrganisation(organisations[0]);
					organisation_converted = organisations[o];
					timeZoneElem.orga = organisation_converted;
					timeZoneElem.startdate = new Date(intervallStart);
					timeZoneElem.startIndex = getColumnOfDate(timeZoneElem.startdate);
					if (intervallEnd >= organisations[o+1].timestamp) {
						timeZoneElem.enddate = organisations[o+1].timestamp;
						timeZoneElem.enddate.setMonth(organisations[o+1].timestamp.getMonth() - 1);
						timeZoneElem.endIndex = getColumnOfDate(timeZoneElem.enddate);
					} else {
						timeZoneElem.enddate = intervallEnd;
						timeZoneElem.enddate.setMonth(intervallEnd.getMonth() - 1);
						timeZoneElem.endIndex = getColumnOfDate(timeZoneElem.enddate);
					}
				} else { continue; }
			} else {
				// ur:210302 -organisation_converted = convertOrganisation(organisations[0]);
				organisation_converted = organisations[o];
				timeZoneElem.orga = organisation_converted;
				timeZoneElem.startdate = new Date(intervallStart);
				timeZoneElem.startIndex = getColumnOfDate(timeZoneElem.startdate);
				timeZoneElem.enddate = new Date(intervallEnd);
				timeZoneElem.endIndex = getColumnOfDate(timeZoneElem.enddate);
			}

			intervallStart = timeZoneElem.enddate;
			if ( intervallStart) { intervallStart.setMonth(intervallStart.getMonth() + 1); }
			timeZones.push(timeZoneElem);
		}
	}
	return timeZones;
}

function getCapacityFromTimeZone( vpvs, roleIdentifier, parentID, timeZone) {

	var roleID = null;
	var tz_organisation = timeZone.orga;
	var tz_startIndex = timeZone.startIndex;
	var tz_endIndex = timeZone.endIndex;
	var tz_dauer = tz_endIndex - tz_startIndex + 1;

	// prepare the tz_organisation for direct access to uid
	logger4js.trace('prepare organisation for direct access to uid');
	var allRoles = [];
	var allTeams = [];
	var allRoleNames = [];

	for ( var i = 0; tz_organisation && tz_organisation.value && tz_organisation.value.allRoles && i < tz_organisation.value.allRoles.length; i++) {
		allRoles[tz_organisation.value.allRoles[i].uid] = tz_organisation.value.allRoles[i];
		allRoleNames[tz_organisation.value.allRoles[i].name] = tz_organisation.value.allRoles[i];
		if (tz_organisation.value.allRoles[i].isTeam)	allTeams.push(tz_organisation.value.allRoles[i]);
	}
	if ( roleIdentifier ) {
		if (isNaN(parseInt(roleIdentifier) )) {
			if (allRoleNames && allRoleNames[roleIdentifier]) roleID = allRoleNames[roleIdentifier].uid || undefined;
		} else {
			roleID = parseInt(roleIdentifier);
		}
	}

	if (!roleIdentifier || roleIdentifier === '' && tz_organisation && tz_organisation.value&& allRoles.length > 0)  roleID = tz_organisation.value.allRoles[0].uid;

	logger4js.trace('find the roleID for the given roleName %s', roleIdentifier);

	if (roleIdentifier && allRoleNames && allRoleNames[roleIdentifier]) roleID = allRoleNames[roleIdentifier].uid || undefined;

	if (!roleID || !allRoles[roleID]) {
		// given roleIdentifier isn't defined in this organisation
		return undefined;

	}
	if (parentID && isNaN(parentID) && !allRoles[parentID]) {
		// given parent isn't defined in this organisation
		logger4js.warn('given parentID is not defined in this organisation roleID/parentID  %s/%s',  roleID, parentID);
		return undefined;
	}

	// getting roles, which are concerned/connected with roleID in the given organisation not regarding the teams
	var concerningRoles = getConcerningRoles(allRoles, allTeams, roleID, parentID);
	logger4js.debug('getting capacities for the related roleID/parentID given organisation %s/%s',  roleID, parentID);
	var tz_capaValues = getCapaValues(tz_startIndex, tz_dauer, concerningRoles, allRoles);

	var costValues = [];
	var costElem = {};

	for ( i = tz_startIndex ; i < tz_dauer + tz_startIndex; i++){
		costElem = {};
		costElem.internCapa = tz_capaValues[i - tz_startIndex].internCapa;
		costElem.internCapa_PT = tz_capaValues[i - tz_startIndex].internCapa_PT;
		costElem.externCapa = tz_capaValues[i - tz_startIndex].externCapa;
		costElem.externCapa_PT = tz_capaValues[i - tz_startIndex].externCapa_PT;
		costElem.actCost_PT = 0;
		costElem.actCost = 0;
		costElem.plannedCost_PT = 0;
		costElem.plannedCost = 0;
		costElem.otherActivityCost_PT = 0;
		costElem.otherActivityCost = 0;
		costValues[i] = costElem;
	}

	for ( i = 0; vpvs && i < vpvs.length; i++) {
		var vpv = vpvs[i];

		var vpvStartIndex = getColumnOfDate(vpv.startDate);
		var vpvEndIndex = getColumnOfDate(vpv.endDate);

		var intStart = Math.max(vpvStartIndex, tz_startIndex);
		var intEnd = Math.min(vpvEndIndex, tz_endIndex);


		logger4js.trace('Calculate Personal Cost of RoleID %s of Project Version %s start %s end %s organisation TS %s', roleID, vpv._id, vpv.startDate, vpv.endDate, tz_organisation.timestamp);

		var oneVPVcostValues = getRessourcenBedarfe(roleID, vpv, concerningRoles, allRoles, intStart, intEnd);


		intStart = Math.max(vpvStartIndex, tz_startIndex, intStart);
		intEnd = Math.min(vpvEndIndex, tz_endIndex, intEnd);

		for (var ci=intStart ; ci < intEnd+1; ci++) {
			costValues[ci].actCost_PT += oneVPVcostValues[ci].actCost_PT || 0;
			costValues[ci].plannedCost_PT += oneVPVcostValues[ci].plannedCost_PT || 0;
			costValues[ci].actCost += oneVPVcostValues[ci].actCost || 0;
			costValues[ci].plannedCost += oneVPVcostValues[ci].plannedCost || 0;
			costValues[ci].otherActivityCost_PT += oneVPVcostValues[ci].otherActivityCost_PT || 0;
			costValues[ci].otherActivityCost += oneVPVcostValues[ci].otherActivityCost || 0;

		}
	}
return costValues;
}


function getRessourcenBedarfe(roleID, vpv, concerningRoles, allRoles, startIndex, endIndex) {
	var costValues = [];
	var costElem = {};


	logger4js.trace('Calculate all RessourceBedarfe and Capacities of %s  ', vpv && vpv._id && roleID);

	if (vpv && roleID && concerningRoles){

		logger4js.debug('Calculate Personal Cost of RoleID %s of Project Version %s start %s end %s actualDataUntil %s', roleID, vpv._id, vpv.startDate, vpv.endDate, vpv.actualDataUntil);

		var vpvStartIndex = getColumnOfDate(vpv.startDate);
		var vpvEndIndex = getColumnOfDate(vpv.endDate);
		var dauer = vpvEndIndex - vpvStartIndex + 1;

		var actualDataUntil = vpv.actualDataUntil;
		var actualDataIndex = getColumnOfDate(actualDataUntil) + 1;

		for (var i=startIndex ; ( i < endIndex + 1) && ( i < dauer+vpvStartIndex ); i++){
			costElem = {};
			costElem.actCost_PT = 0;
			costElem.actCost = 0;
			costElem.plannedCost_PT = 0;
			costElem.plannedCost = 0;
			costElem.otherActivityCost_PT = 0;
			costElem.otherActivityCost = 0;
			costValues[i] = costElem;
		}

		if (!vpv || !vpv._id || dauer <= 0 || !vpv.AllPhases) {
			return costValues;
		}

		logger4js.trace('Convert vpv-Hierarchy to direct access for Project Version %s',  vpv._id);

		//var isTeam =  allRoles[roleID].isTeam ? true : false;
		var roleIDisTeam = concerningRoles[0].actRole.isTeam;
		var roleIDisTeamMember =  (concerningRoles[0].teamID != -1) && (allRoles[roleID].subRoleIDs.length <= 0);

		logger4js.trace('Combine Capacity Values for Project Version %s',  vpv._id);
		if (dauer > 0) {

			// Treatment, if the roleID is a orgaUnit, no parentID is given
			if (!roleIDisTeam && !roleIDisTeamMember){

				for (i = 0; concerningRoles && i< concerningRoles.length; i++) {
					var actRoleID = concerningRoles[i].actRole.uid;
					logger4js.trace('Calculate Intersect %s Role %s', i, actRoleID);
					var teamID = concerningRoles[i].teamID;
					// tagessatz of orga-unit
					var tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					// tagessatz of teamID
					if (teamID && teamID != -1) {
						tagessatz = allRoles[teamID] ? allRoles[teamID].tagessatz : tagessatz;
					}
					// tagessatz of person
					if (allRoles[actRoleID] && allRoles[actRoleID].subRoleIDs && allRoles[actRoleID].subRoleIDs.length <= 0) {
						tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					}

					logger4js.trace('Calculate Phases with ActRole %s Phases %s', actRoleID, vpv.AllPhases && vpv.AllPhases.length);
					for (var j= 0; vpv.AllPhases && j < vpv.AllPhases.length; j++) {
						var phase = vpv.AllPhases[j];
						if (!phase) {
							continue;
						}
						var phasenStart = vpvStartIndex + phase.relStart - 1;

						logger4js.trace('Calculate Phase %s Roles %s', i, phase.AllRoles.length);
						for (var k = 0; phase.AllRoles && k < phase.AllRoles.length ; k++) {
							if ((phase.AllRoles[k].RollenTyp == actRoleID)|| (phase.AllRoles[k].teamID == actRoleID)) {
								var role = phase.AllRoles[k];
								// logger4js.trace('Calculate Bedarf of Role %O', role.Bedarf);
								if (role &&  role.Bedarf) {
									var dimension = role.Bedarf.length;
									// for (var l = phasenStart; l < phasenStart + dimension; l++) {
									var maxStart = Math.max(phasenStart,startIndex);
									var minEnd = Math.min(phasenStart + dimension, dauer + vpvStartIndex, endIndex + 1);
									for (var l = (maxStart); l < minEnd ; l++) {
										// result in euro or in personal day
										// if costValues[l] is not set yet use 0
										if (l < actualDataIndex) {
											costValues[l].actCost = (costValues[l].actCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
											costValues[l].actCost_PT = (costValues[l].actCost_PT || 0) + role.Bedarf[l - phasenStart] ;
										} else {
											costValues[l].plannedCost = (costValues[l].plannedCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
											costValues[l].plannedCost_PT = (costValues[l].plannedCost_PT || 0) + role.Bedarf[l - phasenStart] ;
										}
									}
								}
							}
						}
					}
				}
			}

			// treatment if the given roleID is a fully defined team
			if (roleIDisTeam) {
				// add all needs with the choosen teamID
				actRoleID = roleID;
				logger4js.trace('Calculate Intersect %s Role %s', i, actRoleID);
				teamID = roleID;
				// tagessatz of orga-unit
				tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
				// tagessatz of teamID
				if (teamID && teamID != -1) {
					tagessatz = allRoles[teamID] ? allRoles[teamID].tagessatz : tagessatz;
				}
				// tagessatz of person
				if (allRoles[actRoleID] && allRoles[actRoleID].subRoleIDs && allRoles[actRoleID].subRoleIDs.length <= 0) {
					tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
				}

				logger4js.trace('Calculate Phases with ActRole %s Phases %s', actRoleID, vpv.AllPhases && vpv.AllPhases.length);
				for (j= 0; vpv.AllPhases && j < vpv.AllPhases.length; j++) {
					phase = vpv.AllPhases[j];
					if (!phase) {
						continue;
					}
					phasenStart = vpvStartIndex + phase.relStart - 1;

					logger4js.trace('Calculate Phase %s Roles %s', i, phase.AllRoles.length);
					for (k = 0; phase.AllRoles && k < phase.AllRoles.length ; k++) {
						if ((phase.AllRoles[k].RollenTyp == actRoleID)|| (phase.AllRoles[k].teamID == actRoleID)) {
							role = phase.AllRoles[k];
							// logger4js.trace('Calculate Bedarf of Role %O', role.Bedarf);
							if (role &&  role.Bedarf) {
								dimension = role.Bedarf.length;
								// for (var l = phasenStart; l < phasenStart + dimension; l++) {
								maxStart = Math.max(phasenStart,startIndex);
								minEnd = Math.min(phasenStart + dimension, dauer + vpvStartIndex, endIndex + 1);
								for ( l = (maxStart); l < minEnd ; l++) {
									// result in euro or in personal day
									// if costValues[l] is not set yet use 0
									if (l < actualDataIndex) {
										costValues[l].actCost = (costValues[l].actCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
										costValues[l].actCost_PT = (costValues[l].actCost_PT || 0) + role.Bedarf[l - phasenStart] ;
									} else {
										costValues[l].plannedCost = (costValues[l].plannedCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
										costValues[l].plannedCost_PT = (costValues[l].plannedCost_PT || 0) + role.Bedarf[l - phasenStart] ;
									}
								}
							}
						}
					}
				}

				// add all needs of the persons in the Team teamID, but not as this teamMember
				for (i = 1; concerningRoles && i< concerningRoles.length; i++) {
					actRoleID = concerningRoles[i].actRole.uid;
					logger4js.trace('Calculate Intersect %s Role %s', i, actRoleID);
					teamID = concerningRoles[i].teamID;
					// tagessatz of orga-unit
					tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					// tagessatz of teamID
					if (teamID && teamID != -1) {
						tagessatz = allRoles[teamID] ? allRoles[teamID].tagessatz : tagessatz;
					}
					// tagessatz of person
					if (allRoles[actRoleID] && allRoles[actRoleID].subRoleIDs && allRoles[actRoleID].subRoleIDs.length <= 0) {
						tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					}

					logger4js.trace('Calculate Phases with ActRole %s Phases %s', actRoleID, vpv.AllPhases && vpv.AllPhases.length);
					for ( j= 0; vpv.AllPhases && j < vpv.AllPhases.length; j++) {
						phase = vpv.AllPhases[j];
						if (!phase) {
							continue;
						}
						phasenStart = vpvStartIndex + phase.relStart - 1;

						logger4js.trace('Calculate Phase %s Roles %s', i, phase.AllRoles.length);
						for (k = 0; phase.AllRoles && k < phase.AllRoles.length ; k++) {
							if ((phase.AllRoles[k].RollenTyp == actRoleID) && (phase.AllRoles[k].teamID != teamID)) {
								role = phase.AllRoles[k];
								// logger4js.trace('Calculate Bedarf of Role %O', role.Bedarf);
								if (role &&  role.Bedarf) {
									dimension = role.Bedarf.length;
									// for (var l = phasenStart; l < phasenStart + dimension; l++) {
									maxStart = Math.max(phasenStart,startIndex);
									minEnd = Math.min(phasenStart + dimension, dauer + vpvStartIndex, endIndex + 1);
									for (l = (maxStart); l < minEnd ; l++) {
										// result in euro or in personal day
										// if costValues[l] is not set yet use 0
										if (l < actualDataIndex) {
											costValues[l].actCost = (costValues[l].actCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
											costValues[l].actCost_PT = (costValues[l].actCost_PT || 0) + role.Bedarf[l - phasenStart] ;
										} else {
											costValues[l].otherActivityCost = (costValues[l].otherActivityCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
											costValues[l].otherActivityCost_PT = (costValues[l].otherActivityCost_PT || 0) + role.Bedarf[l - phasenStart] ;
										}
									}
								}
							}

						}
					}
				}
			}

			// treatment if the given roleID is a TeamMember
			if (roleIDisTeamMember) {
				// add all needs of the person roleID as TeamMember  in the Team teamID
				for (i = 0; concerningRoles && i< concerningRoles.length; i++) {
					actRoleID = concerningRoles[i].actRole.uid;
					logger4js.trace('Calculate Intersect %s Role %s', i, actRoleID);
					teamID = concerningRoles[i].teamID;
					// tagessatz of orga-unit
					tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					// tagessatz of teamID
					if (teamID && teamID != -1) {
						tagessatz = allRoles[teamID] ? allRoles[teamID].tagessatz : tagessatz;
					}
					// tagessatz of person
					if (allRoles[actRoleID] && allRoles[actRoleID].subRoleIDs && allRoles[actRoleID].subRoleIDs.length <= 0) {
						tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					}

					logger4js.trace('Calculate Phases with ActRole %s Phases %s', actRoleID, vpv.AllPhases && vpv.AllPhases.length);
					for ( j= 0; vpv.AllPhases && j < vpv.AllPhases.length; j++) {
						phase = vpv.AllPhases[j];
						if (!phase) {
							continue;
						}
						phasenStart = vpvStartIndex + phase.relStart - 1;

						logger4js.trace('Calculate Phase %s Roles %s', i, phase.AllRoles.length);
						for (k = 0; phase.AllRoles && k < phase.AllRoles.length ; k++) {
							if ((phase.AllRoles[k].RollenTyp == actRoleID) && (phase.AllRoles[k].teamID != teamID)) {
								role = phase.AllRoles[k];
								// logger4js.trace('Calculate Bedarf of Role %O', role.Bedarf);
								if (role &&  role.Bedarf) {
									dimension = role.Bedarf.length;
									// for (var l = phasenStart; l < phasenStart + dimension; l++) {
									maxStart = Math.max(phasenStart,startIndex);
									minEnd = Math.min(phasenStart + dimension, dauer + vpvStartIndex, endIndex + 1);
									for (l = (maxStart); l < minEnd ; l++) {
										// result in euro or in personal day
										// if costValues[l] is not set yet use 0
										if (l < actualDataIndex) {
											costValues[l].actCost = (costValues[l].actCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
											costValues[l].actCost_PT = (costValues[l].actCost_PT || 0) + role.Bedarf[l - phasenStart] ;
										} else {
											costValues[l].otherActivityCost = (costValues[l].otherActivityCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
											costValues[l].otherActivityCost_PT = (costValues[l].otherActivityCost_PT || 0) + role.Bedarf[l - phasenStart] ;
										}
									}
								}
							}
						}
					}
				}
				// add all needs of the person in the Team teamID, as this teamMember
				for (i = 0; concerningRoles && i< concerningRoles.length; i++) {
					actRoleID = concerningRoles[i].actRole.uid;
					logger4js.trace('Calculate Intersect %s Role %s', i, actRoleID);
					teamID = concerningRoles[i].teamID;
					// tagessatz of orga-unit
					tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					// tagessatz of teamID
					if (teamID && teamID != -1) {
						tagessatz = allRoles[teamID] ? allRoles[teamID].tagessatz : tagessatz;
					}
					// tagessatz of person
					if (allRoles[actRoleID] && allRoles[actRoleID].subRoleIDs && allRoles[actRoleID].subRoleIDs.length <= 0) {
						tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
					}

					// ur:180.08.2021// var phasesWithActRole = intersectArray[i].phases;

					// calculate the needs of this Role with faktor always 1.0

					logger4js.trace('Calculate Phases with ActRole %s Phases %s', actRoleID, vpv.AllPhases && vpv.AllPhases.length);
					for ( j= 0; vpv.AllPhases && j < vpv.AllPhases.length; j++) {
						phase = vpv.AllPhases[j];
						if (!phase) {
							continue;
						}
						phasenStart = vpvStartIndex + phase.relStart - 1;

						logger4js.trace('Calculate Phase %s Roles %s', i, phase.AllRoles.length);
						for (k = 0; phase.AllRoles && k < phase.AllRoles.length ; k++) {
							if ((phase.AllRoles[k].RollenTyp == actRoleID) && (phase.AllRoles[k].teamID == teamID)) {
								role = phase.AllRoles[k];
								// logger4js.trace('Calculate Bedarf of Role %O', role.Bedarf);
								if (role &&  role.Bedarf) {
									dimension = role.Bedarf.length;
									// for (var l = phasenStart; l < phasenStart + dimension; l++) {
									maxStart = Math.max(phasenStart,startIndex);
									minEnd = Math.min(phasenStart + dimension, dauer + vpvStartIndex, endIndex + 1);
									for (l = (maxStart); l < minEnd ; l++) {
										// result in euro or in personal day
										// if costValues[l] is not set yet use 0
										if (l < actualDataIndex) {
											costValues[l].actCost = (costValues[l].actCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
											costValues[l].actCost_PT = (costValues[l].actCost_PT || 0) + role.Bedarf[l - phasenStart] ;
										} else {
											costValues[l].plannedCost = (costValues[l].plannedCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;
											costValues[l].plannedCost_PT = (costValues[l].plannedCost_PT || 0) + role.Bedarf[l - phasenStart] ;
										}
									}
								}
							}

						}
					}
				}
			}

		}
	}
	logger4js.trace('Finished getRessourcenBedarf Project Version %s',  vpv._id);
	return costValues;
}

function getCapaValues(startIndex, dauer, concerningRoles, allRoles) {
	var capaValues = [];
	var capaElem = {};

	for (var i=0 ; i < dauer; i++){
		capaElem = {};
		capaElem.internCapa_PT = 0;
		capaElem.externCapa_PT = 0;
		capaElem.internCapa = 0;
		capaElem.externCapa = 0;
		capaValues[i] = capaElem;
	}

	var concerningUIDs = [];

	// Calculate the Capacities of this Role
	for (var cR = 0; concerningRoles && cR < concerningRoles.length; cR++){
		var actRoleID = concerningRoles[cR].actRole.uid;
		var indexUID = concerningUIDs.indexOf(actRoleID);

		// UIDs should only be added once
		if ( indexUID >= 0 ) continue;

		// collect the UIDs, which were added to the capa
		concerningUIDs.push(actRoleID);

		// for the capa now always the faktor=1, since new skill management
		var faktor = 1;

		var tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
		var capaProRole = allRoles[actRoleID] ? allRoles[actRoleID].kapazitaet : 0;
		var roleIsExtern = allRoles[actRoleID] ? allRoles[actRoleID].isExternRole : 0;

		for ( var mon=0 ; mon < dauer; mon++){
			if (roleIsExtern) {
				capaValues[mon].externCapa_PT = (capaValues[mon].externCapa_PT || 0) + capaProRole[startIndex + mon + 1] * faktor;
				capaValues[mon].externCapa = (capaValues[mon].externCapa || 0) + capaProRole[startIndex + mon + 1] * tagessatz * faktor / 1000 ;
			} else {
				capaValues[mon].internCapa_PT = (capaValues[mon].internCapa_PT || 0) + capaProRole[startIndex + mon + 1] * faktor;
				capaValues[mon].internCapa = (capaValues[mon].internCapa || 0) + capaProRole[startIndex + mon + 1] * tagessatz * faktor / 1000 ;
			}
		}
	}
	return capaValues;
}


function buildRClists(vpv, team) {
	var rclists = {};
	var teamlists = {};

	if (vpv){
		// prepare rclists of this vpv
		for (var i = 0; i < vpv.AllPhases.length; i++) {
			var phase = vpv.AllPhases[i];

			if (!phase || !phase.name) {
				// skip empty phase
				continue;
			}
			for (var j = 0; phase && phase.AllRoles && j < phase.AllRoles.length; j++) {
				var role = phase.AllRoles[j];

				// rclists.addRP
				if (!rclists[role.RollenTyp]){
					var phasesPerTeam = [];
					var newRole = {};
					phasesPerTeam.push(phase.name);
					newRole[role.teamID] = phasesPerTeam;
					rclists[role.RollenTyp]=newRole;
				} else {
					newRole = rclists[role.RollenTyp];
					if (newRole[role.teamID]){
						phasesPerTeam = newRole[role.teamID];
						var indexPhase= phasesPerTeam.indexOf(phase.name);
						if (!(indexPhase >= 0)) {
							phasesPerTeam.push(phase.name);
							newRole[role.teamID] = phasesPerTeam;
							rclists[role.RollenTyp] = newRole;
						}
					} else {
						phasesPerTeam = [];
						phasesPerTeam.push(phase.name);
						newRole[role.teamID] = phasesPerTeam;
						rclists[role.RollenTyp]=newRole;
					}

				}
				// teamlists.addRP
				if (!teamlists[role.teamID]){
					phasesPerTeam = [];
					var newTeam = {};
					phasesPerTeam.push(phase.name);
					newTeam[role.RollenTyp] = phasesPerTeam;
					teamlists[role.teamID]=newTeam;
				} else {
					newTeam = teamlists[role.teamID];
					if (newTeam[role.RollenTyp]){
						phasesPerTeam = newTeam[role.RollenTyp];
						indexPhase= phasesPerTeam.indexOf(phase.name);
						if (!(indexPhase >= 0)) {
							phasesPerTeam.push(phase.name);
							newTeam[role.RollenTyp] = phasesPerTeam;
							teamlists[role.teamID] = newTeam;
						}
					} else {
						phasesPerTeam = [];
						phasesPerTeam.push(phase.name);
						newTeam[role.RollenTyp] = phasesPerTeam;
						teamlists[role.teamID]=newTeam;
					}
				}
			}
		}
	}
	if ( team ) {
		return teamlists;
	} else {
		return rclists;
	}
	// return rclists;
}



function getConcerningRoles(allRoles, allTeams, roleID, parentID) {
	var concerningRoles = [];
	var crElem = {};

	function findConcerningRoles(value, parentRole) {
		//value is the Id of one subrole
		var hroleID = value.key;
		crElem = {};
		crElem.actRole = allRoles[hroleID];
		crElem.teamID = -1;
		crElem.faktor = 1.0;

		if (parentRole.isTeam){
			for (var t = 0 ; t < crElem.actRole.teamIDs.length; t++) {
				var team = crElem.actRole.teamIDs[t];
				if (parentRole.uid != team.key) { continue; }
				crElem.teamID = team.key;
				crElem.faktor = team.value;
			}
		}
		concerningRoles.push(crElem);

		var newParent = crElem.actRole;
		if (newParent && newParent.subRoleIDs.length > 0){
			var shroles = newParent.subRoleIDs;
			for (var sr = 0; shroles && sr < shroles.length; sr++) {
				findConcerningRoles(shroles[sr], newParent);
			}
		}
	}
	// find all roles corresponding to this one roleID all over the organisation - result in concerningRoles
	if (roleID || roleID != ''){
		var actRole = allRoles[roleID];
		crElem = {};
		crElem.actRole = allRoles[roleID];
		crElem.teamID = -1;
		if (allRoles[parentID] && allRoles[parentID].isTeam) 	crElem.teamID = parentID;
		crElem.faktor = 1;
		concerningRoles.push(crElem);

		if (actRole) {
			var subRoles = actRole.subRoleIDs;
			for (var sr = 0; subRoles && sr < subRoles.length; sr++) {
				findConcerningRoles(subRoles[sr], actRole);
			}
		}
	}

	return concerningRoles;
}


// find summary Roles
function getSummaryRoles(allRoles, roleID) {
	var summaryRoles = [];

	function findSummaryRoles(value) {
		//value is the Id of one subrole
		var hroleID = value.key;
		var hrole = allRoles[hroleID];
		if (hrole.subRoleIDs.length > 0){
			summaryRoles[hroleID] = hrole;
			var shroles = hrole.subRoleIDs;
			shroles.forEach(findSummaryRoles);
		}
	}

	// all summary roles
	if ((roleID === undefined || roleID === '') && allRoles) {
		var i = 0;
		for (i=0; allRoles &&  i <= allRoles.length; i++ ){
			var hrole = allRoles[i];
			if (hrole && hrole.subRoleIDs.length > 0 ) summaryRoles[allRoles[i].uid] = allRoles[i];
		}
		return summaryRoles;
	}

	// only summary roles that are children of the role roleID
	if (roleID && allRoles){
		var role = allRoles[roleID];
		if (role.subRoleIDs && role.subRoleIDs.length > 0) {
			var subRoles = role.subRoleIDs;
			if (subRoles.length > 0 ){
				summaryRoles[role.uid] = role;
				subRoles.forEach(findSummaryRoles);
			}

		}
		return summaryRoles;
	}
	return summaryRoles;
}

function getParentOfRole (roleID, allRoles, sumRoles) {
	var parentRole = undefined;
	if (allRoles[roleID]) {

		var notFound = true;
		for (var k=0; sumRoles && k < sumRoles.length;k++){
			// check only roles, which are not isTeam or isTeamParent
			var hrole = sumRoles[k];
			if (hrole)	{
				for( var i = 0; notFound && hrole && hrole.subRoleIDs && i < hrole.subRoleIDs.length; i++ ){
					if ( hrole.subRoleIDs[i] && hrole.subRoleIDs[i].key == roleID) {
						parentRole = hrole;
						notFound = false;
					}
				}
			}
		}
	}
	return parentRole;
}

function buildTopNodes(allRoles) {
	var topLevelNodes = [];
	var topLevel = [];
	var i = 1;

	// find all summaryRoles
	var sumRoles = getSummaryRoles(allRoles, '');

	while (i <= allRoles.length){
		var currentRole = allRoles[i];
		if (currentRole) {
			var parent = getParentOfRole(currentRole.uid, allRoles, sumRoles);
			if (!parent && !topLevel[currentRole.uid]) {
				topLevel[currentRole.uid] = currentRole;
				topLevelNodes.push(currentRole);
			}
		}
		i++;
	}
	return topLevelNodes;
}

// function getTeamOfSummaryRole(allTeams, allRoles){
// 	var virtuals = undefined;
//
// 	for (var j=0; allTeams && j < allTeams.length; j++) {
// 		var oneTeam = allTeams[j];
// 		if (oneTeam) {
// 			var isVirtual = true;
// 			var k = 0;
// 			var vglID = undefined;
// 			while (k < oneTeam.subRoleIDs.length){
// 				var currentRole = oneTeam.subRoleIDs[k];
// 				if (currentRole) {
// 					var parent = getParentOfRole(currentRole.key, allRoles);
// 					// parent is role
// 					// look, if the other team-members includes to this parent as well
// 					if (parent && !parent.isTeam) {
// 						if (k == 0)  {
// 							vglID = parent.uid;
// 						} else {
// 							if (vglID != parent.uid) {
// 								isVirtual = false;
// 								break;
// 							}
// 						}
// 						k++;
// 					} else {
// 						isVirtual = false;
// 						break;
// 					}
// 				}
// 			}
// 			virtuals = [];
// 			virtuals[oneTeam.uid] = isVirtual;
// 		}
// 	}
// 	return virtuals;
// }


function convertOrganisation(organisation_new) {

	var organisation = undefined;
	if ( !organisation_new ) {
		return;
	}
	var startCalc = new Date();
	logger4js.debug('Change the new organisation in the old definition with an capacity array of 240 months');
	organisation = organisation_new;
	var allRoles = [];
	for ( var i = 0; organisation_new && organisation_new.value && organisation_new.value.allRoles && i < organisation_new.value.allRoles.length; i++) {
		var capa_new = [];
		var actrole = organisation_new.value.allRoles[i];
		// initialise the new array with the default capacity except the first element.
		capa_new[0] = 0;
		for ( var j = 1; j < 240; j++) {
			capa_new.push(actrole.defaultKapa);
		}
		// get the index of the startOfCal, because the array kapazität begins with this month since beginning of
		if (actrole.startOfCal) {
			var sOC_date = new Date(actrole.startOfCal);
			var indexOfstartOfCal = getColumnOfDate(sOC_date);
			if (indexOfstartOfCal >= 0) {
				// fill the array with the capacities != defaultKapa beginning with index 1 not 0
				for ( var ic = 1 + indexOfstartOfCal; ic >= 0 && ic <= 240 && actrole.kapazitaet && ic <= actrole.kapazitaet.length + indexOfstartOfCal-1; ic++) {
					capa_new[ic] = actrole.kapazitaet[ic - indexOfstartOfCal];
				}
			}
		}
		allRoles[i] = actrole;
		allRoles[i].kapazitaet = capa_new;
	}
	organisation.value.allRoles = allRoles;
	var endCalc = new Date();
	logger4js.debug('Convert Organisation duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return organisation;


}
function buildOrgaList (orga) {
	var organisation = [];
	var organisationItem = {};
	var aggreID = undefined;
	for (let i = 0; orga.value.allRoles && i < orga.value.allRoles.length; i++) {
		const role = orga.value.allRoles[i];
		const id = role.uid;
		if (!organisation[id]) {
			organisationItem = {};
			organisation[id] = organisationItem;
			organisation[id].uid = id;
			organisation[id].calcid = id;
			organisation[id].pid = undefined;
		}
		organisation[id].name = role.name;
		organisation[id].isExternRole = role.isExternRole;
		organisation[id].defaultKapa = role.defaultKapa;
		organisation[id].tagessatz = role.tagessatzIntern;
		organisation[id].employeeNr = role.employeeNr;
		organisation[id].defaultDayCapa = role.defaultDayCapa;
		if (role.entryDate > '0001-01-01T00:00:00Z') {
			organisation[id].entryDate = role.entryDate;
		}
		if (role.exitDate < '2200-11-30T23:00:00Z') {
			organisation[id].exitDate = role.exitDate;
		}
		organisation[id].aliases = role.aliases;
		organisation[id].isAggregationRole = role.isAggregationRole;
		if (role.isAggregationRole){
			aggreID = id;
			organisation[id].aggreID = aggreID;
		}
		organisation[id].isSummaryRole = role.isSummaryRole;
		organisation[id].isActDataRelevant = role.isActDataRelevant;

		// this.log(`Add Orga Unit ${id} ${role.name} Children ${role.subRoleIDs.length}`);
		if (role.isTeam) {
			logger4js.info('Skip Handling of Team Members');
			organisation[id].type = 2;
			organisation[id].isTeam = true;
		} else {
			organisation[id].type = 1;
		}
		// role is a summary role
		if (role.isSummaryRole || role.subRoleIDs.length > 0) {
			organisation[id].sumRole = true;
		} else {
			organisation[id].sumRole = false;
		}
		for (let j = 0; j < role.subRoleIDs.length; j++) {
			const index = Number(role.subRoleIDs[j].key);
			if (index < 0) {
				logger4js.error(`Inconsistent Org Structure Role ${id} SubRole ${role.subRoleIDs[j].key}`);
				// something wrong with the numbering
				break;
			}
			if (!organisation[index]) {
				// added by subrole
				organisationItem = {};
				organisation[index] = organisationItem;
				organisation[index].uid = index;
				organisation[index].calcid = index;
			} else {
				logger4js.debug(`SubRole already exists ${id} SubRole ${index}`);
			}
			if (!organisation[index].pid) {
				organisation[index].pid = id;
			}
			if (!organisation[index].aggreID) {
				organisation[index].aggreID = organisation[role.uid] && organisation[role.uid].aggreID;
			}
		}
	}


      // build team members Information by duplicating users with their percentage
      let maxid = 0;
      orga.value.allRoles.forEach(element => { if (element.uid > maxid) maxid = element.uid; } );
      logger4js.trace(`MaxID ${maxid}`);
      for (let i = 0; i < orga.value.allRoles.length; i++) {
        const role = orga.value.allRoles[i];
        if (role.isTeam && role.subRoleIDs && role.subRoleIDs.length > 0) {
          for (let j = 0; j < role.subRoleIDs.length; j++) {
            const index = role.subRoleIDs[j].key;
            if (!organisation[index] || organisation[index].isTeam) {
              // nothing to do
              continue;
            }
            const userRole = organisation[index];
            // now it is a user, add a new entry
			maxid += 1;
			organisationItem = {};
            organisation[maxid] = organisationItem;
            organisation[maxid].uid = index;
            organisation[maxid].calcid = maxid;
            organisation[maxid].type = 2;
            organisation[maxid].pid = role.uid;
            organisation[maxid].name = userRole.name;
            organisation[maxid].parent = role.name;
            if (userRole.employeeNr) { organisation[maxid].employeeNr = userRole.employeeNr; }
            if (userRole.isExternRole) { organisation[maxid].isExternRole = userRole.isExternRole; }
            if (userRole.defaultDayCapa >= 0) { organisation[maxid].defaultDayCapa = userRole.defaultDayCapa; }
            if (userRole.defaultKapa >= 0) { organisation[maxid].defaultKapa = userRole.defaultKapa; }
            if (userRole.tagessatz >= 0) { organisation[maxid].tagessatz = userRole.tagessatz; }
            if (userRole.entryDate) { organisation[maxid].entryDate = userRole.entryDate; }
            if (userRole.exitDate) { organisation[maxid].exitDate = userRole.exitDate; }
            if (userRole.aliases) { organisation[maxid].aliases = userRole.aliases; }
            organisation[maxid].percent = Number(role.subRoleIDs[j].value) || 0;
          }
        }
       }
	return organisation;
}


function cleanupRestrictedVersion(vpv) {
	if (!vpv) return;
	vpv.customDblFields = undefined;
	vpv.customStringFields = undefined;
	vpv.Risiko = undefined;
	vpv.StrategicFit = undefined;
	vpv.actualDataUntil = undefined;
	vpv.Erloes = undefined;
	vpv.leadPerson = undefined;
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
function checkUIDs(newOrga, oldOrga) {
	logger4js.debug('checkUIDs: Are all uids of the oldOrga in the newOrga as well? ', newOrga && newOrga.allRoles && newOrga.allRoles.length, oldOrga && oldOrga.allRoles && oldOrga.allRoles.length);
	var result = true;
	var i = 0;

	if (!oldOrga || !newOrga) {
		logger4js.warn('Error: either the new organisation or the old organisation or both are undefined');
		return false;
	}
	if ((oldOrga.allCosts.length > newOrga.allCosts.length)) {
		logger4js.warn('Error: more old costs (%s) than new costs (%s) are in the organisation', oldOrga.allCosts.length, newOrga.allCosts.length);
		result = false;
	}

	if ((oldOrga.allRoles.length > newOrga.allRoles.length)){
		logger4js.warn('Error: more old roles (%s) than new roles (%s) in the organisation', oldOrga.allRoles.length, newOrga.allRoles.length);
		result = false;
	}

	// check all UIDs of roles - they all have to exist in the newOrga as well
	var allNewRoles = [];
	for ( i = 0; newOrga && newOrga.allRoles && i < newOrga.allRoles.length; i++) {
		allNewRoles[newOrga.allRoles[i].uid] = newOrga.allRoles[i];
	}
	var resultRoles = true;
	for ( i = 0; oldOrga &&  oldOrga.allRoles && i < oldOrga.allRoles.length; i++) {
		var thisRole = oldOrga.allRoles[i];
		if (!(thisRole && allNewRoles && allNewRoles[thisRole.uid] )) {
			logger4js.warn('Error: Role-UID ( %s - %s) is missing in newOrga', thisRole.uid, thisRole.name);
			resultRoles = resultRoles && false;
		}
	}
	if (resultRoles) {
		logger4js.debug('allRoles (%s) of the oldOrga are included in the newOrga' , newOrga.allRoles.length);
	}

	// check all UIDs of costs - they all have to exist in the newOrga as well
	var allNewCosts = [];
	for ( i = 0;  newOrga.allCosts && i < newOrga.allCosts.length; i++) {
		allNewCosts[newOrga.allCosts[i].uid] = newOrga.allCosts[i];
	}
	var resultCosts = true;
	for ( i = 0; oldOrga && oldOrga.allCosts && i < oldOrga.allCosts.length; i++) {
		var thisCost = oldOrga.allCosts[i];
		if (!(thisCost && allNewCosts && allNewCosts[thisCost.uid] )) {
			logger4js.warn('Error: Cost-UID ( %s - %s) is missing in newOrga', thisCost.uid, thisCost.name);
			resultCosts = resultCosts && false;
		}
	}
	if ( resultCosts ) {
		logger4js.debug('allCosts (%s) of the oldOrga are included in the newOrga' , newOrga.allCosts.length);
	}

	result = result && resultCosts && resultRoles;
	return result;
}

function verifyOrganisation(newOrga, oldOrga) {
	// updates newOrga if possible and returns true/false if the orga could be used
	// newOrga is the pure Orga Value
	// oldOrga is the full setting including timestamp, vcid, ...
	logger4js.debug('verify Organisation ', newOrga , oldOrga && oldOrga.name && oldOrga.timestamp && oldOrga.value.validFrom);
	var result = true;
	if ( newOrga && oldOrga && oldOrga.value ) {
		var doldO = validateDate(oldOrga.timestamp,false);
		var dnewO = validateDate(newOrga.validFrom,false);
		if ( dnewO < doldO ) {
			result = false;
			return result;
		}
		logger4js.debug('newOrga and oldOrga are given and there timestamps are convenient!', doldO , dnewO);
		result =  checkUIDs(newOrga, oldOrga.value);
	}

	logger4js.debug('Verification of the new organisation:  ', result);
	return result;
}

function convertVPV(oldVPV, oldPFV, orga) {

	// this function converts an oldVPV to a newVPV and returns it to the caller
	// if an orga is delivered all individual roles will be replaced by the parent orga unit
	// if an oldPFV is delivered, the newVPV is squeezed to the Phases/Deadlines&Deliveries from the oldPFV

	logger4js.debug('convertVPV:  ', oldVPV._id, oldPFV != undefined, orga != undefined);

	var newPFV = new VisboProjectVersion();

	// check the existence of the orga
	// if ( !orga || orga.length < 1 ) {
	// 	logger4js.debug('creation of new PFV is going wrong because of no valid orga');
	// 	return undefined;
	// }

	if (orga && orga.length > 0) {	// convert the newest organisation

		// it exists the oldVPV and at least one organisation
		// find the newest organisation - maxIndex
		var maxTimestamp = new Date(0);
		var maxIndex = 0;
		for ( var i = 0; orga && i < orga.length; i++) {
			var oTimestamp = new Date(orga[i].timestamp);
			if ( oTimestamp > maxTimestamp) {
				maxIndex = i;
				maxTimestamp = orga[i].timestamp;
			}
		}
		var actOrga = convertOrganisation(orga[maxIndex]);
		var orgalist = buildOrgaList(actOrga);
		logger4js.debug('generate new PFV %s out of VPV %s , actOrga %s ', oldPFV && oldPFV.name, oldVPV && oldVPV.name + oldVPV.variantName , actOrga && actOrga.timestamp);
	}

	// check the existence of oldVPV, which will be the base of the newPFV
	if ( !oldVPV ) {
		logger4js.debug('creation of new PFV is going wrong because of no valid old VPV');
		return undefined;
	} else {
		// variable for the persCost of the oldVPV
		var allPersCostVPV = 0;

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
		newPFV.leadPerson = oldVPV.leadPerson;
		newPFV.startDate = oldVPV.startDate;
		newPFV.endDate = oldVPV.endDate;
		newPFV.earliestStart = oldVPV.earliestStart;
		newPFV.earliestStartDate = oldVPV.earliestStartDate;
		newPFV.latestStart = oldVPV.latestStart;
		newPFV.latestStartDate = oldVPV.latestStartDate;
		newPFV.vpStatus = oldVPV.vpStatus;
		newPFV.ampelStatus = oldVPV.ampelStatus;
		newPFV.ampelErlaeuterung = oldVPV.ampelErlaeuterung;
		newPFV.farbe = oldVPV.farbe;
		newPFV.Schrift = oldVPV.Schrift;
		newPFV.Schriftfarbe = oldVPV.Schriftfarbe;
		newPFV.VorlagenName = oldVPV.VorlagenName;
		newPFV.Dauer = oldVPV.Dauer;
		newPFV.hierarchy = oldVPV.hierarchy;
		newPFV.volumen = oldVPV.volumen;
		newPFV.complexity = oldVPV.complexity;
		newPFV.description = oldVPV.description;
		newPFV.businessUnit = oldVPV.businessUnit;

		// newPFV.AllPhases have to be created new ones	and the ressources will be aggregated to sumRoles
		var newpfvAllPhases = [];
		for ( i = 0; oldVPV && oldVPV.AllPhases && i < oldVPV.AllPhases.length ; i++){
			var onePhase = {};
			var phase = oldVPV.AllPhases[i];

			if (orga && orga.length > 0 && orgalist) {
				if (i == 0 ) {
					allPersCostVPV = getAllPersonalKosten(oldVPV, actOrga);
				}
				logger4js.debug('aggregate allRoles of the one phase %s in the given VPV and the given orga %s to generate a newPFV ', phase.nameID, actOrga.name);
				onePhase.AllRoles  = aggregateRoles(phase, orgalist);
			} else {
				onePhase.AllRoles = phase.AllRoles;
			}

			var newAllCosts = [];
			for ( var ic = 0; phase && phase.AllCosts && ic < phase.AllCosts.length; ic++){
				var oneCost = {};
				oneCost.KostenTyp = phase.AllCosts[ic].KostenTyp;
				oneCost.name = phase.AllCosts[ic].name;
				oneCost.farbe = phase.AllCosts[ic].farbe;
				oneCost.Bedarf = phase.AllCosts[ic].Bedarf;
				newAllCosts.push(oneCost);
			}
			onePhase.AllCosts = newAllCosts;

			var newAllResults = [];
			for ( var ires = 0; phase && phase.AllResults && ires < phase.AllResults.length; ires++){
				var oneResult = {};
				var milestone = phase.AllResults[ires];
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
				oneResult.penalty = milestone.penalty ;
				var newmsdeliverables = [];
				for (var id = 0;  milestone && milestone.deliverables && id < milestone.deliverables.length; id++){
					newmsdeliverables.push(milestone.deliverables[id]);
				}
				oneResult.deliverables = newmsdeliverables;
				newAllResults.push(oneResult);
			}
			onePhase.AllResults = newAllResults;

			// AllBewertungen keep as they are
			onePhase.AllBewertungen = phase.AllBewertungen;

			var newdeliverables = [];
			for ( id = 0;  phase && phase.deliverables && id < phase.deliverables.length; id++){
				newdeliverables.push(phase.deliverables[id]);
			}
			onePhase.deliverables = newdeliverables;

			onePhase.percentDone= phase.percentDone;
			onePhase.invoice= phase.invoice;
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
			onePhase.farbe= phase.farbe;
			onePhase.shortName= phase.shortName;
			onePhase.originalName= phase.originalName;
			onePhase.appearance= phase.appearance;
			newpfvAllPhases.push(onePhase);
		}
		newPFV.AllPhases = newpfvAllPhases;
	}

	logger4js.debug('newPFV now with aggregated resources');

	if ( oldVPV && oldPFV  ) {
		// oldVPV is to be squeezed to the deadlines and deliveries of the oldPFV
		logger4js.debug('generate a newPFV based on the given VPV; deadlines and deliveries reduced to the same as in the oldPFV');

		newPFV = checkAndChangeDeliverables(oldVPV, oldPFV, newPFV);
		newPFV = checkAndChangeDeadlines(oldVPV, oldPFV, newPFV);
		newPFV = createIndices(newPFV);

		//var correct = ensureValidVPV(newPFV);
	}

	logger4js.debug('check the cost of VPV and newPFV - they have to be equal');
	// var allPersCostVPV = getAllPersonalKosten(oldVPV, actOrga);
	// var allPersCost = getAllPersonalKosten(newPFV, actOrga);
	// var result = true;
	// var sumVPV = 0.0;
	// var sumPFV = 0.0;
	// for (var c=0; allPersCost && c < allPersCost.length; c++){
	// 	result = result && (allPersCost[c] == allPersCostVPV[c]);
	// 	sumVPV = sumVPV + allPersCostVPV[c];
	// 	sumPFV = sumPFV + allPersCost[c];
	// }
	logger4js.debug('creation of a new PFV based on a special VPV:  ', newPFV);

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
	logger4js.debug('remove the phases in remPhaseList AllPhases');
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
						logger4js.warn('phaseName %s is not included in the hierarchy of newVPV', phase.AllResults[j].name)
					}
				}
			} else {
				logger4js.warn('phaseName %s is not included in the hierarchy of newVPV', phaseName)
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

	logger4js.debug('Delete one Milestone from Phase of VPV');
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
	logger4js.debug('Delete one Milestone from hierarchy of VPV');
	var vpvHrchyNodes = newPFV.hierarchy.allNodes;
	newPFV.hierarchy.allNodes = deleteElemIDFromHrchy(hrchy_vpv, vpvHrchyNodes, elemID);
	return newPFV;
}

function deletePhaseFromVPV(hrchy_vpv, newPFV, elem) {
	if ( !hrchy_vpv || !newPFV || !elem) {
		return newPFV;
	}
	logger4js.debug('Delete the phase %s from VPV and if there are milestones in the phase, put them in the phase´s parent', elem.nameID);
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

	logger4js.debug('take the needs of the phase an add them into the parentPhase');

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

	logger4js.debug('Delete one elemID from hierarchy of VPV');

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

	logger4js.debug('Move the needs from phase to its parent');

	logger4js.debug('Check startdates and enddates of the phase and the parent phase');
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
			for ( var n = 0; n < role.Bedarf.length || n < parentNeeds.length; n++){
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

	logger4js.debug('Move the costss from phase to its parent');

	logger4js.debug('Check startdates and enddates of the phase and the parent phase');
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
			for ( var n = 0; n < cost.Bedarf.length || n < parentCosts.length; n++){
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

		if (roleSett &&  roleSett.sumRole && !roleSett.aggreID) {
			oneRole.RollenTyp = role.RollenTyp;
			oneRole.teamID = role.teamID;
			oneRole.Bedarf = role.Bedarf;
			// oneRole.name = role.name;
			// oneRole.farbe = role.farbe;
			// oneRole.startkapa = role.startkapa;
			// oneRole.tagessatzIntern = role.tagessatzIntern;
			// oneRole.isCalculated = role.isCalculated;
			newAllRoles.push(oneRole);
			continue;
		}

		if (roleSett &&  roleSett.sumRole && (roleSett.aggreID == role.RollenTyp)) {
			oneRole.RollenTyp = role.RollenTyp;
			oneRole.teamID = role.teamID;
			oneRole.Bedarf = role.Bedarf;
			// oneRole.name = role.name;
			// oneRole.farbe = role.farbe;
			// oneRole.startkapa = role.startkapa;
			// oneRole.tagessatzIntern = role.tagessatzIntern;
			// oneRole.isCalculated = role.isCalculated;
			newAllRoles.push(oneRole);
			continue;
		}

		if (roleSett && roleSett.aggreID){
			oneRole.RollenTyp = roleSett.aggreID;
			oneRole.teamID = role.teamID;
			// oneRole.name = roleSett.name;
			// oneRole.farbe = role.farbe;
			// oneRole.startkapa = role.startkapa;
			// oneRole.tagessatzIntern = role.tagessatzIntern;
		}
		// there is no aggregation role defined; the needs will be added to the parentID
		if (roleSett && !roleSett.aggreID && !roleSett.sumRole) {
			oneRole.RollenTyp = roleSett.pid;
			oneRole.teamID = role.teamID;
			// oneRole.name = roleSett.name;
			// oneRole.farbe = role.farbe;
			// oneRole.startkapa = role.startkapa;
			// oneRole.tagessatzIntern = role.tagessatzIntern;
		}

		if (( role.teamID === -1 ) || ( !role.teamID)) {
			// Badarf has to be adopted in € according to the defaultDayCost of the role
			// therefore it will be considered the relation between tagessatz of each person versus the tagessatz of the summaryRole
			// and the PT will be calculated in the same relation.
			oneRole.Bedarf = [];
			var actTagessatz = roleSett.tagessatz;
			var newTagessatz = orgalist && orgalist[oneRole.RollenTyp] && orgalist[oneRole.RollenTyp].tagessatz;
			var ptFaktor = (newTagessatz && newTagessatz !== 0) ? actTagessatz/newTagessatz : 1;
			for (var ib = 0; role && ib < role.Bedarf.length; ib++) {
				oneRole.Bedarf.push(role.Bedarf[ib] * ptFaktor);
			}
		} else {
			// the needs for teams are always calculated with the tagessatz of the team
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
	//console.log(groupedRoles);

	// make an array of the grouped roles
	const arrayOfGroupedRoles = Object.entries(groupedRoles);
	//console.log(arrayOfGroupedRoles);

	// sum the needs of the groupedRoles
	var resultNewRoles = [];
	if (!arrayOfGroupedRoles || arrayOfGroupedRoles.length <= 0)	{
		return resultNewRoles;
	}
	for (var iarr= 0; arrayOfGroupedRoles && iarr < arrayOfGroupedRoles.length; iarr++) {
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

	let anzDaysPMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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

			var i;
			for (i = 1; i < arLength - 1; i++) {
				arResult.push(arSum * fractionX);
			}

			arResult.push(arSum * fractionN);
	}

	// let chckSum = arResult.reduce(sumOF);

	return arResult;
}

function calcNewBedarfe(oldPhStartDate, oldPhEndDate, newPhStartDate, newPhEndDate, oldArray, scaleFactor, separatorIndex) {
	// function does calculate a new Array, length is defined by columns(newStartDate), columns(newEndDate)
	// if separatorIndex is given, function does keep all values before the separatorIndex unchanged
	// only values starting with separatorIndex are changed according scaleFactor
	// if similarCharacteristics then the distributionof values over the various months is maintained


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
		//ar2 = calcPhArValues(newPhStartDate, newPhEndDate, arSum*scaleFactor);
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
	// C4 (stop criterium) : is no Milestone-Date earlier than parent-phase start and not later than parent phase endDate ?
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
	let startOfCalendar = new Date ('2015-01-01');

	// return true;

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
			enforceHealing = false;
		}
	}

	// variable criterias is a array of boolean values, indicating which validity criterias are fulfilled / not fulfilled
	// all criterias which are violated but can be healed, will be healed, and it will be documented in the logger.warn
	// all criterias which are stop criterias will lead to return false
	let criterias = [];

	let projectDurationInDays = diffDays(myVPV.endDate, myVPV.startDate) + 1;

	//
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

	//
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

	//
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

	//
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

	//
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

		//
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

		//
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

			//
			// Criterium
			// checks whether all elements of an array are >= 0
			let c6tmp = (role.Bedarf && role.Bedarf.map(value => value >= 0).reduce((accumulator, currentValue) => accumulator && currentValue));
			c6 = c6 && c6tmp;
			if (!c6tmp) {
				logger4js.warn('ensureValidVPV severe violation C6: Role Array with negative values (vpvId: %s, phase: %s, RoleId: %s) ',
				myVPV._id, phase.name, role.RollenTyp);
			}
		});

		phase.AllCosts.forEach(cost => {

			//
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

			//
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

			//
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

			//
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

			//
			// Criterium c12
			let c12tmp = !(myHrchy[result.name] === undefined);
			c12 = c12 && c12tmp;
			if (!c12tmp) {
				logger4js.warn('ensureValidVPV severe violation C12: Milestone not in hierarchy: (vpvId: %s, phase: %s, milestone-Name: %s)', myVPV._id, phase.name, result.name);
			}
			// c12 = c12 && !(myHrchy[result.name] === undefined);

		});

		if (!(phase.name == rootPhaseName)) {
			// check auf rootPhaseName ist bereits in c1 abgeprüft ..

			//
			// Criterium
			let c12tmp = !(myHrchy[phase.name] === undefined);
			c12 = c12 && c12tmp;
			if (!c12tmp) {
				logger4js.warn('ensureValidVPV severe violation C12: Phase not in hierarchy: (vpvId: %s, phase-Name: %s) ', myVPV._id, phase.name);
			}
		}


	});

	//
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

		newVPV.actualDataUntil = new Date(scaleFromDate);
	} else {
		if (oldVPV.actualDataUntil && newVPV.actualDataUntil) {
			// there was given a actualDataUntil and a scaleFromDate 
			if (diffDays(oldVPV.actualDataUntil, newVPV.actualDataUntil) >= 0) {
				scaleFromDate = new Date(oldVPV.actualDataUntil);

				scaleFromDate.setDate(15);
				scaleFromDate.setMonth(scaleFromDate.getMonth() + 1);
				scaleFromDate.setDate(1);

				newVPV.actualDataUntil = new Date(scaleFromDate);

			} else {
				// scaleFromDate is later than actualDataUntil, then it is just ok 
				scaleFromDate = new Date(newVPV.actualDataUntil);
				
			}
				
		}
	}
	
	let scaleFromDateColumn = -1;
	
	if (!newVPV) {
		return undefined;
	}

	// if (!ensureValidVPV(oldVPV)) {
	// 	return undefined;
	// }

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
		if (scaleFromDate > oldVPV.endDate) {
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

		//
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
						//
						// this is very important : otherwise there would be no array Element left to hold the new values
						let betterPhEndDate = getDateEndOfCurrentMonth(scaleFromDate);
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

	// now copy by reference to allPhases of oldVPV
	newVPV.AllPhases = oldVPV.AllPhases;
	newVPV.Dauer = getColumnOfDate(newVPV.endDate) - getColumnOfDate(newVPV.startDate) + 1;

	if (ensureValidVPV(newVPV)) {
		return newVPV;
	} else {
		return undefined;
	}


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

	//

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

		// if a pfv is created from a vpv , the invoices and penalties need to be unchanged
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

module.exports = {
	// getAllPersonalKosten: getAllPersonalKosten,
	// getAllOtherCost: getAllOtherCost,
	calcKeyMetrics: calcKeyMetrics,
	calcCosts: calcCosts,
	calcDeliverables: calcDeliverables,
	calcDeadlines: calcDeadlines,
	calcCapacities: calcCapacities,
	calcCapacitiesPerProject: calcCapacitiesPerProject,
	cleanupRestrictedVersion: cleanupRestrictedVersion,
	convertOrganisation: convertOrganisation,
	getRessourcenBedarfe: getRessourcenBedarfe,
	verifyOrganisation: verifyOrganisation,
	convertVPV: convertVPV,
	ensureValidVPV: ensureValidVPV,
	scaleVPV: scaleVPV,
	resetStatusVPV: resetStatusVPV
};
