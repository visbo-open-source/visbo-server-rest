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
//
// debuglog = function(logCategory, level, logstring, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
// 	var maxlevel = 9;
// 	var label = "All";
// 	if ( configDebug == undefined ) {
// 		if (process.env.DEBUG != undefined) {
// 			configDebug = JSON.parse(process.env.DEBUG);
// 		} else {
// 			configDebug = {"VC": "info", "VP": "info", "VPV": "info", "USER":"info", "OTHER": "info", "All": "info"}
// 		}
// 		// console.log("LOG LEVEL: %O", configDebug)
// 	}
// 	if (typeof logCategory != "number" ) {
// 		maxlevel = Number(configDebug[logCategory]);
// 		label = logCategory
// 	} else
// 		maxlevel = logCategory
//
// 	if (level <= maxlevel ){
// 		if (arg1 == undefined) arg1 = '';
// 		if (arg2 == undefined) arg2 = '';
// 		if (arg3 == undefined) arg3 = '';
// 		if (arg4 == undefined) arg4 = '';
// 		if (arg5 == undefined) arg5 = '';
// 		if (arg6 == undefined) arg6 = '';
// 		if (arg7 == undefined) arg7 = '';
// 		if (arg8 == undefined) arg8 = '';
// 		if (arg9 == undefined) arg9 = '';
// 		var message = util.format.apply(null, [logstring, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9])
// 		//console.log("%s: %s-Level%d %s", moment().format('YYYY-MM-DD HH:mm:ss:SSS'), label, level, message);
// 		logger.info(message);
// 	}
// };

// module.exports = {
// 	debuglog: debuglog
// };
