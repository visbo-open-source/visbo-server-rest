var express = require('express');
var router = express.Router();

var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var jwt = require('jsonwebtoken');
var jwtSecret = require('./../secrets/jwt');
var auth = require('./../components/auth');
var errorHandler = require('./../components/errorhandler').handler;
var systemVC = require('./../components/systemVC');
var getSystemVCSetting = systemVC.getSystemVCSetting;
var getSystemUrl = systemVC.getSystemUrl;
var getReSTUrl = systemVC.getReSTUrl;

var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth20').Strategy;

var useragent = require('useragent');
var eMailTemplates = '/../emailTemplates/';
var fs = require('fs');

var logModule = 'USER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var validate = require('./../components/validate');

var mail = require('./../components/mail');
var sendMail = require('./../components/sendMail');
var ejs = require('ejs');

var visbouser = mongoose.model('User');

var visboShortUA = function(stringUA) {
	var agent = useragent.parse(stringUA);
	agent.patch = undefined;
	agent.family.patch = undefined;
	agent.os.patch = undefined;
	logger4js.debug('User Agent %s', agent.toString());
	return agent.toString();
};

var findUserAgent = function(currentUserAgent) {
	// logger4js.trace('FIND UserAgent %O with %s result %s', this, currentUserAgent.userAgent, currentUserAgent.userAgent == this.userAgent);
	return currentUserAgent.userAgent == this.userAgent;
};

// Password hashing functions from auth module
var isValidHash = auth.isValidHash;
var isValidPassword = auth.isValidPassword;
var createHash = auth.createHash;

var redirectURL = getReSTUrl().concat('/token/user/googleRedirect');
var settingOAuth = getSystemVCSetting('OAuthGoogle');
if (settingOAuth && settingOAuth.value) { settingOAuth = settingOAuth.value; }

if (settingOAuth) {
	logger4js.warn('Redirect URL', redirectURL);
	passport.use(new GoogleStrategy({
			clientID: settingOAuth.clientID,
			clientSecret: settingOAuth.clientSecret,
			callbackURL: getReSTUrl().concat('/token/user/googleRedirect')
		},
		function(accessToken, refreshToken, profile, cb) {
			logger4js.trace('Access Token', accessToken, 'Refresh Token', refreshToken);
			logger4js.trace('Profile', profile);
			logger4js.warn('GOOGLE BASED OAUTH VALIDATION for ', profile && profile.displayName);
			return cb(null, profile); // MS TODO: What is the callback Function
		}
	));
}

passport.serializeUser(function(user, cb) {
    logger4js.info('User authenticated', user && user.displayName);
    cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
    logger4js.info('User not authenticated', JSON.stringify(obj));
    cb(null, obj);
});

router.route('/user/login')

/**
	* @api {post} /token/user/login User Login
	* @apiVersion 1.0.0
	* @apiGroup Authentication
	* @apiName UserLogin
	* @apiDescription POST Login returns if it was successful an access token and the user profile information
	* of the authenticated user. The token has to be passed to every subsequent API Call in the header with name "access-key"
	* @apiPermission none
	* @apiError {number} 401 user & password do not match
	* @apiError {number} 400 User or password missing
	* @apiError {number} 500 Internal Server Error
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/token/user/login
	*   body:
	*   {
	*     'email': 'example@example.com',
	*     'password': 'thisIsPassword'
	*   }
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   'state':'success',
	*   'message':'Successfully logged in',
	*   'token':'eyJhbG...brDI',
	*   'user':{
	*     '_id':'UID5a96787976294c5417f0e49',
	*     'updatedAt':'2018-02-28T09:00:00.000Z',
	*     'createdAt':'2018-02-28T10:00:00.000Z',
	*     'email':'example@example.com',
	*     'profile': {
	*       'firstname': 'First',
	*       'lastname': 'Last',
	*       'company': 'Company inc',
	*       'phone': '0151-11223344',
	*       'address' : {
	*         'street': 'Street',
	*         'city': 'City',
	*         'zip': '88888',
	*         'state': 'State',
	*         'country': 'Country',
	*       }
	*     },
	*     'status': {
	*       'registeredAt': '2018-06-01T13:00:00.000Z',
	*       'lastLoginAt': '2019-01-01T14:00:00.001Z',
	*       'loginRetries': 0,
	*       'lastLoginFailedAt': '2018-11-01T09:00:00.001Z',
	*       'lastPWResetAt': '2018-12-01T14:00:00.001ZZ'
	*     }
	*   }
	* }
	*/

// Post Login
	.post(function(req, res) {
		var currentDate = new Date();
		req.auditDescription = 'Login';

		var body = req.body || {};

		logger4js.debug('Try to Login %s', body.email);
		logger4js.debug('Login Headers %O', req.headers);
		var lang = validate.evaluateLanguage(req);
    	logger4js.debug('The Accepted Language is: ' + lang);
		if (!body.email || !body.password){
			logger4js.debug('Authentication Missing email or password %s', body.email);
			return res.status(400).send({
				state: 'failure',
				message: 'email or password missing'
			});
		}
		req.body = body;
		req.body.email = req.body.email.toLowerCase().trim();
		req.visboUserAgent = visboShortUA(req.headers['user-agent']);
		logger4js.debug('Shortened User Agent ', req.visboUserAgent);

		visbouser.findOne({ 'email' : req.body.email }, async function(err, user) {
			if (err) {
				errorHandler(err, res, `DB: POST Login ${req.body.email} Find `, 'Error Login Failed');
				return;
			}
			if (!user) {
				logger4js.info('User not Found', req.body.email);
				return res.status(403).send({
					state: 'failure',
					message: 'email or password mismatch'
				});
			}
			logger4js.debug('Try to Login User Found %s', user.email);

			if (!user.status || !user.status.registeredAt || !user.password) {
				logger4js.warn('Login: User %s not Registered User Status %s', req.body.email, user.status ? true: false);
				// Send Mail to User with Register Link
				sendMail.accountNotRegistered(req, res, user);
				return res.status(403).send({
					state: 'failure',
					message: 'email or password mismatch'
				});
			}
			logger4js.debug('Login: User %s Check Login Retries %s', req.body.email, user.status.loginRetries);
			var loginRetries = 3;
			var lockMinutes = 15;
			var loginFailedIntervalMinute = 4 * 60;
			if (user.status.lockedUntil && user.status.lockedUntil.getTime() > currentDate.getTime()) {
				logger4js.info('Login: User %s locked until %s', req.body.email, user.status.lockedUntil);
				return res.status(403).send({
					state: 'failure',
					message: 'email or password mismatch'
				});
			}
			logger4js.debug('Login: Check password for %s user', req.body.email);
			if (!isValidPassword(user, req.body.password)) {
				var lastLoginFailedAt = user.status.lastLoginFailedAt || new Date(0);
				// save user and increment wrong password count and timestamp
				logger4js.debug('Login: Wrong password', req.body.email);
				if (!user.status.loginRetries) user.status.loginRetries = 0;
				if ((currentDate.getTime() - (lastLoginFailedAt.getTime() || 0))/1000/60 > loginFailedIntervalMinute ) {
					// reset retry count if last login failed is older than loginFailedIntervalMinute
					user.status.loginRetries = 0;
				}
				user.status.loginRetries += 1;
				user.status.lastLoginFailedAt = currentDate;
				if (user.status.loginRetries > loginRetries) {
					if (!user.status.lockedUntil || user.status.lockedUntil.getTime() < currentDate.getTime()) {
						logger4js.info('Login: Retry Count for %s now reached. Send Mail', req.body.email);
						user.status.lockedUntil = new Date();
						user.status.lockedUntil.setTime(currentDate.getTime() + lockMinutes*60*1000);
						logger4js.debug('Login: Retry Count New LockedUntil %s', user.status.lockedUntil.toISOString());
						sendMail.accountLocked(req, res, user);
					}
				}
				user.save(function(err, user) {
					if (err) {
						logger4js.error('Login User Update DB Connection User.save() %s', err.message);
						return res.status(500).send({
							state: 'failure',
							message: 'database error, failed to update user',
							error: err
						});
					}
					logger4js.debug('Login: Retry Count for %s incremented %s last failed %s locked until %s', req.body.email, user.status.loginRetries, user.status.lastLoginFailedAt, user.status.lockedUntil);
					return res.status(403).send({
						state: 'failure',
						message: 'email or password mismatch'
					});
				});
			} else {
				// Login Successful
				var message = 'Successfully logged in.';
				if (!auth.isAllowedPassword(req.body.password)) {
					logger4js.info('Login Password: current password does not match password rules');
					if (!user.status) user.status = {};
					if (!user.status.expiresAt) {
						user.status.expiresAt = currentDate;
						user.status.expiresAt.setDate(currentDate.getDate() + 1); // allow 1 day to change
					}
					// show expiration in Hours / Minutes
					var expiresHour = Math.trunc((user.status.expiresAt.getTime() - currentDate.getTime())/1000/3600);
					var expiresMin = '00'.concat(Math.trunc((user.status.expiresAt.getTime() - currentDate.getTime())/1000/60%60)).substr(-2, 2);
					message = message.concat(` YOUR password expires in ${expiresHour}:${expiresMin} h`);
					if (currentDate.getTime() > user.status.expiresAt.getTime()) {
						logger4js.info('Login Password expired at: %s', user.status.expiresAt.toISOString());
						sendMail.passwordExpired(req, res, user);
						return res.status(403).send({
							state: 'failure',
							message: 'email or password mismatch'
						});
					}
					sendMail.passwordExpiresSoon(req, res, user, user.status.expiresAt);
				}
				logger4js.debug('Try to Login %s username&password accepted', req.body.email);
				var passwordCopy = user.password;
				user.password = undefined;
				if (!user.status) user.status = {};		
						
				// set  the status isApprover 
				//console.log("vor auth.isApprover: ",user.status.isApprover);
				if (await auth.isApprover(user.email)) {
					user.status.isApprover = true;
				} else {
					user.status.isApprover = false;
				}						
				//console.log("nach auth.isApprover:", user.status.isApprover);		

				// add info about the session ip and userAgent to verify during further requests to avoid session steeling
				user.session = {};
				user.session.ip = req.headers['x-real-ip'] || req.ip;
				user.session.ticket = req.get('User-Agent');

				var userReduced = {};
				userReduced._id = user._id;
				userReduced.email = user.email;
				userReduced.profile = user.profile;
				userReduced.status = user.status;
				userReduced.session = user.session;
				logger4js.trace('User Reduced User: %O', JSON.stringify(userReduced));
				// jwt.sign(user.toJSON(), jwtSecret.user.secret,
				jwt.sign(userReduced, jwtSecret.user.secret,
					{ expiresIn: jwtSecret.user.expiresIn },
					async function(err, token) {
						if (err) {
							logger4js.error('JWT Signing Error %s ', err.message);
							return res.status(500)({
								state: 'failure',
								message: 'token generation failed',
								error: err
							});
						}
						logger4js.trace('JWT Signing Success ');

						// set  the status isApprover and the last login and reset the password retries
						if (!user.status) user.status = {};
						if (await auth.isApprover(user.email)) {
							user.status.isApprover = true;
						} else {
							user.status.isApprover = false;
						}					
						if (!user.status.loginRetries) user.status.loginRetries = 0;
						var lastLoginAt = user.status.lastLoginAt || currentDate;
						user.status.lastLoginAt = currentDate;
						user.status.loginRetries = 0;
						user.status.lockedUntil = undefined;
						user.password = passwordCopy;
						user.session = undefined;
						// Check user Agent and update or add it and send e-Mail about new login
						var curAgent = {};
						curAgent.userAgent = req.visboUserAgent;
						curAgent.createdAt = new Date();
						curAgent.lastUsedAt = curAgent.createdAt;
						logger4js.trace('User Agent prepared %s', curAgent.userAgents);

						if (!user.userAgents || user.userAgents.length == 0) {
							user.userAgents = [];
							user.userAgents.push(curAgent);
							logger4js.debug('Init User Agent first Login %s', JSON.stringify(user.userAgents));
						} else {
							// Check List of User Agents and add or updated
							var index = user.userAgents.findIndex(findUserAgent, curAgent);
							if (index >= 0) {
								user.userAgents[index].lastUsedAt = curAgent.lastUsedAt;
							} else {
								user.userAgents.push(curAgent);
								// Send Mail about new Login with unknown User Agent
								sendMail.accountNewLogin(req, res, user);
								logger4js.debug('New Login with new User Agent %s', req.visboUserAgent);
							}
							// Cleanup old User Agents older than 3 Months
							var expiredAt = new Date();
							expiredAt.setMonth(expiredAt.getMonth()-3);
							logger4js.trace('User before Filter %s User Agents %s', expiredAt, JSON.stringify(user.userAgents));
							user.userAgents = user.userAgents.filter(userAgents => ( userAgents.lastUsedAt >= expiredAt ));
						}

						logger4js.trace('User before Save User Agents %s', JSON.stringify(user.userAgents));
						user.save(function(err, user) {
							if (err) {
								logger4js.error('Login User Update DB Connection %s', err.message);
								return res.status(500).send({
									state: 'failure',
									message: 'database error, failed to update user',
									error: err
								});
							}
							user.password = undefined;
							user.status.lastLoginAt = lastLoginAt;
							return res.status(200).send({
								state: 'success',
								message: message,
								token: token,
								user: user
							});
						});
					}
				);
			}
		});
	});

	router.route('/user/ott')

	/**
		* @api {post} /token/user/ott User Login with One Time Token
		* @apiVersion 1.0.0
		* @apiGroup Authentication
		* @apiName UserLoginOtt
		* @apiDescription POST Login returns if it was successful an access token and the user profile information
		* of the authenticated user. The token has to be passed to every subsequent API Call in the header with name "access-key"
		* @apiPermission none
		* @apiError {number} 401 One Time Token is not valid for any reason
		* @apiError {number} 400 One Time Token missing
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/token/user/ott
		* {
		*  'ott':'OTT Token'
		* }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*   'state':'success',
		*   'message':'Successfully logged in',
		*   'token':'eyJhbG...brDI',
		*   'user':{
		*     '_id':'UID5a96787976294c5417f0e49',
		*     'updatedAt':'2018-02-28T09:00:00.000Z',
		*     'createdAt':'2018-02-28T10:00:00.000Z',
		*     'email':'example@example.com',
		*     'profile': {
		*       'firstname': 'First',
		*       'lastname': 'Last',
		*       'company': 'Company inc',
		*       'phone': '0151-11223344',
		*       'address' : {
		*         'street': 'Street',
		*         'city': 'City',
		*         'zip': '88888',
		*         'state': 'State',
		*         'country': 'Country',
		*       }
		*     },
		*     'status': {
		*       'registeredAt': '2018-06-01T13:00:00.000Z',
		*       'lastLoginAt': '2019-01-01T14:00:00.001Z',
		*       'loginRetries': 0,
		*       'lastLoginFailedAt': '2018-11-01T09:00:00.001Z',
		*       'lastPWResetAt': '2018-12-01T14:00:00.001ZZ'
		*     }
		*   }
		* }
		*/

	// Post OTT Login
		.post(function(req, res) {
			req.auditDescription = 'Login OTT';

			logger4js.info('Try to Login with OTT');
			var lang = validate.evaluateLanguage(req);
			logger4js.debug('The Accepted Language is: ' + lang);
			auth.verifyOTT(req, res, function() {
				logger4js.debug('OTT Token valid & checked ', req.decoded.email, req.decoded._id);
				visbouser.findOne({ 'email' : req.decoded.email }, function(err, user) {
					if (err) {
						errorHandler(err, res, `DB: POST OTT Login ${req.decoded.email} Find `, 'Error OTT Login Failed');
						return;
					}
					if (!user) {
						logger4js.warn('OTT Token valid but User not found', req.decoded.email);
						return res.status(403).send({
							state: 'failure',
							message: 'One time Token email mismatch'
						});
					}
					logger4js.debug('Try to Login User Found %s', user.email);

					var message = 'Successfully logged in.';
					req.visboUserAgent = visboShortUA(req.headers['user-agent']);
					var passwordCopy = user.password;
					user.password = undefined;
					if (!user.status) user.status = {};
					// add info about the session ip and userAgent to verify during further requests to avoid session steeling
					user.session = {};
					user.session.ip = req.headers['x-real-ip'] || req.ip;
					user.session.ticket = req.get('User-Agent');

					var userReduced = {};
					userReduced._id = user._id;
					userReduced.email = user.email;
					userReduced.profile = user.profile;
					userReduced.status = user.status;
					userReduced.session = user.session;
					logger4js.trace('User Reduced User: %O', JSON.stringify(userReduced));

					jwt.sign(userReduced, jwtSecret.user.secret,
						{ expiresIn: jwtSecret.user.expiresIn },
						function(err, token) {
							if (err) {
								logger4js.error('JWT Signing Error %s ', err.message);
								return res.status(500)({
									state: 'failure',
									message: 'token generation failed',
									error: err
								});
							}
							logger4js.trace('OTT JWT Signing Success ');
							user.password = passwordCopy;
							user.session = undefined;
							// Check user Agent and update or add it and send e-Mail about new login
							var curAgent = {};
							curAgent.userAgent = req.visboUserAgent;
							curAgent.createdAt = new Date();
							curAgent.lastUsedAt = curAgent.createdAt;
							logger4js.trace('User Agent prepared %s', curAgent.userAgents);

							if (!user.userAgents || user.userAgents.length == 0) {
								user.userAgents = [];
								user.userAgents.push(curAgent);
								logger4js.debug('Init User Agent first Login %s', JSON.stringify(user.userAgents));
							} else {
								// Check List of User Agents and add or updated
								var index = user.userAgents.findIndex(findUserAgent, curAgent);
								if (index >= 0) {
									user.userAgents[index].lastUsedAt = curAgent.lastUsedAt;
								} else {
									user.userAgents.push(curAgent);
									// Send Mail about new Login with unknown User Agent
									sendMail.accountNewLogin(req, res, user);
									logger4js.debug('New Login with new User Agent %s', req.visboUserAgent);
								}
								// Cleanup old User Agents older than 3 Months
								var expiredAt = new Date();
								expiredAt.setMonth(expiredAt.getMonth()-3);
								logger4js.trace('User before Filter %s User Agents %s', expiredAt, JSON.stringify(user.userAgents));
								user.userAgents = user.userAgents.filter(userAgents => ( userAgents.lastUsedAt >= expiredAt ));
							}
							logger4js.trace('User before Save User Agents %s', JSON.stringify(user.userAgents));
							user.save(function(err, user) {
								if (err) {
									logger4js.error('Login User Update DB Connection %s', err.message);
									return res.status(500).send({
										state: 'failure',
										message: 'database error, failed to update user',
										error: err
									});
								}
								user.password = undefined;
								return res.status(200).send({
									state: 'success',
									message: message,
									token: token,
									user: user
								});
							});
						}
					);
				});
			});
		});

router.route('/user/logingoogle')

	// get google authentication
	// MS TODO: setup as middleware function??
	.get(passport.authenticate('google', { scope: ['profile','email'] }));
	// .get(function(req, res) {
	// 	req.auditDescription = 'Google Login';
	// 	req.auditTTLMode = 1;
	//
	// 	var result = passport.authenticate('google', { scope: ['profile', 'email'] });
	// 	console.log('logingoogle result', JSON.stringify(result));
	// })

router.route('/user/googleRedirect')

	// get google confirmation
	.get(passport.authenticate('google'),(req, res)=>{
		logger4js.warn('redirected', req.user && req.user.displayName, JSON.stringify(req.user));
		let user = {
			displayName: req.user.displayName,
			name: req.user.name && req.user.name.givenName,
			email: req.user._json.email,
			provider: req.user.provider
		};
		logger4js.debug('google Redirect', user);

		var currentDate = new Date();
		req.auditDescription = 'Login';

		logger4js.info('Try to Login google user %s', user.email);
		logger4js.debug('Login Headers %O', req.headers);
		var lang = validate.evaluateLanguage(req);
		logger4js.debug('The Accepted Language is: ' + lang);
		req.body.email = user.email.toLowerCase().trim();
		req.visboUserAgent = visboShortUA(req.headers['user-agent']);
		logger4js.debug('Shortened User Agent ', req.visboUserAgent);

		visbouser.findOne({ 'email' : req.body.email }, function(err, user) {
			if (err) {
				errorHandler(err, res, `DB: POST Login ${req.body.email} Find `, 'Error Login Failed');
				return;
			}
			if (!user) {
				logger4js.info('User not Found', req.body.email);
				return res.status(403).send({
					state: 'failure',
					message: 'email not registered for this authentication'
				});
			}
			logger4js.debug('Try to Login User Found %s', user.email);

			if (!user.status || !user.status.registeredAt) {
				logger4js.warn('Login: User %s not Registered User Status %s', req.body.email, user.status ? true: false);
				// Send Mail to User with Register Link
				sendMail.accountNotRegistered(req, res, user);
				return res.status(403).send({
					state: 'failure',
					message: 'email or password mismatch'
				});
			}
			logger4js.debug('Login: User %s Check Login Retries %s', req.body.email, user.status.loginRetries);
			if (user.status.lockedUntil && user.status.lockedUntil.getTime() > currentDate.getTime()) {
				logger4js.info('Login: User %s locked until %s', req.body.email, user.status.lockedUntil);
				return res.status(403).send({
					state: 'failure',
					message: 'email or password mismatch'
				});
			}
			logger4js.debug('Try to Login (google) %s user accepted', req.body.email);
			var passwordCopy = user.password;
			user.password = undefined;
			if (!user.status) user.status = {};
			// add info about the session ip and userAgent to verify during further requests to avoid session steeling
			user.session = {};
			user.session.ip = req.headers['x-real-ip'] || req.ip;
			user.session.ticket = req.get('User-Agent');

			var userReduced = {};
			userReduced._id = user._id;
			userReduced.email = user.email;
			userReduced.profile = user.profile;
			userReduced.status = user.status;
			userReduced.session = user.session;
			logger4js.trace('User Reduced User: %O', JSON.stringify(userReduced));

			jwt.sign(userReduced, jwtSecret.user.secret,
				{ expiresIn: jwtSecret.user.expiresIn },
				function(err, token) {
					if (err) {
						logger4js.error('JWT Signing Error %s ', err.message);
						return res.status(500)({
							state: 'failure',
							message: 'token generation failed',
							error: err
						});
					}
					logger4js.trace('JWT Signing Success ');
					// set the last login and reset the password retries

					if (!user.status) user.status = {};
					if (!user.status.loginRetries) user.status.loginRetries = 0;
					var lastLoginAt = user.status.lastLoginAt || currentDate;
					user.status.lastLoginAt = currentDate;
					user.status.loginRetries = 0;
					user.status.lockedUntil = undefined;
					user.password = passwordCopy;
					user.session = undefined;
					// Check user Agent and update or add it and send e-Mail about new login
					var curAgent = {};
					curAgent.userAgent = req.visboUserAgent;
					curAgent.createdAt = new Date();
					curAgent.lastUsedAt = curAgent.createdAt;
					logger4js.trace('User Agent prepared %s', curAgent.userAgents);

					if (!user.userAgents || user.userAgents.length == 0) {
						user.userAgents = [];
						user.userAgents.push(curAgent);
						logger4js.debug('Init User Agent first Login %s', JSON.stringify(user.userAgents));
					} else {
						// Check List of User Agents and add or updated
						var index = user.userAgents.findIndex(findUserAgent, curAgent);
						if (index >= 0) {
							user.userAgents[index].lastUsedAt = curAgent.lastUsedAt;
						} else {
							user.userAgents.push(curAgent);
							// Send Mail about new Login with unknown User Agent
							sendMail.accountNewLogin(req, res, user);
							logger4js.debug('New Login with new User Agent %s', req.visboUserAgent);
						}
						// Cleanup old User Agents older than 3 Months
						var expiredAt = new Date();
						expiredAt.setMonth(expiredAt.getMonth()-3);
						logger4js.trace('User before Filter %s User Agents %s', expiredAt, JSON.stringify(user.userAgents));
						user.userAgents = user.userAgents.filter(userAgents => ( userAgents.lastUsedAt >= expiredAt ));
					}
					logger4js.trace('User before Save User Agents %s', JSON.stringify(user.userAgents));
					user.save(function(err, user) {
						if (err) {
							logger4js.error('Login User Update DB Connection %s', err.message);
							return res.status(500).send({
								state: 'failure',
								message: 'database error, failed to update user',
								error: err
							});
						}
						user.password = undefined;
						user.status.lastLoginAt = lastLoginAt;

						// MS TODO: store a hash and the token

						// res.header('access-key', token);
						var uiURL = getSystemUrl().concat('/oauthconfirm');
						logger4js.info('Login google redirect to ', uiURL);
						// MS TODO: do not sent the token as parameter but instead use a hash
						if (token) {
							uiURL = uiURL.concat('?hash=', token);
						}
						res.redirect(uiURL);
					});
				}
			);
		});
	});

router.route('/user/pwforgotten')

/**
	* @api {post} /token/user/pwforgotten Password Forgotten
	* @apiVersion 1.0.0
	* @apiGroup Authentication
	* @apiName PasswordForgotten
	* @apiDescription Post pwforgotten initiates the setting of a new password. To avoid user & password probing, this function delivers always success
	* but send a Mail with the Reset Link only if the user was found and the last Reset Password was not done in the last 15 minutes.
	* in case the user does a successful login, the timer is ignored
	* @apiPermission none
	* @apiError {number} 400 email missing
	* @apiError {number} 500 Internal Server Error
	* @apiExample Example usage:
	*  url: https://my.visbo.net/api/token/user/forgottenpw
	*  body: {
	*   'email': 'example@example.com',
	* }
	*/

// Forgot Password
	.post(function(req, res) {
		req.auditDescription = 'Forgot Password';

		logger4js.info('Requested Password Reset through e-Mail %s', req.body.email);
		if (req.body.email)	req.body.email = req.body.email.toLowerCase().trim();
		if (!validate.validateEmail(req.body.email, false)) {
			logger4js.info('No valid eMail specified %s ', req.body.email);
			return res.status(400).send({
				state: 'failure',
				message: 'No valid eMail specified'
			});
		}

		var query = { 'email' : req.body.email };
		visbouser.findOne(query, function(err, user) {
			if (err) {
				errorHandler(err, res, `DB: POST Forgot PW ${req.body.email} Find `, 'Password Forgotten Failed');
				return;
			}
			// we return success to prevent eMail probing and count the request to prevent eMail spamming
			if (!user) {
				return res.status(200).send({
					// state: 'failure',
					// message: 'email not registered'
					state: 'success',
					message: 'Successfully Requested Password Reset through e-Mail'
				});
			}
			if (!user.status || !user.status.registeredAt) {
				logger4js.info('Password Reset: User not registered %s ', user._id);
				return res.status(200).send({
					// state: 'failure',
					// message: 'email not registered'
					state: 'success',
					message: 'Successfully Requested Password Reset through e-Mail'
				});
			}
			var currentDate = new Date();
			if (user.status.lastPWResetAt
			&& user.status.lastPWResetAt > user.status.lastLoginAt
			&& (currentDate.getTime() - user.status.lastPWResetAt.getTime())/1000/60 < 5) {
				logger4js.warn('Multiple Password Resets for User %s ', user._id);
				return res.status(200).send({
					// state: 'failure',
					// message: 'email not registered'
					state: 'success',
					message: 'Successfully Requested Password Reset through e-Mail'
				});
			}
			user.status.lastPWResetAt = currentDate;
			user.save(function(err, user) {
				if (err) {
					logger4js.error('Forgot Password Save user Error DB Connection %s', err.message);
					return res.status(500).send({
						state: 'failure',
						message: 'database error, failed to update user',
						error: err
					});
				}
				user.password = undefined;
				var userShort = new visbouser();
				userShort.email = user.email;
				userShort.status = user.status;
				userShort.updatedAt = user.updatedAt;
				userShort.createdAt = user.createdAt;
				userShort._id = user._id;

				var lang = validate.evaluateLanguage(req);
				logger4js.debug('Requested Password Reset through e-Mail %s expires in %s Language %s', user.email, jwtSecret.register.expiresIn, lang);
				// logger4js.debug('Requested Password Reset Request %O', req);
				// delete user.profile;
				// delete user.status;
				jwt.sign(userShort.toJSON(), jwtSecret.register.secret,
					{ expiresIn: jwtSecret.register.expiresIn },
					function(err, token) {
						if (err) {
							errorHandler(err, res, 'Sign: POST Forgot Password ', 'Token generation failed');
							return;
						}
						// Send e-Mail with Token to registered Users
						var template = __dirname.concat(eMailTemplates, lang, '/pwreset1.ejs');
						if (!fs.existsSync(template)) {
							logger4js.warn('E-Mail template %s does not exists', template);
							return res.status(500).send({
								state: 'failure',
								message: 'E-Mail Rendering Templates missing'
							});
						}
						var uiUrl =  getSystemUrl();
						var pwreseturl = uiUrl.concat('/pwreset', '?token=', token);
						logger4js.debug('E-Mail template %s, url %s', template, pwreseturl.substring(0, 40));
						ejs.renderFile(template, {user: user, url: pwreseturl}, function(err, emailHtml) {
							if (err) {
								logger4js.warn('E-Mail Rendering failed %s', err.message);
								return res.status(500).send({
									state: 'failure',
									message: 'E-Mail Rendering failed',
									error: err
								});
							}
							var message = {
									// from: 'service@visbo.de',
									to: user.email,
									subject: res.__('Mail.Subject.PWReset'),
									// text: 'Password reset Token: '.concat(token, ' '),
									// html: '<b>Password reset Token:</b><br><p>Password reset Token: '.concat(token, ' </p>')
									html: '<p> '.concat(emailHtml, ' </p>')
									// html: ejs.renderFile(template)
							};
							mail.VisboSendMail(message);
							logger4js.trace('PW Reset Env %s uiUrl %s debug %s.', process.env.NODE_ENV, uiUrl, req.body.debug);
							if (process.env.NODE_ENV == 'development' && (uiUrl == 'http://localhost:4200' || uiUrl == 'https://dev.visbo.net') && req.body.debug) {
								// deliver more details to do automatic testing without mail verification
								return res.status(200).send({
									state: 'success',
									message: 'Successfully Requested Password Reset through e-Mail',
									debug: {
										url: pwreseturl,
										token: token
									}
								});
							} else {
								return res.status(200).send({
									state: 'success',
									message: 'Successfully Requested Password Reset through e-Mail'
								});
							}
						});
					}
				);
			});
		});
	});

router.route('/user/pwreset')

/**
	* @api {post} /token/user/pwreset Password Reset
	* @apiVersion 1.0.0
	* @apiGroup Authentication
	* @apiName PasswordReset
	* @apiPermission none
	* @apiError {number} 400 email or token missing
	* @apiError {number} 401 token no longer valid
	* @apiError {number} 409 user not found or user already changed
	* @apiError {number} 500 Internal Server Error
	* @apiExample Example usage:
	*  url: https://my.visbo.net/api/token/user/pwreset
	*  body: {
	*   'token': 'FhwMsAKhKABXNEXG4GTW_zXUKXcc56mhTYkj7ZyB9M0',
	*   'password': 'newPassword'
	* }
	*/

	// Password Reset
	.post(function(req, res) {
		req.auditDescription = 'Password Reset';

		logger4js.info('Password Reset Change through e-Mail Token %s PW %s', req.body.token && 'Token Available', req.body.password && 'PW Available');
		if (!req.body.token || !req.body.password) {
			return res.status(400).send({
				state: 'failure',
				message: 'token or password is missing'
			});
		}
		var token = req.body.token;
		// verifies secret and checks exp
    jwt.verify(token, jwtSecret.register.secret, function(err, decoded) {
      if (err) {
        return res.status(403).send({
					state: 'failure',
					message: 'Session has expired'
        });
      } else {
        // if everything is good, save to request for use in other routes
				logger4js.debug('Forgot PW Token Check for User %s and _id %s', decoded.email, decoded._id);
				var query = { 'email' : decoded.email, 'updatedAt': decoded.updatedAt };
				visbouser.findOne(query, function(err, user) {
					if (err) {
						errorHandler(err, res, 'DB: POST PW Reset Find ', 'Error password reset failed');
						return;
					}
					if (!user) {
						logger4js.debug('Forgot Password user not found or different change date');
						return res.status(409).send({
							state: 'failure',
							message: 'invalid token'
						});
					}
					if (!auth.isAllowedPassword(req.body.password)) {
						logger4js.info('Password forgotten: new password does not match password rules');
						return res.status(409).send({
							state: 'failure',
							message: 'Pasword does not match password rules'
						});
					}
					user.password = createHash(req.body.password);
					if (!user.status) user.status = {};
					user.status.loginRetries = 0;
					user.status.lockedUntil = undefined;
					user.status.lastPWResetAt = undefined; // Reset the Date, so that the user can ask for password reset again without a time limit
					user.status.expiresAt = undefined;
					user.save(function(err) {
						if (err) {
							logger4js.error('Forgot Password Save user Error DB Connection %s', err.message);
							return res.status(500).send({
								state: 'failure',
								message: 'database error, failed to update user',
								error: err
							});
						}
						logger4js.debug('Forgot Password Save Successful');
						return res.status(200).send({
							state: 'success',
							message: 'Successfully Changed Password'
						});
					});
				});
			}
    });
	});

router.route('/user/signup')

/**
	* @api {get} /token/user/signup?id=user5c754febb&hash=hash5c754feaa User Signup
	* @apiVersion 1.0.0
	* @apiGroup Authentication
  * @apiName GetUserSignup
	* @apiPermission none
	* @apiError {number} 400 no valid hash delivered
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/token/user/signup?id=user5c754febb&hash=hash=hash5c754feaa
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'User Registration',
	*  'user':{
	*    '_id':'user5c754febb',
	*    'updatedAt':'2018-03-20T10:31:27.216Z',
	*    'createdAt':'2018-02-28T09:38:04.774Z',
	*    'email':'first.last@visbo.de',
	*    '__v':0,
	*    'profile': {
	*      'firstname': 'First',
	*      'lastname': 'Last',
	*      'company': 'Company inc',
	*      'phone': '0151-11223344',
	*      'address' : {
	*        'street': 'Street',
	*        'city': 'City',
	*        'zip': '88888',
	*        'state': 'State',
	*        'country': 'Country',
	*      }
	*    }
	*  }
	*}
	*/
// get signup info
	.get(function(req, res) {
		req.auditDescription = 'Signup Read';
		req.auditTTLMode = 1;

		var hash = req.query.hash;
		if (!req.query.id || !hash) {
			return res.status(400).send({
				state: 'failure',
				message: 'Signup User ID with Hash not allowed'
			});
		}

		visbouser.findById(req.query.id, function(err, user) {
			if (err) {
				errorHandler(err, res, `DB: GET Signup Info ${req.query.id} Find `, 'Error get signup info failed');
				return;
			}
			if (!user || (user.status && user.status.registeredAt)) {
				return res.status(403).send({
					state: 'failure',
					message: 'UserID / Hash not valid or User already registered'
				});
			}
			// check hash to avoid id probing
			var secret = 'register'.concat(user._id, user.updatedAt.getTime());
			if (!isValidHash(hash, secret)) {
				return res.status(403).send({
					state: 'failure',
					message: 'UserID / Hash not valid or User already registered'
				});
			}
			user.password = undefined;
			return res.status(200).send({
				state: 'success',
				message: 'Signup User Information',
				user: user
			});
		});
	})

/**
  * @api {post} /token/user/signup?hash=hash5c754feaa User Signup
  * @apiVersion 1.0.0
  * @apiGroup Authentication
  * @apiName UserSignup
	* @apiPermission none
	* @apiError {number} 400 email or userid missing in body
	* @apiError {number} 401 token no longer valid
	* @apiError {number} 409 unknown userID
	* @apiError {number} 409 email already registered
	* @apiDescription signup a user with Profile Details and a new password.
	* Signup can be called with an e-mail address or an _id. The system refuses the registration if an _id is specified and there is no user with this _id to be registered
	* If called with an e-mail, the system returns an error if a user with this e-mail already exists and is registered.
	* The hash is optional and if delivered correct, the system does not ask for e-mail confirmation.
  * @apiExample Example usage:
  *   url: https://my.visbo.net/api/token/user/signup
  *   body:
  *   {
  *     'email': 'example@example.com',
	*     '_id': 'UID294c5417f0e49',
  *     'password': 'thisIsPassword',
	*     'profile': {
	*       'firstName': 'First',
	*       'lastName': 'Last',
	*       'company': 'VISBO GmbH',
	*       'phone': '08024-112233',
	*       'address': {
	*         'street': 'Kurt-Koch-Str.',
	*         'zip': '83607',
	*         'city': 'Holzkirchen',
	*         'state': 'Bayern',
	*         'country': 'Germany'
	*       }
	*     }
  *   }
	* @apiSuccessExample {json} Success-Response:
  * HTTP/1.1 200 OK
  * {
  *   'state':'success',
  *   'message':'Successfully logged in',
  *   'token':'eyJhbG...brDI',
  *   'user':{
  *    '_id':'UID294c5417f0e49',
  *    'updatedAt':'2018-02-28T09:38:04.774Z',
  *    'createdAt':'2018-02-28T09:38:04.774Z',
  *    'email':'example@example.com',
	*     'profile': {
	*       'firstName': 'First',
	*       'lastName': 'Last',
	*       'company': 'VISBO GmbH',
	*       'phone': '08024-112233',
	*       'address': {
	*         'street': 'Kurt-Koch-Str.',
	*         'zip': '83607',
	*         'city': 'Holzkirchen',
	*         'state': 'Bayern',
	*         'country': 'Germany'
	*       }
	*     }
  *    '__v':0
  *   }
  * }
  */

// Post Signup User
	.post(function(req, res) {
		req.auditDescription = 'Signup';

		var hash = req.query && req.query.hash;
		if (req.body.email) req.body.email = req.body.email.toLowerCase().trim();
		logger4js.info('Signup Request for e-Mail %s or id %s hash %s', req.body.email, req.body._id, hash);

		var query = {};
		if (req.body.email) {
			if (!validate.validateEmail(req.body.email, false)) {
				logger4js.warn('Signup uses not allowed UserName %s ', req.body.email);
				return res.status(400).send({
					state: 'failure',
					message: 'Signup User Name not allowed'
				});
			}
			query.email = req.body.email;
		} else if (req.body._id && validate.validateObjectId(req.body._id, false)) {
			query._id = req.body._id;
		} else {
			logger4js.warn('Signup no eMail or valid UserID %s found ', req.body._id);
			return res.status(400).send({
				state: 'failure',
				message: 'No e-Mail or User ID in body'
			});
		}
		visbouser.findOne(query, function(err, user) {
			if (err) {
				errorHandler(err, res, `DB: POST Signup ${req.body.email} Find `, 'Signup failed');
				return;
			}
			if (user) req.body.email = user.email.toLowerCase();
			// if user exists and is registered already refuse to register again
			if (user && user.status && user.status.registeredAt) {
				return res.status(409).send({
					state: 'failure',
					message: 'email already registered'
				});
			}
			// if user does not exist already refuse to register with id
			if (!user && req.body._id) {
				return res.status(409).send({
					state: 'failure',
					message: 'User ID incorrect'
				});
			}
			if (!user) user = new visbouser();
			logger4js.debug('Signup Request new User before init %s %s', user._id || '', user.email || '');
			if (req.body.profile) {
				user.profile.firstName = req.body.profile.firstName;
				user.profile.lastName = req.body.profile.lastName;
				user.profile.company = req.body.profile.company;
				user.profile.phone = req.body.profile.phone;
				if (req.body.profile.address) {
					user.profile.address.street = req.body.profile.address.street;
					user.profile.address.city = req.body.profile.address.city;
					user.profile.address.zip = req.body.profile.address.zip;
					user.profile.address.state = req.body.profile.address.state;
					user.profile.address.country = req.body.profile.address.country;
				}
			}
			if (!user.email) user.email = req.body.email;
			if (!auth.isAllowedPassword(req.body.password)) {
				logger4js.info('Signup: New password does not match password rules');
				return res.status(409).send({
					state: 'failure',
					message: 'Pasword does not match password rules'
				});
			}
			user.password = createHash(req.body.password);
			//  if a hash is available check correctness and skip confirm e-Mail or in case the hash is incorrect deliver error
			if (hash) {
				var secret = 'register'.concat(user._id, user.updatedAt.getTime());
				if (isValidHash(hash, secret)) {
					// set the registered flag as the hash confirms e-Mail Access
					logger4js.debug('set the registered flag as the hash confirms e-Mail Access');
					// update registered status
					if (!user.status) {
						user.status = {};
					}
					user.status.registeredAt = new Date();
				} else {
					logger4js.warn('incorrect hash during registration of User %s', user.email);
				}
			}
			user.save(function(err, user) {
				if (err) {
					logger4js.error('Signup Error DB Connection %s', err.message);
					return res.status(500).send({
						state: 'failure',
						message: 'database error, failed to create user',
						error: err
					});
				}
				user.password = undefined;
				// now send the eMail for confirmation of the e-Mail address
				var lang = validate.evaluateLanguage(req);

				logger4js.trace('User Registration %s RegisteredAt %s. Confirm e-mail Language %s', user.email, user.status.registeredAt, lang);
				if (!user.status.registeredAt) {
					// send e-Mail confirmation
					var template = __dirname.concat(eMailTemplates, lang, '/confirmUser.ejs');
					var uiUrl =  getSystemUrl();
					var eMailSubject = res.__('Mail.Subject.EMailConfirm');
					var secret = 'registerconfirm'.concat(user._id, user.updatedAt.getTime());
					var hash = createHash(secret);

					var registerconfirm = uiUrl.concat('/registerconfirm?id=', user._id, '&hash=', hash);

					logger4js.debug('E-Mail template %s, url %s', template, registerconfirm);
					ejs.renderFile(template, {userTo: user, url: registerconfirm}, function(err, emailHtml) {
						if (err) {
							logger4js.warn('E-Mail Rendering failed %s %s', template, err.message);
							return res.status(500).send({
								state: 'failure',
								message: 'E-Mail Rendering failed',
								error: err
							});
						}
						// logger4js.debug('E-Mail Rendering done: %s', emailHtml);
						var message = {
								// from: useremail,
								to: user.email,
								subject: eMailSubject,
								html: '<p> '.concat(emailHtml, ' </p>')
						};
						logger4js.info('Now send mail from %s to %s', message.from || 'system', message.to);
						mail.VisboSendMail(message);
						logger4js.warn('PW Reset Env %s uiUrl %s debug %s.', process.env.NODE_ENV, uiUrl, req.body.debug);
						if (process.env.NODE_ENV == 'development' && uiUrl == 'http://localhost:4200' && req.body.debug) {
							// deliver more details to do automatic testing without mail verification
							return res.status(200).send({
								state: 'success',
								message: 'Successfully signed up',
								user: user,
								debug: {
									url: registerconfirm,
									hash: hash
								}
							});
						} else {
							return res.status(200).send({
								state: 'success',
								message: 'Successfully signed up',
								user: user
							});
						}
					});
				} else {
					logger4js.info('User Registration completed with Hash %s', user.email);
					sendMail.accountRegisteredSuccess(req, res, user);
					return res.status(200).send({
						state: 'success',
						message: 'Successfully signed up',
						user: user
					});
				}
			});
		});
	});

	router.route('/user/confirm')

	/**
	  * @api {post} /token/user/confirm e-Mail Confirmation
	  * @apiVersion 1.0.0
	  * @apiGroup Authentication
	  * @apiName emailConfirm
		* @apiPermission none
		* @apiError {number} 400 no userid or hash missing
		* @apiError {number} 401 hash no longer valid for user
		* @apiError {number} 500 Internal Server Error
	  * @apiExample Example usage:
	  *   url: https://my.visbo.net/api/token/user/confirm
	  *   body:
	  *   {
	  *     '_id': 'userId5c754feaa',
	  *     'hash': 'hash5x974fdfd',
	  *   }
		* @apiSuccessExample {json} Success-Response:
	  * HTTP/1.1 200 OK
	  * {
	  *   'state':'success',
	  *   'message':'Successfully confirmed e-Mail',
	  *   'user':{
	  *    '_id':'userId5c754feaa',
	  *    'updatedAt':'2018-02-28T09:38:04.774Z',
	  *    'createdAt':'2018-02-28T09:38:04.774Z',
	  *    'email':'example@example.com',
		*     'profile': {
		*       'firstName': 'First',
		*       'lastName': 'Last',
		*       'company': 'VISBO GmbH',
		*       'phone': '08024-112233',
		*       'address': {
		*         'street': 'Kurt-Koch-Str.',
		*         'zip': '83607',
		*         'city': 'Holzkirchen',
		*         'state': 'Bayern',
		*         'country': 'Germany'
		*       }
		*     }
	  *    '__v':0
	  *   }
	  * }
	  */
	// Post User Confirm
		.post(function(req, res) {
			req.auditDescription = 'Register Confirm';

			logger4js.info('e-Mail confirmation for user %s hash %s', req.body._id, req.body.hash);
			if (!validate.validateObjectId(req.body._id, false) || !req.body.hash) {
				return res.status(400).send({
					state: 'failure',
					message: 'No valid User ID or hash in body'
				});
			}

			var query = {_id: req.body._id};
			visbouser.findOne(query, function(err, user) {
				if (err) {
					errorHandler(err, res, `DB: POST User confirm ${req.body._id} Find `, 'Error signup confirm failed');
					return;
				}
				// if user exists and is registered already refuse to register again
				if (!user || (user.status && user.status.registeredAt)) {
					if (!user) logger4js.warn('Security: invalid e-Mail confirmation for unknown userID %s', req.body._id);
					return res.status(403).send({
						state: 'failure',
						message: 'No e-mail address to confirm'
					});
				}
				// user exists and is not registered yet
				logger4js.debug('Confirm eMail for %s %s', user._id, user.email, user.createdAt.getTime());
				// verify hash
				var secret = 'registerconfirm'.concat(user._id, user.updatedAt.getTime());
				if (!isValidHash(req.body.hash, secret)) {
					logger4js.warn('Security: invalid e-Mail & hash combination', user.email);
					return res.status(403).send({
						state: 'failure',
						message: 'No e-mail address to confirm'
					});
				}

				// update registered status
				if (!user.status) {
					user.status = {};
				}
				user.status.registeredAt = new Date();
				user.save(function(err, user) {
					if (err) {
						logger4js.error('Confirm eMail  DB Connection %s', err.message);
						return res.status(500).send({
							state: 'failure',
							message: 'database error, failed to update user',
							error: err
						});
					}
					// now send the eMail for successfully signup of the e-Mail address
					sendMail.accountRegisteredSuccess(req, res, user);
					return res.status(200).send({
						state: 'success',
						message: 'Successfully confirmed eMail',
						user: user
					});
				});
			});
		});

module.exports = router;
