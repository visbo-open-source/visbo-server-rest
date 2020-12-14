
var logModule = 'VPV';
var log4js = require('log4js');
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
						// logger4js.trace("Calculate Bedarf of Cost %O", cost.Bedarf);
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

	if ( (vpv || pfv) && organisations && organisations.length > 0 ) {

		if (pfv && vpv) {
			var calcStartDate = Math.min(vpv.startDate, pfv.startDate);
			var calcEndDate = Math.max(vpv.endDate, pfv.endDate);
		}
		if (!pfv && vpv) {
			var calcStartDate = vpv.startDate;
			var calcEndDate =  vpv.endDate;
		}
		if (pfv && !vpv) {
			var calcStartDate = pfv.startDate;
			var calcEndDate = pfv.endDate;
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
	logger4js.info('Calculate Project Costs duration %s ms ', endCalc.getTime() - startCalc.getTime());
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
	logger4js.info('Calculate Project Deadlines duration %s ms ', endCalc.getTime() - startCalc.getTime());
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
	logger4js.info('Calculate Project Deliveries duration %s ms ', endCalc.getTime() - startCalc.getTime());
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
	result.timeDelayFinished = ((wholeDelayFinished / finishedElements.length) || 0);

	var wholeDelayUnFinished = 0;
	for ( f = 0; f < unfinishedElements.length; f++) {
		wholeDelayUnFinished += 1 * (unfinishedElements[f] || 0);
	}
	result.timeDelayUnFinished = ((wholeDelayUnFinished / unfinishedElements.length) || 0);

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
	logger4js.info('Calculate KeyMetrics duration %s ms ', endCalc.getTime() - startCalc.getTime());

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
				'baselineCost_PT': capaVPV[item].baselineCost_PT
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
				'baselineCost': capaVPV[item].baselineCost,
				'baselineCost_PT': capaVPV[item].baselineCost_PT
			});
		}
	}
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
		logger4js.info('Calculate Capacities missing vpvs or organisation ');
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

				// append the monthlyNeeds of the actual timezone at the result-Arry allCalcCapaValues
				for (i = 0 ; i < zoneDauer; i++){
					const currentIndex = currentDate.toISOString().concat('_', roleID);
					allCalcCapaValues[currentIndex] = {
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
	logger4js.info('Calculate Capacity Costs duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return allCalcCapaValues;
}


function splitInTimeZones(organisations, calcC_startDate, calcC_endDate) {
	var timeZones = [];
	var organisation_converted = {};

	if (!organisations && organisations.length <= 0 && !calcC_startDate && !calcC_endDate) {
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

		for ( var o = 0; intervallStart && organisations && organisations[o] && o < organisations.length; o++) {
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
	logger4js.debug('getting roles, which are concerned/connected with roleID in the given organisation %s',  roleID);
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


		// build role/cost - lists with teams
		logger4js.trace('Build Role / Cost List for Project Version %s',  vpv._id);
		var rclists = buildRClists(vpv);

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
						if (phase.AllRoles[k].RollenTyp == actRoleID) {
							var role = phase.AllRoles[k];
							// logger4js.trace("Calculate Bedarf of Role %O", role.Bedarf);
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


	// Calculate the Capacities of this Role
	for (var cR = 0; concerningRoles && cR < concerningRoles.length; cR++){

		var actRoleID = concerningRoles[cR].actRole.uid;
		var faktor = concerningRoles[cR].faktor;

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


function buildRClists(vpv) {
	var rclists = {};

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
			}
		}
	}
	return rclists;
}


function getConcerningRoles(allRoles, allTeams, roleID) {
	var concerningRoles = [];
	var crElem = {};

	function findConcerningRoles(value, parentRole) {
		//value is the Id of one subrole
		var hroleID = value.key;
		crElem = {};
		crElem.actRole = allRoles[hroleID];

		if (parentRole.isTeam){
			for (var t = 0 ; t < crElem.actRole.teamIDs.length; t++) {
				var team = crElem.actRole.teamIDs[t];
				if (parentRole.uid != team.key) { continue; }
				crElem.teamID = team.key;
				crElem.faktor = team.value;
				concerningRoles.push(crElem);
			}
		} else {
			crElem.teamID = -1;
			crElem.faktor = 1.0;
			concerningRoles.push(crElem);

			var newParent = crElem.actRole;
			if (newParent && newParent.subRoleIDs.length > 0){
				var shroles = newParent.subRoleIDs;
				for (var sr = 0; shroles && sr < shroles.length; sr++) {
					findConcerningRoles(shroles[sr], newParent);
				}
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

	// eliminate duplicates of the pair roleID|teamID
	var concerningRolesIndexed = [];
	for (var dup = 0; dup < concerningRoles.length; dup++) {
		var crElement = concerningRoles[dup];
		var key = crElement.actRole.uid + '|' + crElement.teamID;
		concerningRolesIndexed[key] = crElement;
	}
	var isConcerningTeam = true;
	for (var t=0; t < allTeams.length; t++) {
		var team = allTeams[t];
		var teamkey = team.uid + '|' + '-1';
		if (team &&  team.subRoleIDs.length > 0 && !concerningRolesIndexed[teamkey]) {
			for ( sr = 0; sr < team.subRoleIDs.length; sr++){
				key = team.subRoleIDs[sr].key + '|' + '-1';
				if (!concerningRolesIndexed[key]) {
					isConcerningTeam = false;
					break;
				}
			}
		}
		if (isConcerningTeam) {
			crElem = {};
			crElem.actRole = team;
			crElem.teamID = -1;
			crElem.faktor = 1;
			concerningRolesIndexed[teamkey] = crElem;
			concerningRoles.push(crElem);
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
	logger4js.info('Convert Organisation duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return organisation;
}

function cleanupRestrictedVersion(vpv) {
	if (!vpv) return;
	vpv.customDblFields = undefined;
	vpv.customStringFields = undefined;
	vpv.customBoolFields = undefined;
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
	vpv.volumen = undefined;
	vpv.complexity = undefined;
	vpv.AllPhases = undefined;
	vpv.hierarchy = undefined;
	vpv.keyMetrics = undefined;
	vpv.status = undefined;
}
function checkUIDs(newOrga, oldOrga) {
	
	if (!oldOrga || !newOrga) return False;	
	//if (oldOrga && oldOrga.allRoles && oldOrga.allCosts) 
	if ((oldOrga.allCosts.length < newOrga.allCosts.length)) return False;
	if ((oldOrga.allRoles.length < newOrga.allRoles.length)) return False;

	// check all UIDs of roles - they all have to exist in the newOrga as well
	var allNewRoles = [];
	for (var i = 0; newOrga && newOrga.allRoles && i < newOrga.allRoles.length; i++) {
		allNewRoles[newOrga.allRoles[i].uid] = newOrga.allRoles[i];
	}
	for ( var i = 0; oldOrga &&  oldOrga.allRoles && i < oldOrga.allRoles.length; i++) {
		var thisRole = oldOrga.allRoles[i];
		if (!(thisRole && allNewRoles && allNewRoles[thisRole.uid] )) {
			logger4js.debug('UID missing in newOrga', thisRole.uid + ' Name: ', thisRole.name);
			return false;
			break;
		}
	}
	if (i != oldOrga.allRoles.length) return false;
	logger4js.debug('allRoles of the oldOrga are included in the newOrga' , newOrga.allRoles.length);

	// check all UIDs of costs - they all have to exist in the newOrga as well
	var allNewCosts = [];
	for (var i = 0;  newOrga.allCosts && i < newOrga.allCosts.length; i++) {
		allNewCosts[newOrga.allCosts[i].uid] = newOrga.allCosts[i];
	}
	for ( var i = 0; oldOrga && oldOrga.allCosts && i < oldOrga.allCosts.length; i++) {
		var thisCost = oldOrga.allCosts[i];
		if (!(thisCost && allNewCosts && allNewCosts[thisCost.uid] )) {
			logger4js.debug('Cost-UID missing in newOrga', thisCost.uid + ' Name: ', thisCost.name);
			return false;
			break;
		}
	}
	if (i != oldOrga.allCosts.length) return false;
	logger4js.debug('allCosts of the oldOrga are included in the newOrga' , newOrga.allCosts.length);

	return true;
}

function verifyOrganisation(newOrga, oldOrga) {
	// updates newOrga if possible and returns true/false if the orga could be used
	// newOrga is the pure Orga Value
	// oldOrga is the full setting including timestamp, vcid, ...
	logger4js.debug('verify Organisation ', newOrga , oldOrga && oldOrga.name && oldOrga.timestamp && oldOrga.value.validFrom);
	var result = true;
	if ( newOrga && oldOrga && oldOrga.value ) {
		var datenow = new Date();
		var doldO = new Date(oldOrga.timestamp);
		var dnewO = new Date(newOrga.validFrom);
		if ( dnewO < doldO ) {
			result = false;
			return result;
		}
		var result =  checkUIDs(newOrga, oldOrga.value);
	}
	return result;
}

module.exports = {
	// getAllPersonalKosten: getAllPersonalKosten,
	// getAllOtherCost: getAllOtherCost,
	calcKeyMetrics: calcKeyMetrics,
	calcCosts: calcCosts,
	calcDeliverables: calcDeliverables,
	calcDeadlines: calcDeadlines,
	calcCapacities: calcCapacities,
	cleanupRestrictedVersion: cleanupRestrictedVersion,
	convertOrganisation: convertOrganisation,
	getRessourcenBedarfe: getRessourcenBedarfe,
	verifyOrganisation: verifyOrganisation
};
