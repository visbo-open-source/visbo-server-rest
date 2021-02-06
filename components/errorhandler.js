var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// check if string has invalid content
// validate a string to prevent XSS
var handler = function(err, res, logMesage, restMessage) {
	var error, httpcode;
	if (!err) {
		logger4js.mark('Unknown Error: %s ReST error %s err %s', logMesage, restMessage, error);
		httpcode = 500;
	} else if (err.name == 'ValidationError') {
		error = err.message;
		logger4js.mark('Mongo Validation Error: %s ReST error %s err %O', logMesage, restMessage, error);
		httpcode = 400;
	} else if (err.name == 'CastError') {
		error = err.message;
		logger4js.mark('Mongo Cast Error: %s ReST error %s err %O', logMesage, restMessage, error);
		httpcode = 400;
	} else if (err.name == 'MongoTimeoutError') {
		error = err.name;
		logger4js.mark('Mongo Timeout Error: %s ReST error %s err %s', logMesage, restMessage, error);
		httpcode = 500;
		throw 'Lost Mongo connection, please restart';
	} else if (err.code == 11000){
		// Unique Key Error
		error = err.errmsg;
		logger4js.warn('Mongo Unique Key Error: %s ReST error %s err %O', logMesage, restMessage, error);
		httpcode = 409;
	} else {
		error = err;
		logger4js.warn('Mongo Error handler: %s ReST error %s err %s', logMesage, restMessage, JSON.stringify(error));
		httpcode = 500;
	}

	if (res) {
		return res.status(httpcode).send({
			state: 'failure',
			message: restMessage || 'Error updating Database',
			error: error
		});
	}
};


module.exports =
	{ handler: handler };
