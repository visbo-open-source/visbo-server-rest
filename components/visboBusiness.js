var logModule = 'VPV';
var log4js = require('log4js');
const { toNamespacedPath } = require('path');
const { validateDate } = require('./validate');
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
					var tagessatz = allRoles[role.RollenTyp] ? allRoles[role.RollenTyp].tagessatz : 0;
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

	// prepare organisation: change the new modelling of kapazität into the old version for calculation
	// will be done in the calling function
	// organisation = convertOrganisation(organisation);

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
			phEndDate = addDays(vpv.startDate, phase.startOffsetinDays + phase.dauerInDays -1);
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
								name: name, phaseVPV: phaseName, endDateVPV: endDate, percentDone: (milestone && milestone.percentDone) || 0
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

				var indexTotal = getColumnOfDate(pfv.endDate) - getColumnOfDate(pfv.startDate);
				// for calculation the actual cost of the baseline: all costs between the start of the project and the month before the timestamp of the vpv
				var endDatePreviousMonthVPV = getDateEndOfPreviousMonth(vpv.timestamp);
				var indexActual = getColumnOfDate(endDatePreviousMonthVPV) - getColumnOfDate(pfv.startDate);

				var timeZonesPFV = splitInTimeZones(organisations, pfv.startDate, pfv.endDate);
				keyMetrics.costBaseLastActual = getSummeKosten(pfv, timeZonesPFV, indexActual);
				keyMetrics.costBaseLastTotal = getSummeKosten(pfv, timeZonesPFV, indexTotal);

				indexTotal = getColumnOfDate(vpv.endDate) - getColumnOfDate(vpv.startDate);
				indexActual = getColumnOfDate(endDatePreviousMonthVPV) - getColumnOfDate(vpv.startDate);
				var timeZonesVPV = splitInTimeZones(organisations, vpv.startDate, vpv.endDate);
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

function calcCapacities(vpvs, pfvs, roleIdentifier, organisations, hierarchy, onlyPT) {
	if (!vpvs || vpvs.length == 0 || !organisations || organisations.length == 0) {
		logger4js.warn('Calculate Capacities missing vpvs or organisation ');
		return [];
	}

	var capaVPV = calcCapacityVPVs(vpvs, roleIdentifier, organisations, hierarchy);
	var capaPFV = [];
	var item;

	if (pfvs) {
		// calc the corresponding of the PFVs
		capaPFV = calcCapacityVPVs(pfvs, roleIdentifier, organisations, hierarchy);
		// insert or update capa values
		for (item in capaPFV) {
			if (!capaVPV[item]) {
				// insert new Value
				logger4js.trace('Insert Capa Value', item, JSON.stringify(capaPFV[item]));
				capaVPV[item] = {};
				capaVPV[item].actualCost_PT = 0;
				capaVPV[item].plannedCost_PT = 0;
				capaVPV[item].actualCost = 0;
				capaVPV[item].actualCost_PT = 0;
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
		const actMonthISO = item.substr(0, 24);
		const roleID = item.substr(25);
		if (onlyPT) {
			capa.push({
				'month': actMonthISO,
				'roleID' : roleID,
				'roleName' : capaVPV[item].roleName,
				'actualCost_PT': capaVPV[item].actualCost_PT || 0,
				'plannedCost_PT': capaVPV[item].plannedCost_PT || 0,
				'internCapa_PT': capaVPV[item].internCapa_PT || 0,
				'externCapa_PT' : capaVPV[item].externCapa_PT || 0,
				'baselineCost_PT': capaVPV[item].baselineCost_PT || 0
			});
		} else {
			capa.push({
				'month': actMonthISO,
				'roleID' : roleID,
				'roleName' : capaVPV[item].roleName,
				'actualCost_PT': capaVPV[item].actualCost_PT || 0,
				'plannedCost_PT': capaVPV[item].plannedCost_PT || 0,
				'internCapa_PT': capaVPV[item].internCapa_PT || 0,
				'externCapa_PT' : capaVPV[item].externCapa_PT || 0,
				'actualCost': capaVPV[item].actualCost || 0,
				'plannedCost': capaVPV[item].plannedCost || 0,
				'internCapa': capaVPV[item].internCapa || 0,
				'externCapa': capaVPV[item].externCapa || 0,
				'baselineCost': capaVPV[item].baselineCost || 0,
				'baselineCost_PT': capaVPV[item].baselineCost_PT || 0
			});
		}
	}
	return capa;
}

function calcCapacitiesPerProject(vpvs, pfvs, roleIdentifier, organisations, onlyPT) {
	if (!vpvs || vpvs.length == 0 || !organisations || organisations.length == 0) {
		logger4js.warn('Calculate Capacities missing vpvs or organisation ');
		return [];
	}

	// calc the capacity for every project/vpv individual
	var capaVPV = [];
	vpvs.forEach(vpv => {
		var capaTempVPV = calcCapacityVPVs([vpv], roleIdentifier, organisations, false);
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
		// calc the capacity of the pfvs
		pfvs.forEach(vpv => {
			var capaTempVPV = calcCapacityVPVs([vpv], roleIdentifier, organisations, false);
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
				capaVPV[item].actualCost_PT = 0;
				capaVPV[item].plannedCost_PT = 0;
				capaVPV[item].actualCost = 0;
				capaVPV[item].actualCost_PT = 0;
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
				capaVPV[currentDate].actualCost = 0;
				capaVPV[currentDate].actualCost_PT = 0;
				capaVPV[currentDate].plannedCost = 0;
				capaVPV[currentDate].baselineCost = 0;
				capaVPV[currentDate].baselineCost_PT = 0;
				capaVPV[currentDate].internCapa_PT = capaVPV[item].internCapa_PT;
				capaVPV[currentDate].externCapa_PT = capaVPV[item].externCapa_PT;
				capaVPV[currentDate].internCapa = capaVPV[item].internCapa;
				capaVPV[currentDate].externCapa = capaVPV[item].externCapa;
			}
			capaVPV[currentDate].actualCost_PT += capaVPV[item].actualCost_PT;
			capaVPV[currentDate].plannedCost_PT += capaVPV[item].plannedCost_PT;
			capaVPV[currentDate].actualCost += capaVPV[item].actualCost;
			capaVPV[currentDate].plannedCost += capaVPV[item].plannedCost;
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
				'internCapa_PT': capaVPV[item].internCapa_PT || 0,
				'externCapa_PT' : capaVPV[item].externCapa_PT || 0,
				'actualCost': capaVPV[item].actualCost || 0,
				'plannedCost': capaVPV[item].plannedCost || 0,
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

function calcCapacityVPVs(vpvs, roleIdentifier, organisations, hierarchy) {

	var allCalcCapaValues = [];
	var allCalcCapaValuesIndexed = [];

	var roleID = '';
	var dateMinValue = -8640000000000000;
	var dateMaxValue = 8640000000000000;
	var calcC_startIndex = Infinity;
	var calcC_endIndex = 0;
	var calcC_startDate = new Date(dateMaxValue);
	var calcC_endDate = new Date(dateMinValue);
	var calcC_dauer = 0;

	var startCalc = new Date();

	if (!vpvs || vpvs.length == 0 || !organisations || organisations.length == 0) {
		logger4js.debug('Calculate Capacities missing vpvs or organisation ');
		return allCalcCapaValuesIndexed;
	}

	// get startIndex and endIndex and dauer of the several vpvs
	for (var i = 0; i < vpvs.length; i++) {
		var vpv = vpvs[i];
		if (!vpv) {
			// skip the version
			continue;
		}
		calcC_startIndex = Math.min(calcC_startIndex, getColumnOfDate(vpv.startDate));
		calcC_startDate = Math.min(calcC_startDate, vpv.startDate);
		calcC_endIndex = Math.max(calcC_endIndex, getColumnOfDate(vpv.endDate));
		calcC_endDate = Math.max(calcC_endDate, vpv.endDate);
		calcC_dauer = calcC_endIndex - calcC_startIndex + 1;
	}

	var currentDate = new Date(calcC_startDate);
	logger4js.trace('Calculate Capacities and Cost of Role %s startDate %s ISO currentDate %s', roleID, calcC_startDate, currentDate.toISOString());
	currentDate.setDate(1);
	currentDate.setHours(0, 0, 0, 0);
	logger4js.trace('Calculate Capacities and Cost of Role currentDate %s ', currentDate.toISOString());

	if (vpvs.length <= 0 || calcC_dauer <= 0 ) {
		return 	allCalcCapaValuesIndexed;
	}

	// divide the complete time from calcC_startdate to calcC_enddate in parts of time, where in each part there is only one organisation valid
	logger4js.trace('divide the complete time from calcC_startdate to calcC_enddate in parts of time, where in each part there is only one organisation valid');
	var timeZones = splitInTimeZones(organisations, calcC_startDate, calcC_endDate);

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

			monthlyNeeds = getCapacityFromTimeZone(vpvs, roleID, timeZones[tz]);
			if (monthlyNeeds) {
				var tzStartIndex = timeZones[tz].startIndex;
				var zoneDauer = timeZones[tz].endIndex - tzStartIndex + 1;
				currentDate = new Date (timeZones[tz].startdate);
				currentDate.setMonth(currentDate.getMonth());
				currentDate.setDate(1);
				currentDate.setHours(0, 0, 0, 0);

				// append the monthlyNeeds of the actual timezone at the result-Arry allCalcCapaValues
				for (i = 0 ; i < zoneDauer; i++){
					const currentIndex = currentDate.toISOString().concat('_', roleID);
					allCalcCapaValues[currentIndex] = {
						'currentDate': currentDate.toISOString(),
						'roleID': roleID,
						'roleName': roleName,
						'actualCost_PT': monthlyNeeds[i + tzStartIndex].actCost_PT || 0,
						'plannedCost_PT': monthlyNeeds[i + tzStartIndex].plannedCost_PT || 0 ,
						'internCapa_PT': monthlyNeeds[i + tzStartIndex].internCapa_PT ,
						'externCapa_PT': monthlyNeeds[i + tzStartIndex].externCapa_PT ,
						'actualCost': monthlyNeeds[i + tzStartIndex].actCost  || 0,
						'plannedCost': monthlyNeeds[i + tzStartIndex].plannedCost  || 0,
						'internCapa': monthlyNeeds[i + tzStartIndex].internCapa  || 0,
						'externCapa': monthlyNeeds[i + tzStartIndex].externCapa  || 0
					};
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
		organisation_converted = convertOrganisation(organisations[0]);
		timeZoneElem.orga = organisation_converted;
		timeZoneElem.startdate = new Date(intervallStart);
		timeZoneElem.startIndex = getColumnOfDate(timeZoneElem.startdate);
		timeZoneElem.enddate = new Date (intervallEnd);
		timeZoneElem.endIndex = getColumnOfDate(timeZoneElem.enddate);
		timeZones.push(timeZoneElem);
	} else {
		// organisations are sorted ascending
		// determine for all organisations the beginning on the first day of month of the timestamp
		for ( var o = 0;  o < organisations.length; o++) {
			organisations[o].timestamp.setDate(1);
			organisations[o].timestamp.setHours(0,0,0,0);
	}

		for ( o = 0; intervallStart && organisations && organisations[o] && o < organisations.length; o++) {
			timeZoneElem = {};
			if (organisations[o+1]) {
				if ( (intervallStart >= organisations[o].timestamp) && (intervallStart >= organisations[o+1].timestamp) ) { continue;}
				// old: if ( (intervallStart < organisations[o].timestamp)) { return timeZones;}
				// old: if ( (intervallStart >= organisations[o].timestamp) && (intervallStart < organisations[o+1].timestamp) ) {
				if (  (intervallStart < organisations[o+1].timestamp) ) {
					// prepare organisation: change the new modelling of capacities into the old version for calculation
					organisation_converted = convertOrganisation(organisations[o]);
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
				organisation_converted = convertOrganisation(organisations[o]);
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

function getCapacityFromTimeZone( vpvs, roleIdentifier, timeZone) {

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

	if (!roleIdentifier || roleIdentifier === '' && tz_organisation && tz_organisation.value&& allRoles.length > 0)  roleIdentifier = tz_organisation.value.allRoles[0].name;

	logger4js.trace('find the roleID for the given roleName %s', roleIdentifier);

	if (roleIdentifier && allRoleNames && allRoleNames[roleIdentifier]) roleID = allRoleNames[roleIdentifier].uid || undefined;

	if (!roleID || !allRoles[roleID]) {
		// given roleIdentifier isn't defined in this organisation
		return undefined;
	}

	// getting roles, which are concerned/connected with roleID in the given organisation
	logger4js.debug('getting roles/teams, which are concerned/connected with roleID in the given organisation %s',  roleID);
	var concerningRoles = getConcerningRoles(allRoles, allTeams, roleID);

	logger4js.debug('getting capacities for the related roleID given organisation %s',  roleID);
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
		costValues[i] = costElem;
	}

	for ( i = 0; vpvs && i < vpvs.length; i++) {
		var vpv = vpvs[i];

		var vpvStartIndex = getColumnOfDate(vpv.startDate);
		var vpvEndIndex = getColumnOfDate(vpv.endDate);

		logger4js.trace('Calculate Personal Cost of RoleID %s of Project Version %s start %s end %s organisation TS %s', roleID, vpv._id, vpv.startDate, vpv.endDate, tz_organisation.timestamp);
		var oneVPVcostValues = getRessourcenBedarfe(roleID, vpv, concerningRoles, allRoles);

		var intStart = Math.max(vpvStartIndex, tz_startIndex);
		var intEnd = Math.min(vpvEndIndex, tz_endIndex);

		for (var ci=intStart ; ci < intEnd + 1; ci++) {
			costValues[ci].actCost_PT += oneVPVcostValues[ci].actCost_PT || 0;
			costValues[ci].plannedCost_PT += oneVPVcostValues[ci].plannedCost_PT || 0;
			costValues[ci].actCost += oneVPVcostValues[ci].actCost || 0;
			costValues[ci].plannedCost += oneVPVcostValues[ci].plannedCost || 0;
		}
	}
return costValues;
}


function getRessourcenBedarfe(roleID, vpv, concerningRoles, allRoles) {
	var costValues = [];
	var costElem = {};


	logger4js.trace('Calculate all RessourceBedarfe and Capacities of %s  ', vpv && vpv._id && roleID);

	if (vpv && roleID && concerningRoles){

		logger4js.debug('Calculate Personal Cost of RoleID %s of Project Version %s start %s end %s actualDataUntil %s', roleID, vpv._id, vpv.startDate, vpv.endDate, vpv.actualDataUntil);

		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;

		var actualDataUntil = vpv.actualDataUntil;
		var actualDataIndex = getColumnOfDate(actualDataUntil) + 1;

		// for (var i=0 ; i < dauer; i++){
		for (var i=startIndex ; i < dauer+startIndex; i++){
			costElem = {};
			costElem.actCost_PT = 0;
			costElem.actCost = 0;
			costElem.plannedCost_PT = 0;
			costElem.plannedCost = 0;
			costValues[i] = costElem;
		}

		if (!vpv || !vpv._id || dauer <= 0 || !vpv.AllPhases) {
			return costValues;
		}

		logger4js.trace('Convert vpv-Hierarchy to direct access for Project Version %s',  vpv._id);
		var hrchy = convertHierarchy(vpv);

		var isTeam = allRoles[roleID].isTeam;

		// build role/cost - lists with teams
		logger4js.trace('Build Role / Cost or Team List for Project Version %s',  vpv._id);
		var rclists = buildRClists(vpv, isTeam);

		// build an intersection ?!?!?!
		var intersectArray = [];
		var intersectElem = new Object;

		logger4js.trace('Evaluate Teams for Project Version %s',  vpv._id);
		for (i = 0; concerningRoles && i< concerningRoles.length; i++) {
			var actRoleID = concerningRoles[i] && concerningRoles[i].actRole.uid;
			var teamID = concerningRoles[i] && concerningRoles[i].teamID;
			if (rclists && rclists[actRoleID]) {
				// no team members in the concerningRoles included
				if (teamID == -1) {
					intersectElem = {};
					intersectElem.role = actRoleID;
					intersectElem.teamID = -1;
					intersectElem.faktor = 1.0;
					intersectElem.phases = [];
					var tID = 0;
					for (tID in rclists[actRoleID]) {
						intersectElem.phases = intersectElem.phases.concat(rclists[actRoleID][tID]);
					}
					// remove duplicate phases from intersectElem.phases-Array
					intersectElem.phases = intersectElem.phases.filter( function (item, index, inputArray ) {
						return inputArray.indexOf(item) == index;
					});
					intersectArray.push(intersectElem);
				} else {
					if (rclists[actRoleID][teamID]) {
						intersectElem = {};
						intersectElem.role = actRoleID;
						intersectElem.teamID = teamID;
						intersectElem.faktor = concerningRoles[i].faktor;
						intersectElem.phases = rclists[actRoleID][teamID];
						intersectArray.push(intersectElem);
					}
				}
			}
		}


		logger4js.trace('Combine Capacity Values for Project Version %s',  vpv._id);
		if (dauer > 0) {

			for (i = 0; intersectArray && i< intersectArray.length; i++) {

				actRoleID = intersectArray[i].role;
				logger4js.trace('Calculate Intersect %s Role %s', i, actRoleID);
				var tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatz : 0;
				teamID = intersectArray[i].teamID;
				var phasesWithActRole = intersectArray[i].phases;

				// calculate the needs of this Role with faktor always 1.0

				logger4js.trace('Calculate Pases with ActRole %s Phases %s', actRoleID, phasesWithActRole && phasesWithActRole.length);
				for (var j= 0; phasesWithActRole && j < phasesWithActRole.length; j++) {
					var phase = getPhaseByID(hrchy, vpv, phasesWithActRole[j]);
					if (!phase) {
						continue;
					}
					var phasenStart = startIndex + phase.relStart - 1;

					logger4js.trace('Calculate Phase %s Roles %s', i, phase.AllRoles.length);
					for (var k = 0; phase.AllRoles && k < phase.AllRoles.length ; k++) {
						if ((phase.AllRoles[k].RollenTyp == actRoleID)|| (phase.AllRoles[k].teamID == actRoleID)) {
							var role = phase.AllRoles[k];
							// logger4js.trace('Calculate Bedarf of Role %O', role.Bedarf);
							if (role &&  role.Bedarf) {
								var dimension = role.Bedarf.length;
								// for (var l = phasenStart; l < phasenStart + dimension; l++) {
								for (var l = phasenStart; (l < phasenStart + dimension) && (l < dauer + startIndex); l++) {
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
		} else {
			// costValues[0] = 0;
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
					var phasesPerTeam = [];
					var newTeam = {};
					phasesPerTeam.push(phase.name);
					newTeam[role.RollenTyp] = phasesPerTeam;
					teamlists[role.teamID]=newTeam;
				} else {
					newTeam = teamlists[role.teamID];
					if (newTeam[role.RollenTyp]){
						phasesPerTeam = newTeam[role.RollenTyp];
						var indexPhase= phasesPerTeam.indexOf(phase.name);
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
}



function getConcerningRoles(allRoles, allTeams, roleID) {
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
// function getSummaryRoles(allRoles, roleID) {
// 	var summaryRoles = [];
//
// 	function findSummaryRoles(value) {
// 		//value is the Id of one subrole
// 		var hroleID = value.key;
// 		var hrole = allRoles[hroleID];
// 		if (hrole.subRoleIDs.length > 0){
// 			summaryRoles[hroleID] = hrole;
// 			var shroles = hrole.subRoleIDs;
// 			shroles.forEach(findSummaryRoles);
// 		}
// 	}
//
// 	// all summary roles
// 	if (roleID === undefined && allRoles) {
// 		var i = 0;
// 		for (i=0; allRoles &&  i <= allRoles.length; i++ ){
// 			var hrole = allRoles[i];
// 			if (hrole && hrole.subRoleIDs.length > 0 ) summaryRoles[allRoles[i].uid] = allRoles[i];
// 		}
// 		return summaryRoles;
// 	}
//
// 	// only summary roles that are children of the role roleID
// 	if (roleID && allRoles){
// 		var role = allRoles[roleID];
// 		if (role.subRoleIDs && role.subRoleIDs.length > 0) {
// 			var subRoles = role.subRoleIDs;
// 			if (subRoles.length > 0 ){
// 				summaryRoles[role.uid] = role;
// 				subRoles.forEach(findSummaryRoles);
// 			}
//
// 		}
// 		return summaryRoles;
// 	}
// }

// function getParentOfRole (roleID, allRoles, sumRoles) {
// 	var parentRole = undefined;
// 	if (allRoles[roleID]) {
//
// 		var notFound = true;
// 		for (var k=0; sumRoles && k < sumRoles.length;k++){
// 			// check only roles, which are not isTeam or isTeamParent
// 			var hrole = sumRoles[k];
// 			if (hrole)	{
// 				for( var i = 0; notFound && hrole && hrole.subRoleIDs && i < hrole.subRoleIDs.length; i++ ){
// 					if ( hrole.subRoleIDs[i] && hrole.subRoleIDs[i].key == roleID) {
// 						parentRole = hrole;
// 						notFound = false;
// 					}
// 				}
// 			}
// 		}
// 	}
// 	return parentRole;
// }

// function buildTopNodes(allRoles) {
// 	var topLevelNodes = [];
// 	var topLevel = [];
// 	var i = 1;

// 	// find all summaryRoles
// 	var sumRoles = getSummaryRoles(allRoles, '');

// 	while (i <= allRoles.length){
// 		var currentRole = allRoles[i];
// 		if (currentRole) {
// 			var parent = getParentOfRole(currentRole.uid, allRoles, sumRoles);
// 			if (!parent && !topLevel[currentRole.uid]) {
// 				topLevel[currentRole.uid] = currentRole;
// 				topLevelNodes.push(currentRole);
// 			}
// 		}
// 		i++;
// 	}
// 	return topLevelNodes;
// }

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
		// get the index of the startOfCal, because the array kapazität begins with this month since beginning of calendar
		var sOC_date = new Date(actrole.startOfCal);
		var indexOfstartOfCal = getColumnOfDate(sOC_date);
		if (indexOfstartOfCal >= 0) {
			// fill the array with the capacities != defaultKapa beginning with index 1 not 0
			for ( var ic = 1 + indexOfstartOfCal; ic >= 0 && ic <= 240 && actrole.kapazitaet && ic <= actrole.kapazitaet.length + indexOfstartOfCal-1; ic++) {
				capa_new[ic] = actrole.kapazitaet[ic - indexOfstartOfCal];
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
	vpv.status = undefined;
	vpv.ampelStatus = undefined;
	vpv.ampelErlaeuterung = undefined;
	vpv.complexity = undefined;
	vpv.AllPhases = undefined;
	vpv.hierarchy = undefined;
	vpv.keyMetrics = undefined;
	vpv.status = undefined;
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
	logger4js.debug('convertVPV:  ', oldVPV._id, 'oldPFV', oldPFV != undefined, 'orga', orga != undefined);
	return oldVPV;
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
	let sameLengthInMonths =  ((getColumnOfDate(oldPhEndDate) - getColumnOfDate(oldPhStartDate)) == (getColumnOfDate(newPhEndDate) - getColumnOfDate(newPhStartDate)));
	let similar1 = ((Math.abs((oldPhStartDate.getDate() - newPhStartDate.getDate())) <=2) && (Math.abs((oldPhEndDate.getDate() - newPhEndDate.getDate())) <=2));
	let similar2 = ((Math.abs((oldPhStartDate.getDate() - newPhStartDate.getDate())) <=4) && (Math.abs((diffDays(newPhEndDate, newPhStartDate) - diffDays(oldPhEndDate, oldPhStartDate)))<=2));

	let similarCharacteristics = sameLengthInMonths && (similar1 || similar2);


	if (separatorIndex && separatorIndex > 0) {

		// ar1 now holds the actualData, which should not be changed 
		ar1 = oldArray.slice(0,separatorIndex);

		// ar2 holds the part of the array which is in the future, starting with separatorIndex 
		ar2 = oldArray.slice(separatorIndex);
	} 

	if (similarCharacteristics) {
		ar2 = ar2.map(x => x * scaleFactor);

	} else {
		let arSum = ar2.reduce(sumOF);

		// calculate the new future-value array ...
		ar2 = calcPhArValues(newPhStartDate, newPhEndDate, arSum*scaleFactor);
	}
	
				
	// if necessary, combine actual data and new future values 
	if (separatorIndex && separatorIndex > 0) {
		resultArray = ar1.concat(ar2);

	} else {
		resultArray = ar2;
	}

	return resultArray;
}

function isValidVPV(myVPV) {
	// function checks whether consistency criterias of a vpv are fulfilled 	

	// validity Criterias
	// C0: is Dauer eq. Number of covered months of the project, i.e checks consistency between VPV.startDate, VPV.endDate and Dauer ?  
	// C1: does rootPhase = '0§.§' exist and are start-Date and endDate of project and rootPhase identical ? 
	// C2: does no Phase is having a start-Date earlier than project startdate? 
	// C3: does no Phase is having a end-Date later than project endDate ?
	// C4: is no Milestone-Date earlier than phase start and not later than phase endDate? 
	// C5: are array lengths of each role identical to relEnde-relStart + 1 of the phase ? 
	// C6: is each value in a role array >= 0 ? 
	// C7: are array lengths of each cost identical to relEnde-relstart + 1 of the phase ?
	// C8: is each value in a cost array >= 0 ?
	// C9: is strategic Fit either undefined or having a numeric value >= 0 and <= 10 
	// C10: is Risiko either undefined or having a numeric value >= 0 and <= 10
	// C11: is number of milestones / phases in hierarchy eq. to number of phases/milestones when traversed in the list?
	// C12: is each name of a phase / milestone listed in the hierarchy?

	let myHrchy = convertHierarchy(myVPV);	

	if  (!(myVPV && myVPV.startDate && myVPV.endDate && myVPV.AllPhases && myHrchy)) {
		logger4js.warn('isValidVPV:  !myVPV: ', myVPV != undefined, myVPV && myVPV.startDate != undefined, 
						myVPV && myVPV.endDate != undefined, myVPV && myVPV.AllPhases != undefined, myHrchy != undefined );
		return false;
	}

	// criterias is a array of boolean values, indicating which validity criterias are fulfilled / not fulfilled
	let criterias = [];
	
	let projectDurationInDays = diffDays(myVPV.endDate, myVPV.startDate) + 1;

	// C0: is Dauer eq. Number of covered months of the project ?
	let c0 = (myVPV.Dauer && myVPV.startDate && myVPV.endDate && myVPV.Dauer == (getColumnOfDate(myVPV.endDate) - getColumnOfDate(myVPV.startDate) + 1));	

	if (!c0) {
		logger4js.debug('isValidVPV: C0: project months vs duration', myVPV.Dauer, myVPV.startDate, myVPV.endDate);
	}
	// C1: does rootPhase = '0§.§' exist and are start-Date and endDate of project and rootPhase identical ? 
	let c1 = (myVPV.AllPhases && myVPV.AllPhases[0] && 
				myVPV.AllPhases[0].name == rootPhaseName && 
				myVPV.AllPhases[0].dauerInDays == projectDurationInDays);
	
	if (!c1) {
		logger4js.debug('isValidVPV: C1: rootPhase does not exist', myVPV.AllPhases && myVPV.AllPhases[0] && myVPV.AllPhases[0].name, 
		myVPV.AllPhases && myVPV.AllPhases[0] && myVPV.AllPhases[0].dauerInDays, projectDurationInDays);
	}

	let c2 = true; 
	let c3 = true;
	let c4 = true;
	let c5 = true;
	let c6 = true;
	let c7 = true;
	let c8 = true;
	let c9 = !myVPV.StrategicFit || (myVPV.StrategicFit >= 0 && myVPV.StrategicFit <= 10);
	
	if (!c9) {
		logger4js.debug('isValidVPV: C9: strategic fit', myVPV.StrategicFit);
	}

	let c10 = !myVPV.Risiko || (myVPV.Risiko && myVPV.Risiko >= 0 && myVPV.Risiko <= 10);
	if (!c10) {
		logger4js.debug('isValidVPV: C10: Risiko', myVPV.Risiko);
	}
	
	let c12 = true; 
	let anzPlanElements = 0;

	myVPV.AllPhases.forEach(phase => {

		anzPlanElements = anzPlanElements + 1; 

		c2 = c2 && (phase.startOffsetinDays >= 0);
		if (!(phase.startOffsetinDays >= 0)) {
			logger4js.debug('isValidVPV: C2: Phase-Start Offset', phase.name, phase.startOffsetinDays);
		}

		c3 = c3 && ((phase.startOffsetinDays + phase.dauerInDays ) <= projectDurationInDays); 
		if (!((phase.startOffsetinDays + phase.dauerInDays ) <= projectDurationInDays)) {
			logger4js.debug('isValidVPV: C3: Phase-Start Offset', phase.name, phase.startOffsetinDays + phase.dauerInDays, projectDurationInDays);
		}

		let phLength = phase.relEnde - phase.relStart + 1;

		phase.AllRoles.forEach(role => {
			let c5tmp = (role.Bedarf && (role.Bedarf.length == phLength));
			c5 = c5 && c5tmp;
			if (!c5tmp) {
				logger4js.debug('isValidVPV: C5: Role Array', role.uid, role.Bedarf.length, phLength);
			}

			// checks whether all elements of an array are >= 0 
			let c6tmp = (role.Bedarf && role.Bedarf.map(value => value >= 0).reduce((accumulator, currentValue) => accumulator && currentValue));
			c6 = c6 && c6tmp;
			if (!c6tmp) {
				logger4js.debug('isValidVPV: C6: Role Array with negative values ', role.uid);
			}
		});

		phase.AllCosts.forEach(cost => {
			let c7tmp = (cost.Bedarf && (cost.Bedarf.length == phLength));
			c7 = c7 && c7tmp;
			if (!c7tmp) {
				logger4js.debug('isValidVPV: C7: Cost Array', cost.uid, cost.Bedarf.length, phLength);
			}
			// checks whether all elements of an array are >= 0 
			let c8tmp = (cost.Bedarf && cost.Bedarf.map(value => value >= 0).reduce((accumulator, currentValue) => accumulator && currentValue));
			c8 = c8 && c8tmp;
			if (!c8tmp) {
				logger4js.debug('isValidVPV: C8: Cost Array with negative values ', cost.uid);
			}
		});

		phase.AllResults.forEach(result => {

			anzPlanElements = anzPlanElements + 1; 

			let c4tmp = (result.offset && result.offset >= 0 && 
						(phase.startOffsetinDays + result.offset) <= projectDurationInDays && 
						(result.offset <= phase.dauerInDays));
			
			c4 = c4 && c4tmp; 
			if (!c4tmp) {
				logger4js.debug('isValidVPV: C4: Milestone not within phase limits: ', result.name, ' in ', phase.name);
			}

			let c12tmp = !(myHrchy[result.name] === undefined);
			c12 = c12 && c12tmp;
			if (!c12tmp) {
				logger4js.debug('isValidVPV: C12: Milestone not in hierarchy: ', result.name);
			}
			// c12 = c12 && !(myHrchy[result.name] === undefined);

		});

		if (!(phase.name == rootPhaseName)) {
			// check auf rootPhaseName ist bereits in c1 abgeprüft , in myHrchy there is no 
			let c12tmp = !(myHrchy[phase.name] === undefined);
			c12 = c12 && c12tmp;
			if (!c12tmp) {
				logger4js.debug('isValidVPV: C12: Phase not in hierarchy: ', phase.name);
			}
		}
		
		
	});
	
	let c11 = myHrchy && (myVPV.hierarchy && myVPV.hierarchy.allNodes && (myVPV.hierarchy.allNodes.length == anzPlanElements));
	if (!c11) {
		logger4js.debug('isValidVPV: C11: Number of hierarchy elements does not match number of plan-Elements', 
						myVPV.hierarchy && myVPV.hierarchy.allNodes && myVPV.hierarchy.allNodes.length, anzPlanElements);
	}
	
	criterias.push(c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12);

	// now High-Level protocolling the single criterias
	if (!c0) {
		logger4js.warn('isValidVPV: C0: Dauer is not eq. to Number of covered months of the project');
	}
	if (!c1) {
		logger4js.warn('isValidVPV: C1: rootPhase = "0§.§" does not exist or start-Date and endDate of project and rootPhase are not identical ');
	}
	if (!c2) {
		logger4js.warn('isValidVPV: C2: at least one Phase is having a start-Date earlier than project startdate');
	}
	if (!c3) {
		logger4js.warn('isValidVPV: C3: at least one Phase is having a end-Date later than project endDate');
	}
	if (!c4) {
		logger4js.warn('isValidVPV: C4: at least one Milestone-Date is earlier than phase start or later than phase endDate');
	}
	if (!c5) {
		logger4js.warn('isValidVPV: C5: array lengths of at least one role is not identical to relEnde-relStart + 1 of the phase');
	}
	if (!c6) {
		logger4js.warn('isValidVPV: C6: at least one value in a role array is < 0 ');
	}
	if (!c7) {
		logger4js.warn('isValidVPV: C7: array lengths of at least one cost is not identical to relEnde-relStart + 1 of the phase');
	}
	if (!c8) {
		logger4js.warn('isValidVPV: C8: at least one value in a cost array is < 0');
	}
	if (!c9) {
		logger4js.warn('isValidVPV: C9: strategic Fit is either undefined or having a numeric value < 0 or > 10');
	}
	if (!c10) {
		logger4js.warn('isValidVPV: C10: Risiko is either undefined or having a numeric value < 0 or > 10');
	}
	if (!c11) {
		logger4js.warn('isValidVPV: C11: number of milestones / phases in hierarchy is not eq. to number of phases/milestones when traversed in the list');
	}
	if (!c12) {
		logger4js.warn('isValidVPV: C12: not each name of a phase / milestone is listed in the hierarchy');
	}
	
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
	// the oldVPV-Values are changed according to the values in newVPV resp scaleFactor 
	// 
	// the scaleFactor defines the scale for the total costs, the distribution has to be calculated from prpject range from oldVPV to the newVPV
	logger4js.debug('scaleVPV:  ', oldVPV._id, 'newVPV', newVPV._id, 'scaleFactor', scaleFactor);
	
	// here the date shall be provided from where on the scaling should take place. Can be provided by parameter
	// scaleFromDate should always be the first of a month. From this month on , including this month all items are being scaled, i.e changed 
	// all other dates and resource/cost values being before thet scaleFromDate, will remain unchanged  	
	//let scaleFromDate = new Date(2021, 7, 1);

	let scaleFromDate = undefined;  
	let scaleFromDateColumn = -1;	
	
	

	if (!isValidVPV(oldVPV)) {
		return undefined;		
	}

	// if a scaleFromDate has been provided: startDates have to be the same ... 
	// use case preserve actualData : in this case a project must not start later or earlier - 
	// this would make all actualData information Nonsense. 
	if (scaleFromDate) {
		scaleFromDateColumn = getColumnOfDate(scaleFromDate);

		// in this case this must be true: oldVPV.StartDate = newVPV.StartDate .. otherwise Exit
		if (diffDays(oldVPV.startDate, newVPV.startDate) != 0) {
			logger4js.warn('scaleVPV: when scaleFromDate is given start-Dates of oldVPV and newVPV need to be identical ', oldVPV.startDate, 'vs. newVPV:', newVPV.startDate);
			return undefined;
		}

		// check whether anything needs to be done 
		if (scaleFromDate < oldVPV.startDate) {
			// same as if scaleFromDate === undefined
			scaleFromDate = undefined; 
			scaleFromDateColumn = -1;
		} 

		// check whether nothing should be scaled 
		if (scaleFromDate > oldVPV.endDate) {
			logger4js.warn('scaleVPV: when scaleFromDate is after endDate of Project ', oldVPV.endDate, 'vs. scale Fom Date:', scaleFromDate);
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

		
		let newOffsetInDays = Math.round(timeScalingFactor * phase.startOffsetinDays);
		let newDauerInDays = Math.round(timeScalingFactor * phase.dauerInDays);

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
					newPhStartDate = addDays(newVPV.startDate, newOffsetInDays);
					newPhEndDate = addDays(newPhStartDate, newDauerInDays - 1);
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

				let newMsOffset = Math.round(result.offset*timeScalingFactor);

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
	
	if (isValidVPV(newVPV)) {
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

	const emptyBewertung = { 'color': 0, 'description':'', 'deliverables':'', 'bewerterName':'', 'datum':'' };	
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
	scaleVPV: scaleVPV,
	resetStatusVPV: resetStatusVPV
};
