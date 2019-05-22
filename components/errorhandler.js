var logging = require('../components/logging');
var mongoose = require('mongoose');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// check if string has invalid content
// validate a string to prevent XSS
var handler = function(err, res, logMesage, restMessage) {
	var error, httpcode;
	if (err.name == 'ValidationError') {
		error = err.message;
		logger4js.mark("Validation Error: %s ReST error %s err %O", logMesage, restMessage, error);
		httpcode = 400;
	} else if (err.name == 'CastError') {
		error = err.message;
		logger4js.mark("Cast Error: %s ReST error %s err %O", logMesage, restMessage, error);
		httpcode = 400;
	} else if (err.code == 11000){
		// Unique Key Error
		error = err.errmsg;
		logger4js.warn("Unique Key Error: %s ReST error %s err %O", logMesage, restMessage, error);
		httpcode = 409;
	} else {
		error = err;
		logger4js.warn("Mongo error handler: %s ReST error %s err %O", logMesage, restMessage, error);
		httpcode = 500;
	}

	if (res) {
		return res.status(httpcode).send({
			state: 'failure',
			message: restMessage || 'Error updating Database',
			error: error
		});
	}
}


module.exports = {
	handler: handler
};
