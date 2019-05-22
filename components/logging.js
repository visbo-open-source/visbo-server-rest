var log4js = require('log4js');
var logger4js = undefined;

var configDebug = undefined;
var fsLogPath = undefined;
var logObj = undefined;
var logConfig = undefined

setLogLevelConfig = function(newConfigDebug) {
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
	configDebug = newConfigDebug
}

initLog4js = function(fsLogPath) {
	// if (!logObj) {
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
	// }
}

module.exports = {
	initLog4js: initLog4js,
	setLogLevelConfig: setLogLevelConfig
};
