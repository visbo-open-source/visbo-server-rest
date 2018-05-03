var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');
var jwt = require('jsonwebtoken');
var jwtSecret = require('./../secrets/jwt');
var logging = require('./../components/logging');

// var nodemailer = require('nodemailer');
var moment = require('moment');
var mail = require('./../components/mail');

var visbouser = mongoose.model('User');

var isValidPassword = function(user, password){
	return bCrypt.compareSync(password, user.password);
};
// Generates hash using bCrypt
var createHash = function(password){
	return bCrypt.hashSync(password, bCrypt.genSaltSync(10), null);
};
var debuglevel = 5;

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
 * @apiParam {String} email Users email.
 * @apiParam {String} password Users password.
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
router.route('/user/login')
	.post(function(req, res) {
		debuglog(debuglevel, 8, "Try to Login %s", req.body.email);
		if (!req.body.email || !req.body.password){
			return res.status(400).send({
				state: "failure",
				message: "email or password missing"
			});
		}

		visbouser.findOne({ "email" : req.body.email }, function(err, user) {
			if (err) {
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
			debuglog(debuglevel, 8, "Try to Login %s username&password accepted", req.body.email);
			user.password = undefined;
			jwt.sign(user, jwtSecret.user.secret,
				{ expiresIn: jwtSecret.user.expiresIn },
				function(err, token) {
					if (err) {
						return res.status(500)({
							state: "failure",
							message: "token generation failed",
							error: err
						});
					}
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
// Forgot Password
/* *
 * @api {post} /token/user/forgottenpw user request password reset
 * @apiVersion 0.0.1
 * @apiGroup Authentication
 * @apiName UserForgottenPW
 * @apiExample Example usage:
 *   url: http://localhost:3484/token/user/forgottenpw
 *   body:
 *   {
 *     "email": "example@example.com",
 *   }
 * @apiParam {String} email Users email.
 */
router.route('/user/forgottenpw')
	.post(function(req, res) {
		debuglog(debuglevel, 8, "Requested Password Reset through e-Mail %s", req.body.email);
		visbouser.findOne({ "email" : req.body.email }, function(err, user) {
			if (err) {
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
		user.password = undefined;		// MS Todo: clear before send wrong place
		debuglog(debuglevel, 8, "Requested Password Reset through e-Mail %s with pw", user.email);
		jwt.sign(user, jwtSecret.user.secret,
			{ expiresIn: jwtSecret.user.expiresIn },
			function(err, token) {
				if (err) {
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
	* @apiParam {String} email Users email.
  * @apiParam {String} password Users password.
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
router.route('/user/signup')
	.post(function(req, res) {
		debuglog(debuglevel, 8, "Signup Request for e-Mail %s", req.body.email);
		visbouser.findOne({ "email": req.body.email }, function(err, user) {
			if (err) {
				return res.status(500).send({
					state: "failure",
					message: "database error",
					error: err
				});
			}
			if (user) {
				return res.status(401).send({
					state: "failure",
					message: "email already registered"
				});
			}
			var newUser = new visbouser();
			debuglog(debuglevel, 8, "Signup Request newUser before init %O", newUser);
			if (req.body.profile) {
				newUser.profile.firstName = req.body.profile.firstName;
				newUser.profile.lastName = req.body.profile.lastName;
				newUser.profile.company = req.body.profile.company;
				newUser.profile.phone = req.body.profile.phone;
				if (req.body.profile.address) {
					newUser.profile.address.street = req.body.profile.address.street;
					newUser.profile.address.city = req.body.profile.address.city;
					newUser.profile.address.zip = req.body.profile.address.zip;
					newUser.profile.address.state = req.body.profile.address.state;
					newUser.profile.address.country = req.body.profile.address.country;
				}
			}
			newUser.email = req.body.email;
			debuglog(debuglevel, 8, "Signup Request newUser %O", newUser);
			newUser.password = createHash(req.body.password);
			newUser._id = undefined;	// is the reset required or does it guarantee uniqueness already?
			newUser.save(function(err, user) {
				if (err) {
					debuglog(debuglevel, 8, "Signup Error %O", err);
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
