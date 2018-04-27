var moment = require('moment');

debuglog = function(maxlevel, level, logstring, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
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
		console.log("%s: Level%d VP ".concat(logstring), moment().format('YYYY-MM-DD HH:mm:ss:SSS'), level, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9);
	}
};

module.exports = {
	debuglog: debuglog
};
