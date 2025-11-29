var mongoose = require('mongoose');
var os = require('os');

// mongoose.Promise = require('q').Promise;
require('../models/visbocenter');
require('../models/visboproject');
require('../models/vcsetting');
require('../models/visboaudit');
var VCSetting = mongoose.model('VCSetting');
var VisboAudit = mongoose.model('VisboAudit');

var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var visboRedis = require('./../components/visboRedis');
var errorHandler = require('./../components/errorhandler').handler;
var visboAudit = require('./../components/visboAudit');
var visboPredict = require('./../components/visboPredict');
var logging = require('./../components/logging');
var lock = require('./../components/lock');
var refreshSystemSetting = require('./../components/systemVC').refreshSystemSetting;
var getSystemVCSetting = require('./../components/systemVC').getSystemVCSetting;
var vcSystemId = undefined;

/* The finishedTask function is responsible for marking a task as completed in the VCSetting collection. 
   It:
    - Logs task completion details.
    - Updates the task's lastRun timestamp and duration in the database.
    - Removes the lockedUntil field to unlock the task for future execution.
    - Optionally updates taskSpecific details if present.
    - Creates an audit entry (unless ignoreAudit is set to true).
  Key Features
    ✔️ Logs task completion with timestamps.
    ✔️ Calculates task duration (lastDuration).
    ✔️ Unlocks the task (unset lockedUntil) for future execution.
    ✔️ Updates the lastRun timestamp.
    ✔️ Optionally updates taskSpecific details.
    ✔️ Triggers an audit log unless ignoreAudit is true. 
*/
function finishedTask(task, ignoreAudit) {
  logger4js.trace('Task Finished, Task (%s/%s)', task && task.name, task && task._id);
  if (!task || !task.value) {
    logger4js.warn('No Task available during Finish, Task %s', task._id);
    return;
  }
  if (task.name == 'Predict Training') logger4js.trace('Task Finished, Task (%s/%s)', task.name, task._id);
  var updateQuery = {_id: task._id};
  var updateOption = {upsert: false};
  var currentDate = new Date();
  var startDate = task.value.lastRun;
  var duration = currentDate - startDate;
  var updateUpdate = {$unset : {'value.lockedUntil' : ''}, $set : {'value.lastRun' : currentDate, 'value.lastDuration': duration} };
  if (task.value.taskSpecific) {
    updateUpdate = {$unset : {'value.lockedUntil' : ''}, $set : {'value.lastRun' : currentDate, 'value.lastDuration': duration, 'value.taskSpecific': task.value.taskSpecific} };
  }

  logger4js.trace('FinishedTask Task(%s/%s) unlock %O', task.name, task._id, updateUpdate);
  VCSetting.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
      if (err) {
        errorHandler(err, undefined, 'DB: Update Task Unlock', undefined);
      }
      logger4js.debug('Finished Task Task(%s/%s) unlocked %s', task.name, task._id, result.modifiedCount);
  });
  if (!ignoreAudit) createTaskAudit(task, duration);
}

/* The createTaskAudit function is responsible for generating an audit entry for a completed task. 
   It validates the task data, constructs an audit entry, and saves it to the system. 
   If the task data is missing or incomplete, a warning is logged, and no audit entry is created.
*/
function createTaskAudit(task, duration) {
  if (!task || !task.value || !task.value.taskSpecific) {
    logger4js.warn('Finished Task Audit no Values');
    return;
  }
  var auditEntry = new VisboAudit();
  auditEntry.action = 'PUT';
  auditEntry.url = 'Task';
  auditEntry.host = os.hostname().split('.')[0];
  auditEntry.sysAdmin = true;
  auditEntry.user = {};
  auditEntry.user.email = 'System';
  auditEntry.vc = {};
  auditEntry.vc.vcid = vcSystemId;
  auditEntry.vc.name = 'Visbo-System';
  var vcjson = {'Info': task.value.taskSpecific};
  auditEntry.vc.vcjson = JSON.stringify(vcjson);

  auditEntry.ttl = new Date();
  auditEntry.ttl.setSeconds(auditEntry.ttl.getSeconds() + task.value.interval * 50);
  auditEntry.actionDescription = 'Task: ' + task.name;
  auditEntry.actionInfo = task.value.taskSpecific.result;
  auditEntry.result = {};
  auditEntry.result.time = duration;
  auditEntry.result.status = task.value.taskSpecific.result != 0 ? 200 : 304;
  auditEntry.result.statusText = 'Success';
  // auditEntry.result.size = taskSpecific.result;
  auditEntry.save(function(err) {
    if (err) {
      logger4js.error('Save Audit failed to save %O', err);
    }
  });
}


/* The checkNextRun function is responsible for managing the execution of scheduled tasks in the VISBO system. 
   It retrieves all tasks that are due for execution, evaluates their conditions, updates their scheduling parameters, and executes necessary operations accordingly.
*/
async function checkNextRun() {
  // mongoose.set('debug', true)
	logger4js.trace('VISBO Task Schedule, check what to start');
	
	try {
		// Redis v4: async/await
		var redisClient = await visboRedis.VisboRedisInit();
		var vcSystemIdRedis = await redisClient.get('vcSystem');
		
		if (!vcSystemIdRedis) {
			logger4js.trace('VISBO Redis System returned no vcSystem');
			return;
		}
		vcSystemId = vcSystemIdRedis;
    logger4js.trace('VISBO Task Schedule Found Redis System VC %s ', vcSystemId);
    var query = {};
		query.vcid = vcSystemId;
		query.type = 'Task';
    query['value.nextRun'] = {$lt: new Date()};
		
		var listTask = await VCSetting.find(query).lean();
		
		if (listTask) {
			logger4js.trace('CheckNextRun Task found for System VC %d', listTask.length);
			// loop through tasks and decided which one needs to run
			var actual = new Date();
			for (var i = 0; i < listTask.length; i++) {
				var task = listTask[i];
				if (!task.value) {
					logger4js.trace('CheckNextRun Task(%s/%s): Has no valid Value %O ', task.name, task._id, task);
					continue;
				} else {
					logger4js.trace('CheckNextRun Task(%s/%s): Check %s nextRun %s actual %s ', task.name, task._id, task.value.nextRun.toISOString().substr(11, 8), actual.toISOString().substr(11, 8));
					if (task.value.nextRun.getTime() > actual.getTime()) {  // nextRun has not expired
						if (task.name == 'Predict Training') logger4js.trace('CheckNextRun Task(%s/%s): Skip execution actual %s next %s', task.name, task._id, actual.toISOString().substr(11, 8), task.value.nextRun.toISOString().substr(11, 8));
						continue;
					} else {  // nextRun has expired already
						if (task.name == 'Predict Training' && task.value.lockedUntil) logger4js.trace('CheckNextRun Task(%s/%s): Is Locked %s next %s', task.name, task._id, task.value.lockedUntil.toISOString().substr(11, 8), task.value.nextRun.toISOString().substr(11, 8));
						if (task.value.lockedUntil) {  // Task was locked
							if (task.value.lockedUntil.getTime() < actual.getTime()) { // lock expired
								logger4js.info('CheckNextRun Task(%s/%s): Has an expired lock %s lastRun %s', task.name, task._id, task.value.lockedUntil.toISOString().substr(11, 8), task.value.lastRun.toISOString().substr(11, 8));
							} else {
								logger4js.info('CheckNextRun Task(%s/%s): Is locked %s lastRun %s ', task.name, task._id, task.value.lockedUntil.toISOString().substr(11, 8), task.value.lastRun.toISOString().substr(11, 8));
								continue;
							}
						}
					}
				}
				if (task.name == 'Predict Training') logger4js.trace('CheckNextRun Task(%s/%s): process actual %s next %s', task.name, task._id, actual.toISOString().substr(11, 8), task.value.nextRun.toISOString().substr(11, 8));
				// update task entry lock & next run
				task.value.nextRun = new Date(); // to guarantee that it is set
				task.value.nextRun.setTime(actual.getTime() + task.value.interval * 1000);
				if (task.value.interval == 60 * 60) { // start at the beginning of the hour
					task.value.nextRun.setMinutes(0);
					task.value.nextRun.setSeconds(0);
				} else if (task.value.interval == 60 * 60 * 24) { // start at the beginning of the day
					task.value.nextRun.setHours(0, 0, 0, 0);
				} else if (task.value.interval == 60 * 60 * 24 * 30) { // start at the beginning of the month
					task.value.nextRun.setDate(1);
					task.value.nextRun.setHours(0, 0, 0, 0);
				}
				var lockPeriod = 5 * 60;
				if (task.name == 'Predict Training') { logger4js.trace('Prepare Task(%s/%s): Needs execution next %s new lock %s', task.name, task._id, task.value.nextRun && task.value.nextRun.toISOString(), task.value.lockedUntil && task.value.lockedUntil.toISOString()); }
				lockPeriod = lockPeriod > task.value.interval ? task.value.interval / 2 : lockPeriod;
				task.value.lockedUntil = new Date(actual);
				task.value.lockedUntil.setTime(task.value.lockedUntil.getTime() + lockPeriod * 1000);
				task.value.lastRun = new Date(); // now set it to current date as the last StartDate
				logger4js.debug('CheckNextRun Task(%s/%s): Needs execution next %s new lock %s', task.name, task._id, task.value.nextRun.toISOString().substr(11, 8), task.value.lockedUntil.toISOString().substr(11, 8));
				// Do not update if locked and check result that it has updated the item
				var updateQuery = {_id: task._id, '$or': [{'value.lockedUntil': {$exists: false}}, {'value.lockedUntil': {$lt: new Date()}}]};
				var updateOption = {upsert: false};
				var updateUpdate = {$set : {'value.lastRun' : task.value.lastRun, 'value.nextRun' : task.value.nextRun, 'value.lockedUntil' : task.value.lockedUntil} };

				var result = await VCSetting.updateOne(updateQuery, updateUpdate, updateOption);
				
				if (task.name == 'Predict Training') { logger4js.trace('Updated Task (%s/%s): updated last run/next run execute task now', task.name, task._id); }
				logger4js.trace('CheckNextRun Task (%s/%s) Saved Items %s', task.name, task._id, result.modifiedCount);
				
				if (result.modifiedCount == 1) {
					// call specific operation for task
					switch(task.name) {
						case 'Audit Cleanup':
							visboAudit.cleanupAudit(task, finishedTask);
							break;
						case 'Audit Squeeze':
							visboAudit.squeezeAudit(task, finishedTask);
							break;
						case 'Log File Cleanup':
							var config = getSystemVCSetting('Log Age');
							var age = 30;
							if (config && config.value && config.value.duration)
								age = config.value.duration;
							task.specificValue = { 'logAge': age };
							logger4js.debug('Execute Log Delete Age %O', task.specificValue);
							logging.cleanupLogFiles(task, finishedTask);
							break;
						case 'Lock Cleanup':
							lock.cleanupAllVPLock(task, finishedTask);
							break;
						case 'System Config':
							refreshSystemSetting(task, finishedTask);
							break;
						case 'Predict Collect':
						//   !!do not execute any longer !!
						//   visboPredict.kmCollect(task, finishedTask, vcSystemId);
							break;
						case 'Predict Training':
						//   !!do not execute any longer !!
						//   visboPredict.kmTraining(task, finishedTask, vcSystemId);
							break;
						case 'Task Test':
							taskTest(task, finishedTask);
							break;
						default:
							finishedTask(task, false);
					}
				} else {
					logger4js.info('CheckNextRun Task (%s/%s) locked already by another Server', task.name, task._id);
				}
				// execute only one per round, otherwise task Object is incorrect
				break;
			}
		}
	} catch (err) {
		logger4js.trace('VISBO Task Schedule error: %O', err);
		errorHandler(err, undefined, 'Task Schedule error', undefined);
	}
}

/* The taskTest function is a utility function used for testing task execution in the VISBO system. 
   It ensures that the provided task object is processed, updates specific task-related properties, and marks the task as completed.
 */
function taskTest(task, finishedTask) {
  if (!task && !task.value) {
    finishedTask(task, true);
  }
  logger4js.trace('TaskTest Execute %s Value %O', task && task._id, task.value);
  task.value.taskSpecific = {};
  task.value.taskSpecific.lastPeriod = new Date();
  task.value.taskSpecific.lastPeriod.setHours(0, 0, 0, 0);

  finishedTask(task, true);
  logger4js.debug('TaskTest Done %s Result %O', task._id, task.value.taskSpecific);
}

/* The visboTaskScheduleInit function initializes the VISBO task scheduling system by periodically checking for tasks that need to be executed. 
*/
function visboTaskScheduleInit() {
	logger4js.trace('VISBO Task Schedule Init! ');
	setInterval(checkNextRun, 5000);
}

module.exports =
  { visboTaskScheduleInit: visboTaskScheduleInit };
