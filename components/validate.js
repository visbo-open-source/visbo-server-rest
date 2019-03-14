var logging = require('../components/logging');
var mongoose = require('mongoose');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// check if string has invalid content
// validate a string to prevent XSS
var validateName = function(name, allowEmpty) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	if (!allowEmpty && !name) {
		logger4js.debug("Check Name: Name is empty!", name);
		return false;
	}
	name = name || '';
	if (name.replace(/(<([^>]+)>)/ig,"") != name) {
		logger4js.debug("Check Name: Name contains Script? %s", name);
		return false;
	}
	return true;
}

// validate a date to prevent XSS
var validateDate = function(dateString, allowEmpty) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	if (!allowEmpty && !dateString) {
		logger4js.debug("Check Date: DateString is empty! :%s:", !dateString);
		return undefined;
	}
	dateValue = dateString ? new Date(dateString) : new Date();
	if (isNaN(dateValue)) {
		logger4js.debug("Check Date: String contains no Date %s", dateString);
		return undefined;
	}
	return dateValue.toISOString();
}

// validate a date to prevent XSS
var validateNumber = function(numberValue, allowEmpty) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	if (!allowEmpty && isNaN(numberValue)) {
		logger4js.debug("Check Number: Number is NaN! :%s:", numberValue);
		return undefined;
	}
	if (isNaN(numberValue)) {
		logger4js.debug("Check Number: String contains no Number %s", numberValue);
		return 0;
	}
	return numberValue;
}

// check if string has invalid content
// validate a string to prevent XSS
var validateObjectId = function(id, allowEmpty) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	logger4js.trace("Check ID:  %s Allow empty %s", id, allowEmpty);
if (allowEmpty != true && !id) {
		logger4js.debug("debug ID: ID is empty!", id);
		return false;
	}
	if (!id) {
		logger4js.debug("trace ID: ID is empty ok", id);
		return true;
	}
	if (!mongoose.Types.ObjectId.isValid(id)) {
		logger4js.debug("Check ID: Not an OBjectId %s", id);
		return false;
	}
	logger4js.trace("Check ID: OBjectId %s ok", id);
	return true;
}

// check if email has invalid content
// validate a string to prevent XSS
var validateEmail = function(email, allowEmpty) {
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	if (!allowEmpty && !email) {
		logger4js.debug("Check Name: Name is empty!", email);
		return false;
	}
	email = email || '';
	// if (email.replace(/ \t\n\\\/%$!,:;<>[]"/g,"") != email) {
	if (email.replace(/[ \t!\\\/%,:;]/ig,"") != email) {
		logger4js.debug("Check Name: Name contains Illegal Characters? %s", email);
		return false;
	}
	return true;
}

module.exports = {
	validateName: validateName,
	validateObjectId: validateObjectId,
	validateEmail: validateEmail,
	validateDate: validateDate,
	validateNumber: validateNumber
};
