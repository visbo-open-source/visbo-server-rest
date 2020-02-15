var mongoose = require('mongoose');

var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// check if string has invalid content
// validate a string to prevent XSS
var validateName = function(name, allowEmpty) {
	if (!allowEmpty && !name) {
		logger4js.trace('Check Name: Name is empty!', name);
		return false;
	}
	name = name || '';
	if (name.replace(/(<([^>]+)>)/ig,'') != name) {
		logger4js.info('Check Name: Name contains Script? %s', name);
		return false;
	}
	return true;
};

// validate a date to prevent XSS
var validateDate = function(dateString, allowEmpty) {
	if (!allowEmpty && !dateString) {
		logger4js.trace('validate Date: DateString is empty! :%s:', !dateString);
		return undefined;
	}
	var dateValue = dateString ? new Date(dateString) : new Date();
	if (isNaN(dateValue)) {
		logger4js.info('validate Date: String contains no Date %s', dateString);
		return undefined;
	}
	return dateValue.toISOString();
};

// validate a date to prevent XSS
var validateNumber = function(numberValue, allowEmpty) {
	if (!allowEmpty && isNaN(numberValue)) {
		logger4js.info('validate Number: Number is NaN! :%s:', numberValue);
		return undefined;
	}
	if (isNaN(numberValue)) {
		logger4js.trace('validate Number: String contains no Number %s', numberValue);
		return 0;
	}
	return numberValue;
};

// check if string has invalid content
// validate a string to prevent XSS
var validateObjectId = function(id, allowEmpty) {
	logger4js.trace('validate ObjectID: %s Allow empty %s', id, allowEmpty);
	if (allowEmpty != true && !id) {
		logger4js.info('validate ObjectID: ID is empty!', id);
		return false;
	}
	if (!id) {
		logger4js.trace('validateObjectId: ID is empty ok');
		return true;
	}
	if (!mongoose.Types.ObjectId.isValid(id)) {
		logger4js.debug('Check ID: Not an OBjectId %s', id);
		return false;
	}
	logger4js.trace('Check ID: OBjectId %s ok', id);
	return true;
};

// check if email has invalid content
// validate a string to prevent XSS
var validateEmail = function(email, allowEmpty) {
	if (!allowEmpty && !email) {
		logger4js.trace('Check Name: Name is empty!', email);
		return false;
	}
	email = email || '';
	if (email.replace(/[ \t!\\/%,:;]/ig,'') != email) {
		logger4js.info('Check Name: Name contains Illegal Characters? %s', email);
		return false;
	}
	return true;
};

module.exports = {
	validateName: validateName,
	validateObjectId: validateObjectId,
	validateEmail: validateEmail,
	validateDate: validateDate,
	validateNumber: validateNumber
};
