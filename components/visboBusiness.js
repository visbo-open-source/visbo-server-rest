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
	var dauer = endIndex - startIndex;
	var faktor = 1;

	if (dauer > 0) {
		for (x = 0; x < 1; x++) { // for performance Test do it several times
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
		}
	} else {
		costValues[0] = 0
	}
	var endCalc = new Date();
	logger4js.warn("Calculate Personal Cost duration %s ", endCalc.getTime() - startCalc.getTime());
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


	if (dauer > 0) {
		for (x = 0; x < 1; x++) { // for performance Test do it several times
			for (var i = 0; i < vpv.AllPhases.length; i++) {
				var phase = vpv.AllPhases[i];
				var phasenStart = phase.relStart - 1
				// logger4js.trace("Calculate Phase %s Costs %s", i, phase.AllCosts.length);
				for (var j = 0; j < phase.AllCosts.length; j++) {
					var cost = phase.AllCosts[j];
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
		}
	} else {
		OthercostValues[0] = 0
	}
	var endCalc = new Date();
	logger4js.warn("Calculate all other Cost duration %s ", endCalc.getTime() - startCalc.getTime());
	return OthercostValues;
}

module.exports = {
	getAllPersonalKosten: getAllPersonalKosten,
	getAllOtherCost: getAllOtherCost
};
