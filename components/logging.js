var fs = require('fs');
var util = require('util');
var moment = require('moment');
var log4js = require('log4js');
var logger = log4js.getLogger();

var configDebug = undefined;
var fsLogPath = undefined;
// var log_file = undefined;

debugLogLevel = function(logCategory) {
	if ( configDebug == undefined ) {
		// console.log("LOG CATEGORY Init");
		if (process.env.DEBUG != undefined) {
			// console.log("LOG CATEGORY Env");
			configDebug = JSON.parse(process.env.DEBUG);
		} else {
			// console.log("LOG CATEGORY Default");
			configDebug = {"VC": "info", "VP": "info", "VPV": "info", "USER":"info", "OTHER": "info", "All": "info"}
		}
		// console.log("LOG LEVEL: %O", configDebug)
	}
	// console.log("LOG CATEGORY %s :%s:%s:", logCategory, configDebug[logCategory], configDebug[logCategory] || "warn");
	return configDebug[logCategory] || configDebug["All"] || "info";
}
