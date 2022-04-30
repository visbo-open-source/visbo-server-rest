var mongoose = require('mongoose');

var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// check if string has invalid content
// validate a string to prevent XSS
var validateName = function(name, allowEmpty) {
	if (!name) {
		if (!allowEmpty) {
			logger4js.trace('Check Name: Empty name is not allowed!', name);
			return false;
		} else {
			return true;
		}
	}
	if (typeof name != 'string') {
		logger4js.debug('Check Name: incorrect Type', name, typeof name);
		return false;
	}
	if (name.replace(/(<([^>]+)>)/ig,'') != name) {
		logger4js.info('Check Name: Name contains Script? %s', name);
		return false;
	}
	return true;
};

var validatePath = function(path, allowEmpty) {
	if (!allowEmpty && !path && !(path.length > 0)) {
		logger4js.trace('Check Path: Path is empty!', path);
		return false;
	}
	for (var i = 0; i < path.length; i++) {
		if (!validateName(path[i], allowEmpty)) {
			return false;
		}
	}
	return true;
};

// validate a date to prevent XSS
var validateDate = function(dateString, allowEmpty, dateObject) {
	var dateValue;
	if (allowEmpty && !dateString) {
		dateValue = new Date();
	} else if (!dateString) {
		logger4js.trace('validate Date: DateString is empty! :%s:', !dateString);
		return undefined;
	} else {
		dateValue = new Date(dateString);
	}
	if (isNaN(dateValue)) {
		logger4js.debug('validate Date: String contains no Date %s', dateString);
		return undefined;
	}
	return dateObject ? dateValue : dateValue.toISOString();
};

// validate a number to prevent XSS
var validateNumber = function(numberValue, allowEmpty) {
	if (allowEmpty && !numberValue) {
		return 0;
	}
	if (isNaN(numberValue)) {
		logger4js.debug('validate Number: String contains no Number %s', numberValue);
		return undefined;
	}
	return Number(numberValue);
};

// check if string has invalid content
// validate a string to prevent XSS
var validateObjectId = function(id, allowEmpty) {
	logger4js.trace('validate ObjectID: %s Allow empty %s', id, allowEmpty);
	if (allowEmpty != true && !id) {
		logger4js.debug('validate ObjectID: ID is empty!', id);
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
		logger4js.debug('Check Name: Name contains Illegal Characters? %s', email);
		return false;
	}
	var emailPart = email.split('@');
	if (emailPart.length != 2) {
		logger4js.debug('Check Name: No user/domain separator? %s', email);
		return false;
	}
	if (!emailPart[0].length) {
		logger4js.debug('Check Name: No User address part? %s', email);
		return false;
	}
	if (!emailPart[1].length) {
		logger4js.debug('Check Name: No Domain part? %s', email);
		return false;
	}
	emailPart = emailPart[1].split('.');
	if (emailPart.length < 2 || emailPart[0].length == 0 || emailPart[1].length == 0) {
		logger4js.debug('Check Name: No correct domain separator ? %s', email);
		return false;
	}
	return true;
};

function convertNumber(str) {
	var result = Number(str);
	if (isNaN(result) && str.indexOf(',') >= 0) {
		var convert = str.replace(',', '.');
		result = Number(convert);
	}
	return result;
}

function compareDate(first, second) {
	if (first === undefined) { first = new Date(-8640000000000000); }
	if (second === undefined) { second = new Date(-8640000000000000); }
	if (typeof first == 'number' || typeof first == 'string') first = new Date(first);
	if (typeof second == 'number' || typeof second == 'string') second = new Date(second);
	return first.getTime() - second.getTime();
}

function isSameDay(dateA, dateB) {
	if (!dateA && !dateB) { return true; }
  if (!dateA || !dateB) { return false; }
  const localA = new Date(dateA);
  const localB = new Date(dateB);
  localA.setHours(0, 0, 0, 0);
  localB.setHours(0, 0, 0, 0);
  return localA.toISOString() === localB.toISOString();
}

function getBeginningOfMonth(dateA) {
	if (dateA === undefined) { dateA = new Date(); }
	var result = new Date(dateA);
  result.setHours(0, 0, 0, 0);
  result.setDate(1);
  return result;
}

var evaluateLanguage = function(req) {
	var lang;
	if (req) {
		lang = req.acceptsLanguages('en', 'de');
	}
	if (!lang) { lang = 'en'; }
	logger4js.trace('evaluate Language: %s', lang);
	return lang;
};

module.exports = {
	validateName: validateName,
	validatePath: validatePath,
	validateObjectId: validateObjectId,
	validateEmail: validateEmail,
	validateDate: validateDate,
	validateNumber: validateNumber,
	evaluateLanguage: evaluateLanguage,
	convertNumber: convertNumber,
	compareDate: compareDate,
	isSameDay: isSameDay,
	getBeginningOfMonth: getBeginningOfMonth
};
