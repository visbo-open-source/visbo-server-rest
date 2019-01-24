var logging = require('../components/logging');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// check if string has invalid content
// validate a string to prevent XSS
var validateName = function(name, allowEmpty) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	if (!allowEmpty && !name) {
		logger4js.info("Check Name: Name is empty!", name);
		return false;
	}
	name = name || '';
	if (name.replace(/(<([^>]+)>)/ig,"") != name) {
		logger4js.info("Check Name: Name contains Script? %s", name);
		return false;
	}
	return true;
}

// validate a date to prevent XSS
var validateDate = function(dateString, allowEmpty) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	if (!allowEmpty && !dateString) {
		logger4js.info("Check Date: DateString is empty! :%s:", !dateString);
		return undefined;
	}
	dateValue = dateString ? new Date(dateString) : new Date();
	if (isNaN(dateValue)) {
		logger4js.info("Check Date: String contains no Date %s", dateString);
		return undefined;
	}
	return dateValue.toISOString();
}

module.exports = {
	validateName: validateName,
	validateDate: validateDate
};
