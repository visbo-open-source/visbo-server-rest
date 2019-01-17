var log4js = require('log4js');
var logger = log4js.getLogger();

var configDebug = undefined;
var fsLogPath = undefined;
// var log_file = undefined;

debugLogLevel = function(logCategory) {
	if ( configDebug == undefined ) {
		// console.log("LOG CATEGORY Init");
		configDebug = {"VC": "debug", "VP": "debug", "VPV": "debug", "USER":"debug", "OTHER": "debug", "All": "debug"}
		// console.log("LOG LEVEL Init: %O", configDebug)
	}
	return configDebug[logCategory] || configDebug["All"] || "info";
}

getLogLevelConfig = function() {
	if ( configDebug == undefined ) {
		configDebug = debugLogLevel();
	}
	return configDebug;
}

setLogLevelConfig = function(newConfigDebug) {
	if ( newConfigDebug == undefined ) {
		return;
	}
	// console.log("LOG LEVEL SET: %O", newConfigDebug)
	configDebug = newConfigDebug
}

module.exports = {
	debugLogLevel: debugLogLevel,
	getLogLevelConfig: getLogLevelConfig,
	setLogLevelConfig: setLogLevelConfig
};
