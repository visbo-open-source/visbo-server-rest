var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var jwt = require('jsonwebtoken');
var jwtSecret = require('./../secrets/jwt');

var pwPolicy = undefined;
var pwPolicyPattern = undefined;

var isAllowedPassword = function(password){
	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	if (!pwPolicy) {
		if (process.env.PWPOLICY != undefined) {
			pwPolicy = process.env.PWPOLICY;
		} else {
			pwPolicy = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*([^a-zA-Z\\d\\s])).{8,}$"
		}
		pwPolicyPattern = new RegExp(pwPolicy);
		logger4js.debug("Initialise Password Policy %s", pwPolicy);
	}
	var result = password.match(pwPolicyPattern)
	logger4js.info("Check Password Policy against %s result %s", pwPolicy, result != null);
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
        // if everything is good, save to request for use in other routes
				// console.log("Auth Check for User %s and _id %s", decoded.email, decoded._id);
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
