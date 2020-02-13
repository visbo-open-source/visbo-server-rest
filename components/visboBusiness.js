
var logging = require('../components/logging');

var logModule = "VPV";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var refMonth = undefined;

function getColumnOfDate(value) {
	if (!refMonth) {
		var d = new Date ("2015-01-01")
		refMonth = d.getFullYear() * 12;
	}
	var valueMonth = value.getFullYear() * 12 + value.getMonth();
	logger4js.trace("Calculate Month Column ref %s value %s diff %s ", refMonth, valueMonth, valueMonth - refMonth);
	return valueMonth - refMonth;
}

function addDays(dd, numDays) {
	var inputDate = new Date(dd);
	inputDate.setDate(inputDate.getDate() + numDays);
	return inputDate;
 }

// calculate cost of personal for the requested project per month
function getAllPersonalKosten(vpv, organisation) {
	costValues = [];
	logger4js.debug("Calculate Personal Cost of Visbo Project Version %s start %s end %s organisation TS %s", vpv._id, vpv.startDate, vpv.endDate, organisation.timestamp);
	var startCalc = new Date();


	// prepare organisation for direct access to uid
	var allRoles = [];
	for (var i = 0; organisation && organisation.value && organisation.value.allRoles && i < organisation.value.allRoles.length; i++) {
		allRoles[organisation.value.allRoles[i].uid] = organisation.value.allRoles[i]
	}
	var endCalc = new Date();
	logger4js.debug("Calculate Personal Cost Convert Organisation %s ", endCalc.getTime() - startCalc.getTime());

	startCalc = new Date();
	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var dauer = endIndex - startIndex + 1;
	var faktor = 1;

	for (i=0 ; i < dauer; i++){
		costValues[i] = 0;
	}

	if (dauer > 0) {
		//for (x = 0; x < 1; x++) { // for performance Test do it several times
			for (var i = 0; vpv && vpv.AllPhases && i < vpv.AllPhases.length; i++) {
				var phase = vpv.AllPhases[i];
				var phasenStart = phase.relStart - 1

				for (var j = 0; phase && phase.AllRoles && j < phase.AllRoles.length; j++) {
					logger4js.trace("Calculate Phase %s Roles %s", i, phase.AllRoles.length);
					//????
					var role = phase.AllRoles[j];
					var tagessatz = allRoles[role.RollenTyp] ? allRoles[role.RollenTyp].tagessatzIntern : 0;
					// logger4js.trace("Calculate Bedarf of Role %O", role.Bedarf);
					if (role &&  role.Bedarf) {
						var dimension = role.Bedarf.length;
						for (var k = phasenStart; k < phasenStart + dimension; k++) {
							// if costValue[i] is not set yet use 0
							costValues[k] = (costValues[k] || 0) + role.Bedarf[k - phasenStart] * tagessatz * faktor / 1000
						}
					}
				}
			}
		//}
	}
	else {
		costValues[0] = 0
	}
	var endCalc = new Date();
	logger4js.debug("Calculate Personal Cost duration %s ", endCalc.getTime() - startCalc.getTime());
	return costValues;
}


// calculate all other Costs for the requested project per month
function getAllOtherCost(vpv, organisation) {
	othercostValues = [];

	logger4js.debug("Calculate all other Cost of Visbo Project Version %s start %s end %s organisation TS %s", vpv._id, vpv.startDate, vpv.endDate, organisation.timestamp);
	var startCalc = new Date();
	// prepare organisation for direct access to uid
	var allCosts = [];
	for (var i = 0; organisation && organisation.value && organisation.value.allRoles && i < organisation.value.allCosts.length; i++) {
		allCosts[organisation.value.allCosts[i].uid] = organisation.value.allCosts[i]
	}
	var endCalc = new Date();
	logger4js.debug("Calculate all other Cost Convert Organisation %s ", endCalc.getTime() - startCalc.getTime());

	startCalc = new Date();
	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var dauer = endIndex - startIndex + 1;
	var faktor = 1;

	for (i=0 ; i < dauer; i++){
		othercostValues[i] = 0;
	}

	if (dauer > 0) {

			for (var i = 0; vpv && vpv.AllPhases && i < vpv.AllPhases.length; i++) {
				var phase = vpv.AllPhases[i];
				var phasenStart = phase.relStart - 1
				// logger4js.trace("Calculate Phase %s Costs %s", i, phase.AllCosts.length);
				for (var j = 0; phase && phase.AllCosts && j < phase.AllCosts.length; j++) {
					var cost = phase.AllCosts[j];
					var costTyp = cost.KostenTyp;
					var tagessatz = allCosts[cost.KostenTyp].budget;
					// logger4js.trace("Calculate Bedarf of Cost %O", cost.Bedarf);
					if (cost.Bedarf) {
						var dimension = cost.Bedarf.length;
						for (var k = phasenStart; k < phasenStart + dimension; k++) {
							// if OthercostValue[i] is not set yet use 0
							othercostValues[k] = (othercostValues[k] || 0) + cost.Bedarf[k - phasenStart] * faktor // dieser Wert ist bereits in T € und muss nicht dividiert durch 1000
						}
					}
				}
			}
		//}
	} else {
		othercostValues[0] = 0
	}
	//var endCalc = new Date();
	//logger4js.warn("Calculate all other Cost duration %s ", endCalc.getTime() - startCalc.getTime());
	return othercostValues;

}

function calcCosts(vpv, pfv, organisation) {
	var allCostValues = [];
	var allCostValuesIndexed = [];
	var startCalc = new Date();
	if ( vpv && organisation ) {
		var currentDate = new Date(vpv.startDate);
		currentDate.setDate(1);
		currentDate.setHours(0, 0, 0, 0);
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;

		var personalCost = getAllPersonalKosten(vpv, organisation);
		var allOtherCost = getAllOtherCost(vpv, organisation);

		for (var i = 0 ; i < dauer; i++){
			allCostValues[currentDate] = {
				'currentCost': personalCost[i] + allOtherCost[i]
			};
			currentDate.setMonth(currentDate.getMonth() + 1);
		}
	}
	if ( pfv && organisation ) {
		var currentDate = new Date(pfv.startDate);
		currentDate.setDate(1);
		currentDate.setHours(0, 0, 0, 0);
		var startIndex = getColumnOfDate(pfv.startDate);
		var endIndex = getColumnOfDate(pfv.endDate);
		var dauer = endIndex - startIndex + 1;

		var personalCost = getAllPersonalKosten(pfv, organisation);
		var allOtherCost = getAllOtherCost(pfv, organisation);

		for (var i = 0 ; i < dauer; i++){
			if (!allCostValues[currentDate]) allCostValues[currentDate] = {}
			allCostValues[currentDate].baseLineCost = personalCost[i] + allOtherCost[i];
			currentDate.setMonth(currentDate.getMonth() + 1);
		}
	}
	var j = 0, element;
	for (element in allCostValues) {
		allCostValuesIndexed[j] = {
			'currentDate': (new Date(element)).toISOString(),
			'baseLineCost': allCostValues[element].baseLineCost || 0,
			'currentCost': allCostValues[element].currentCost || 0
		}
		j++
	}

	var endCalc = new Date();
	logger4js.info("Calculate Project Costs duration %s ms ", endCalc.getTime() - startCalc.getTime());
	return allCostValuesIndexed;
}

function getNamePart(str, part) {
		var result = undefined;
		if (!str || part < 0) {
			return result;
		}
		var compName = str.split("§");
		if (compName.length > part) {
			result = compName[part];
		}
		return result;
}

function calcDeadlines(vpv, pfv) {
	var allDeadlineValuesIndexed = [];
	var startCalc = new Date();

	if (!vpv || !pfv ) {
		logger4js.warn("Calculate Project Deadlines missing at least one parameter ");
		return allDeadlineValuesIndexed;
	}

	var hrchy_pfv = convertHierarchy(pfv);
	var hrchy_vpv = convertHierarchy(vpv);
	var allDeadlines = getDeadlines(pfv, hrchy_pfv, undefined);
	allDeadlines = getDeadlines(vpv, hrchy_vpv, allDeadlines);

	var j = 0, element;
	var listDeadlines = allDeadlines.getAllDeadlines();

	for (var element = 0; element < listDeadlines.length; element++) {
		logger4js.trace("Add Project Deadline %s", JSON.stringify(listDeadlines[element]));
		var name = getNamePart(listDeadlines[element].nameID || '§UNDEFINED', 1);
		allDeadlineValuesIndexed[j] = {
			'name': name || getNamePart(listDeadlines[element].phasePFV, 1),
			'phasePFV': getNamePart(listDeadlines[element].phasePFV, 1),
			'phaseVPV': getNamePart(listDeadlines[element].phaseVPV, 1),
			'type': listDeadlines[element].type || 'UNDEFINED',
			'endDatePFV': listDeadlines[element].endDatePFV || '',
			'endDateVPV': listDeadlines[element].endDateVPV || '',
			'changeDays': Math.round((listDeadlines[element].endDateVPV - listDeadlines[element].endDatePFV) / 1000 / 3600 / 24),
			'percentDone': listDeadlines[element].percentDone || 0
		}
		j++
	}
	var endCalc = new Date();
	logger4js.info("Calculate Project Deadlines duration %s ms ", endCalc.getTime() - startCalc.getTime());
	return allDeadlineValuesIndexed;
}

function calcDeliverables(vpv, pfv) {
	var allDeliveryValuesIndexed = [];
	var startCalc = new Date();

	if (!vpv || !pfv ) {
		logger4js.warn("Calculate Project Deliveries missing at least one parameter ");
		return allDeliveryValuesIndexed;
	}

	var hrchy_pfv = convertHierarchy(pfv);
	var hrchy_vpv = convertHierarchy(vpv);
	var allDeliverables = getAllDeliverables(pfv, hrchy_pfv, undefined);
	allDeliverables = getAllDeliverables(vpv, hrchy_vpv, allDeliverables);

	var j = 0, element;
	var listDeliveries = allDeliverables.getAllDeliveries();

	for (var element = 0; element < listDeliveries.length; element++) {
		logger4js.trace("Add Project Delivery %s", JSON.stringify(listDeliveries[element]));
		var name = getNamePart(listDeliveries[element].nameID || '§UNDEFINED', 1);
		allDeliveryValuesIndexed[j] = {
			'name': name,
			'phasePFV': getNamePart(listDeliveries[element].phasePFV, 1),
			'phaseVPV': getNamePart(listDeliveries[element].phaseVPV, 1),
			'description': listDeliveries[element].description || 'UNDEFINED',
			'datePFV': listDeliveries[element].datePFV || '',
			'dateVPV': listDeliveries[element].dateVPV || '',
			'changeDays': Math.round((listDeliveries[element].dateVPV - listDeliveries[element].datePFV) / 1000 / 3600 / 24),
			'percentDone': listDeliveries[element].percentDone || 0
		}
		j++
	}

	var endCalc = new Date();
	logger4js.info("Calculate Project Deliveries duration %s ms ", endCalc.getTime() - startCalc.getTime());
	return allDeliveryValuesIndexed;
}

function getSummeKosten(vpv, organisation, index){
	// calculate the total cost until index-month
	var costSum = 0;

	if (vpv && organisation && index){
		var allCostValues = {};
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;


		var personalCost = getAllPersonalKosten(vpv, organisation);
		var allOtherCost = getAllOtherCost(vpv, organisation);

		if (index > dauer - 1){
			index = dauer - 1
		}

		for (i = 0 ; i <= index; i++){
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
		if (newDeliverable.datePFV) this.allDeliverables[id].datePFV =  newDeliverable.datePFV;
	};
	this.updateDeliverable = function(id, updateDeliverable) {
		if (updateDeliverable == undefined) return;
		if (id == undefined) return;
		if (this.allDeliverables[id] == undefined) return;
		if (updateDeliverable.phase) this.allDeliverables[id].phaseVPV =  updateDeliverable.phase;
		if (updateDeliverable.description) this.allDeliverables[id].description =  updateDeliverable.description;
		if (updateDeliverable.dateVPV) this.allDeliverables[id].dateVPV =  updateDeliverable.dateVPV;
		if (updateDeliverable.percentDone) this.allDeliverables[id].percentDone =  updateDeliverable.percentDone;
	};
	this.getDelivery = function(id) {
		var result = this.allDeliverables[id] || {};
		return result
	};
	this.getAllDeliveries = function() {
		var idList = [];
		for (var id in this.allDeliverables) {
			idList.push(this.allDeliverables[id])
		}
		return idList;
	}
}

// Deliverables for the Project combine INfo from baseline and vpv
function VisboDeadlines() {
  this.length = 0;
  this.allDeadlines = {};
  this.addDeadline = function(id, newDeadline) {
		if (newDeadline == undefined) return;
		if (id == undefined) return;
		if (this.allDeadlines[id] == undefined) {
			this.allDeadlines[id] = {};
			this.length += 1;
		}
		if (newDeadline.nameID) this.allDeadlines[id].nameID =  newDeadline.nameID;
		if (newDeadline.phasePFV) this.allDeadlines[id].phasePFV =  newDeadline.phasePFV;
		if (newDeadline.name) this.allDeadlines[id].name =  newDeadline.name;
		if (newDeadline.type) this.allDeadlines[id].type =  newDeadline.type;
		if (newDeadline.endDatePFV) this.allDeadlines[id].endDatePFV =  newDeadline.endDatePFV;
	};
	this.updateDeadline = function(id, updateDeadline) {
		if (updateDeadline == undefined) return;
		if (id == undefined) return;
		if (this.allDeadlines[id] == undefined) return;
		if (updateDeadline.phaseVPV) this.allDeadlines[id].phaseVPV =  updateDeadline.phaseVPV;
		if (updateDeadline.endDateVPV) this.allDeadlines[id].endDateVPV =  updateDeadline.endDateVPV;
		if (updateDeadline.percentDone) this.allDeadlines[id].percentDone =  updateDeadline.percentDone;
	};
	this.getDeadline = function(id) {
		var result = this.allDeadlines[id] || {};
		return result
	};
	this.getAllDeadlines = function() {
		var idList = [];
		for (var id in this.allDeadlines) {
			idList.push(this.allDeadlines[id])
		}
		return idList;
	}
}

// check if elemId is milestone
function elemIdIsMilestone(elemId) {
	var isElemId = false;

	if (elemId) {
		// is string at the beginning of the nameID
		isElemId = (elemId.indexOf("1§") == 0);
	}

	return isElemId;
}


function getPhaseByID(hrchy, vpv, elemId){
	var phase = undefined;

	if (hrchy && hrchy[elemId] && hrchy[elemId].hryNode) {
		var phIndex = hrchy[elemId].hryNode.indexOfElem;
		if (vpv.AllPhases && phIndex > 0 && phIndex <= vpv.AllPhases.length) {
				phase = vpv.AllPhases[phIndex-1];
		}
	}
	logger4js.trace("find the the Phase %s of the project %s ", elemId, vpv.name);
	return phase;
}

function getMilestoneByID(hrchy,vpv, elemId){
	var ms = undefined;

	if (hrchy && hrchy[elemId]) {
		currentNode = hrchy[elemId].hryNode;
		if (currentNode){
			 var phaseID = currentNode.parentNodeKey;
			 var phase = getPhaseByID(hrchy,vpv,phaseID);
			 var msIndex = currentNode.indexOfElem;

			if (phase && phase.AllResults){
				ms = phase.AllResults[msIndex-1];
			}
		}
	}
	logger4js.trace("find the milestone number %s of the project %s ", elemId, vpv.name);
	return ms;
}

function getMsDate(hrchy, vpv, elemId){
	var msDate = undefined;

	currentNode = elemId && hrchy[elemId] && hrchy[elemId].hryNode;
	if (currentNode){
		 phaseID = currentNode.parentNodeKey;
		 phase = getPhaseByID(hrchy, vpv, phaseID);

		 var msIndex = currentNode.indexOfElem;
		 if (phase ) {
			ms = phase.AllResults[msIndex-1];
			logger4js.trace("get the Date of Milestone %s in %s ", ms.name, phase.name);
   			msDate = addDays(vpv.startDate, (phase.startOffsetinDays + ms.offset));
		 }
	}
	return msDate;
}

// get endDate of Phase to use also for other elemenst like i.e. Deliveries
function getPhEndDate(vpv, phase){
	var phEndDate = new Date();

	if (phase){
		logger4js.trace("find the endDate of the Phase %s  ", phase.name);
		if (phase.dauerInDays > 0){
			phEndDate = addDays(vpv.startDate, phase.startOffsetinDays + phase.dauerInDays -1);
		}
		else{
			phEndDate = addDays(vpv.startDate, phase.startOffsetinDays);
		}
	}

	return phEndDate;
}



// find all milestones of one VisboProjectVersion
// function getMilestonesOld(hrchy, vpv){

// 	var milestones=[];

// 	if (vpv && vpv.hierarchy && vpv.hierarchy.allNodes && hrchy){

// 		logger4js.trace("Calculate all milestones of %s  ", vpv._id);

// 		for (var i = 0; i < vpv.hierarchy.allNodes.length; i++) {
// 			var currentNodeID = vpv.hierarchy.allNodes[i].hryNodeKey;
// 			if (elemIdIsMilestone(currentNodeID)){
// 				var msDate = getMsDate(hrchy, vpv, currentNodeID);
// 				if (msDate){
// 					while (milestones[msDate] != null) {
// 						//add one millisecond to  msDate to make the key unique
// 						msDate.setMilliseconds(msDate.getMilliseconds + 1);
// 					}
// 					milestones[msDate] = currentNodeID;

// 				}

// 			}
// 		}
// 	}
// 	return milestones.reverse();
// }

// find all phases of One VisboProjectVersion vpv
// function getPhasesOld(hrchy, vpv){

// 	var phases = [];

// 	if (vpv && vpv.hierarchy && vpv.hierarchy.allNodes && hrchy){

// 		logger4js.trace("Calculate all phases of %s  ", vpv._id);

// 		for (var i = 0; i < vpv.hierarchy.allNodes.length; i++) {
// 			var currentNodeID = vpv.hierarchy.allNodes[i].hryNodeKey;

// 			if (!elemIdIsMilestone(currentNodeID)){
// 				if (currentNodeID != null){
// 					var phase = getPhaseByID(hrchy, vpv, currentNodeID);
// 					var phaseDate = getPhEndDate(vpv, phase);

// 					if (phaseDate){
// 						while (phases[phaseDate] != null) {
// 							//add one millisecond to  phaseDate to make the key unique
// 							phaseDate.setMilliseconds(phaseDate.getMilliseconds + 1);
// 						}
// 						phases[phaseDate] = currentNodeID;
// 					}
// 				}
// 			}
// 		}
// 	}
// 	return phases.reverse();
// }

// Calculate all Deliverables for the requested Project/BaseProject
function getAllDeliverables(vpv, hrchy, allDeliverables) {

	logger4js.trace("Calculate all Deliverables of %s  ", vpv && vpv._id);

	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var dauer = endIndex - startIndex + 1;
	var addAll = false;

	if (!vpv || !vpv._id || dauer <= 0 || !vpv.AllPhases) {
		return undefined;
	}

	if (vpv.variantName == 'pfv') {
		addAll = true;
		// initialise the deliverables for the project version
		allDeliverables = new VisboDeliverable();
	} else if (!allDeliverables) {
		addAll = true;
		allDeliverables = new VisboDeliverable();
	}

	for (var i = 0; i < vpv.AllPhases.length; i++) {
		var phase = vpv.AllPhases[i];
		var endDate = getPhEndDate(vpv, phase);
		var phasenStart = phase.relStart - 1;
		// logger4js.trace("Calculate Phase %s Deliverables %s", i, phase.deliverables.length);

		for (var j = 0; phase.deliverables && j < phase.deliverables.length; j++) {
			var id = phase.deliverables[j]
			if (addAll) {
				allDeliverables.addDeliverable(id, {nameID: phase.name, description: phase.deliverables[j], datePFV: endDate})
			} else {
				allDeliverables.updateDeliverable(id, {description: phase.deliverables[j], dateVPV: endDate, percentDone:  (phase && phase.percentDone) || 0})
			}
		}

		for (var k = 0; phase && phase.AllResults && k < phase.AllResults.length; k++){
			var milestone = phase.AllResults[k];
			var endDate = getMsDate(hrchy, vpv, milestone.name);

			// logger4js.trace("Calculate Milestone %s Deliverables %s", i, phase.AllResults.length);

			for (var m = 0; milestone && milestone.deliverables && m < milestone.deliverables.length; m++){
				// logger4js.trace("fetch Deliverable %s of phase %s", deliv.name, milestone.nameID);
				var id = milestone.deliverables[m]
				if (addAll) {
					allDeliverables.addDeliverable(id, {phase: phase.name, nameID: milestone.name, description: milestone.deliverables[m], datePFV: endDate})
				} else {
					allDeliverables.updateDeliverable(id, {phase: phase.name, description: milestone.deliverables[m], dateVPV: endDate, percentDone: (milestone && milestone.percentDone) || 0})
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
		if (listDeliveries[element].dateVPV) {
			result.deliverableCompletionCurrentTotal += 1;
		}
		// Item was planned before refDate in baseline
		if (listDeliveries[element].datePFV && listDeliveries[element].datePFV.getTime() < refDate.getTime()) {
			result.deliverableCompletionBaseLastActual += 1
		}
		// Item was due in VPV, add it to actual weighted with percentDone
		if (listDeliveries[element].dateVPV && listDeliveries[element].dateVPV.getTime() < refDate.getTime()) {
			result.deliverableCompletionCurrentActual += 1 * (listDeliveries[element].percentDone || 0);
		}
	}
	return result;
}

// Calculate all Deadlines for the requested Project/BaseProject
function getDeadlines(vpv, hrchy, allDeadlines) {

	logger4js.trace("Calculate all Deadlines of %s  ", vpv && vpv._id);

	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var dauer = endIndex - startIndex + 1;
	var addAll = false;

	if (!vpv || !vpv.hierarchy || !vpv.hierarchy.allNodes || !vpv.AllPhases || !hrchy) {
		return undefined;
	}

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
			if (isMS) {				
				var name = currentNodeID;
				var milestone = getMilestoneByID(hrchy, vpv, currentNodeID);
				var endDate = getMsDate(hrchy, vpv, currentNodeID);
				var phaseName = hryElement.hryNode && hryElement.hryNode.parentNodeKey;
				var phase = getPhaseByID(hrchy, vpv, phaseName);				
				if (addAll) {
					allDeadlines.addDeadline(currentNodeID, {nameID: currentNodeID, type: "Milestone", name: name, phasePFV: phaseName, endDatePFV: endDate})
				} else {
					allDeadlines.updateDeadline(currentNodeID, {nameID: currentNodeID, phaseVPV: phaseName, endDateVPV: endDate, percentDone: (milestone && milestone.percentDone) || 0})
				}
			} else {
				// currentNode is a phase
				var phase = getPhaseByID(hrchy, vpv, currentNodeID);
				var endDate = getPhEndDate(vpv, phase);
				var name = currentNodeID;
				// get rid of root node "0"
				if (name && name.length > 2 && endDate) {
					if (addAll) {
						allDeadlines.addDeadline(currentNodeID, {nameID: currentNodeID, type: "Phase", name: name, phasePFV: name, endDatePFV: endDate})
					} else {
						allDeadlines.updateDeadline(currentNodeID, {nameID: currentNodeID, endDateVPV: endDate, percentDone: (phase && phase.percentDone) || 0})
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
		result.timeCompletionBaseLastActual += 1
	}
	// Item was due in VPV, add it to actual weighted with percentDone
	if (listDeadlines[element].endDateVPV && listDeadlines[element].endDateVPV.getTime() < refDate.getTime()) {
		result.timeCompletionCurrentActual += 1 * (listDeadlines[element].percentDone || 0);
	}
}
return result;
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
};

function calcKeyMetrics(vpv, pfv, organisation) {
	var keyMetrics = {};
	var oldkeyMetrics = {};
	var startCalc = new Date();
	var pfv_Deliverables = [];
	var vpv_Deliverables = [];

	if (vpv && pfv){

		// Calculate keyMetrics Values here
		oldkeyMetrics = vpv.keyMetrics;
		keyMetrics = vpv.keyMetrics || {};
		logger4js.debug("Calculate KeyMetrics for %s with pfv %s and organization %s result %s ", vpv && vpv._id, pfv && pfv._id, organisation && organisation._id, JSON.stringify(keyMetrics));

		if (vpv.variantName != "pfv"){

			var indexTotal = getColumnOfDate(vpv.endDate) - getColumnOfDate(vpv.startDate);
			var indexActual = getColumnOfDate(vpv.timestamp) - getColumnOfDate(vpv.startDate);

			if (organisation){
				keyMetrics.costBaseLastActual = getSummeKosten(pfv, organisation, indexActual);
				keyMetrics.costBaseLastTotal = getSummeKosten(pfv, organisation, indexTotal);

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
	logger4js.info("Calculate KeyMetrics duration %s ms ", endCalc.getTime() - startCalc.getTime());

	return keyMetrics;

}

module.exports = {
	getAllPersonalKosten: getAllPersonalKosten,
	getAllOtherCost: getAllOtherCost,
	calcKeyMetrics: calcKeyMetrics,
	calcCosts: calcCosts,
	calcDeliverables: calcDeliverables,
	calcDeadlines: calcDeadlines
};
