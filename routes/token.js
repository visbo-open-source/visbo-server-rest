var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');
var jwt = require('jsonwebtoken');
var jwtSecret = require('./../secrets/jwt');

var logging = require('./../components/logging');
var logModule = "USER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var mail = require('./../components/mail');

var visbouser = mongoose.model('User');

var isValidPassword = function(user, password){
	return bCrypt.compareSync(password, user.password);
};
// Generates hash using bCrypt
var createHash = function(password){
	return bCrypt.hashSync(password, bCrypt.genSaltSync(10), null);
};

router.route('/user/login')

/**
	* @api {post} /token/user/login User Login
	* @apiVersion 0.0.1
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
			if (!user) {
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

router.route('/user/forgottenpw')

/**
	* @api {post} /token/user/forgottenpw Password Reset
	* @apiVersion 0.0.1
	* @apiGroup Authentication
	* @apiName UserForgottenPW
	* @apiExample Example usage:
	*   url: http://localhost:3484/token/user/forgottenpw
	*   body:
	*   {
	*     "email": "example@example.com",
	*   }
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
			if (!user) {
				return res.status(401).send({
					state: "failure",
					message: "email not registered"
				});
			}
		user.password = undefined;		// clear before send
		logger4js.debug("Requested Password Reset through e-Mail %s with pw", user.email);
		jwt.sign(user.toJSON(), jwtSecret.user.secret,
			{ expiresIn: jwtSecret.user.expiresIn },
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
				var message = {
						from: 'visbo@seyfried.bayern',
						to: user.email,
						subject: 'Visbo Password Reset Request',
						text: 'Password reset Token: '.concat(token, " "),
						html: '<p>Password reset Token: '.concat(token, " </p>")
				};
				//
				// //transporter.sendMail(data[, callback])
				// transporter.sendMail(message);
				mail.VisboSendMail(message);
				return res.status(200).send({
					state: "success",
					message: "Successfully Requested Password Reset through e-Mail",
					user: user
				});
			});
	});
});

router.route('/user/signup')

/**
  * @api {post} /token/user/signup User Signup
  * @apiVersion 0.0.1
  * @apiGroup Authentication
  * @apiName UserSignup
  * @apiPermission none
  * @apiError UserEsists User does already exist HTTP 401
	* @apiError ParameterMissing required parameters email, password missing HTTP 400
  * @apiError ServerIssue No DB Connection or Token Generation failed HTTP 500
  * @apiExample Example usage:
  *   url: http://localhost:3484/token/user/signup
  *   body:
  *   {
  *     "email": "example@example.com",
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
  *    "_id":"5a96787976294c5417f0e409",
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

		logger4js.info("Signup Request for e-Mail %s", req.body.email);
		visbouser.findOne({ "email": req.body.email }, function(err, user) {
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
			user.email = req.body.email;
			user.status = {registeredAt: Date()};
			logger4js.debug("Signup Request new User %O \n%O", user, user.status);
			user.password = createHash(req.body.password);
			// user._id = undefined;	// is the reset required or does it guarantee uniqueness already?
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
				return res.status(200).send({
					state: "success",
					message: "Successfully signed up",
					user: user
				});
			});
		});
	});

module.exports = router;
