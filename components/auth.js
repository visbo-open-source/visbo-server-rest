var mongoose = require('mongoose');

var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var visboRedis = require('./../components/visboRedis');
var getSystemVCSetting = require('./../components/systemVC').getSystemVCSetting;
var getSystemUrl = require('./../components/systemVC').getSystemUrl;
var errorHandler = require('./../components/errorhandler').handler;

var VCSettings = mongoose.model('VCSetting');

var jwt = require('jsonwebtoken');
var jwtSecret = require('./../secrets/jwt');

var pwPolicy = undefined;
var pwPolicyPattern = undefined;

var isAllowedPassword = function(password){

	if (!password) return false;
	if (!pwPolicy) {
		var pwPolicySetting = getSystemVCSetting('PW Policy');
		if (pwPolicySetting) {
			logger4js.trace('Check Password Policy from DB %O len %s', pwPolicySetting, pwPolicySetting.value.PWPolicy.length);
			if (pwPolicySetting.value && pwPolicySetting.value.PWPolicy) {
				pwPolicy = pwPolicySetting.value.PWPolicy;
			}
		}
		if (!pwPolicy) {
			logger4js.trace('Check Password Policy from .env %s', process.env.PWPOLICY);
			pwPolicy = process.env.PWPOLICY || '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*([^a-zA-Z\\d\\s])).{8,}$';
		}

		pwPolicyPattern = new RegExp(pwPolicy);
		logger4js.debug('Initialise Password Policy %s', pwPolicy);
	}

	logger4js.trace('Check Password Policy against %s result %s', pwPolicy, password.match(pwPolicyPattern)|| 'NULL');
	var result = password.match(pwPolicyPattern);
	return result;
};

// Verify User Authentication
function verifyUser(req, res, next) {

	var apiToken = false;
	var options = {};
	var token = req.headers['access-key'];
	if (!token) {
		token = req.headers['api-key'];
		var uiUrl =  getSystemUrl();
		if (token && process.env.NODE_ENV == 'development' && (uiUrl == 'http://localhost:4200' || uiUrl == 'https://dev.visbo.net') && req.body.debug) {
			apiToken = true;
			options.ignoreExpiration = true;
		}
	}

	// decode token
  if (token) {
    // verifies secret and checks exp
    jwt.verify(token, jwtSecret.user.secret, options, function(err, decoded) {
      if (err) {
				logger4js.debug('Authentication with token. Decode Issue', JSON.stringify(req.headers));
				if (decoded) req.decoded = decoded;
        return res.status(401).send({
					state: 'failure',
					message: 'Session is no longer valid'
        });
      } else {
        // if everything is good, check IP and User Agent to prevent session steeling
				var sessionValid = true;
				if (!apiToken) {
					if (decoded.session.ip != (req.headers['x-real-ip'] || req.ip)) {
						logger4js.info('User %s: Different IPs for Session %s vs %s', decoded.email, decoded.session.ip, req.headers['x-real-ip'] || req.ip);
						sessionValid = false;
					}
					if (decoded.session.ticket != req.get('User-Agent')) {
						logger4js.info('User %s: Different UserAgents for Session %s vs %s', decoded.email, decoded.session.ticket, req.get('User-Agent'));
						sessionValid = false;
					}
				}
				if (!sessionValid) {
					return res.status(401).send({
						state: 'failure',
						message: 'Session is no longer valid'
					});
				}
				var redisClient = visboRedis.VisboRedisInit();
				var tokenID = token.split('.')[2];
				redisClient.get('token.'+tokenID, function(err, reply) {
					// logger4js.debug('Redis Token Check err %O reply %s', err, reply);
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'Logout Validation'
						});
					}
					if (reply) {
						logger4js.info('Token already terminated');
						return res.status(401).send({
							state: 'failure',
							message: 'Session already terminated'
						});
					}
					// if everything is good, save to request for use in other routes
					req.decoded = decoded;
					return next();
				});
      }
    });
  } else {
		logger4js.info('Authentication without token. Headers', JSON.stringify(req.headers));
		return res.status(401).send({
			state: 'failure',
			message: 'No token provided'
		});
  }
}

// check if User is an Approver within all VC-organisations, he has access
var isApprover = async function (email) {
	var result = undefined;
	const queryVCSetting =  VCSettings.find({"type": "organisation", 'value.allRoles': {$elemMatch: { 'email': email, 'isSummaryRole': { $exists: true }, 'isSummaryRole': true}}});	
	const settingsWithUser = await queryVCSetting.exec();
	result = (settingsWithUser?.length > 0);
	logger4js.debug('user with email %s is an approver?:  ', email, result);
	//console.log("result of .isApprover function", result);
	return result;
	};


// Verify User Authentication
function verifyOTT(req, res, next) {

	var ott = req.body.ott;
	// decode token
  if (ott) {
		logger4js.debug('OTT Authentication with token:', ott);
    // verifies secret and checks exp
    jwt.verify(ott, jwtSecret.user.secret, function(err, decoded) {
      if (err) {
				logger4js.debug('OTT Authentication with token. Decode Issue', JSON.stringify(decoded));
				if (decoded) req.decoded = decoded;
        		return res.status(400).send({
					state: 'failure',
					message: 'One Time Token is no longer valid'
        });
      } else {
        // if everything is good, check IP and User Agent to prevent session steeling
				var sessionValid = true;
				if (decoded.session.ip != (req.headers['x-real-ip'] || req.ip)) {
					logger4js.info('User %s: Different IPs for Session %s vs %s', decoded.email, decoded.session.ip, req.headers['x-real-ip'] || req.ip);
					sessionValid = false;
				}
				if (!sessionValid) {
					return res.status(400).send({
						state: 'failure',
						message: 'One Time Token is no longer valid'
					});
				}
				var redisClient = visboRedis.VisboRedisInit();
				var ottID = ott.split('.')[2];
				redisClient.get('ott.'+ottID, function(err, reply) {
					// logger4js.debug('Redis Token Check err %O reply %s', err, reply);
					if (err) {
						return res.status(500).send({
							state: 'failure',
							message: 'OTT Authentication Validation'
						});
					}
					if (!reply || reply != decoded._id) {
						logger4js.warn('OTT Token already terminated');
						return res.status(400).send({
							state: 'failure',
							message: 'One Time Token is no longer valid'
						});
					}
					// if everything is good, save to request for use in other routes
					req.decoded = decoded;
					redisClient.del('ott.'+ottID, function(err, response) {
						if (err) {
							errorHandler(err, undefined, 'REDIS: Del OTT Error ', undefined);
							return;
						}
						if (response) {
							logger4js.debug('REDIS: OTT Deleted Successfully');
						} else  {
							logger4js.info('REDIS: OTT Item not found or no longer present');
						}
						return next();
					});
				});
      }
    });
  } else {
		logger4js.info('OTT Authentication without token.');
		return res.status(400).send({
			state: 'failure',
			message: 'No One Time Token provided'
		});
  }
}

module.exports = {
	verifyUser: verifyUser,
	verifyOTT: verifyOTT,
	isAllowedPassword: isAllowedPassword,
	isApprover: isApprover
};
