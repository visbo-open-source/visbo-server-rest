var mongoose = require('mongoose');
var bcrypt = require('bcrypt');

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

// ============================================
// Password Hashing Functions (bcrypt)
// ============================================

const SALT_ROUNDS = 10;

/**
 * Generate a hash for a password/secret (sync)
 * @param {string} secret - The password or secret to hash
 * @returns {string} - The bcrypt hash
 */
function createHash(secret) {
	return bcrypt.hashSync(secret, SALT_ROUNDS);
}

/**
 * Generate a hash for a password/secret (async)
 * @param {string} secret - The password or secret to hash
 * @returns {Promise<string>} - The bcrypt hash
 */
async function createHashAsync(secret) {
	return bcrypt.hash(secret, SALT_ROUNDS);
}

/**
 * Validate a password against a user's stored hash (sync)
 * @param {object} user - User object with password field
 * @param {string} password - Plain text password to validate
 * @returns {boolean} - True if password matches
 */
function isValidPassword(user, password) {
	return bcrypt.compareSync(password, user.password);
}

/**
 * Validate a password against a user's stored hash (async)
 * @param {object} user - User object with password field
 * @param {string} password - Plain text password to validate
 * @returns {Promise<boolean>} - True if password matches
 */
async function isValidPasswordAsync(user, password) {
	return bcrypt.compare(password, user.password);
}

/**
 * Validate a secret against a hash (sync)
 * @param {string} hash - The stored hash
 * @param {string} secret - The secret to validate
 * @returns {boolean} - True if secret matches hash
 */
function isValidHash(hash, secret) {
	return bcrypt.compareSync(secret, hash);
}

/**
 * Validate a secret against a hash (async)
 * @param {string} hash - The stored hash
 * @param {string} secret - The secret to validate
 * @returns {Promise<boolean>} - True if secret matches hash
 */
async function isValidHashAsync(hash, secret) {
	return bcrypt.compare(secret, hash);
}

/* The isAllowedPassword function validates a given password against a dynamically retrieved password policy.

It:
	Retrieves the password policy from:
		Database (getSystemVCSetting('PW Policy')), if available.
		Environment variable (process.env.PWPOLICY), as a fallback.
		A default regex pattern, if neither of the above exists.
	Compiles the password policy regex (pwPolicyPattern) if it is not already set.
	Validates the given password against the compiled regex pattern.
This function helps enforce security standards for passwords. */

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

/* The verifyUser function is a middleware for user authentication in an Express.js application. It verifies an access token (access-key or api-key) provided in the request headers.
It:
	Extracts and validates the token from the request headers.
	Decodes the token using JWT (jsonwebtoken).
	Checks for session hijacking risks by comparing the IP address and User-Agent.
	Verifies that the session has not been terminated using Redis.
	Allows access to the next middleware if authentication is successful. */

/* 	It returns
	Calls next() if authentication is successful.
	Sends an HTTP response (401 Unauthorized or 500 Internal Server Error) if:
		The token is missing or invalid.
		The session is deemed compromised (e.g., IP/User-Agent mismatch).
		The session has been explicitly terminated in Redis.
 */

// Verify User Authentication
async function verifyUser(req, res, next) {

	var apiToken = false;
	var options = {};
	var token = req.headers['access-key'];
	if (!token) {
		token = req.headers['api-key'];
		var uiUrl =  getSystemUrl();
		if (token && process.env.NODE_ENV == 'development' && (uiUrl == 'http://localhost:4200' || uiUrl == 'https://dev.visbo.net') && req.body && req.body.debug) {
			apiToken = true;
			options.ignoreExpiration = true;
		}
	}

	// decode token
	if (token) {
		// verifies secret and checks exp
		jwt.verify(token, jwtSecret.user.secret, options, async function(err, decoded) {
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
				
				try {
					// Redis v4: async/await
					var redisClient = await visboRedis.VisboRedisInit();
					var tokenID = token.split('.')[2];
					var reply = await redisClient.get('token.' + tokenID);
					
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
				} catch (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Logout Validation'
					});
				}
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

/* The isApprover function checks if a user is an approver based on their email address. 
It queries the VCSettings collection for an organization where the user has a role with the isSummaryRole flag set to true.

This function is asynchronous and returns a boolean result. */

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
/* The verifyOTT function is a middleware for verifying a One-Time Token (OTT) in an Express.js application. 
It checks whether the provided OTT is valid, ensuring that it:

	Exists in the request body (req.body.ott).
	Can be successfully decoded using JWT (jsonwebtoken).
	Matches the session’s IP address to prevent token hijacking.
	Has not been terminated (via Redis validation).
	Deletes the OTT after successful validation to ensure it is only used once.

If all checks pass, the function attaches the decoded OTT to the request (req.decoded) and calls next() to proceed. */

async function verifyOTT(req, res, next) {

	var ott = req.body.ott;
	// decode token
	if (ott) {
		logger4js.debug('OTT Authentication with token:', ott);
		// verifies secret and checks exp
		jwt.verify(ott, jwtSecret.user.secret, async function(err, decoded) {
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
				
				try {
					// Redis v4: async/await
					var redisClient = await visboRedis.VisboRedisInit();
					var ottID = ott.split('.')[2];
					var reply = await redisClient.get('ott.' + ottID);
					
					if (!reply || reply != decoded._id) {
						logger4js.warn('OTT Token already terminated');
						return res.status(400).send({
							state: 'failure',
							message: 'One Time Token is no longer valid'
						});
					}
					
					// if everything is good, save to request for use in other routes
					req.decoded = decoded;
					
					try {
						var response = await redisClient.del('ott.' + ottID);
						if (response) {
							logger4js.debug('REDIS: OTT Deleted Successfully');
						} else {
							logger4js.info('REDIS: OTT Item not found or no longer present');
						}
					} catch (delErr) {
						errorHandler(delErr, undefined, 'REDIS: Del OTT Error ', undefined);
					}
					
					return next();
				} catch (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'OTT Authentication Validation'
					});
				}
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
	isApprover: isApprover,
	// Password hashing (bcrypt)
	createHash: createHash,
	createHashAsync: createHashAsync,
	isValidPassword: isValidPassword,
	isValidPasswordAsync: isValidPasswordAsync,
	isValidHash: isValidHash,
	isValidHashAsync: isValidHashAsync
};
