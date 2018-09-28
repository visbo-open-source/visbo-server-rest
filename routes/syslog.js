var express = require('express');
var router = express.Router();

var fs = require('fs');
var util = require('util');
var path = require('path');

// var assert = require('assert');
var auth = require('./../components/auth');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);


//Register the authentication middleware
router.use('/', auth.verifySysAdmin);


router.route('/')
/**
	* @api {get} /syslog Get log file list
	* @apiVersion 1.0.0
	* @apiHeader {String} access-key User authentication token.
	* @apiGroup SysLog
	* @apiName GetSysLogs
	* @apiPermission user must be authenticated and sysadmin
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiExample Example usage:
	*   url: http://localhost:3484/syslog
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"Available Log Files",
	*  "files":[{
	*    "name":"all-the-logs.log",
	*    "updatedAt":"2018-03-20T10:31:27.216Z",
	*    "size":"123000"
	*  }]
	*}
	*/
// get syslog file list
	.get(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'SysLog (Read)';

		logger4js.info("Get Log File List ");

		var dir = path.join(__dirname, '../logging');
		var fileList = [];

		var files = fs.readdirSync(dir);
		var stats = {}
    for (var i in files){
			var file = path.join(dir, files[i]);
			stats = fs.statSync(file)
      fileList.push({name: files[i], size: stats.size, updatedAt: stats.mtime});
    }

		logger4js.info("Get SysLog ");
		return res.status(200).send({
			state: 'success',
			message: 'Available Log Files',
			files: fileList
		});
	})

router.route('/:filename')
/**
	* @api {get} /syslog/filename Get log file
	* @apiVersion 1.0.0
	* @apiHeader {String} access-key User authentication token.
	* @apiGroup SysLog
	* @apiName GetSysLogFile
	* @apiPermission user must be authenticated and sysadmin
	* @apiError NotAuthenticated no valid token HTTP 401
	* @apiExample Example usage:
	*   url: http://localhost:3484/syslog/all-the-logs.log
	* @apiSuccessExample {json} Success-Response:
	* HTTP/1.1 200 OK
	* {
	*  "state":"success",
	*  "message":"Downlaod Log File Successful",
	*  "file": filecontent
	*}
	*/
// get syslog file list
	.get(function(req, res) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		req.auditDescription = 'SysLogs (Read)';

		logger4js.info("Get Logfile %s ", req.params.filename);
		var dir = path.join(__dirname, '../logging');
		var fileName = path.join(dir, req.params.filename);
		stats = fs.statSync(fileName)
		if (!stats) {
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
	})

module.exports = router;
