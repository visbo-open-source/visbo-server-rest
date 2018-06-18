var moment = require('moment');
var configDebug = undefined;

debuglog = function(deflevel, level, logstring, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
	var maxlevel = 9;
	var label = "All";
	if ( configDebug == undefined ) {
		if (process.env.DEBUG != undefined) {
			configDebug = JSON.parse(debugstring);
		} else {
			configDebug = {"VC": "0", "VP": "0", "VPV": "0", "USER":"0", "OTHER": "0", "All": "0"}
		}
	}
	if (typeof deflevel != "number" ) {
		maxlevel = Number(configDebug[deflevel]);
		label = deflevel
		// console.log("LOGGING NEW LEVEL ".concat("newlevel "), maxlevel, typeof maxlevel );
	} else
		maxlevel = deflevel

	if (level <= maxlevel ){
		if (arg1 == undefined) arg1 = '';
		if (arg2 == undefined) arg2 = '';
		if (arg3 == undefined) arg3 = '';
		if (arg4 == undefined) arg4 = '';
		if (arg5 == undefined) arg5 = '';
		if (arg6 == undefined) arg6 = '';
		if (arg7 == undefined) arg7 = '';
		if (arg8 == undefined) arg8 = '';
		if (arg9 == undefined) arg9 = '';
		console.log("%s: %s-Level%d ".concat(logstring), moment().format('YYYY-MM-DD HH:mm:ss:SSS'), label, level, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9);
	}
};

module.exports = {
	debuglog: debuglog
};
