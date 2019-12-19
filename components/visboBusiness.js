
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
					var tagessatz = allRoles[role.RollenTyp].tagessatzIntern;
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
	logger4js.warn("Calculate Personal Cost duration %s ", endCalc.getTime() - startCalc.getTime());
	return costValues;
}


// calculate all other Costs for the requested project per month
var getAllOtherCost = function(vpv, organisation) {
	OthercostValues = [];

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
		OthercostValues[i] = 0;
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

var calcCosts = function(vpv, pfv, organisation) {
	var allCostValues = [];
	var allCostValuesIndexed = [];
	var startCalc = new Date();
	if ( vpv && organisation ) {
		var currentDate = new Date(vpv.startDate);
		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;

		var personalCost = getAllPersonalKosten(vpv, organisation);
		var allOtherCost = getAllOtherCost(vpv, organisation);

		for (var i = 0 ; i < dauer; i++){
			allCostValues[currentDate] = {
				'Costs': personalCost[i] + allOtherCost[i]
			};
			currentDate.setMonth(currentDate.getMonth() + 1);
		}
	}
	if ( pfv && organisation ) {
		var currentDate = new Date(pfv.startDate);
		var startIndex = getColumnOfDate(pfv.startDate);
		var endIndex = getColumnOfDate(pfv.endDate);
		var dauer = endIndex - startIndex + 1;

		var personalCost = getAllPersonalKosten(pfv, organisation);
		var allOtherCost = getAllOtherCost(pfv, organisation);

		for (var i = 0 ; i < dauer; i++){
			if (!allCostValues[currentDate]) allCostValues[currentDate] = {}
			allCostValues[currentDate] = {
				'BaseLineCosts': personalCost[i] + allOtherCost[i]
			};
			currentDate.setMonth(currentDate.getMonth() + 1);
		}
	}
	var j = 0, element;
	for (element in allCostValues) {
		allCostValuesIndexed[j] = {
			'Date': (new Date(element)).toISOString(),
			'BaseLineCosts': allCostValues[element].BaseLineCosts || 0,
			'CurrentCost': allCostValues[element].Costs || 0
		}
		j++
	}

	var endCalc = new Date();
	logger4js.info("Calculate Project Costs duration %s ms ", endCalc.getTime() - startCalc.getTime());
	return allCostValuesIndexed;
}

var getSummeKosten = function(vpv, organisation, index){
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

function deliverable (name, nameID){
	deliverable.name = name;
	deliverable.nameID = nameID;
}

function deliverableValue (relMonth, wert){
	this.relMonth = relMonth;
	this.wert = wert;
}

// check im elemId is milestone
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
	if (vpv.AllPhases){
		if ((phIndex >= 0) && (phIndex <= vpv.AllPhases.length)){
			phase = vpv.AllPhases[phIndex-1];
	   }
	   else{
		   phase = null;
	   }
	}
	else{
		phase = undefined;
	}

	logger4js.trace("find the the Phase %s of the project %s ", elemId, vpv.name);
	return phase;
}

var getMilestoneByID = function(hrchy,vpv, elemId){

	// prepared for direct access with elemId
	// hrchy = vpv.hierarchy, orderd by elemId

	currentNode = hrchy[elemId].hryNode;
	if (currentNode){
		 phaseID = currentNode.parentNodeKey;
		 phase = getPhaseByID(hrchy,vpv,phaseID);
		 var msIndex = currentNode.indexOfElem;

		 if (phase && phase.AllResults){
			ms = phase.AllResults[msIndex-1];
		 }
	}
	else{
		ms = null;
	}
	logger4js.trace("find the milestone number %s of the project %s ", elemId, vpv.name);
	return ms;
}


var getMsDate = function(hrchy, vpv, elemId){

	var msDate = new Date();

	currentNode = hrchy[elemId].hryNode;
	if (currentNode){
		 phaseID = currentNode.parentNodeKey;
		 phase = getPhaseByID(hrchy, vpv, phaseID);

		 var msIndex = currentNode.indexOfElem;
		 if (phase ) {
			ms = phase.AllResults[msIndex-1];
			logger4js.trace("get the Date of Milestone %s in %s ", ms.name, phase.name);
   			msDate = addDays(vpv.startDate, (phase.startOffsetinDays + ms.offset));
		 }
		 else{
			 msdate = undefined
		 }
	}
	else{
		msDate = null;
	}

	return msDate;
}
// Herausfinden des EndDates der Phase phase
var getPhEndDate = function(vpv, phase){
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
var getMilestones = function(hrchy, vpv){

	var milestones=[];

	if (vpv && hrchy){

		logger4js.trace("Calculate all milestones of %s  ", vpv && vpv._id);

		for (var i = 0; vpv.hierarchy && vpv.hierarchy.allNodes && i < vpv.hierarchy.allNodes.length; i++) {
			var currentNodeID = vpv.hierarchy.allNodes[i].hryNodeKey;
			if (elemIdIsMilestone(currentNodeID)){
				var msDate = getMsDate(hrchy, vpv, currentNodeID);
				if (msDate){
					while (milestones[msDate] != null) {
						//add one millisecond to  msDate to make the key unique
						msDate.setMilliseconds(msDate.getMilliseconds + 1);
					}
					milestones[msDate] = currentNodeID;

				}

			}
		}
	}
	else{

	}
	return milestones.reverse();
}

// find all phases of One VisboProjectVersion vpv
var getPhases = function(hrchy, vpv){

	var phases = [];

	if (vpv && hrchy){

		logger4js.trace("Calculate all phases of %s  ", vpv && vpv._id);

		for (var i = 0; vpv.hierarchy && vpv.hierarchy.allNodes && i < vpv.hierarchy.allNodes.length; i++) {
			var currentNodeID = vpv.hierarchy.allNodes[i].hryNodeKey;

			if (!elemIdIsMilestone(currentNodeID)){
				if (currentNodeID != null){
					var phase = getPhaseByID(hrchy, vpv, currentNodeID);
					var phaseDate = getPhEndDate(vpv, phase);

					if (phaseDate){
						while (phases[phaseDate] != null) {
							//add one millisecond to  phaseDate to make the key unique
							phaseDate.setMilliseconds(phaseDate.getMilliseconds + 1);
						}
						phases[phaseDate] = currentNodeID;
					}
				}

			}
		}

	}
	else{

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

	// index for the deliverables found
	var l = 0;

	if ((dauer > 0) && (vpv.AllPhases)) {
			for (var i = 0; i < vpv.AllPhases.length; i++) {
				var phase = vpv.AllPhases[i];
				var phasenStart = phase.relStart - 1;
				// logger4js.trace("Calculate Phase %s Deliverables %s", i, phase.deliverables.length);

				for (var j = 0; vpv.AllPhases[i].deliverables && j < vpv.AllPhases[i].deliverables.length; j++) {
					var tmpNameId = phase.name;
					var tmpdeliverable = phase.deliverables[j] + "(" + tmpNameId + ")";

					var deliv = new deliverable();
					deliv.nameID = tmpNameId;
					deliv.name = tmpdeliverable;
					// logger4js.trace("fetch Deliverable %s of phase %s", deliv.name, phase.nameID);
					allDelivNames[l] = deliv;
					l++;
				}

				for (var k = 0; phase && phase.AllResults && k < phase.AllResults.length; k++){
					var milestone = phase.AllResults[k];
					// logger4js.trace("Calculate Milestone %s Deliverables %s", i, phase.AllResults.length);

					for (var m = 0; milestone && milestone.deliverables && m < milestone.deliverables.length; m++){
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

var getDeliverableOutOfPhase = function(hrchy, vpv, deliverable, bezugsdatum, total){

	var deliverableComplValue = new deliverableValue(0,0);
	var deliverableComplValueArray = [];

	if (vpv && hrchy && deliverable){

		var hstr = deliverable.name;
		var hstrArr = hstr.split("(");
		var deliverableName = hstrArr[0];


		var phase = getPhaseByID(hrchy,vpv, deliverable.nameID);

		if (phase){

			var currentEndIndex = phase.relEnde - 1;
			var currentPrzDone = phase.percentDone;
			var isElemOfPast = (getPhEndDate(vpv, phase).getTime() < bezugsdatum.getTime());

			if (deliverableName != ""){

				deliverableComplValue.relMonth = currentEndIndex;

				if (vpv.variantName != "pfv"){
					if (total){
						if (isElemOfPast){
							//deliverableComplValue.wert = 1 * currentPrzDone;
							deliverableComplValue.wert = 1 ;
						}
						else{
							deliverableComplValue.wert = 1;
						}
					}
					else{
						if (isElemOfPast){
							deliverableComplValue.wert = 1 * currentPrzDone;
						}
					}
				}
				else{
					if (total){
							deliverableComplValue.wert = 1;
					}
					else{
						if (isElemOfPast){
								deliverableComplValue.wert = 1;
						}

					}
				}
			}

		}
		else{
			deliverableComplValue.wert = -1;
		}
	}

	deliverableComplValueArray[0] = deliverableComplValue;
	return deliverableComplValueArray;
}

var getDeliverableOutOfMilestone = function(hrchy,vpv, deliverable, bezugsdatum, total){

	// var deliverableMSComplValue = new deliverableValue(0,0);
	var deliverableMSComplValue = new deliverableValue(0,0);
	var deliverableMSComplValueArray = [];

	if (vpv && hrchy && deliverable){

		var hstr = deliverable.name;
		var hstrArr = hstr.split("(");
		var deliverableName = hstrArr[0];

		var ms = getMilestoneByID(hrchy,vpv, deliverable.nameID);

		if (ms){

			var msStartDate = getMsDate(hrchy, vpv, deliverable.nameID)
			var currentEndIndex =getColumnOfDate(msStartDate) - getColumnOfDate(vpv.startDate);
			var currentPrzDone = ms.percentDone;
			var isElemOfPast = (msStartDate.getTime() < bezugsdatum.getTime());

			deliverableMSComplValue.relMonth = currentEndIndex;

			// prepare Deliverables for direct access to elemId
			var msDelilverables = [];
			for (var msi = 0; ms.deliverables && msi < ms.deliverables.length; msi++) {
				msDelilverables[ms.deliverables[msi]] = ms.deliverables[msi];
			}

			var hmsDeliv = msDelilverables[deliverableName];

			if (hmsDeliv != null){

				if (deliverableName != ""){

				if (vpv.variantName != "pfv"){
					if (total){
						if (isElemOfPast){
							//deliverableMSComplValue.wert = 1 * currentPrzDone;
							deliverableMSComplValue.wert = 1;
						}
						else{
							deliverableMSComplValue.wert = 1;
						}
					}
					else{
						if (isElemOfPast){
							deliverableMSComplValue.wert = 1 * currentPrzDone;
							}
					}
				}
				else{
					if (total){
							deliverableMSComplValue.wert =  1;
					}
					else{
						if (isElemOfPast){
							deliverableMSComplValue.wert =  1;
							}

						}
					}
				}
			}
			else{
				deliverableMSComplValue.wert = -1;
			}

		}
		else{
			deliverableMSComplValue.wert = -1;
		}
	}


	deliverableMSComplValueArray[0] = deliverableMSComplValue;

	return deliverableMSComplValueArray;
}

var getDeliverableCompletionMetric = function(vpv, hrchy, baseDeliverables, bezugsdatum, total){

	var sum = 0;

	if (vpv && baseDeliverables){

		deliverableCompletionValues=[];

		logger4js.trace("Calculate metric of Deliverables of %s  ", vpv && vpv._id);

		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;

		// Fill the Array with Value = 0 for every Element
		for (i=0 ; i < dauer; i++){
			deliverableCompletionValues[i] = 0;
		}

		// prepare hierarchy for direct access with elemId
		// var hrchy = [];
		// for (var i = 0; vpv.hierarchy && vpv.hierarchy.allNodes && i < vpv.hierarchy.allNodes.length; i++) {
		// 	hrchy[vpv.hierarchy.allNodes[i].hryNodeKey] = vpv.hierarchy.allNodes[i];
		// }


		if (dauer > 0) {

			for (var i = 0; i < baseDeliverables.length; i++) {

				var baseDeliv = new deliverable();
				baseDeliv = baseDeliverables[i];
				var hstr = baseDeliv.name || "";
				var hstrArr = hstr.split("(");
				var baseDelivName = hstrArr[0];
				var weitersuchen = false;

				if (baseDelivName != "") {

					var delComplValueArray = [];
					var delComplValue = new deliverableValue(0,0);

					var isMS = elemIdIsMilestone(baseDeliv.nameID);

					if (!isMS){     // Deliverable belongs to a phase

						delComplValueArray = getDeliverableOutOfPhase(hrchy,vpv,baseDeliv,bezugsdatum, total);
						delComplValue = delComplValueArray[0];
						if (delComplValue.wert != -1){
							deliverableCompletionValues[delComplValue.relMonth] = deliverableCompletionValues[delComplValue.relMonth] + delComplValue.wert;
							weitersuchen = false;
						}
						else{
							weitersuchen = true;
						}

					}
					else{           // Deliverable belongs to a milestone


						delComplValueArray =  getDeliverableOutOfMilestone(hrchy,vpv,baseDeliv,bezugsdatum, total);
						delComplValue = delComplValueArray[0];

						if (delComplValue.wert != -1){
							deliverableCompletionValues[delComplValue.relMonth] = deliverableCompletionValues[delComplValue.relMonth] + delComplValue.wert;
							weitersuchen = false;
						}
						else{
							weitersuchen = true;
						}

					}

					// Deliverable was shifted
					if (weitersuchen) {


						if (vpv.variantName != "pfv"){

							var vpv_Deliverables = getAllDeliverables(vpv);

							// baseDeliv.nameID belongs perhaps to another phase or milestone
							for (j= 0; vpv_Deliverables && j < vpv_Deliverables.length; j++){

								var delComplValueArray = [];
								var delComplValue = new deliverableValue(0,0);

								var vpvDeliv = vpv_Deliverables[j];
								var hstr = vpvDeliv.name;
								var hstrArr = hstr.split("(");
								var vpvDelivName = hstrArr[0];

								if (baseDelivName == vpvDelivName){

									if (elemIdIsMilestone(vpvDeliv.nameID)){
										delComplValueArray = getDeliverableOutOfMilestone(hrchy, vpv,  vpvDeliv, bezugsdatum, total);
										delComplValue = delComplValueArray[0];
									}
									else{
										delComplValueArray = getDeliverableOutOfPhase(hrchy, vpv, vpvDeliv, bezugsdatum, total);
										delComplValue = delComplValueArray[0];
									}

									if (delComplValue.wert != -1){
										deliverableCompletionValues[delComplValue.relMonth] = deliverableCompletionValues[delComplValue.relMonth] + delComplValue.wert;
									}
								}
							}

						}
					}
				}

			} // end of for baseDeliverables

		}
	}

	// Sum the values for all months
	var sum = 0;
	for (i=0; i < dauer; i++){
		sum += deliverableCompletionValues[i];
	}
	return sum;
}


var getTimeCompletionMetric= function(vpv, hrchy, baseMilestones, basePhases, bezugsdatum, total){

	var sum = 0;

	if (vpv){

		timeCompletionValues=[];

		logger4js.trace("Calculate metric of Deliverables of %s  ", vpv && vpv._id);

		var startIndex = getColumnOfDate(vpv.startDate);
		var endIndex = getColumnOfDate(vpv.endDate);
		var dauer = endIndex - startIndex + 1;

		// Fill the Array with Value = 0 for every Element
		for (i=0 ; i < dauer; i++){
			timeCompletionValues[i] = 0;
		}

		// var hrchy = [];
		// for (var i = 0; vpv.hierarchy && vpv.hierarchy.allNodes && i < vpv.hierarchy.allNodes.length; i++) {
		// 	hrchy[vpv.hierarchy.allNodes[i].hryNodeKey] = vpv.hierarchy.allNodes[i];
		// }


		if (dauer > 0) {
			for (x in basePhases) {

				phaseId = basePhases[x] ;
				phase = getPhaseByID(hrchy, vpv, phaseId);

				if (phase){
					{
						var currentEndIndex = phase.relEnde - 1;
						var currentPrzDone = phase.percentDone;
						var isElemOfPast = (getPhEndDate(vpv, phase).getTime() < bezugsdatum.getTime());

						if (vpv.variantName != "pfv"){
							if (total){

								if (isElemOfPast){
									//timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1 * currentPrzDone;
									timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
								}
								else{
									timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
								}

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

				if (ms){

					var msStartDate = getMsDate(hrchy, vpv, msId)
					var currentEndIndex =getColumnOfDate(msStartDate) - getColumnOfDate(vpv.startDate);
					var currentPrzDone = ms.percentDone;
					var isElemOfPast = (msStartDate.getTime() < bezugsdatum.getTime());

					if (vpv.variantName != "pfv"){
						if (total){

							if (isElemOfPast){
								//timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1 * currentPrzDone;
								timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
							}
							else{
								timeCompletionValues[currentEndIndex] = timeCompletionValues[currentEndIndex] + 1;
							}

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
	var oldkeyMetrics = {};
	var startCalc = new Date();
	var pfv_Deliverables = [];
	var vpv_Deliverables = [];

	if (vpv && organisation && pfv){

		// Calculate keyMetrics Values here
		oldkeyMetrics = vpv.keyMetrics;
		keyMetrics = vpv.keyMetrics || {};
		logger4js.debug("Calculate KeyMetrics for %s with pfv %s and organization %s result %s ", vpv && vpv._id, pfv && pfv._id, organisation && organisation._id, JSON.stringify(keyMetrics));

		if (vpv.variantName != "pfv"){

			var indexTotal = getColumnOfDate(vpv.endDate) - getColumnOfDate(vpv.startDate);
			var indexActual = getColumnOfDate(vpv.timestamp) - getColumnOfDate(vpv.startDate);

			if (organisation){
				if (pfv){
					keyMetrics.costBaseLastActual = getSummeKosten(pfv, organisation, indexActual);
					keyMetrics.costBaseLastTotal = getSummeKosten(pfv, organisation, indexTotal);
				}

				keyMetrics.costCurrentTotal= getSummeKosten(vpv, organisation, indexTotal);
				keyMetrics.costCurrentActual= getSummeKosten(vpv, organisation, indexActual);

			}


			var hrchy_vpv = [];
			for (var i = 0; vpv.hierarchy && vpv.hierarchy.allNodes && i < vpv.hierarchy.allNodes.length; i++) {
				hrchy_vpv[vpv.hierarchy.allNodes[i].hryNodeKey] = vpv.hierarchy.allNodes[i];
			}


			keyMetrics.endDateCurrent= vpv.endDate;

			if (pfv){

				keyMetrics.endDateBaseLast = pfv.endDate;

				// prepare hierarchy of pfv for direct access
				var hrchy_pfv = [];
				for (var i = 0; pfv.hierarchy && pfv.hierarchy.allNodes && i < pfv.hierarchy.allNodes.length; i++) {
					hrchy_pfv[pfv.hierarchy.allNodes[i].hryNodeKey] = pfv.hierarchy.allNodes[i];
				}

				baseMilestones = getMilestones(hrchy_pfv, pfv);
				basePhases = getPhases(hrchy_pfv, pfv);

				if (basePhases && baseMilestones){

					keyMetrics.timeCompletionCurrentActual = getTimeCompletionMetric(vpv, hrchy_vpv, baseMilestones, basePhases, vpv.timestamp,false);
					keyMetrics.timeCompletionBaseLastActual = getTimeCompletionMetric(pfv, hrchy_pfv, baseMilestones, basePhases, vpv.timestamp,false);
					keyMetrics.timeCompletionCurrentTotal = getTimeCompletionMetric(vpv, hrchy_vpv, baseMilestones, basePhases, vpv.timestamp,true);
					keyMetrics.timeCompletionBaseLastTotal = getTimeCompletionMetric(pfv, hrchy_pfv, baseMilestones, basePhases, vpv.timestamp,true);

				}
				else{
					keyMetrics.timeCompletionCurrentActual = undefined;
					keyMetrics.timeCompletionBaseLastActual = undefined;
					keyMetrics.timeCompletionCurrentTotal = undefined;
					keyMetrics.timeCompletionBaseLastTotal = undefined;
				}


				baseDeliverables = getAllDeliverables(pfv);

				if (pfv_Deliverables){
					keyMetrics.deliverableCompletionBaseLastActual= getDeliverableCompletionMetric(pfv, hrchy_pfv, baseDeliverables, vpv.timestamp, false);
					keyMetrics.deliverableCompletionBaseLastTotal= getDeliverableCompletionMetric(pfv, hrchy_pfv,  baseDeliverables, vpv.timestamp, true);
					keyMetrics.deliverableCompletionCurrentActual= getDeliverableCompletionMetric(vpv, hrchy_vpv, baseDeliverables, vpv.timestamp, false);
					keyMetrics.deliverableCompletionCurrentTotal= getDeliverableCompletionMetric(vpv, hrchy_vpv, baseDeliverables, vpv.timestamp, true);
				}
				else{
					keyMetrics.deliverableCompletionBaseLastActual= undefined;
					keyMetrics.deliverableCompletionBaseLastTotal= undefined;
					keyMetrics.deliverableCompletionCurrentActual=undefined;
					keyMetrics.deliverableCompletionCurrentTotal= undefined;
				}


			}
			else{

				keyMetrics.timeCompletionCurrentActual = undefined;
				keyMetrics.timeCompletionBaseLastActual = undefined;
				keyMetrics.timeCompletionCurrentTotal = undefined;
				keyMetrics.timeCompletionBaseLastTotal = undefined;

				keyMetrics.endDateBaseLast = undefined;

				keyMetrics.deliverableCompletionBaseLastActual= undefined;
				keyMetrics.deliverableCompletionBaseLastTotal= undefined;
				keyMetrics.deliverableCompletionCurrentActual=undefined;
				keyMetrics.deliverableCompletionCurrentTotal= undefined;
				// keyMetrics.deliverableCompletionCurrentActual= getDeliverableCompletionMetric(vpv, vpv_Deliverables, vpv.timestamp, false);
				// keyMetrics.deliverableCompletionCurrentTotal= getDeliverableCompletionMetric(vpv, vpv_Deliverables, vpv.timestamp, true);

			}

		}
		else{
			keyMetrics = undefined;
		}
	}

	else{
		keyMetrics = undefined;
	}

	// var diff_CostBLAct = oldkeyMetrics.costBaseLastActual - keyMetrics.costBaseLastActual;
	// var diff_CostBLTot = oldkeyMetrics.costBaseLastTotal - keyMetrics.costBaseLastTotal;
	// var diff_CostCurAct = oldkeyMetrics.costCurrentActual - keyMetrics.costCurrentActual;
	// var diff_CostCurTot = oldkeyMetrics.costCurrentTotal - keyMetrics.costCurrentTotal;

	// var diff_DelivBLAct = oldkeyMetrics.deliverableCompletionBaseLastActual - keyMetrics.deliverableCompletionBaseLastActual;
	// var diff_DelivBLTot = oldkeyMetrics.deliverableCompletionBaseLastTotal - keyMetrics.deliverableCompletionBaseLastTotal;
	// var diff_DelivCurAct = oldkeyMetrics.deliverableCompletionCurrentActual - keyMetrics.deliverableCompletionCurrentActual;
	// var diff_DelivCurTot= oldkeyMetrics.deliverableCompletionCurrentTotal - keyMetrics.deliverableCompletionCurrentTotal;

	// var diff_timeBLAct = oldkeyMetrics.timeCompletionBaseLastActual - keyMetrics.timeCompletionBaseLastActual;
	// var diff_timeBLTot = oldkeyMetrics.timeCompletionBaseLastTotal - keyMetrics.timeCompletionBaseLastTotal;
	// var diff_timeCurAct = oldkeyMetrics.timeCompletionCurrentActual - keyMetrics.timeCompletionCurrentActual;
	// var diff_timeCurTot = oldkeyMetrics.timeCompletionCurrentTotal -	keyMetrics.timeCompletionCurrentTotal;

	// var diff_endDateBL = oldkeyMetrics.endDateBaseLast.getTime() - keyMetrics.endDateBaseLast.getTime();
	// var diff_endDateCur = oldkeyMetrics.endDateCurrent.getTime() - keyMetrics.endDateCurrent.getTime()


	var endCalc = new Date();
	logger4js.info("Calculate KeyMetrics duration %s ms ", endCalc.getTime() - startCalc.getTime());

	return keyMetrics;

}

module.exports = {
	getAllPersonalKosten: getAllPersonalKosten,
	getAllOtherCost: getAllOtherCost,
	calcKeyMetrics: calcKeyMetrics,
	calcCosts: calcCosts
};
