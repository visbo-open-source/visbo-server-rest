var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
mongoose.Promise = require('q').Promise;
var assert = require('assert');
var auth = require('./../components/auth');
var Admin = mongoose.model('Admin');


//Register the authentication middleware
router.use('/profile', auth.verifyAdmin);


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
	 * @ api {get} /admin/profile Get admin profile
	 * @ apiHeader {String} access-key Admin authentication token.
	 * @ apiVersion 0.0.1
	 * @ apiGroup AdminProfile
	 * @ apiName GetAdminProfile
	 * @ apiExample Example usage:
	 *   url: http://localhost:3484/admin/profile
	 *
	 */
	.get(function(req, res) {
		Admin.findById(req.decoded._id, function(err, admin) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting admin',
					error: err
				});
			}
			admin.password = undefined;
			return res.status(200).send({
				state: 'success',
				message: 'Returned admin data',
				admin: admin
			});
		});
	})
	// Update profile
	/**
	 * @ api {put} /admin/profile Update admin profile
	 * @ apiHeader {String} access-key Admin authentication token.
	 * @ apiVersion 0.0.1
	 * @ apiGroup AdminProfile
	 * @ apiName UpdateAdminProfile
	 * @ apiExample Example usage:
	 *   url: http://localhost:3484/admin/profile
	 *
	 *   body:
	 *   {
	 *     "name": "John Doe",
	 *     "profile": {
	 *       "address": "Sylhet, BD",
	 *       "company": "Owlette",
	 *       "phone": "+8801413667755",
	 *       "dob": "Thu Dec 16 1971 00:00:00 GMT+0600 (+06)"
	 *     }
	 *   }
	 *
	 * @ apiParam {String} name Admin's name.
	 * @ apiParam {Object} profile Profile object.
	 * @ apiParam {String} profile.address Address.
	 * @ apiParam {String} profile.company Company.
	 * @ apiParam {String} profile.phone Phone number.
	 * @ apiParam {Date} profile.dob Date of birth.
	 */
	.put(function(req, res) {
		Admin.findById(req.decoded._id, function(err, admin) {
			if (err) {
				return res.status(500).send({
					state: 'failure',
					message: 'Error getting admin',
					error: err
				});
			}

			admin.name = req.body.name;
			admin.profile.dob = req.body.profile.dob;
			admin.profile.address = req.body.profile.address;
			admin.profile.company = req.body.profile.company;
			admin.profile.phone = req.body.profile.phone;
			admin.profile.updated_at = Date.now();

			admin.save(function(err, admin) {
				if (err) {
					return res.status(500).send({
						state: 'failure',
						message: 'Error updating admin',
						error: err
					});
				}
				admin.password = undefined;
				return res.status(200).send({
					state: 'success',
					message: 'Updated admin profile',
					admin: admin
				});
			});
		});
	});


module.exports = router;
