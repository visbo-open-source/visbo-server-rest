var express = require('express');
var router = express.Router();
var url = require('url') ;
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');
var jwt = require('jsonwebtoken');
var jwtSecret = require('./../secrets/jwt');

var logModule = "USER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var mail = require('./../components/mail');
var ejs = require('ejs');
var read = require('fs').readFileSync;

var visbouser = mongoose.model('User');

var isValidHash = function(hash, secret){
	return bCrypt.compareSync(secret, hash);
};
var isValidPassword = function(user, password){
	return bCrypt.compareSync(password, user.password);
};
// Generates hash using bCrypt
var createHash = function(secret){
	return bCrypt.hashSync(secret, bCrypt.genSaltSync(10), null);
};

router.route('/user/login')

/**
	* @api {post} /token/user/login User Login
	* @apiVersion 1.0.0
	* @apiGroup Authentication
	* @apiName UserLogin
	* @apiPermission none
	* @apiError UserNamePasswordMismatch User not found or user &password do not match HTTP 401
	* @apiError ParameterMissing required parameters email, password missing HTTP 400
	* @apiError ServerIssue No DB Connection or Token Generation failed HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/token/user/login
	*   body:
	*   {
	*     "email": "example@example.com",
	*     "password": "thisIsPassword"
	*   }
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*   "state":"success",
	*   "message":"Successfully logged in",
	*   "token":"eyJhbG...brDI",
	*   "user":{
	*     "_id":"5a96787976294c5417f0e409",
	*     "updatedAt":"2018-02-28T09:38:04.774Z",
	*     "createdAt":"2018-02-28T09:38:04.774Z",
	*     "email":"example@example.com",
	*     "profile": {
	*       "firstname": "First",
	*       "lastname": "Last",
	*       "company": "Company inc",
	*       "phone": "0151-11223344",
	*       "address" : {
	*         "street": "Street",
	*         "city": "City",
	*         "zip": "88888",
	*         "state": "State",
	*         "country": "Country",
	*       }
	*     }
	*   }
	* }
	*/

// Post Login
	.post(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		logger4js.info("Try to Login %s", req.body.email);
		if (!req.body.email || !req.body.password){
			logger4js.debug("Authentication Missing email or password %s", req.body.email);
			return res.status(400).send({
				state: "failure",
				message: "email or password missing"
			});
		}

		visbouser.findOne({ "email" : req.body.email }, function(err, user) {
			if (err) {
				logger4js.fatal("Post Login DB Connection ", err);
				return res.status(500).send({
					state: "failure",
					message: "database error",
					error: err
				});
			}
			logger4js.debug("Try to Login DB Checked", req.body.email);
			if (!user) {
				logger4js.warn("User not Found", req.body.email);
				return res.status(400).send({
					state: "failure",
					message: "email not registered"
				});
			}
			if (!user.status || !user.status.registeredAt) {
				logger4js.warn("Login: User not Registered", req.body.email);
				return res.status(400).send({
					state: "failure",
					message: "email not registered"
				});
			}

			if (!isValidPassword(user, req.body.password)) {
				return res.status(401).send({
					state: "failure",
					message: "email or password mismatch"
				});
			}
			logger4js.debug("Try to Login %s username&password accepted", req.body.email);
			user.password = undefined;
			jwt.sign(user.toJSON(), jwtSecret.user.secret,
				{ expiresIn: jwtSecret.user.expiresIn },
				function(err, token) {
					logger4js.debug("JWT Signing %s ", err);
					if (err) {
						logger4js.error("JWT Signing error %s ", err);
						return res.status(500)({
							state: "failure",
							message: "token generation failed",
							error: err
						});
					}
					logger4js.debug("JWT Signing Success %s ", err);
					return res.status(200).send({
						state: "success",
						message: "Successfully logged in",
						token: token,
						user: user
					});
				}
			);
		});
	});

router.route('/user/pwforgotten')

/**
	* @api {post} /token/user/pwforgotten Password Reset
	* @apiVersion 1.0.0
	* @apiGroup Authentication
	* @apiName UserForgottenPW
	* @apiExample Example usage:
	*  url: http://localhost:3484/token/user/forgottenpw
	*  body: {
	*   "email": "example@example.com",
	* }
	*/

// Forgot Password
	.post(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		logger4js.info("Requested Password Reset through e-Mail %s", req.body.email);
		visbouser.findOne({ "email" : req.body.email }, function(err, user) {
			if (err) {
				logger4js.fatal("Forgot Password DB Connection ", err);
				return res.status(500).send({
					state: "failure",
					message: "database error",
					error: err
				});
			}
			// MS TODO should we return success to prevent eMail probing and count the request to prevent eMail spamming
			if (!user) {
				return res.status(200).send({
					// state: "failure",
					// message: "email not registered"
					state: "success",
					message: "Successfully Requested Password Reset through e-Mail"
				});
			}
			user.save(function(err, user) {
				if (err) {
					logger4js.error("Forgot Password Save user Error DB Connection %O", err);
					return res.status(500).send({
						state: "failure",
						message: "database error, failed to update user",
						error: err
					});
				}
				user.password = undefined;
				logger4js.debug("Requested Password Reset through e-Mail %s expires in %s token encoded %O", user.email, jwtSecret.register.expiresIn);
				// logger4js.debug("Requested Password Reset Request %O", req);
				// delete user.profile;
				// delete user.status;
				jwt.sign(user.toJSON(), jwtSecret.register.secret,
					{ expiresIn: jwtSecret.register.expiresIn },
					function(err, token) {
						if (err) {
							logger4js.fatal("forgot Password Sign Error ", err);
							return res.status(500).send({
								state: "failure",
								message: "token generation failed",
								error: err
							});
						};
						// Send e-Mail with Token to the Users
						var template = __dirname.concat('/../emailTemplates/pwreset1.ejs')
						// MS TODO do we need to generate HTTPS instead of HTTP
						var uiUrl =  'localhost:4200'
						if (process.env.UI_URL != undefined) {
						  uiUrl = process.env.UI_URL;
						}
						var pwreseturl = 'http://'.concat(uiUrl, '/pwreset', '?token=', token);
						// var url = 'http://'.concat(req.headers.host, url.parse(req.url).pathname, '?token=', token);
						logger4js.debug("E-Mail template %s, url %s", template, pwreseturl);
						ejs.renderFile(template, {user: user, url: pwreseturl}, function(err, emailHtml) {
							if (err) {
								logger4js.fatal("E-Mail Rendering failed %O", err);
								return res.status(500).send({
									state: "failure",
									message: "E-Mail Rendering failed",
									error: err
								});
							}
							// logger4js.debug("E-Mail Rendering done: %s", emailHtml);
							var message = {
									from: 'visbo@seyfried.bayern',
									to: user.email,
									subject: 'Visbo Password Reset Request',
									// text: 'Password reset Token: '.concat(token, " "),
									// html: '<b>Password reset Token:</b><br><p>Password reset Token: '.concat(token, " </p>")
									html: '<p> '.concat(emailHtml, " </p>")
									// html: ejs.renderFile(template)
							};
							mail.VisboSendMail(message);
							return res.status(200).send({
								state: "success",
								message: "Successfully Requested Password Reset through e-Mail"
							});
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
	* @apiExample Example usage:
	*  url: http://localhost:3484/token/user/pwreset
	*  body: {
	*   "token": "FhwMsAKhKABXNEXG4GTW_zXUKXcc56mhTYkj7ZyB9M0",
	*   "password": "newPassword"
	* }
	*/

	// Password Reset
	.post(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		logger4js.info("Password Reset Change through e-Mail");
		if (!req.body.token || !req.body.password) {
			return res.status(400).send({
				state: "failure",
				message: "token or password is missing"
			});
		}
		var token = req.body.token;
		// verifies secret and checks exp
    jwt.verify(token, jwtSecret.register.secret, function(err, decoded) {
      if (err) {
        return res.status(401).send({
        	state: 'failure',
        	message: 'Token is dead'
        });
      } else {
        // if everything is good, save to request for use in other routes
				logger4js.debug("Forgot PW Token Check for User %s and _id %s", decoded.email, decoded._id);
				visbouser.findOne({ "email" : decoded.email, "updatedAt": decoded.updatedAt }, function(err, user) {
					if (err) {
						logger4js.fatal("Forgot Password Change DB Connection ", err);
						return res.status(500).send({
							state: "failure",
							message: "database error",
							error: err
						});
					}
					if (!user) {
						logger4js.debug("Forgot Password user not found or different change date");
						return res.status(401).send({
							state: "failure",
							message: "invalid token"
						});
					}
					user.password = createHash(req.body.password);
					user.save(function(err, user) {
						if (err) {
							logger4js.error("Forgot Password Save user Error DB Connection %O", err);
							return res.status(500).send({
								state: "failure",
								message: "database error, failed to update user",
								error: err
							});
						}
						logger4js.debug("Forgot Password Save Successful");
						return res.status(200).send({
							state: "success",
							message: "Successfully Changed Password"
						});
					});
				});
			}
    });
	});

router.route('/user/signup')

/**
  * @api {post} /token/user/signup?hash=hash5c754feaa User Signup
  * @apiVersion 1.0.0
  * @apiGroup Authentication
  * @apiName UserSignup
  * @apiPermission none
	* @apiDescription signup a user with Profile Details and a new password.
	* Signup can be called with an e-mail address or an _id. The system refuses the registration if an _id is specified and there is no user with this _id to be registered
	* If called with an e-mail, the system returns an error if a user with this e-mail already exists and is registered.
	* The hash is optional and if delivered correct, the system does not ask for e-mail confirmation.
  * @apiError UserEsists User does already exist HTTP 401
	* @apiError ParameterMissing required parameters email, password missing HTTP 400
  * @apiError ServerIssue No DB Connection or Token Generation failed HTTP 500
  * @apiExample Example usage:
  *   url: http://localhost:3484/token/user/signup
  *   body:
  *   {
  *     "email": "example@example.com",
	*     "_id": "UID294c5417f0e409",
  *     "password": "thisIsPassword",
	*     "profile": {
	*       "firstName": "First",
	*       "lastName": "Last",
	*       "company": "Visbo GmbH",
	*       "phone": "08024-112233",
	*       "address": {
	*         "street": "Kurt-Koch-Str.",
	*         "zip": "83607",
	*         "city": "Holzkirchen",
	*         "state": "Bayern",
	*         "country": "Germany"
	*       }
	*     }
  *   }
	* @apiSuccessExample {json} Success-Response:
  * HTTP/1.1 200 OK
  * {
  *   "state":"success",
  *   "message":"Successfully logged in",
  *   "token":"eyJhbG...brDI",
  *   "user":{
  *    "_id":"UID294c5417f0e409",
  *    "updatedAt":"2018-02-28T09:38:04.774Z",
  *    "createdAt":"2018-02-28T09:38:04.774Z",
  *    "email":"example@example.com",
	*     "profile": {
	*       "firstName": "First",
	*       "lastName": "Last",
	*       "company": "Visbo GmbH",
	*       "phone": "08024-112233",
	*       "address": {
	*         "street": "Kurt-Koch-Str.",
	*         "zip": "83607",
	*         "city": "Holzkirchen",
	*         "state": "Bayern",
	*         "country": "Germany"
	*       }
	*     }
  *    "__v":0
  *   }
  * }
  */

// Post Signup User
	.post(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		var hash = (req.query && req.query.hash) ? req.query.hash : undefined;
		logger4js.info("Signup Request for e-Mail %s or id %s hash %s", req.body.email, req.body._id, hash);
		var query = {};
		if (req.body.email) {
			query.email = req.body.email;
		} else if (req.body._id) {
			query._id = req.body._id;
		} else {
			return res.status(400).send({
				state: "failure",
				message: "No e-Mail or User ID in body"
			});
		}
		visbouser.findOne(query, function(err, user) {
			if (err) {
				logger4js.fatal("user Signup DB Connection ", err);
				return res.status(500).send({
					state: "failure",
					message: "database error",
					error: err
				});
			}
			// if user exists and is registered already refuse to register again
			if (user && user.status && user.status.registeredAt) {
				return res.status(401).send({
					state: "failure",
					message: "email already registered"
				});
			}
			// if user does not exist already refuse to register with id
			if (!user && req.body._id) {
				return res.status(400).send({
					state: "failure",
					message: "User ID incorrect"
				});
			}
			if (!user) user = new visbouser();
			logger4js.debug("Signup Request new User before init %s %s", user._id || "", user.email || "");
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
			user.password = createHash(req.body.password);
			//  if a hash is available check correctness and skip confirm e-Mail or in case the hash is incorrect deliver error
			if (hash) {
				var secret = 'register'.concat(user._id, user.updatedAt.getTime());
				if (isValidHash(hash, secret)) {
					// set the registered flag as the hash confirms e-Mail Access
					logger4js.debug("set the registered flag as the hash confirms e-Mail Access");
					// update registered status
					if (!user.status) {
						user.status = {};
					}
					user.status.registeredAt = new Date();
				} else {
					logger4js.warn("incorrect hash during registration of User %s", user.email);
				}
			}
			user.save(function(err, user) {
				if (err) {
					logger4js.error("Signup Error DB Connection %O", err);
					return res.status(500).send({
						state: "failure",
						message: "database error, failed to create user",
						error: err
					});
				}
				user.password = undefined;
				// now send the eMail for confirmation of the e-Mail address
				logger4js.trace("User Registration %s RegisteredAt %s. Confirm e-mail?", user.email, user.status.registeredAt);
				if (!user.status.registeredAt) {
					// send e-Mail confirmation
					var template = __dirname.concat('/../emailTemplates/confirmUser.ejs')
					// MS TODO do we need to generate HTTPS instead of HTTP
					var uiUrl =  'localhost:4200'
					var eMailSubject = 'Please confirm your eMail address ';
					if (process.env.UI_URL != undefined) {
						uiUrl = process.env.UI_URL;
					}
					var secret = 'registerconfirm'.concat(user._id, user.updatedAt.getTime());
					var hash = createHash(secret);

					uiUrl = 'http://'.concat(uiUrl, '/registerconfirm?id=', user._id, '&hash=', hash);

					logger4js.debug("E-Mail template %s, url %s", template, uiUrl);
					ejs.renderFile(template, {userTo: user, url: uiUrl}, function(err, emailHtml) {
						if (err) {
							logger4js.fatal("E-Mail Rendering failed %s %O", template, err);
							return res.status(500).send({
								state: "failure",
								message: "E-Mail Rendering failed",
								error: err
							});
						}
						// logger4js.debug("E-Mail Rendering done: %s", emailHtml);
						var message = {
								// from: useremail,
								to: user.email,
								subject: eMailSubject,
								html: '<p> '.concat(emailHtml, " </p>")
						};
						logger4js.info("Now send mail from %s to %s", message.from || 'system', message.to);
						mail.VisboSendMail(message);
						return res.status(200).send({
							state: "success",
							message: "Successfully signed up",
							user: user
						});
					});
				} else {
					logger4js.info("User Registration completed with Hash %s", user.email);
					return res.status(200).send({
						state: "success",
						message: "Successfully signed up",
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
	  * @apiName UserConfirm
	  * @apiPermission none
		* @apiError ParameterMissing required parameters userId & hash missing HTTP 400
	  * @apiError ServerIssue No DB Connection HTTP 500
	  * @apiExample Example usage:
	  *   url: http://localhost:3484/token/user/confirm
	  *   body:
	  *   {
	  *     "_id": "userId5c754feaa",
	  *     "hash": "hash5x974fdfd",
	  *   }
		* @apiSuccessExample {json} Success-Response:
	  * HTTP/1.1 200 OK
	  * {
	  *   "state":"success",
	  *   "message":"Successfully confirmed e-Mail",
	  *   "user":{
	  *    "_id":"userId5c754feaa",
	  *    "updatedAt":"2018-02-28T09:38:04.774Z",
	  *    "createdAt":"2018-02-28T09:38:04.774Z",
	  *    "email":"example@example.com",
		*     "profile": {
		*       "firstName": "First",
		*       "lastName": "Last",
		*       "company": "Visbo GmbH",
		*       "phone": "08024-112233",
		*       "address": {
		*         "street": "Kurt-Koch-Str.",
		*         "zip": "83607",
		*         "city": "Holzkirchen",
		*         "state": "Bayern",
		*         "country": "Germany"
		*       }
		*     }
	  *    "__v":0
	  *   }
	  * }
	  */
	// Post User Confirm
		.post(function(req, res) {
			logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

			logger4js.info("e-Mail confirmation for user %s hash %s", req.body._id, req.body.hash);
			if (!req.body._id || !req.body.hash) {
				return res.status(400).send({
					state: "failure",
					message: "No User ID or hash in body"
				});
			}

			var query = {_id: req.body._id};
			visbouser.findOne(query, function(err, user) {
				if (err) {
					logger4js.fatal("e-Mail confirmation DB Connection ", err);
					return res.status(500).send({
						state: "failure",
						message: "database error",
						error: err
					});
				}
				// if user exists and is registered already refuse to register again
				if (!user || (user.status && user.status.registeredAt)) {
					if (!user) logger4js.warn("Security: invalid e-Mail confirmation for unknown userID %s", req.body._id);
					return res.status(401).send({
						state: "failure",
						message: "No e-mail address to confirm"
					});
				}
				// user exists and is not registered yet
				logger4js.debug("Confirm eMail for %s %s", user._id, user.email, user.createdAt.getTime());
				// verify hash
				var secret = 'registerconfirm'.concat(user._id, user.updatedAt.getTime());
				if (!isValidHash(req.body.hash, secret)) {
					logger4js.warn("Security: invalid e-Mail & hash combination", user.email);
					return res.status(401).send({
						state: "failure",
						message: "No e-mail address to confirm"
					});
				}

				// update registered status
				if (!user.status) {
					user.status = {};
				}
				user.status.registeredAt = new Date();
				user.save(function(err, user) {
					if (err) {
						logger4js.error("Confirm eMail  DB Connection %O", err);
						return res.status(500).send({
							state: "failure",
							message: "database error, failed to update user",
							error: err
						});
					}
					// now send the eMail for confirmation of the e-Mail address
					var template = __dirname.concat('/../emailTemplates/confirmResultUser.ejs')
					// MS TODO do we need to generate HTTPS instead of HTTP
					var uiUrl =  'localhost:4200'
					var eMailSubject = 'Successful eMail confirmation';
					if (process.env.UI_URL != undefined) {
						uiUrl = process.env.UI_URL;
					}

					uiUrl = 'http://'.concat(uiUrl, '/login?email=', user.email);

					logger4js.debug("E-Mail template %s, url %s", template, uiUrl);
					ejs.renderFile(template, {userTo: user, url: uiUrl}, function(err, emailHtml) {
						if (err) {
							logger4js.fatal("E-Mail Rendering failed %s %O", template, err);
							return res.status(500).send({
								state: "failure",
								message: "E-Mail Rendering failed",
								error: err
							});
						}
						var message = {
								// from: useremail,
								to: user.email,
								subject: eMailSubject,
								html: '<p> '.concat(emailHtml, " </p>")
						};
						logger4js.info("Now send mail from %s to %s", message.from || 'system', message.to);
						mail.VisboSendMail(message);
						return res.status(200).send({
							state: "success",
							message: "Successfully confirmed eMail",
							user: user
						});
					});
				});
			});
		});

module.exports = router;
