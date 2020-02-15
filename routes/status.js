var express = require('express');
var router = express.Router();

var logging = require('./../components/logging');
var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var validate = require('./../components/validate');
var getSystemVCSetting = require('./../components/systemVC').getSystemVCSetting

const sleep = function (ms) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(ms*2);
    }, ms);
  });
};

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

		logger4js.debug("Get Satus ReST Server ");
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
					version: process.env.VERSION_REST || new Date(),
					versionUI: process.env.VERSION_UI || new Date()
				}
			});
		}
	})

router.route('/pwpolicy')
/**
	* @api {get} /status/pwpolicy Get Password Policy of ReST Server
	* @apiVersion 1.0.0
	* @apiGroup Visbo System
	* @apiName GetPWPolicy
	* @apiExample Example usage:
	*   url: http://localhost:3484/status/pwpolicy
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"Password Policy",
	*  "value":{
	*    "PWPolicy":"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d\s])(?!.*[\"\'\\]).{8,}$",
  *    "Description":"At least 8 characters, at least one character of each type: alpha, capital alpha, number, special. No Quotes and backslash."
	*  }
	*}
	*/
// get status/pwpolicy
	.get(function(req, res) {
		req.auditDescription = 'Status PW Policy (Read)';
		req.auditTTLMode = 3;
    logger4js.info("Get Password Policy ReST Server ");
    var pwPolicySetting = getSystemVCSetting('PW Policy')

		return res.status(200).send({
			state: 'success',
			message: "Password Policy",
			value: pwPolicySetting.value
		});
	})

  router.route('/test')
  // get status/test
  	.get(async function(req, res) {
  		req.auditDescription = 'Status Test (Read)';
  		req.auditTTLMode = 4;			// short Time to Live
  		var message = "Say Hello World";

  		var status = "UNDEFINED"
  		logger4js.info("Get Status Test ");
  		try {
  			var result = await sleep(500)
  			logger4js.info("Get Status after say hello: %s Result %O ", message, result);
  			var status = message
  		} catch (ex) {
  			logger4js.info("Say Hello Again Catch Error %O", ex);
  			return res.status(500).send({
  				state: 'failure',
  				message: 'Status Test Check Failed',
  				error: JSON.stringify(ex)
  			});
  		}
  		return res.status(200).send({
  			state: 'success',
  			message: 'Status Test Check',
  			status: status
  		});
  	})

module.exports = router;
