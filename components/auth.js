var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var jwt = require('jsonwebtoken');
var jwtSecret = require('./../secrets/jwt');

var pwPolicy = undefined;
var pwPolicyPattern = undefined;
var pwPolicyExclude = undefined;
var pwPolicyExcludePattern = undefined;

var isAllowedPassword = function(password){
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

	if (!pwPolicy) {
		logger4js.debug("Check Password Policy from .env %s", process.env.PWPOLICY);
		pwPolicy = process.env.PWPOLICY || "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*([^a-zA-Z\\d\\s])).{8,}$"
		pwPolicyPattern = new RegExp(pwPolicy);

		pwPolicyExclude = process.env.PWPOLICYEXCLUDE || "^(?!.*[\"\'\\])"
		pwPolicyExcludePattern = new RegExp(pwPolicyExclude);
		logger4js.debug("Initialise Password Policy %s", pwPolicy);
	}

	logger4js.info("Check Password Policy against %s result %s", pwPolicy, password.match(pwPolicyPattern)|| 'NULL');
	logger4js.info("Check Password Policy against Exclude %s result %s", pwPolicyExclude, password.match(pwPolicyExcludePattern) || 'NULL');
	var result = password.match(pwPolicyPattern) && password.match(pwPolicyExcludePattern)
	return result;
};

// Verify User Authentication
function verifyUser(req, res, next) {

	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
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
				// if everything is good, save to request for use in other routes
				req.decoded = decoded;
        return next();
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
