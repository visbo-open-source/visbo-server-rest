var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var visboRedis = require('./../components/visboRedis');
var getSystemVCSetting = require('./../components/systemVC').getSystemVCSetting

var jwt = require('jsonwebtoken');
var jwtSecret = require('./../secrets/jwt');

var pwPolicy = undefined;
var pwPolicyPattern = undefined;
var pwPolicyExclude = undefined;
var pwPolicyExcludePattern = undefined;

var isAllowedPassword = function(password){

	if (!pwPolicy) {
		var pwPolicySetting = getSystemVCSetting('PW Policy')
		if (pwPolicySetting) {
			logger4js.trace("Check Password Policy from DB %O len %s", pwPolicySetting, pwPolicySetting.value.PWPOlicy.length);
			if (pwPolicySetting.value && pwPolicySetting.value.PWPOlicy) {
				pwPolicy = pwPolicySetting.value.PWPOlicy
			}
			if (pwPolicySetting.value && pwPolicySetting.value.PWPOlicyExclude) {
				pwPolicyExclude = pwPolicySetting.value.PWPOlicyExclude
			}
		}
		if (!pwPolicy) {
			logger4js.trace("Check Password Policy from .env %s", process.env.PWPOLICY);
			pwPolicy = process.env.PWPOLICY || "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*([^a-zA-Z\\d\\s])).{8,}$"
		}
		if (!pwPolicyExclude) {
			logger4js.debug("Check Password Exclude Policy from .env %s", process.env.PWPOLICY);
			pwPolicyExclude = process.env.PWPOLICYEXCLUDE || "^(?!.*[\"\'\\\\])"
		}

		pwPolicyPattern = new RegExp(pwPolicy);
		pwPolicyExcludePattern = new RegExp(pwPolicyExclude);
		logger4js.debug("Initialise Password Policy %s", pwPolicy);
	}

	logger4js.trace("Check Password Policy against %s result %s", pwPolicy, password.match(pwPolicyPattern)|| 'NULL');
	logger4js.trace("Check Password Policy against Exclude %s result %s", pwPolicyExclude, password.match(pwPolicyExcludePattern) || 'NULL');
	var result = password.match(pwPolicyPattern) && password.match(pwPolicyExcludePattern)
	return result;
};

// Verify User Authentication
function verifyUser(req, res, next) {

	var token = req.headers['access-key'];

	// decode token
  if (token) {

    // verifies secret and checks exp
    jwt.verify(token, jwtSecret.user.secret, function(err, decoded) {
      if (err) {
				if (decoded) req.decoded = decoded;
        return res.status(401).send({
        	state: 'failure',
        	message: 'Token is dead'
        });
      } else {
        // if everything is good, check IP and User Agent to prevent session steeling
				var sessionValid = true;
				if (decoded.session.ip != (req.headers["x-real-ip"] || req.ip)) {
					logger4js.warn("User %s: Different IPs for Session %s vs %s", decoded.email, decoded.session.ip, req.headers["x-real-ip"] || req.ip);
					sessionValid = false;
				}
				if (decoded.session.ticket != req.get('User-Agent')) {
					logger4js.warn("User %s: Different UserAgents for Session %s vs %s", decoded.email, decoded.session.ticket, req.get('User-Agent'));
					sessionValid = false;
				}
				if (!sessionValid) {
					return res.status(401).send({
	        	state: 'failure',
	        	message: 'Token is dead'
	        });
				}
				var redisClient = visboRedis.VisboRedisInit();
				var token = req.headers['access-key'].split(".")[2];
				redisClient.get('token.'+token, function(err, reply) {
					// logger4js.debug("Redis Token Check err %O reply %s", err, reply);
					if (err) {
						return res.status(500).send({
		        	state: 'failure',
		        	message: 'Logout Validation'
		        });
					}
					logger4js.trace("Redis Token Found %s user %s", token, reply, );
					if (reply) {
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
  }
  else {
  	// if the user is not authenticated
		return res.status(401).send({
			state: 'failure',
			message: 'No token provided'
		});
  }
};

module.exports = {
	verifyUser: verifyUser,
	isAllowedPassword: isAllowedPassword
};
