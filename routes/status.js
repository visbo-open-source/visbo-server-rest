var express = require('express');
var router = express.Router();

var logging = require('./../components/logging');
var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);


router.route('/')
/**
	* @api {get} /status Get status of ReST Server
	* @apiVersion 1.0.0
	* @apiGroup Visbo System
	* @apiName GetReSTStatus
	* @apiExample Example usage:
	*   url: http://localhost:3484/status
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"Status of ReST Server",
	*  "status":[{
	*    "version":"V 2018-10-01 14:10:00 +02:00",
	*    "upTime":"2018-09-20T10:31:27.216Z"
	*  }]
	*}
	*/
// get status
	.get(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'Status (Read)';

		logger4js.info("Get Satus ReST Server ");

		return res.status(200).send({
			state: 'success',
			message: 'Status of ReST Server',
			status: {
				version: process.env.VERSION_REST
			}
		});
	})

module.exports = router;
