var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');

// var assert = require('assert');
var auth = require('./../components/auth');
var User = mongoose.model('User');

var logModule = "USER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// Generates hash using bCrypt
var createHash = function(secret){
	return bCrypt.hashSync(secret, bCrypt.genSaltSync(10), null);
};
var isValidPassword = function(user, password){
	return bCrypt.compareSync(password, user.password);
};

//Register the authentication middleware
router.use('/', auth.verifyUser);

/////////////////
// Profile API
// /profile
/////////////////

router.route('/profile')
/**
	* @api {get} /user/profile Get own profile
	* @apiVersion 1.0.0
	* @apiHeader {String} access-key User authentication token.
	* @apiGroup UserProfile
	* @apiName GetUserProfile
	* @apiPermission user must be authenticated
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiError ServerIssue No DB Connection HTTP 500
	* @apiExample Example usage:
	*   url: http://localhost:3484/user/profile
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"User profile",
	*  "user":{
	*    "_id":"5a96787976294c5417f0e409",
	*    "updatedAt":"2018-03-20T10:31:27.216Z",
	*    "createdAt":"2018-02-28T09:38:04.774Z",
	*    "email":"markus.seyfried@visbo.de",
	*    "__v":0,
	*    "profile": {
	*      "firstname": "First",
	*      "lastname": "Last",
	*      "company": "Company inc",
	*      "phone": "0151-11223344",
	*      "address" : {
	*        "street": "Street",
	*        "city": "City",
	*        "zip": "88888",
	*        "state": "State",
	*        "country": "Country",
	*      }
	*    }
	*  }
	*}
	*/
// get profile
	.get(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		logger4js.info("Get Profile ");
		User.findById(req.decoded._id, function(err, user) {
			if (err) {
				logger4js.fatal("User Get Profile DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting user',
					error: err
				});
			}
			user.password = undefined;
			return res.status(200).send({
				state: 'success',
				message: 'Returned user data',
				user: user
			});
		});
	})

/**
	* @api {put} /user/profile Update own profile
	* @apiVersion 1.0.0
	* @apiHeader {String} access-key User authentication token.
	* @apiGroup UserProfile
	* @apiName UpdateUserProfile
	* @apiExample Example usage:
	*   url: http://localhost:3484/user/profile
	*   body:
	*   {
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
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  "state":"success",
	* "message":"Updated user profile",
	* "user":{
	*    "_id":"5a96787976294c5417f0e409",
	*    "updatedAt":"2018-03-20T10:31:27.216Z",
	*    "createdAt":"2018-02-28T09:38:04.774Z",
	*    "email":"markus.seyfried@visbo.de",
	*    "profile": {
	*      "firstname": "First",
	*      "lastname": "Last",
	*      "company": "Company inc",
	*      "phone": "0151-11223344",
	*      "address" : {
	*        "street": "Street",
	*        "city": "City",
	*        "zip": "88888",
	*        "state": "State",
	*        "country": "Country",
	*      }
	*    }
	*  }
	* }
	*/
// Update profile
	.put(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		logger4js.info("Put/Update user %s", req.decoded._id);
		User.findById(req.decoded._id, function(err, user) {
			if (err) {
				logger4js.fatal("User update Profile DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting user',
					error: err
				});
			}
			if (!req.body.profile || !req.body.profile.firstName || !req.body.profile.lastName ) {
				logger4js.debug("Put/Update user %s body %O", req.decoded._id, req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'Body does not contain correct Profile data'
				});
			}

			logger4js.debug("Put/Update Properties %O", req.body.profile);
			if (req.body.profile.firstName != undefined) user.profile.firstName = req.body.profile.firstName;
			if (req.body.profile.lastName != undefined) user.profile.lastName = req.body.profile.lastName;
			if (req.body.profile.company != undefined) user.profile.company = req.body.profile.company;
			if (req.body.profile.phone != undefined) user.profile.phone = req.body.profile.phone;
			if (req.body.profile.address) {
				if (req.body.profile.address.street != undefined) user.profile.address.street = req.body.profile.address.street;
				if (req.body.profile.address.city != undefined) user.profile.address.city = req.body.profile.address.city;
				if (req.body.profile.address.zip != undefined) user.profile.address.zip = req.body.profile.address.zip;
				if (req.body.profile.address.state != undefined) user.profile.address.state = req.body.profile.address.state;
				if (req.body.profile.address.country != undefined) user.profile.address.country = req.body.profile.address.country;
			}
			logger4js.debug("Put/Update after updating properties %O", user.profile);

			user.save(function(err, user) {
				logger4js.debug("Put/Update after Save");
				if (err) {
					logger4js.fatal("User update Profile to DB Connection ", err);
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating user',
						error: err
					});
				}
				user.password = undefined;
				return res.status(200).send({
					state: 'success',
					message: 'Updated user profile',
					user: user
				});
			});
		});
	});

router.route('/passwordchange')

/**
	* @api {put} /user/passwordchange Update password
	* @apiVersion 1.0.0
	* @apiHeader {String} access-key User authentication token.
	* @apiGroup UserProfile
	* @apiName PasswordChange
	* @apiExample Example usage:
	*  url: http://localhost:3484/user/passwordchange
	*  body:
	*  {
	*    "password": "new password",
  *    "passwordold": "old password"
	*  }
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"You changed your password successfully"
	* }
	*/
// Change Password
	.put(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.

		logger4js.info("Put/Update user password %s", req.decoded._id);
		User.findById(req.decoded._id, function(err, user) {
			if (err) {
				logger4js.fatal("User update Password DB Connection ", err);
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting user',
					error: err
				});
			}
			if (!req.body.password || !req.body.oldpassword ) {
				logger4js.debug("Put/Update user %s body incomplete", req.decoded._id);
				return res.status(400).send({
					state: 'failure',
					message: 'Body does not contain correct required fields'
				});
			}

			logger4js.debug("Put/Update Password Check Old Password");
			if (!isValidPassword(user, req.body.oldpassword)) {
				logger4js.info("Change Password: Wrong password", user.email);
				return res.status(401).send({
					state: "failure",
					message: "password mismatch"
				});
			} else {
				logger4js.debug("Try to Change Password %s username&password accepted", user.email);
				user.password = createHash(req.body.password);
				if (!user.status) user.status = {};
				user.status.loginRetries = 0;
				user.save(function(err, user) {
					if (err) {
						logger4js.error("Change Password Update DB Connection %O", err);
						return res.status(500).send({
							state: "failure",
							message: "database error, failed to update user",
							error: err
						});
					}
					return res.status(200).send({
						state: "success",
						message: "You changed your password successfully"
					});
				});
			}
		});
	})

module.exports = router;
