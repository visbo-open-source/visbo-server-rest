var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var User = mongoose.model('User');

var logModule = "USER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

//Register the authentication middleware
router.use('/profile', auth.verifyUser);

/////////////////
// Profile API
// /profile
/////////////////

// API for
//  get profile
//  update profile
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
			if (!req.body || !req.body.profile || !req.body.profile.firstname || !req.body.profile.lastname) {
				return res.status(400).send({
					state: 'failure',
					message: 'Body does not contain correct Profile data',
					error: err
				});
			}

			user.profile.firstname = req.body.profile.firstname;
			user.profile.lastname = req.body.profile.lastname;
			user.profile.address = req.body.profile.address;
			user.profile.company = req.body.profile.company;
			user.profile.phone = req.body.profile.phone;

			user.save(function(err, user) {
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


module.exports = router;
