
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
	logger4js.debug('Calculate Personal Cost Convert Organisation %s ', endCalc.getTime() - startCalc.getTime());

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
					var tagessatz = allRoles[role.RollenTyp] ? allRoles[role.RollenTyp].tagessatzIntern : 0;
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
					if ((costTyp === costID) || (costID == "")) {
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

function calcCosts(vpv, pfv, organisation) {
	var allCostValues = [];
	var allCostValuesIndexed = [];
	var startCalc = new Date();
	if ( vpv && organisation ) {
		logger4js.trace('Calculate Project Costs vpv startDate %s ISO %s ', vpv.startDate, vpv.startDate.toISOString());
		var currentDate = new Date(vpv.startDate);
		logger4js.trace('Calculate Project Costs vpv startDate %s ISO %s currentDate %s', vpv.startDate, vpv.startDate.toISOString(), currentDate.toISOString());
		currentDate.setDate(1);
		currentDate.setHours(0, 0, 0, 0);
		logger4js.trace('Calculate Project Costs vpv currentDate %s ', currentDate.toISOString());
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;

		var personalCost = getAllPersonalKosten(vpv, organisation);
		var allOtherCost = getAllOtherCost("", vpv, organisation);
/* 
		var licenseCost = getAllOtherCost(1, vpv, organisation);
		var travelCost = getAllOtherCost(2, vpv, organisation);
		var persCost = getAllOtherCost(3, vpv, organisation);

		var monthlyNeeds1002euro = getRessourcenBedarfe(1002,vpv,true, true, organisation);
		var monthlyNeeds1002PT = getRessourcenBedarfe(1002,vpv,true, false, organisation);
		var monthlyNeeds3euro = getRessourcenBedarfe(3,vpv,true, true, organisation);
		var monthlyNeeds3PT = getRessourcenBedarfe(3,vpv,true, false, organisation);
		var monthlyNeeds5euro = getRessourcenBedarfe(5,vpv,true, true, organisation);
		var monthlyNeeds5PT = getRessourcenBedarfe(5,vpv,true, false, organisation);
		var monthlyNeeds2euro = getRessourcenBedarfe(2,vpv,true, true, organisation);
		var monthlyNeeds2PT = getRessourcenBedarfe(2,vpv,true, false, organisation);
		var monthlyNeeds6euro = getRessourcenBedarfe(6,vpv,true, true, organisation);
		var monthlyNeeds6PT = getRessourcenBedarfe(6,vpv,true, false, organisation);
		var monthlyNeeds16euro = getRessourcenBedarfe(16,vpv,true, true, organisation);
		var monthlyNeeds16PT = getRessourcenBedarfe(16,vpv,true, false, organisation);
 */
		for (var i = 0 ; i < dauer; i++){
			const currentDateISO = currentDate.toISOString();
			allCostValues[currentDateISO] = { 'currentCost': personalCost[i] + allOtherCost[i] };
			currentDate.setMonth(currentDate.getMonth() + 1);
		}
	}
	if ( pfv && organisation ) {
		currentDate = new Date(pfv.startDate);
		currentDate.setDate(1);
		currentDate.setHours(0, 0, 0, 0);
		logger4js.trace('Calculate Project Costs pfv currentDate %s ', currentDate.toISOString());
		startIndex = getColumnOfDate(pfv.startDate);
		endIndex = getColumnOfDate(pfv.endDate);
		dauer = endIndex - startIndex + 1;

		personalCost = getAllPersonalKosten(pfv, organisation);
		allOtherCost = getAllOtherCost("", pfv, organisation);

		for (i = 0 ; i < dauer; i++) {
			const currentDateISO = currentDate.toISOString();
			if (!allCostValues[currentDateISO]) {
				allCostValues[currentDateISO] = {};
			}
			allCostValues[currentDateISO].baseLineCost = personalCost[i] + allOtherCost[i];
			currentDate.setMonth(currentDate.getMonth() + 1);
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


function getSummeKosten(vpv, organisation, index){
	// calculate the total cost until index-month
	var costSum = 0;

	if (vpv && organisation && (index>=0)){
		var allCostValues = {};
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;


		var personalCost = getAllPersonalKosten(vpv, organisation);
		var allOtherCost = getAllOtherCost("", vpv, organisation);

		if (index > dauer - 1){
			index = dauer - 1;
		}

		for (var i = 0 ; i <= index; i++){
			allCostValues[i] = personalCost[i] + allOtherCost[i];
			costSum += allCostValues[i];
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

	if (vpv && pfv){

		// Calculate keyMetrics Values here
		keyMetrics = vpv.keyMetrics || {};
		logger4js.debug('Calculate KeyMetrics for %s with pfv %s and organization %s result %s ', vpv && vpv._id, pfv && pfv._id, organisation && organisation._id, JSON.stringify(keyMetrics));

		if (vpv.variantName != 'pfv'){



			if (organisation){
				var indexTotal = getColumnOfDate(pfv.endDate) - getColumnOfDate(pfv.startDate);
				// for calculation the actual cost of the baseline: all costs between the start of the project and the month before the timestamp of the vpv
				var endDatePreviousMonthVPV = getDateEndOfPreviousMonth(vpv.timestamp);
				var indexActual = getColumnOfDate(endDatePreviousMonthVPV) - getColumnOfDate(pfv.startDate);
				keyMetrics.costBaseLastActual = getSummeKosten(pfv, organisation, indexActual);
				keyMetrics.costBaseLastTotal = getSummeKosten(pfv, organisation, indexTotal);

				indexTotal = getColumnOfDate(vpv.endDate) - getColumnOfDate(vpv.startDate);
				indexActual = getColumnOfDate(vpv.actualDataUntil) - getColumnOfDate(vpv.startDate);
				keyMetrics.costCurrentTotal= getSummeKosten(vpv, organisation, indexTotal);
				keyMetrics.costCurrentActual= getSummeKosten(vpv, organisation, indexActual);
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

function calcCapacities(vpv, roleID, organisation) {

	var allCapaValues = [];
	var allCostValuesIndexed = [];

	var startCalc = new Date();
	if ( vpv && organisation && roleID) {

		logger4js.trace('Calculate Capacities and Cost of Role %s startDate %s ISO %s ', roleID, vpv.startDate, vpv.startDate.toISOString());
		var currentDate = new Date(vpv.startDate);
		logger4js.trace('Calculate Capacities and Cost of Role %s startDate %s ISO %s currentDate %s', roleID, vpv.startDate, vpv.startDate.toISOString(), currentDate.toISOString());
		currentDate.setDate(1);
		currentDate.setHours(0, 0, 0, 0);
		logger4js.trace('Calculate Capacities and Cost of Role currentDate %s ', currentDate.toISOString());
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;

		if (!vpv || !vpv._id || dauer <= 0 || !vpv.AllPhases) {
			return monthlyNeeds;
		}
		logger4js.debug('Convert vpv-Hierarchy to direct access for Project Version %s',  vpv._id);
		var hrchy = convertHierarchy(vpv);

		// prepare organisation for direct access to uid
		var allRoles = [];
		var allTeams = [];
		var allRoleNames = [];

		for (var i = 0; organisation && organisation.value && organisation.value.allRoles && i < organisation.value.allRoles.length; i++) {
			allRoles[organisation.value.allRoles[i].uid] = organisation.value.allRoles[i];
			allRoleNames[organisation.value.allRoles[i].name] = organisation.value.allRoles[i];
			if (organisation.value.allRoles[i].isTeam)	allTeams[organisation.value.allRoles[i].uid] = organisation.value.allRoles[i];;
		}	


		// roles, which are concerned/connected with roleID in the given organisation
		var concerningRoles = getConcerningRoles(allRoles, roleID);

		allCapaValues = getCapaValues(dauer, concerningRoles, allRoles);

		var allCostValues = getRessourcenBedarfe(roleID, vpv, concerningRoles);


/* 
		var licenseCost = getAllOtherCost(1, vpv, organisation);
		var travelCost = getAllOtherCost(2, vpv, organisation);
		var persCost = getAllOtherCost(3, vpv, organisation);

		var monthlyNeeds1002euro = getRessourcenBedarfe(1002,vpv,true, true, organisation);
		var monthlyNeeds1002PT = getRessourcenBedarfe(1002,vpv,true, false, organisation);
		var monthlyNeeds3euro = getRessourcenBedarfe(3,vpv,true, true, organisation);
		var monthlyNeeds3PT = getRessourcenBedarfe(3,vpv,true, false, organisation);
		var monthlyNeeds5euro = getRessourcenBedarfe(5,vpv,true, true, organisation);
		var monthlyNeeds5PT = getRessourcenBedarfe(5,vpv,true, false, organisation);
		var monthlyNeeds2euro = getRessourcenBedarfe(2,vpv,true, true, organisation);
		var monthlyNeeds2PT = getRessourcenBedarfe(2,vpv,true, false, organisation);
		var monthlyNeeds6euro = getRessourcenBedarfe(6,vpv,true, true, organisation);
		var monthlyNeeds6PT = getRessourcenBedarfe(6,vpv,true, false, organisation);
		var monthlyNeeds16euro = getRessourcenBedarfe(16,vpv,true, true, organisation);
		var monthlyNeeds16PT = getRessourcenBedarfe(16,vpv,true, false, organisation);
 */
		for (var i = 0 ; i < dauer; i++){
			const currentDateISO = currentDate.toISOString();
			allCapaValues[currentDateISO] = { 'currentCost_PT': allCostValues[i].currentCost_PT };
			currentDate.setMonth(currentDate.getMonth() + 1);
		}
	}
	
	var j = 0, element;
	for (element in allCapaValues) {
		allCostValuesIndexed[j] = {
			'currentDate': element,
			'actualCost_PT': allCostValues[element].currentCost_PT || 0,
			'currentCost_PT': allCostValues[element].currentCost_PT || 0,
			'internCapacity_PT': allCapaValues[element].internCapa_PT || 0,
			'externCapacity_PT' :allCapaValues[element].externCapa_PT || 0,			
			'actualCost': allCostValues[element].currentCost || 0,
			'currentCost': allCostValues[element].currentCost || 0,
			'internCapacity': allCapaValues[element].internCapa || 0,
			'externCapacity' :allCapaValues[element].externCapa || 0
		};
		j++;
	}

	var endCalc = new Date();
	logger4js.info('Calculate Project Costs duration %s ms ', endCalc.getTime() - startCalc.getTime());
	return allCostValuesIndexed;
}


function getRessourcenBedarfe(roleID, vpv, concerningRoles) {
	var costValues = [];
	var costElem = {};	
	// var capaValues = [];	
	// var capaElem = {};

	logger4js.trace('Calculate all RessourceBedarfe and Capacities of %s  ', vpv && vpv._id && roleID);

	if (vpv && roleID && organisation){

		logger4js.debug('Calculate Personal Cost of RoleID %s of Project Version %s start %s end %s organisation TS %s', roleID, vpv._id, vpv.startDate, vpv.endDate, organisation.timestamp);
/* 
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;
		 */
		if (!vpv || !vpv._id || dauer <= 0 || !vpv.AllPhases) {
			return costValues;
		}
		logger4js.debug('Convert vpv-Hierarchy to direct access for Project Version %s',  vpv._id);
		var hrchy = convertHierarchy(vpv);

/* 		// prepare organisation for direct access to uid
		var allRoles = [];
		var allTeams = [];
		var allRoleNames = [];

		for (var i = 0; organisation && organisation.value && organisation.value.allRoles && i < organisation.value.allRoles.length; i++) {
			allRoles[organisation.value.allRoles[i].uid] = organisation.value.allRoles[i];
			allRoleNames[organisation.value.allRoles[i].name] = organisation.value.allRoles[i];
			if (organisation.value.allRoles[i].isTeam)	allTeams[organisation.value.allRoles[i].uid] = organisation.value.allRoles[i];;
		}	
 */
/* 
		// roles, which are concerned/connected with roleID in the given organisation
		var concerningRoles = getConcerningRoles(allRoles, roleID); */
/* 
		capaValues = getCapaValues(dauer, concerningRoles, allRoles); */
/* 
		for (i=0 ; i < dauer; i++){
			capaElem.internCapa_PT = 0;
			capaElem.externCapa_PT = 0;
			capaElem.internCapa = 0;
			capaElem.externCapa = 0;
			capaValues[i] = capaElem;
		}
		

		// Calculate the Capacities of this Role
		for ( cR = 0; cR < concerningRoles.length; cR++){

			var actRoleID = concerningRoles[cR].actRole.uid;
			var teamID = concerningRoles[cR].teamID;
			var faktor = concerningRoles[cR].faktor;
			
			var tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatzIntern : 0;
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
		} */

		// evt. Beginn Loop über alle vpv

		// build role/cost - lists with teams
		 var rclists = buildRClists(vpv);

		// build an intersection ?!?!?!
		var intersectArray = [];
		var intersectElem = new Object;	

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

	
		for (i=0 ; i < dauer; i++){
			costElem.actCost_PT = 0;
			costElem.actCost = 0;
			costElem.currentCost_PT = 0;
			costElem.currentCost = 0;
			costValues[i] = costElem;
		}
		
		if (dauer > 0) {
			
			for (i = 0; intersectArray && i< intersectArray.length; i++) {
				
				var phasesWithActRole = intersectArray[i].phases;
				var actRoleID = intersectArray[i].role;
				var teamID = intersectArray[i].teamID;


				// calculate the needs of this Role with faktor always 1.0
				
				for ( j= 0; phasesWithActRole && j < phasesWithActRole.length; j++) {
					var phase = getPhaseByID(hrchy, vpv, phasesWithActRole[j]);
					var phasenStart = phase.relStart - 1;
				
					// logger4js.trace('Calculate Phase %s Roles %s', i, phase.AllRoles.length);					
					for (k = 0; phase && phase.AllRoles && k < phase.AllRoles.length ; k++) {
						if (phase.AllRoles[k].RollenTyp == actRoleID) {
							var role = phase.AllRoles[k];									
							// logger4js.trace("Calculate Bedarf of Role %O", role.Bedarf);
							if (role &&  role.Bedarf) {
								var dimension = role.Bedarf.length;
								for (l = phasenStart; l < phasenStart + dimension; l++) {
									// result in euro or in personal day 									
									// if costValues[l] is not set yet use 0
									costValues[l].currentCost = (costValues[l].currentCost || 0) + role.Bedarf[l - phasenStart] * tagessatz  / 1000;								
									costValues[l].currentCost_PT = (costValues[l].currentCost_PT || 0) + role.Bedarf[l - phasenStart] ;							
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
	return costValues;
}

function getCapaValues(dauer, concerningRoles, allRoles) {
	var capaValues = [];

	for (i=0 ; i < dauer; i++){
		capaElem.internCapa_PT = 0;
		capaElem.externCapa_PT = 0;
		capaElem.internCapa = 0;
		capaElem.externCapa = 0;
		capaValues[i] = capaElem;
	}


	// Calculate the Capacities of this Role
	for ( cR = 0; cR < concerningRoles.length; cR++){

		var actRoleID = concerningRoles[cR].actRole.uid;	
		var faktor = concerningRoles[cR].faktor;
		
		var tagessatz = allRoles[actRoleID] ? allRoles[actRoleID].tagessatzIntern : 0;
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
					var newRole = rclists[role.RollenTyp];
					if (newRole[role.teamID]){
						var phasesPerTeam = newRole[role.teamID];
						var indexPhase= phasesPerTeam.indexOf(phase.name);
						if (!(indexPhase >= 0)) {
							phasesPerTeam.push(phase.name);
							newRole[role.teamID] = phasesPerTeam;
							rclists[role.RollenTyp] = newRole;							
						}					
					} else {
						var phasesPerTeam = [];
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


function getConcerningRoles(allRoles, roleID) {
	var concerningRoles = [];
	var crElem = {};
	// find all roles corresponding to this one roleID all over the organisation - result in concerningRoles
	if (roleID || roleID != ""){	

		var actRole = allRoles[roleID];
		crElem = {};
		crElem.actRole = allRoles[roleID];
		crElem.teamID = -1;
		crElem.faktor = 1;
		concerningRoles.push(crElem);

		var subRoles = actRole.subRoleIDs;	

		if (subRoles.length > 0 ){				
			subRoles.forEach(findConcerningRoles);
		}

		function findConcerningRoles(value,index,array) {
			//value is the Id of one subrole
			var hroleID = value.key;
			crElem = {};
			crElem.actRole = allRoles[hroleID];
			
			if (actRole.isTeam){				
				for (t = 0 ; t < crElem.actRole.teamIDs.length; t++) {
					var team = crElem.actRole.teamIDs[t];
					crElem.teamID = team.key;
					var teamValue = parseFloat(team.value.replace(',', '.'));
					crElem.faktor = teamValue;
					concerningRoles.push(crElem);
				}
			} else {
				crElem.teamID = -1;
				crElem.faktor = 1.0;
				concerningRoles.push(crElem);

				actRole = crElem.actRole;	
				if (actRole && actRole.subRoleIDs.length > 0){				
					var shroles =actRole.subRoleIDs;
					shroles.forEach(findConcerningRoles);
				}			
			}		
			
		}
	}
	return concerningRoles;
}


// find summary Roles
function getSummaryRoles(allRoles, roleID) {
	var summaryRoles = [];
	// all summary roles
	if (!roleID && allRoles) {
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
			function findSummaryRoles(value,index,array) {
				//value is the Id of one subrole							
				var hroleID = value.key;
				var hrole = allRoles[hroleID];							
				if (hrole.subRoleIDs.length > 0){
					summaryRoles[hroleID] = hrole;
					var shroles = hrole.subRoleIDs;
					shroles.forEach(findSummaryRoles);
				}			
			}					
		}
		return summaryRoles;
	}		
}

function getParentOfRole (roleID, allRoles) {
	var parentRole = undefined;
	if (allRoles[roleID]) {
		// find all summaryRoles
		var sumRoles = getSummaryRoles(allRoles, "");    
		var notFound = true;
		for (k=0; sumRoles && k < sumRoles.length;k++){
			// check only roles, which are not isTeam or isTeamParent
			var hrole = sumRoles[k];		
			if (hrole && !hrole.isTeam && !hrole.isTeamParent)	{
				for(i=0; notFound && hrole && i< hrole.subRoleIDs.length; i++ ){
					var roleuid = hrole.subRoleIDs[i].key;
					if ( hrole.subRoleIDs[i] && hrole.subRoleIDs[i].key == roleID) {
						parentRole = hrole;
					}
				}
			}
		
		}
	}
	return parentRole;
}

function buildTopNodes(allRoles) {
	var topLevelNodes = [];
	var i = 1;

	while (i <= allRoles.length){
		var currentRole = allRoles[i];
		if (currentRole) {
			var parent = getParentOfRole(currentRole.uid, allRoles);
			if (!parent && !topLevelNodes[currentRole.uid]) topLevelNodes[currentRole.uid] = currentRole;
		}
		i++;
	}
	return topLevelNodes;
}

function getTeamOfSummaryRole(allTeams, allRoles){
	var virtuals = undefined;

	for (j=0; allTeams && j < allTeams.length; j++) {
		var oneTeam = allTeams[j];
		if (oneTeam) {
			var isVirtual = true;
			var k = 0;			
			var vglID = undefined;				
			while (k < oneTeam.subRoleIDs.length){
				var currentRole = oneTeam.subRoleIDs[k];
				if (currentRole) {							
					var parent = getParentOfRole(currentRole.key, allRoles);	
					// parent is role
					// look, if the other team-members includes to this parent as well		
					if (parent && !parent.isTeam) {
						if (k == 0)  {
							vglID = parent.uid;	
						} else {
							if (vglID != parent.uid) {		
								isVirtual = false;
								break;								
							}
						}
						k++;
					} else {
						isVirtual = false;
						break;
					}
				}
			}
			virtuals = [];
			virtuals[oneTeam.uid] = isVirtual;
		}
		j++;		
	}
	return virtuals;
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



module.exports = {
	getAllPersonalKosten: getAllPersonalKosten,
	getAllOtherCost: getAllOtherCost,
	calcKeyMetrics: calcKeyMetrics,
	calcCosts: calcCosts,
	calcDeliverables: calcDeliverables,
	calcDeadlines: calcDeadlines,
	calcCapacities: calcCapacities,
	cleanupRestrictedVersion: cleanupRestrictedVersion,
	getRessourcenBedarfe: getRessourcenBedarfe
};
