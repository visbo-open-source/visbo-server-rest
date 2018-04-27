var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var logging = require('./../components/logging');
var User = mongoose.model('User');

//Register the authentication middleware
router.use('/profile', auth.verifyUser);

var debuglevel = 5;

/////////////////
// Profile API
// /profile
/////////////////

// API for
//  get profile
//  update profile
router.route('/profile')
	// get profile
	/**
	 * @api {get} /user/profile Get own profile
	 * @apiHeader {String} access-key User authentication token.
	 * @apiVersion 0.0.1
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
 	 * "message":"Updated user profile",
 	 * "user":{
	 *    "_id":"5a96787976294c5417f0e409",
	 *    "updatedAt":"2018-03-20T10:31:27.216Z",
	 *    "createdAt":"2018-02-28T09:38:04.774Z",
	 *    "email":"markus.seyfried@visbo.de",
	 *    "__v":0,
	 *    "profile": {
 	* 			"firstname": "First",
 	* 			"lastname": "Last",
 	* 			"company": "Company inc",
 	* 			"phone": "0151-11223344",
   * 			"address" : {
 	* 				"street": "Street",
 	* 				"city": "City",
 	* 				"zip": "88888",
 	* 				"state": "State",
 	* 				"country": "Country",
 	* 			}
 	* 	 }
	 *  }
	 * }
 */
	.get(function(req, res) {
		debuglog(debuglevel, 1, "Get Profile ");		// MS Log
		User.findById(req.decoded._id, function(err, user) {
			if (err) {
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

	// Update profile
	/**
	 * @api {put} /user/profile Update own profile
	 * @apiHeader {String} access-key User authentication token.
	 * @apiVersion 0.0.1
	 * @apiGroup UserProfile
	 * @apiName UpdateUserProfile
	 * @apiExample Example usage:
	 *   url: http://localhost:3484/user/profile
	 *   body:
	 *   {
	 *     "name":"First Last-Name",
	 *     "profile" : {
	 *      "address" : "Kurt Koch Str. 4a, 83607 Holzkirchen",
	 *      "company": "Visbo GmbH",
	 *      "phone": "0151-11111111"
	 *     }
	 *   }
	 * @apiParam {String} name User's name.
	 * @apiParam {Object} profile Profile object.
	 * @apiParam {String} profile.address Address.
	 * @apiParam {String} profile.company Company.
	 * @apiParam {String} profile.phone Phone number.
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
	 *    "name":"First Last-Name",
	 *    "__v":0,
	 *    "profile":{
	 *      "address":"Kurt Koch Str. 4a, 83607 Holzkirchen",
	 *      "company":"Visbo GmbH",
	 *      "phone":"0151-11111111"
	 *    }
	 *  }
	 * }
	 */
	.put(function(req, res) {
		User.findById(req.decoded._id, function(err, user) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting user',
					error: err
				});
			}

			user.name = req.body.name;
			user.profile.address = req.body.profile.address;
			user.profile.company = req.body.profile.company;
			user.profile.phone = req.body.profile.phone;

			user.save(function(err, user) {
				if (err) {
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
