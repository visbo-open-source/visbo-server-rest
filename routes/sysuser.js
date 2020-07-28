var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;

var User = mongoose.model('User');

// var assert = require('assert');
var auth = require('./../components/auth');
var verifyVc = require('./../components/verifyVc');
var errorHandler = require('./../components/errorhandler').handler;

var logModule = 'USER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// Register the VC middleware to check that the user has access to the System Admin
router.use('/', verifyVc.getSystemGroups);

router.route('/')
/**
	* @api {get} /sysuser Get users list
	* @apiVersion 1.0.0
	* @apiHeader {String} access-key User authentication token.
	* @apiGroup VISBO System
	* @apiName GetSysUsers
	* @apiPermission user must be authenticated and has System View Permission
	* @apiError {number} 401 Not Authenticated, no valid token
	* @apiError {number} 403 No Permission, user has no View Permission
	* @apiExample Example usage:
	*   url: https://my.visbo.net/api/sysuser
	*   url: https://my.visbo.net/api/sysuser?email='visbo'&userid=us5c754feac&maxcount=100
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'User List',
	*  'user':[{
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
	*      },
	*      'status': {
	*        'registeredAt': '2018-02-28T09:40:00.000Z',
	*        'lastPWResetAt': '2018-08-20T10:00:00.000Z',
	*        'lastLoginAt': '2018-09-25T11:00:00.000Z'
  *      }
	*    }
	*  }]
	*}
	*/
// get sysuser list
	.get(function(req, res) {
		req.auditDescription = 'SysUsers (Read)';
		req.auditSysAdmin = true;
		req.auditTTLMode = 1;
		var email = (req.query && req.query.email) ? req.query.email : undefined;
		var userId = req.query && req.query.userid && mongoose.Types.ObjectId.isValid(req.query.userid) ? req.query.userid : undefined;
		var maxcount = req.query && req.query.maxcount ? Number(req.query.maxcount) : 100;

		logger4js.info('Get System User List email: %s, userid: %s, maxcount: %s', email, userId, maxcount);

		var query = {};
		// acting user was already checked to have sysAdmin Permission
		if (email) query.email = new RegExp(email, 'i');
		if (userId) query._id = userId;
		// query.deleted = {$exists: false};

		User.find(query)
		.limit(maxcount)
		.select('-password')
		.sort({updatedAt: -1})
		.lean()
		.exec(function (err, listUsers) {
			if (err) {
				errorHandler(err, res, 'DB: GET System User', 'Error getting Sys Users');
				return;
			}
			logger4js.debug('Found Users %d', listUsers.length);
			return res.status(200).send({
				state: 'success',
				message: 'Returned VISBO Users',
				user: listUsers
			});
		});
	});

module.exports = router;
