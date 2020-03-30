var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var bCrypt = require('bcrypt-nodejs');

// var assert = require('assert');
var auth = require('./../components/auth');
var User = mongoose.model('User');
var errorHandler = require('./../components/errorhandler').handler;
var getSystemUrl = require('./../components/systemVC').getSystemUrl;

var mail = require('../components/mail');
var eMailTemplates = "/../emailTemplates/";
var ejs = require('ejs');
var useragent = require('useragent');
var validate = require('./../components/validate');

var logModule = 'USER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var visboRedis = require('./../components/visboRedis');

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
	* @apiGroup User Profile
	* @apiName GetUserProfile
	* @apiPermission user must be authenticated
	* @apiError {number} 401 user not authenticated
	* @apiError {number} 500 Internal Server Error
	* @apiExample Example usage:
	*   url: http://localhost:3484/user/profile
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
// get profile
	.get(function(req, res) {
		req.auditDescription = 'Profile (Read)';
		req.auditTTLMode = 1;

		User.findById(req.decoded._id, function(err, user) {
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
	* @apiError {number} 400 required fields for profile missing
	* @apiError {number} 401 user not authenticated
	* @apiError {number} 500 Internal Server Error
	* @apiExample Example usage:
	*   url: http://localhost:3484/user/profile
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
	.put(function(req, res) {
		req.auditDescription = 'Profile (Update)';

		logger4js.info('Put/Update user %s', req.decoded._id);
		User.findById(req.decoded._id, function(err, user) {
			if (err) {
				errorHandler(err, res, `DB: PUT Profile ${req.decoded._id} Find `, 'Error update profile failed');
				return;
			}
			if (!req.body.profile || !req.body.profile.firstName || !req.body.profile.lastName ) {
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

			user.save(function(err, user) {
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
	* @apiError {number} 400 old or new password missing
	* @apiError {number} 409 password mismatch
	* @apiError {number} 401 user not authenticated
	* @apiError {number} 500 Internal Server Error
	* @apiExample Example usage:
	*  url: http://localhost:3484/user/passwordchange
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
	.put(function(req, res) {
		req.auditDescription = 'Password (Change)';

		logger4js.info('Put/Update user password %s', req.decoded._id);
		User.findById(req.decoded._id, function(err, user) {
			if (err) {
				errorHandler(err, res, `DB: PUT Change Password ${req.decoded._id} Find `, 'Error change password failed');
				return;
			}
			if (!req.body.password || !req.body.oldpassword ) {
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
				user.save(function(err, user) {
					if (err) {
						errorHandler(err, res, `DB: PUT Profile ${req.decoded._id} Save `, 'Error chaneg password failed');
						return;
					}
					user.password = undefined;
					// now send an e-Mail to the user for pw change
					var lang = validate.evaluateLanguage(req);
					var template = __dirname.concat(eMailTemplates, lang, '/passwordChanged.ejs');
					var uiUrl =  getSystemUrl();
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
					ejs.renderFile(template, {userTo: user, url: uiUrl, info}, function(err, emailHtml) {
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
	*  url: http://localhost:3484/user/logout
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'You have successfully logged out'
	* }
	*/
// Logout
	.post(function(req, res) {
		req.auditDescription = 'Logout';

		logger4js.info('Post Logout %s', req.decoded._id);
		// add token to Redis
		var redisClient = visboRedis.VisboRedisInit();
		var token = req.headers['access-key'].split('.')[2];
		redisClient.set('token.'+token, req.decoded._id, 'EX', 3600);
		return res.status(200).send({
			state: 'success',
			message: 'You have successfully logged out'
		});
	});


module.exports = router;
