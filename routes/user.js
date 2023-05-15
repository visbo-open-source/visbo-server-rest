var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');
var jwt = require('jsonwebtoken');
var jwtSecret = require('./../secrets/jwt');

// var assert = require('assert');
var auth = require('./../components/auth');
var User = mongoose.model('User');
var errorHandler = require('./../components/errorhandler').handler;
var getSystemUrl = require('./../components/systemVC').getSystemUrl;
var verifyManager = require('./../components/verifyVp').verifyManager;
var createTimeEntry = require('./../components/timeTracker').createTimeEntry;
var updateTimeEntry = require('./../components/timeTracker').updateTimeEntry;
var updateMany = require('./../components/timeTracker').updateMany;
var deleteTimeEntry = require('./../components/timeTracker').deleteTimeEntry;
var getTimeEntry = require('./../components/timeTracker').getTimeEntry;
var getSettings = require('./../components/timeTracker').getSettings;
var filterSubRoles = require('./../components/timeTracker').filterSubRoles;
var findSubRolesTimeTracker = require('./../components/timeTracker').findSubRolesTimeTracker;

var mail = require('../components/mail');
var eMailTemplates = '/../emailTemplates/';
var ejs = require('ejs');
var useragent = require('useragent');
var validate = require('./../components/validate');

var logModule = 'USER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var visboRedis = require('./../components/visboRedis');

// Generates hash using bCrypt
var createHash = function (secret) {
	return bCrypt.hashSync(secret, bCrypt.genSaltSync(10), null);
};
var isValidPassword = function (user, password) {
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
		* @apiGroup User Profile
		* @apiName GetUserProfile
		* @apiPermission Authenticated
		* @apiError {number} 401 user not authenticated
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/user/profile
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'User profile',
		*  'user':{
		*    '_id':'us5c754feac',
		*    'updatedAt':'2018-03-20T10:31:27.216Z',
		*    'createdAt':'2018-02-28T09:38:04.774Z',
		*    'email':'first.last@visbo.de',
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
	// get profile
	.get(function (req, res) {
		req.auditDescription = 'User Profile Read';
		req.auditTTLMode = 1;

		User.findById(req.decoded._id, function (err, user) {
			if (err) {
				errorHandler(err, res, `DB: GET Profile ${req.decoded._id} Find `, 'Error get profile failed');
				return;
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
		* @apiGroup User Profile
		* @apiName UpdateUserProfile
		* @apiPermission Authenticated
		* @apiError {number} 400 required fields for profile missing
		* @apiError {number} 401 user not authenticated
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*   url: https://my.visbo.net/api/user/profile
		*   body:
		*   {
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
		*     }
		*   }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		* 'message':'Updated user profile',
		* 'user':{
		*    '_id':'UID294c5417f0e49',
		*    'updatedAt':'2018-03-20T10:31:27.216Z',
		*    'createdAt':'2018-02-28T09:38:04.774Z',
		*    'email':'markus.seyfried@visbo.de',
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
		* }
		*/
	// Update profile
	.put(function (req, res) {
		req.auditDescription = 'User Profile Update';

		logger4js.info('Put/Update user %s', req.decoded._id);
		User.findById(req.decoded._id, function (err, user) {
			if (err) {
				errorHandler(err, res, `DB: PUT Profile ${req.decoded._id} Find `, 'Error update profile failed');
				return;
			}
			if (!req.body.profile || !req.body.profile.firstName || !req.body.profile.lastName) {
				logger4js.debug('Put/Update user %s body %O', req.decoded._id, req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'Body does not contain correct Profile data'
				});
			}

			logger4js.debug('Put/Update Properties %O', req.body.profile);
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
			logger4js.debug('Put/Update after updating properties %O', user.profile);

			user.save(function (err, user) {
				logger4js.debug('Put/Update after Save');
				if (err) {
					errorHandler(err, res, `DB: PUT Profile ${req.decoded._id} Save `, 'Error update profile failed');
					return;
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
		* @apiGroup User Profile
		* @apiName PasswordChange
		* @apiPermission Authenticated
		* @apiError {number} 400 old or new password missing
		* @apiError {number} 409 password mismatch
		* @apiError {number} 401 user not authenticated
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/user/passwordchange
		*  body:
		*  {
		*    'password': 'new password',
	  *    'passwordold': 'old password'
		*  }
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'You changed your password successfully'
		* }
		*/
	// Change Password
	.put(function (req, res) {
		req.auditDescription = 'User Password Change';

		logger4js.info('Put/Update user password %s', req.decoded._id);
		User.findById(req.decoded._id, function (err, user) {
			if (err) {
				errorHandler(err, res, `DB: PUT Change Password ${req.decoded._id} Find `, 'Error change password failed');
				return;
			}
			if (!req.body.password || !req.body.oldpassword) {
				logger4js.debug('Put/Update user %s body incomplete %O', req.decoded._id, req.body);
				return res.status(400).send({
					state: 'failure',
					message: 'Body does not contain correct required fields'
				});
			}

			logger4js.debug('Put/Update Password Check Old Password');
			if (!isValidPassword(user, req.body.oldpassword)) {
				logger4js.info('Change Password: Wrong password', user.email);
				return res.status(409).send({
					state: 'failure',
					message: 'password mismatch'
				});
			} else {
				if (!auth.isAllowedPassword(req.body.password)) {
					logger4js.info('Password Change: new passowrd does not match password rules');
					return res.status(409).send({
						state: 'failure',
						message: 'Password does not match password rules'
					});
				}
				logger4js.debug('Try to Change Password %s username&password accepted', user.email);
				user.password = createHash(req.body.password);
				if (!user.status) user.status = {};
				user.status.loginRetries = 0;
				user.status.expiresAt = undefined;
				user.save(function (err, user) {
					if (err) {
						errorHandler(err, res, `DB: PUT Profile ${req.decoded._id} Save `, 'Error chaneg password failed');
						return;
					}
					user.password = undefined;
					// now send an e-Mail to the user for pw change
					var lang = validate.evaluateLanguage(req);
					var template = __dirname.concat(eMailTemplates, lang, '/passwordChanged.ejs');
					var uiUrl = getSystemUrl();
					uiUrl = uiUrl.concat('/pwforgotten/');
					var eMailSubject = res.__('Mail.Subject.PWChange');
					var info = {};
					logger4js.debug('E-Mail template %s, url %s', template, uiUrl);
					info.changedAt = new Date();
					info.ip = req.headers['x-real-ip'] || req.ip;
					// Check User userAgent
					// var agent = useragent.parse(req.headers['user-agent']);
					// logger4js.info('User Agent Browser %s ', agent.toAgent());
					// logger4js.info('User Agent String %s ', agent.toString());
					// logger4js.info('User Agent OS %s ', agent.os.toString());
					// logger4js.info('User Agent JSON %s', JSON.stringify(agent));
					// logger4js.info('Get Profile ');
					info.userAgent = useragent.parse(req.get('User-Agent')).toString();
					logger4js.debug('E-Mail template %s, url %s', template, uiUrl);
					ejs.renderFile(template, { userTo: user, url: uiUrl, info }, function (err, emailHtml) {
						if (err) {
							logger4js.warn('E-Mail Rendering failed %s', err.message);
							return res.status(500).send({
								state: 'failure',
								message: 'E-Mail Rendering failed',
								error: err
							});
						}
						var message = {
							to: user.email,
							subject: eMailSubject,
							html: '<p> '.concat(emailHtml, ' </p>')
						};
						logger4js.info('Now send mail from %s to %s', message.from || 'System', message.to);
						mail.VisboSendMail(message);
						return res.status(200).send({
							state: 'success',
							message: 'You changed your password successfully',
							user: user
						});
					});

				});
			}
		});
	});

router.route('/logout')
	/**
		* @api {post} /user/logout User Logout
		* @apiVersion 1.0.0
		* @apiHeader {String} access-key User authentication token.
		* @apiGroup Authentication
		* @apiName Logout
		* @apiError {number} 401 user not authenticated
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/user/logout
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'You have successfully logged out'
		* }
		*/
	// Logout
	.post(function (req, res) {
		req.auditDescription = 'Logout';

		logger4js.info('Post Logout %s', req.decoded._id);
		// add token to Redis
		var redisClient = visboRedis.VisboRedisInit();
		var token = req.headers['access-key'].split('.')[2];
		redisClient.set('token.' + token, req.decoded._id, 'EX', 3600);
		return res.status(200).send({
			state: 'success',
			message: 'You have successfully logged out'
		});
	});

router.route('/ott')
	/**
		* @api {post} /user/ott Generate a One Time Token
		* @apiVersion 1.0.0
		* @apiHeader {String} access-key User authentication token.
		* @apiGroup Authentication
		* @apiName Generate One Time Token
		* @apiError {number} 401 user not authenticated
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/user/ott
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'One Time Token successfully generated'
		* }
		*/
	.get(function (req, res) {
		req.auditDescription = 'Generate One Time Token';
		req.auditTTLMode = 1;

		logger4js.info('Generate One Time Token %s', req.decoded._id);
		var userReduced = {};
		userReduced._id = req.decoded._id;
		userReduced.email = req.decoded.email;
		userReduced.session = {};
		userReduced.session.ip = req.headers['x-real-ip'] || req.ip;
		var timestamp = new Date();
		var expiresIn = 120;
		userReduced.session.timestamp = timestamp;

		logger4js.trace('User Reduced User: %O', JSON.stringify(userReduced));
		jwt.sign(userReduced, jwtSecret.user.secret,
			{ expiresIn: expiresIn },
			function (err, ott) {
				if (err) {
					logger4js.error('JWT Signing Error %s ', err.message);
					return res.status(500)({
						state: 'failure',
						message: 'token generation failed',
						error: err
					});
				}
				logger4js.trace('JWT Signing Success ');
				// add token to Redis
				var redisClient = visboRedis.VisboRedisInit();
				var ottID = ott.split('.')[2];
				redisClient.set('ott.' + ottID, req.decoded._id, 'EX', expiresIn);
				return res.status(200).send({
					state: 'success',
					message: 'One Time Token successfully generated',
					ott: ott
				});
			}
		);
	});

router.route('/timetracker')
	/**
			* @api {post} /user/timetracker Create a time entry
			* @apiVersion 1.0.0
			* @apiHeader {String} access-key User authentication token.
			* @apiGroup Authentication
			* @apiName Create time tracker data
			* @apiError {number} 401 user not authenticated
			* @apiError {number} 500 Internal Server Error
			* @apiExample Example usage:
			*  url: https://my.visbo.net/api/user/timetracker
			* @apiSuccessExample {json} Success-Response:
			* HTTP/1.1 201 Created
			* {
			*  'state':'success',
			*  'message':'Time tracker data successfully saved',
			* }
			*/
	.post(async function (req, res) {
		req.auditDescription = 'Time tracker Create';
		req.auditTTLMode = 1;
		try {
			logger4js.info('Post Time entry %s', req.decoded._id);
			const newEntry = await createTimeEntry(req.decoded._id, req.body);
			if (newEntry) {
				return res.status(201).send({
					'state': 'success',
					'message': 'Time tracker data successfully saved',
					'timeEntry': newEntry
				});
			}
			logger4js.error('Error in creating time entry');
			return res.status(500).send({
				state: 'error',
				message: 'Error in creating time entry'
			});
		} catch (error) {
			logger4js.error('Error in create time entry: %O', error);
			return res.status(500).send({
				state: 'error',
				message: error
			});
		}
	})
	/**
		* @api {patch} /user/timetracker Update specific time entry
		* @apiVersion 1.0.0
		* @apiHeader {String} access-key User authentication token.
		* @apiGroup Authentication
		* @apiName Update time tracker data
		* @apiError {number} 401 user not authenticated
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/user/timetracker
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'Time tracker data successfully updated',
		* }
		*/
	.patch(async function (req, res) {
		req.auditDescription = 'Time tracker Update many';
		req.auditTTLMode = 1;
		try {
			logger4js.info('Update time entry %s', req.decoded._id);
			const newValues = await updateMany(req.body);
			if (newValues) {
				return res.status(200).send({
					'state': 'success',
					'message': 'Time tracker data successfully updated',
					'timeEntry': newValues
				});
			}
			logger4js.error('Error in updating time entry with id %s', req.params.id);
			return res.status(500).send({
				state: 'error',
				message: 'Error in updating time entry'
			});
		} catch (error) {
			logger4js.error('Error in update time entry: %O', error);
			return res.status(500).send({
				state: 'error',
				message: error
			});
		}
	});

router.route('/timetracker/:id')
	/**
		* @api {get} /user/timetracker/5a1f1b0b1c9d440000e1b1b1 Get time tracker data by employee id
		* @apiVersion 1.0.0
		* @apiHeader {String} access-key User authentication token.
		* @apiGroup Authentication
		* @apiName Get time tracker data
		* @apiError {number} 401 user not authenticated
		* @apiError {number} 303 Not Found
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/user/timetracker/5a1f1b0b1c9d440000e1b1b1
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'Time tracker data retrived successfully',
		*  'timeTracker': [
			{
				'_id': '5a1f1b0b1c9d440000e1b1b1',
				'userId': '5a1f1b0b1c9d440000e1b1b1',
				'vpid': 'John Doe',
				'vpvid': 'johndoe@email.com',
				'vcid': 'John Doe',
				'roleId': '5a1f1b0b1c9d440000e1b1b1',
				'date': '2017-11-30T00:00:00.000Z',
				'time': 5.5,
				'notes': 'John Doe',
				'approvalDate': '2017-11-30T00:00:00.000Z',
				'approvalId': '5a1f1b0b1c9d440000e1b1b1',
				'status': 'Not Started',
				'aggreUID': '5a1f1b0b1c9d440000e1b1b1',
				'aggreDate': '2017-11-30T00:00:00.000Z',
			}...
		]
		* }
		*/
	.get(async function (req, res) {
		req.auditDescription = 'Time tracker Read';
		req.auditTTLMode = 1;
		try {
			logger4js.info('Get time tracker by user with id %s', req.decoded._id);
			var settings = await getSettings(req.decoded.email);
			if (settings.length > 0) {
				const managerView = [];
				for (let setting of settings) {
					var filteredList = await filterSubRoles(setting.value.allRoles, req.decoded.email, setting.vcid);
					var subRoles = await findSubRolesTimeTracker(filteredList);
					console.log(JSON.stringify(subRoles));
					managerView.push(subRoles);
				}
				// settings.forEach(async (item) => {
				// 	var filteredList = await filterSubRoles(item.value.allRoles, req.decoded.email, item.vcid);
				// 	var subRoles = await findSubRolesTimeTracker(filteredList);
				// 	console.log(JSON.stringify(subRoles));
				// 	managerView.push(subRoles);
				// });
				var userView = await getTimeEntry(req.params.id);
				return res.status(200).send({
					state: 'success',
					message: 'Time tracker data retrieved for manager',
					managerView: managerView ? managerView.flat() : [],
					timeEntries: userView
				});
			} else {
				var timeEntries = await getTimeEntry(req.params.id);
				if (timeEntries) {
					return res.status(200).send({
						state: 'success',
						message: 'Time tracker data retrived for user',
						timeEntries: timeEntries
					});
				}
				logger4js.error('Time tracker data not found with id %s', req.params.id);
				return res.status(404).send({
					state: 'error',
					message: 'Time tracker data not found'
				});
			}
		} catch (error) {
			logger4js.error('Error in get time entry: %O', error);
			return res.status(500).send({
				state: 'error',
				message: error
			});
		}
	})
	/**
		* @api {delete} /user/timetracker/5a1f1b0b1c9d440000e1b1b1 Delete specific time entry
		* @apiVersion 1.0.0
		* @apiHeader {String} access-key User authentication token.
		* @apiGroup Authentication
		* @apiName Delete time tracker data
		* @apiError {number} 401 user not authenticated
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/user/timetracker/5a1f1b0b1c9d440000e1b1b1
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'Time tracker data successfully deleted'
		* }
		*/
	.delete(async function (req, res) {
		req.auditDescription = 'Time tracker Delete';
		req.auditTTLMode = 1;
		try {
			logger4js.info('Delete time entry %s', req.decoded._id);

			const deletedEntry = await deleteTimeEntry(req.params.id);
			if (deletedEntry) {
				return res.status(200).send({
					state: 'success',
					message: 'Time tracker data successfully deleted'
				});
			}
			logger4js.error('Time entry not found with id %s', req.params.id);
			return res.status(404).send({
				state: 'error',
				message: 'Time entry not found'
			});
		} catch (error) {
			log4js.error('Error in delete time entry: %O', error);
			return res.status(500).send({
				state: 'error',
				message: error
			});
		}
	})
	/**
		* @api {patch} /user/timetracker/5a1f1b0b1c9d440000e1b1b1 Update specific time entry
		* @apiVersion 1.0.0
		* @apiHeader {String} access-key User authentication token.
		* @apiGroup Authentication
		* @apiName Update time tracker data
		* @apiError {number} 401 user not authenticated
		* @apiError {number} 500 Internal Server Error
		* @apiExample Example usage:
		*  url: https://my.visbo.net/api/user/timetracker/5a1f1b0b1c9d440000e1b1b1
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'Time tracker data successfully updated',
		* }
		*/
	.patch(async function (req, res) {
		req.auditDescription = 'Time tracker Update';
		req.auditTTLMode = 1;
		try {
			if (req.body.status === 'Approved' || req.body.status === 'inQuestion') {
				var entry = await findEntry(req.params.id);
				var canUpdate = await verifyManager(entry.vpid, req.decoded._id);
				if (!canUpdate) {
					logger4js.error('Error in updating time entry with id %s', req.params.id);
					return res.status(403).send({
						'state': 'error',
						'message': 'Only manager of the project could update status'
					});
				} else {
					logger4js.info('Update time entry %s', req.decoded._id);
					const newValues = await updateTimeEntry(req.params.id, req.body);
					if (newValues) {
						return res.status(200).send({
							'state': 'success',
							'message': 'Time tracker data successfully updated',
							'timeEntry': newValues
						});
					}
					logger4js.error('Error in updating time entry with id %s', req.params.id);
					return res.status(500).send({
						state: 'error',
						message: 'Error in updating time entry'
					});
				}
			}
			logger4js.info('Update time entry %s', req.decoded._id);
			const newValues = await updateTimeEntry(req.params.id, req.body);
			if (newValues) {
				return res.status(200).send({
					'state': 'success',
					'message': 'Time tracker data successfully updated',
					'timeEntry': newValues
				});
			}
			logger4js.error('Error in updating time entry with id %s', req.params.id);
			return res.status(500).send({
				state: 'error',
				message: 'Error in updating time entry'
			});
		} catch (error) {
			logger4js.error('Error in update time entry: %O', error);
			return res.status(500).send({
				state: 'error',
				message: error
			});
		}
	});

module.exports = router;
