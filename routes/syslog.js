var express = require('express');
var router = express.Router();

var fs = require('fs');
var path = require('path');

// var assert = require('assert');
var auth = require('../components/auth');
var verifyVc = require('../components/verifyVc');

var Const = require('../models/constants');
var constPermSystem = Const.constPermSystem;

var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

//Register the authentication middleware for all URLs under this module
router.use('/', auth.verifyUser);
// Register the VC middleware to check that the user has access to the System Admin
router.use('/', verifyVc.getSystemGroups);

router.route('/')
/**
	* @api {get} /syslog Get log file list
	* @apiVersion 1.0.0
	* @apiHeader {String} access-key User authentication token.
	* @apiGroup Visbo System Log
	* @apiName GetSysLogs
	* @apiPermission user must be authenticated and access to System View and ViewLog Permission
	* @apiError {number} 401 Not Authenticated, no valid token
	* @apiError {number} 403 No Permission, user has no View & ViewLog Permission
	* @apiExample Example usage:
	*   url: http://localhost:3484/syslog
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  'state':'success',
	*  'message':'Available Log Files',
	*  'files':[{
	*    'name':'all-the-logs.log',
	*    'updatedAt':'2018-03-20T10:31:27.216Z',
	*    'size':'123000'
	*  }]
	*}
	*/
// get syslog file list
	.get(function(req, res) {
		var userId = req.decoded._id;

		req.auditDescription = 'SysLog (Read)';
		req.auditSysAdmin = true;
		req.auditTTLMode = 1;

		logger4js.info('Get Log File List Perm system: %O ', req.listVCPerm.getPerm(0));

		var ageDays = 7;
		if (req.query.ageDays && !isNaN(req.query.ageDays)) ageDays = req.query.ageDays;
		var ageDate = new Date();
		ageDate.setDate(ageDate.getDate() - ageDays);
		ageDate.setHours(0);
		ageDate.setMinutes(0);
		ageDate.setSeconds(0);
		ageDate.setMilliseconds(0);

		var dir = path.join(__dirname, '../logging');
		if (process.env.LOGPATH != undefined) {
			dir = process.env.LOGPATH;
		}
		var fileList = [];

		if (!(req.listVCPerm.getPerm(0).system & constPermSystem.ViewLog)) {
			logger4js.debug('No Permission to View System Log for user %s', userId);
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to View System Log'
			});
		}
		logger4js.debug('Get Log File from Directory: %s Date %s', dir, ageDate);
		var folders = fs.readdirSync(dir);
		var stats = {};
    for (var i in folders){
			var folder = path.join(dir, folders[i]);
			if (folders[i].substring(0, 1) == '.') {
				logger4js.debug('Ignore dot folders %s in log folder', folder);
				continue;
			}
			stats = fs.statSync(folder);
			if ( !stats.isDirectory()) {
				logger4js.debug('Ignore native file %s in log folder', folder);
			} else {
				// Browse Host Directory for Log Files per Host
				var files = fs.readdirSync(folder);
				for (var j in files){
					var file = path.join(folder, files[j]);
					if (files[j].substring(0, 1) == '.') {
						logger4js.debug('Ignore dot files %s in log folder', file);
						continue;
					}
					stats = fs.statSync(file);
					if ( !stats.isFile()) {
						logger4js.debug('Ignore non native file %s in log folder', file);
					} else {
						if (stats.mtime > ageDate) {
							fileList.push({folder: folders[i], name: files[j], size: stats.size, updatedAt: stats.mtime});
						} else {
							logger4js.debug('Ignore Log File %s from %s Modified %s AgeFilter %s', folders[i], files[j], stats.mtime, ageDate);
						}
					}
				}
			}
    }

		logger4js.info('Get SysLog ');
		return res.status(200).send({
			state: 'success',
			message: 'Available Log Files',
			files: fileList
		});
	});

	router.route('/file/:folder/:filename')
	/**
		* @api {get} /syslog/filename Get log file
		* @apiVersion 1.0.0
		* @apiHeader {String} access-key User authentication token.
		* @apiGroup Visbo System Log
		* @apiName GetSysLogFile
		* @apiPermission user must be authenticated and has System View and ViewLog Permission
		* @apiError {number} 401 Not Authenticated, no valid token
		* @apiError {number} 403 No Permission, user has no View & ViewLog Permission
		* @apiExample Example usage:
		*   url: http://localhost:3484/syslog/all-the-logs.log
		* @apiSuccessExample {json} Success-Response:
		* HTTP/1.1 200 OK
		* {
		*  'state':'success',
		*  'message':'Downlaod Log File Successful',
		*  'file': filecontent
		*}
		*/
	// get syslog file
	.get(function(req, res) {
		req.auditDescription = 'SysLogs (Read)';
		req.auditSysAdmin = true;

		logger4js.info('Get Logfile %s/%s ', req.params.folder, req.params.filename);
		if (!(req.listVCPerm.getPerm(0).system & constPermSystem.ViewLog)) {
			logger4js.debug('No Permission to View System Log');
			return res.status(403).send({
				state: 'failure',
				message: 'No Permission to View System Log'
			});
		}
		var dir = path.join(__dirname, '../logging');
		if (process.env.LOGPATH != undefined) {
			dir = process.env.LOGPATH;
		}
		var fileName = path.join(dir, req.params.folder, req.params.filename);
		if (!fs.statSync(fileName)) {
			return res.status(400).send({
				state: 'failure',
				message: 'File does not exists or no permission'
			});
		}
		fs.readFile(fileName, function (err, content) {
			if (err) {
				return res.status(400).send({
					state: 'failure',
					message: 'File does not exists or no permission'
				});
			} else {
				//specify Content will be an attachment
				// res.type('text/plain');

				res.setHeader('Content-disposition', 'attachment; filename='+req.params.filename);
				res.setHeader('Content-Type', 'text/plain');
				res.end(content);
			}
		});
		// res.download(dir, fileName);
	});

module.exports = router;
