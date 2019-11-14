//var mongoose = require('mongoose');
//var clsResult = mongoose.model('clsResult');
//var clsHierarchyNode = mongoose.model('clsHierarchyNode');
//var clsPhase = mongoose.model('clsPhase');
var logging = require('../components/logging');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var refMonth = undefined;

var getColumnOfDate = function(value) {
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
	return new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate() + numDays);
 }

// calculate cost of personal for the requested project per month
var getAllPersonalKosten = function(vpv, organisation) {
	costValues = [];
	logger4js.info("Calculate Personal Cost of Visbo Project Version %s start %s end %s organisation TS %s", vpv._id, vpv.startDate, vpv.endDate, organisation.timestamp);
	var startCalc = new Date();
	// prepare organisation for direct access to uid
	var allRoles = [];
	for (var i = 0; i < organisation.value.allRoles.length; i++) {
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
			for (var i = 0; i < vpv.AllPhases.length; i++) {
				var phase = vpv.AllPhases[i];
				var phasenStart = phase.relStart - 1
				// logger4js.trace("Calculate Phase %s Roles %s", i, phase.AllRoles.length);
				for (var j = 0; j < phase.AllRoles.length; j++) {
					var role = phase.AllRoles[j];
					var tagessatz = allRoles[role.RollenTyp].tagessatzIntern;
					// logger4js.trace("Calculate Bedarf of Role %O", role.Bedarf);
					if (role.Bedarf) {
						var dimension = role.Bedarf.length;
						for (var k = phasenStart; k < phasenStart + dimension; k++) {
							// if costValue[i] is not set yet use 0
							costValues[k] = (costValues[k] || 0) + role.Bedarf[k - phasenStart] * tagessatz * faktor / 1000
						}
					}
				}
			}
		//}
	} else {
		costValues[0] = 0
	}
	//var endCalc = new Date();
	//logger4js.warn("Calculate Personal Cost duration %s ", endCalc.getTime() - startCalc.getTime());
	return costValues;
}


// calculate all other Costs for the requested project per month
var getAllOtherCost = function(vpv, organisation) {
	OthercostValues = [];
	
	logger4js.info("Calculate all other Cost of Visbo Project Version %s start %s end %s organisation TS %s", vpv._id, vpv.startDate, vpv.endDate, organisation.timestamp);
	var startCalc = new Date();
	// prepare organisation for direct access to uid
	var allCosts = [];
	for (var i = 0; i < organisation.value.allCosts.length; i++) {
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
		OthercostValues[i] = 0;
	}

	if (dauer > 0) {
		//for (x = 0; x < 1; x++) { // for performance Test do it several times
			for (var i = 0; i < vpv.AllPhases.length; i++) {
				var phase = vpv.AllPhases[i];
				var phasenStart = phase.relStart - 1
				// logger4js.trace("Calculate Phase %s Costs %s", i, phase.AllCosts.length);
				for (var j = 0; j < phase.AllCosts.length; j++) {
					var cost = phase.AllCosts[j];
					var costTyp = cost.KostenTyp;
					var tagessatz = allCosts[cost.KostenTyp].budget;
					// logger4js.trace("Calculate Bedarf of Cost %O", cost.Bedarf);
					if (cost.Bedarf) {
						var dimension = cost.Bedarf.length;
						for (var k = phasenStart; k < phasenStart + dimension; k++) {
							// if OthercostValue[i] is not set yet use 0
							OthercostValues[k] = (OthercostValues[k] || 0) + cost.Bedarf[k - phasenStart] * faktor // dieser Wert ist bereits in T € und muss nicht dividiert durch 1000
						}
					}
				}
			}
		//}
	} else {
		OthercostValues[0] = 0
	}
	//var endCalc = new Date();
	//logger4js.warn("Calculate all other Cost duration %s ", endCalc.getTime() - startCalc.getTime());
	return OthercostValues;
}

var getSummeKosten = function(vpv, organisation, index){
	// calculate the total cost until index-month
	var costSum = 0;

	if ((vpv != null) && (organisation != null)){
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

function deliverable (name, nameID){
	deliverable.name = name;
	deliverable.nameID = nameID;
}
var elemIdIsMilestone = function(elemId) {
	if (elemId != null) {
		var isElemId = (elemId.search("1§") >= 0);
	}
	else{
		isElemId = false;
	}
	
	return isElemId;
}


var getPhaseByID = function(hrchy, vpv, elemId){
	
	var phIndex = hrchy[elemId].hryNode.indexOfElem;
	
	if ((phIndex >= 0) && (phIndex <= vpv.AllPhases.length)){
		 phase = vpv.AllPhases[phIndex-1];
	}
	else{
		phase = null;
	}	
	logger4js.trace("find the the Phase %s of the project %s ", phase.name, vpv.name);
	return phase;
}

var getMilestoneByID = function(hrchy,vpv, elemId){
	
	// prepared for direct Access with elemId
	// hrchy = vpv.hierarchy, sortiert nach elemId	
	
	currentNode = hrchy[elemId].hryNode;
	if (currentNode != null){
		 phaseID = currentNode.parentNodeKey;
		 phase = getPhaseByID(hrchy,vpv,phaseID);
		 var msIndex = currentNode.indexOfElem;
		 ms = phase.AllResults[msIndex-1];		 
	}
	else{
		ms = null;
	}	
	logger4js.trace("find the milestone %s of the project %s ", ms.name, vpv.name);
	return ms;
}
var getMsDate = function(hrchy, vpv, elemId){
	//var ms = new clsResult();
	//var hrchy = vpv.hierarchy;
	var msDate = new Date();	
	//var currentNode = new clsHierarchyNode();

	//if ((msIndex >= 0) && (msIndex <= hrchy.allNodes.length)){
	currentNode = hrchy[elemId].hryNode;
	if (currentNode != null){
		 phaseID = currentNode.parentNodeKey;
		 phase = getPhaseByID(hrchy, vpv, phaseID);
		 
		 var msIndex = currentNode.indexOfElem;
		 ms = phase.AllResults[msIndex-1];
		 
		 logger4js.trace("get the Date of Milestone %s in %s ", ms.name, phase.name);

		 msDate = addDays(vpv.startDate, (phase.startOffsetinDays + ms.offset));
	}
	else{
		msDate = null;
	}	
	return msDate;
}
// Herausfinden des EndDates der Phase phase
var getPhEndDate = function(vpv, phase){
	var phEndDate = new Date();
	logger4js.trace("find the endDate of the Phase %s  ", phase.name);
	if (phase.dauerInDays > 0){
		phEndDate = addDays(vpv.startDate, phase.startOffsetinDays + phase.dauerInDays -1);
	}
	else{
		phEndDate = addDays(vpv.startDate, phase.startOffsetinDays);
	}
	return phEndDate; 
}



// finde all milestones of one VisboProjectVersion
var getMilestones = function(hrchy, vpv){
	
	if (vpv != null){

		var milestones=[];
			
		logger4js.trace("Calculate all milestones of %s  ", vpv && vpv._id);
		
		
		for (var i = 0; i < vpv.hierarchy.allNodes.length; i++) {
			var currentNodeID = vpv.hierarchy.allNodes[i].hryNodeKey;
			if (elemIdIsMilestone(currentNodeID)){
				var msDate = getMsDate(hrchy, vpv, currentNodeID);
				while (milestones[msDate] != null) {
					//addiere auf msDate eine MilliSekunde					
					msDate.setMilliseconds(msDate.getMilliseconds + 1);
				}
				milestones[msDate] = currentNodeID;
			}		
		}
	}	
	return milestones.reverse();
}

// find all phases of One VisboProjectVersion vpv
var getPhases = function(hrchy, vpv){

	if (vpv != null){

		var phases = [];

		logger4js.trace("Calculate all phases of %s  ", vpv && vpv._id);		
				
		for (var i = 0; i < vpv.hierarchy.allNodes.length; i++) {
			var currentNodeID = vpv.hierarchy.allNodes[i].hryNodeKey;

			if (!elemIdIsMilestone(currentNodeID)){	
				if (currentNodeID != null){
					var phase = getPhaseByID(hrchy, vpv, currentNodeID);
					var phaseDate = getPhEndDate(vpv, phase);
					while (phases[phaseDate] != null) {
						//addiere auf phaseDate eine MilliSekunde					
						phaseDate.setMilliseconds(phaseDate.getMilliseconds + 1);
					}
					phases[phaseDate] = currentNodeID;
				}			
			
			}
		}	
	}	
return phases.reverse();
}


// Calculate all Deliverables for the requested Project/BaseProject
var getAllDeliverables = function(vpv) {
	allDelivNames=[];
	logger4js.trace("Calculate all Deliverables of %s  ", vpv && vpv._id);
	
	var startIndex = getColumnOfDate(vpv.startDate);
	var endIndex = getColumnOfDate(vpv.endDate);
	var dauer = endIndex - startIndex + 1;

	// Laufvariable für die aufgesammelten Deliverables
	var l = 0;
	
	if (dauer > 0) {	
			for (var i = 0; i < vpv.AllPhases.length; i++) {
				var phase = vpv.AllPhases[i];
				var phasenStart = phase.relStart - 1;
				// logger4js.trace("Calculate Phase %s Deliverables %s", i, phase.deliverables.length);
				var anzPhaseDel = phase.deliverables.length;
				for (var j = 0; j < vpv.AllPhases[i].deliverables.length; j++) {
					var tmpNameId = phase.name;
					var tmpdeliverable = phase.deliverables[j] + "(" + tmpNameId + ")";

					var deliv = new deliverable;
					deliv.nameID = tmpNameId;
					deliv.name = tmpdeliverable;
					// logger4js.trace("fetch Deliverable %s of phase %s", deliv.name, phase.nameID);
					allDelivNames[l] = deliv;
					l++;
				}
				var anzMS = phase.AllResults.length;
				for (var k = 0; k < phase.AllResults.length; k++){
					var milestone = phase.AllResults[k];
					var anzMsDeliv = milestone.deliverables.length;
					// logger4js.trace("Calculate Milestone %s Deliverables %s", i, phase.AllResults.length);	
					for (var m = 0; m < milestone.deliverables.length; m++){
						var tmpNameId = milestone.name;
						var tmpdeliverable = milestone.deliverables[m] + "(" + tmpNameId + ")";	

						var deliv = new deliverable;
						deliv.nameID = tmpNameId;
						deliv.name = tmpdeliverable;
						// logger4js.trace("fetch Deliverable %s of phase %s", deliv.name, milestone.nameID);
						allDelivNames[l] = deliv;
						l++;
					}
				}
			}
		}
	else {
		allDelivNames[0] = 0
	}
	return allDelivNames;
}

var getDeliverableCompletionMetric = function(vpv, baseDeliverables, bezugsdatum, total){

	var sum = 0;

	if (vpv != null){

		deliverableCompletionValues=[];
	
		logger4js.trace("Calculate metric of Deliverables of %s  ", vpv && vpv._id);
		
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;
	
		// Fill the Array with Value = 0 for every Element
		for (i=0 ; i < dauer; i++){
			deliverableCompletionValues[i] = 0;
		}
	
		var hrchy = [];
		for (var i = 0; i < vpv.hierarchy.allNodes.length; i++) {
			hrchy[vpv.hierarchy.allNodes[i].hryNodeKey] = vpv.hierarchy.allNodes[i];
		}	
	
		if (dauer > 0) {
			for (var i = 0; i < baseDeliverables.length; i++) {
				var baseDeliv = new deliverable();
				baseDeliv = baseDeliverables[i];
				var hstr = baseDeliv.name;
				var hstrArr = hstr.split("(");
				var baseDelivName = hstrArr[0];
	
				var isMS = elemIdIsMilestone(baseDeliv.nameID);
				if (!isMS){     // Deliverable gehört zu einer Phase
					
					var phase = getPhaseByID(hrchy,vpv, baseDeliv.nameID);
					if (phase != null){
						var currentEndIndex = phase.relEnde - 1;
						var currentPrzDone = phase.percentDone;
						var isElemOfPast = (getPhEndDate(vpv, phase).getTime() < bezugsdatum.getTime());
	
						if (vpv.variantName != "pfv"){
							if (total){
								if ((baseDelivName != "") && (phase.deliverables.search(baseDelivName))>= 0){
									deliverableCompletionValues[currentEndIndex] = deliverableCompletionValues[currentEndIndex] + 1;
								}
							}
							else{
								if (isElemOfPast){
									if ((baseDelivName != "") && (phase.deliverables.search(baseDelivName))>= 0){
										deliverableCompletionValues[currentEndIndex] = deliverableCompletionValues[currentEndIndex] + 1 * currentPrzDone;
									}
								}									
							}
						}
						else{
							if (total){
								if ((baseDelivName != "") && (phase.deliverables.search(baseDelivName))>= 0){
									deliverableCompletionValues[currentEndIndex] = deliverableCompletionValues[currentEndIndex] + 1;
								}
							}
							else{
								if (isElemOfPast){
									if ((baseDelivName != "") && (phase.deliverables.search(baseDelivName))>= 0){
										deliverableCompletionValues[currentEndIndex] = deliverableCompletionValues[currentEndIndex] + 1;
									}
								}
							
							}
						}
					}
				}
				else{           // Deliverable gehört zu einem Meilenstein
					
					ms = getMilestoneByID(hrchy,vpv, baseDeliv.nameID);		
			
					if (ms != null){
	
						var msStartDate = getMsDate(hrchy, vpv, baseDeliv.nameID)
						var currentEndIndex =getColumnOfDate(msStartDate) - getColumnOfDate(vpv.startDate);
						var currentPrzDone = ms.percentDone;
						var isElemOfPast = (msStartDate.getTime() < bezugsdatum.getTime());
						
						// prepare Deliverables for direct access to elemId
						var msDelilverables = [];
						for (var msi = 0; msi < ms.deliverables.length; msi++) {
							msDelilverables[ms.deliverables[msi]] = ms.deliverables[msi];
						}	
	
						if (vpv.variantName != "pfv"){
							if (total){
								if ((baseDelivName != "") && (msDelilverables[baseDelivName] != "")){
									deliverableCompletionValues[currentEndIndex] = deliverableCompletionValues[currentEndIndex] + 1;
								}
							}
							else{
								if (isElemOfPast){
									if ((baseDelivName != "") && (msDelilverables[baseDelivName] != "")){
										deliverableCompletionValues[currentEndIndex] = deliverableCompletionValues[currentEndIndex] + 1 * currentPrzDone;
									}
								}									
							}
						}
						else{
							if (total){
								if ((baseDelivName != "") && (msDelilverables[baseDelivName] != "")){
									deliverableCompletionValues[currentEndIndex] = deliverableCompletionValues[currentEndIndex] + 1;
								}
							}
							else{
								if (isElemOfPast){
									if ((baseDelivName != "") && (msDelilverables[baseDelivName] != "")){
										deliverableCompletionValues[currentEndIndex] = deliverableCompletionValues[currentEndIndex] + 1;
									}
								}
							
							}
						}
					}							
				}
			}
		}
	
		// Sum the values for all months
		var sum = 0;
		for (i=0; i < dauer; i++){
			sum += deliverableCompletionValues[i];
		}
	}

	return sum;
}


var getTimeCompletionMetric= function(vpv, baseMilestones, basePhases, bezugsdatum, total){
	
	var sum = 0;

	if (vpv != null){

		timeCompletionValues=[];
	
		logger4js.trace("Calculate metric of Deliverables of %s  ", vpv && vpv._id);
		
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;
	
		// Fill the Array with Value = 0 for every Element
		for (i=0 ; i < dauer; i++){
			timeCompletionValues[i] = 0;
		}
	
		var hrchy = [];
		for (var i = 0; i < vpv.hierarchy.allNodes.length; i++) {
			hrchy[vpv.hierarchy.allNodes[i].hryNodeKey] = vpv.hierarchy.allNodes[i];
		}	
	
		if (dauer > 0) {
			for (x in basePhases) {

				phaseId = basePhases[x] ;
				phase = getPhaseByID(hrchy, vpv, phaseId);

				if (phase != null){
					{
						var currentEndIndex = phase.relEnde - 1;
						var currentPrzDone = phase.percentDone;
						var isElemOfPast = (getPhEndDate(vpv, phase).getTime() < bezugsdatum.getTime());
	
						if (vpv.variantName != "pfv"){
							if (total){
								
								timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
								
							}
							else{
								if (isElemOfPast){
									
									timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1 * currentPrzDone;
									
								}									
							}
						}
						else{
							if (total){
								
								timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
								
							}
							else{
								if (isElemOfPast){
									
									timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
								}								
							
							}
						}
					}
				}

			}
			for (x in baseMilestones) {

				msId = baseMilestones[x] ;
				ms = getMilestoneByID(hrchy, vpv, msId);

				if (ms != null){

						var msStartDate = getMsDate(hrchy, vpv, msId)
						var currentEndIndex =getColumnOfDate(msStartDate) - getColumnOfDate(vpv.startDate);
						var currentPrzDone = ms.percentDone;
						var isElemOfPast = (msStartDate.getTime() < bezugsdatum.getTime());
						
						if (vpv.variantName != "pfv"){
							if (total){
								
								timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
								
							}
							else{
								if (isElemOfPast){
									
									timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1 * currentPrzDone;
									
								}									
							}
						}
						else{
							if (total){
								
								timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
								
							}
							else{
								if (isElemOfPast){
									
									timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
								}								
							
							}
						}
					}
				}

			}

		}
		// Sum the values for all months
		var sum = 0;
		for (i=0; i < dauer; i++){
			sum += timeCompletionValues[i];
		}
		
		return sum;
 }

var calcKeyMetrics = function(vpv, pfv, organisation) {
	var keyMetrics = {};
	var startCalc = new Date();
	var pfv_Deliverables = [];
	var vpv_Deliverables = [];
	
	if (vpv != null){

		// Calculate keyMetrics Values here
		keyMetrics = vpv.keyMetrics;
		logger4js.debug("Calculate KeyMetrics for %s with pfv %s and organization %s result %s ", vpv && vpv._id, pfv && pfv._id, organisation && organisation._id, JSON.stringify(keyMetrics));
		
		if (vpv.variantName != "pfv"){					
			var index = getColumnOfDate(vpv.endDate) - getColumnOfDate(vpv.startDate);
			keyMetrics.costBaseLastTotal = getSummeKosten(pfv, organisation, index);
			keyMetrics.costCurrentTotal= getSummeKosten(vpv, organisation, index);
			
			var index = getColumnOfDate(vpv.timestamp) - getColumnOfDate(vpv.startDate);
			keyMetrics.costCurrentActual= getSummeKosten(vpv, organisation, index);
			keyMetrics.costBaseLastActual = getSummeKosten(pfv, organisation, index);

			if (pfv != null){
				
				var hrchy = [];
				for (var i = 0; i < vpv.hierarchy.allNodes.length; i++) {
					hrchy[vpv.hierarchy.allNodes[i].hryNodeKey] = vpv.hierarchy.allNodes[i];
				}	

				baseMilestones = getMilestones(hrchy,pfv);
				basePhases = getPhases(hrchy, pfv);

				keyMetrics.timeCompletionCurrentActual = getTimeCompletionMetric(vpv, baseMilestones, basePhases, vpv.timestamp,false);
				keyMetrics.timeCompletionBaseLastActual = getTimeCompletionMetric(pfv, baseMilestones, basePhases, vpv.timestamp,false);
				keyMetrics.timeCompletionCurrentTotal = getTimeCompletionMetric(vpv, baseMilestones, basePhases, vpv.timestamp,true);
				keyMetrics.timeCompletionBaseLastTotal = getTimeCompletionMetric(pfv, baseMilestones, basePhases, vpv.timestamp,true);

				keyMetrics.endDateCurrent= vpv.endDate;
				keyMetrics.endDateBaseLast = pfv.endDate;

				pfv_Deliverables = getAllDeliverables(pfv);
				keyMetrics.deliverableCompletionBaseLastActual= getDeliverableCompletionMetric(pfv, pfv_Deliverables, vpv.timestamp, false);
				keyMetrics.deliverableCompletionBaseLastTotal= getDeliverableCompletionMetric(pfv, pfv_Deliverables, vpv.timestamp, true);	
				keyMetrics.deliverableCompletionCurrentActual= getDeliverableCompletionMetric(vpv, pfv_Deliverables, vpv.timestamp, false);
				keyMetrics.deliverableCompletionCurrentTotal= getDeliverableCompletionMetric(vpv, pfv_Deliverables, vpv.timestamp, true);

			}
			else{
				
				keyMetrics.timeCompletionCurrentActual = 0;
				keyMetrics.timeCompletionBaseLastActual = 0;
				keyMetrics.timeCompletionCurrentTotal = 0;
				keyMetrics.timeCompletionBaseLastTotal = 0;

				keyMetrics.endDateCurrent = vpv.endDate;
				keyMetrics.endDateBaseLast = null;

				vpv_Deliverables = getAllDeliverables(vpv);
				keyMetrics.deliverableCompletionBaseLastActual= 0;
				keyMetrics.deliverableCompletionBaseLastTotal= 0;	
				keyMetrics.deliverableCompletionCurrentActual= 0;
				keyMetrics.deliverableCompletionCurrentTotal= 0;
				keyMetrics.deliverableCompletionCurrentActual= getDeliverableCompletionMetric(vpv, vpv_Deliverables, vpv.timestamp, false);
				keyMetrics.deliverableCompletionCurrentTotal= getDeliverableCompletionMetric(vpv, vpv_Deliverables, vpv.timestamp, true);		
		
			}	
		
		}
		else{
			// übernehme die vorhandene keyMetrics
		}
	}

	else{
		keyMetrics = null;
	}

	var endCalc = new Date();
	logger4js.debug("Calculate KeyMetrics duration %s ms ", endCalc.getTime() - startCalc.getTime());

	return keyMetrics;
}

module.exports = {
	getAllPersonalKosten: getAllPersonalKosten,
	getAllOtherCost: getAllOtherCost,
	calcKeyMetrics: calcKeyMetrics
};
