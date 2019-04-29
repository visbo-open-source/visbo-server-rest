var express = require('express');
var router = express.Router();

var logging = require('./../components/logging');
var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var validate = require('./../components/validate');

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
		req.auditDescription = 'Status (Read)';
		req.auditTTLMode = 4;			// short Time to Live

		logger4js.info("Get Satus ReST Server ");
		var err = {"code": "400", "errtext": "Long explanation"}
		if (req.query.error) {
			var status = ''
			if (req.query.date) {
				if (validate.validateDate(req.query.date, false)) {
					var dateValue = new Date(req.query.date);
					status = "Get Status Date native ".concat(req.query.date, " converted ", dateValue.toISOString(), " is Date ")
					logger4js.info(status);
					err = '';
				}
			}
			if (req.query.number != undefined) {
				var numberValue = req.query.number;
				status = "Get Status Number native ".concat(req.query.number, " is Number ", !isNaN(numberValue))
				logger4js.info(status);
				err = '';
			}
			if (req.query.string != undefined) {
				var stringValue = req.query.string;
				status = "Get Status String native ".concat(req.query.string, " is String ", stringValue)
				logger4js.info(status);
				err = '';
			}
			if (req.query.email != undefined) {
				if (validate.validateEmail(req.query.email, false)) {
					var email = req.query.email;
					status = "Get Status eMail native ".concat(req.query.email, " is eMail ", email)
					logger4js.info(status);
					err = '';
				}
			}
			if (req.query.objectid != undefined) {
				if (validate.validateObjectId(req.query.objectid, false)) {
					var id = req.query.objectid;
					status = "Get Status String native ".concat(req.query.objectid, " is ObjectId ", id)
					logger4js.info(status);
					err = '';
				}
			}

			if (err) {
				logger4js.info("Get Status: %O %s ", req.query, err.message);
				return res.status(400).send({
					state: 'failiure',
					message: err
				});
			} else {
				return res.status(200).send({
					state: 'success',
					message: 'Status Check',
					status: status
				});

			}
		} else {
			return res.status(200).send({
				state: 'success',
				message: 'Status of ReST Server',
				status: {
					version: process.env.VERSION_REST,
					versionUI: process.env.VERSION_UI
				}
			});
		}
	})

module.exports = router;
