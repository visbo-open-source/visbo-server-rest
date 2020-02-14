var fs = require('fs');
var path = require('path');

var log4js = require('log4js');
var logger4js = undefined;

var logObj = undefined;
var logConfig = undefined

function setLogLevelConfig(newConfigDebug) {
	if ( newConfigDebug == undefined ) {
		return;
	}
	for (var category in newConfigDebug) {
		if (logConfig.categories[category]) {
			logger4js.trace("LogLevel Set %O Value %s", category, newConfigDebug[category])
			// logConfig.categories[category].level = newConfigDebug[category]
			var logger = log4js.getLogger(category);
			logger.level = newConfigDebug[category]
		}
	}
	// console.log("LOG LEVEL SET: %O", newConfigDebug)
}

function cleanupLogFiles(task, finishedTask) {
	logger4js.debug("cleanupLogFiles Execute %s", task && task._id);
	if (!task || !task.value) finishedTask(task, false);
	var ageDays = 30;
	if (task.specificValue)
		ageDays =  task.specificValue.logAge || ageDays
	var deleteLogDate = new Date();
	var deletedCount = 0;
	deleteLogDate.setDate(deleteLogDate.getDate()-ageDays)
	deleteLogDate.setHours(0);
	deleteLogDate.setMinutes(0);
	deleteLogDate.setSeconds(0);
	deleteLogDate.setMilliseconds(0);

	var dir = path.join(__dirname, '../logging');
	if (process.env.LOGPATH != undefined) {
		dir = process.env.LOGPATH;
	}

	logger4js.debug("Delete Log File from Directory: %s Date %s", dir, deleteLogDate);
	var folders = fs.readdirSync(dir);
	var stats = {}

	for (var i in folders) {
		var folder = path.join(dir, folders[i]);
		if (folders[i].substring(0, 1) == '.') {
			logger4js.debug("Ignore dot folders %s in log folder", folder);
			continue;
		}
		stats = fs.statSync(folder);
		if ( !stats.isDirectory()) {
			logger4js.debug("Ignore native file %s in log folder", folder);
		} else {
			// Browse Host Directory for Log Files per Host
			var files = fs.readdirSync(folder);
			var emptyFolder = true;
			stats = {}
			for (var j in files) {
				var file = path.join(folder, files[j]);
				if (files[j].substring(0, 1) == '.') {
					logger4js.debug("Ignore dot files %s in log folder", file);
					emptyFolder = false
					continue;
				}
				stats = fs.statSync(file);
				if ( !stats.isFile()) {
					logger4js.debug("Ignore non native file %s in log folder", file);
					emptyFolder = false
				} else {
					if (stats.mtime < deleteLogDate) {
						var fullFileName = path.join(folder, files[j]);
						logger4js.trace("Delete Log File %s Modified %s AgeFilter %s", fullFileName, stats.mtime, deleteLogDate);
						try {
							fs.unlinkSync(fullFileName);
							deletedCount += 1;
							logger4js.debug('Delete Log File %s successfully', fullFileName);
						} catch (err) {
							logger4js.warn('Delete Log File %s failed', fullFileName);
						}
					} else {
						logger4js.debug("Keep Log File %s from %s Modified %s AgeFilter %s", files[j], folders[i], stats.mtime, deleteLogDate);
						emptyFolder = false
					}
				}
			}
			if (emptyFolder) {
				logger4js.warn('Delete Empty Log Folder %s', folder);
				try {
					fs.rmdirSync(folder);
					logger4js.debug('Delete Log Folder %s successfully', folder);
				} catch (err) {
					logger4js.warn('Delete Log Folder %s failed', folder);
				}
			}
		}
	}
	task.value.taskSpecific = {result: deletedCount, resultDescription: `Deleted ${deletedCount} expired Log Files`}
	finishedTask(task, false);
}

function initLog4js(fsLogPath) {
	if (!logObj) {
		logConfig = {
			appenders: {
				out: { type: 'stdout' },
				everything: { type: 'dateFile', filename: fsLogPath + '/all-the-logs', maxLogSize: 4096000, backups: 30, daysToKeep: 30 },
				emergencies: {  type: 'dateFile', filename: fsLogPath + '/oh-no-not-again', maxLogSize: 4096000, backups: 30, daysToKeep: 30 },
				'just-errors': { type: 'logLevelFilter', appender: 'emergencies', level: 'error' },
				'just-errors2': { type: 'logLevelFilter', appender: 'out', level: 'warn' }
			},
			categories: {
				default: { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
				"VC": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'info' },
				"VP": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
				"VPV": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
				"USER": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
				"MAIL": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
				"ALL": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
				"OTHER": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' }
			}
			// ,
			// pm2: true,
			// pm2InstanceVar: 'INSTANCE_ID'
		}
		logObj = log4js.configure(logConfig);
		// log4js.level = 'info';
		logger4js = log4js.getLogger("OTHER");

		logger4js.info("LogPath %s", fsLogPath)
	}
}

module.exports = {
	initLog4js: initLog4js,
	setLogLevelConfig: setLogLevelConfig,
	cleanupLogFiles: cleanupLogFiles
};
