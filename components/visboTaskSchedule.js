var mongoose = require('mongoose');
// mongoose.Promise = require('q').Promise;
require('../models/visbocenter');
require('../models/visboproject');
require('../models/vcsetting');
require('../models/visboaudit');
var VisboCenter = mongoose.model('VisboCenter');
var VCSetting = mongoose.model('VCSetting');
var VisboAudit = mongoose.model('VisboAudit');
var VisboProject = mongoose.model('VisboProject');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var events = require('events');
var eventEmitter = new events.EventEmitter();
var visboRedis = require('./../components/visboRedis');
var errorHandler = require('./../components/errorhandler').handler;
var visboAudit = require('./../components/visboAudit');
var lock = require('./../components/lock');
var refreshSystemSetting = require('./../components/systemVC').refreshSystemSetting;
var vcSystemId = undefined;

//Create an event handler:
function finishedTask(task, ignoreAudit) {
  logger4js.info("Task Finished, Task (%s/%s)", task && task.name, task && task._id);
  if (!task || !task.value) {
    logger4js.warn("No Task available during Finish, Task %s", task._id);
    return;
  }
  var updateQuery = {_id: task._id};
  var updateOption = {upsert: false};
  var currentDate = new Date();
  var startDate = task.value.lastRun;
  var duration = currentDate - startDate;
  var updateUpdate = {$unset : {'value.lockedUntil' : ''}, $set : {'value.lastRun' : currentDate, 'value.lastDuration': duration} };
  if (task.value.taskSpecific) {
    updateUpdate = {$unset : {'value.lockedUntil' : ''}, $set : {'value.lastRun' : currentDate, 'value.lastDuration': duration, 'value.taskSpecific': task.value.taskSpecific} };
  }

  logger4js.trace("FinishedTask Task(%s/%s) unlock %O", task.name, task._id, updateUpdate);
  VCSetting.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
      if (err) {
        errorHandler(err, undefined, `DB: Update Task Unlock`, undefined)
      }
      logger4js.debug("Finished Task Task(%s/%s) unlocked %s", task.name, task._id, result.nModified);
  })
  if (!ignoreAudit) createTaskAudit(task, duration);
}

function createTaskAudit(task, duration) {
  if (!task || !task.value || !task.value.taskSpecific) {
    logger4js.warn("Finished Task Audit no Values");
    return;
  };
  var auditEntry = new VisboAudit();
  auditEntry.action = "PUT";
  auditEntry.url = "Task"
  auditEntry.sysAdmin = true;
  auditEntry.user = {};
  auditEntry.user.email = "System";
  auditEntry.vc = {};
  auditEntry.vc.vcid = vcSystemId
  auditEntry.vc.name = "Visbo-System"
  var vcjson = {"Info": task.value.taskSpecific.resultDescription}
  auditEntry.vc.vcjson = JSON.stringify(vcjson);

  auditEntry.ttl = new Date();
  auditEntry.ttl.setSeconds(auditEntry.ttl.getSeconds() + task.value.interval * 7);
  auditEntry.actionDescription = "Task: " + task.name;
  auditEntry.actionInfo = task.value.taskSpecific.result;
  auditEntry.result = {};
  auditEntry.result.time = (new Date()) - task.value.lastRun;
  auditEntry.result.status = task.value.taskSpecific.result != 0 ? 200 : 304;
  auditEntry.result.statusText = "Success"
  // auditEntry.result.size = taskSpecific.result;
  auditEntry.save(function(err, auditEntryResult) {
    if (err) {
      logger4js.error("Save VisboAudit failed to save %O", err);
    }
  });
}

function checkNextRun() {
	logger4js.trace("Visbo Task Schedule, check what to start");
	// get all Tasks
  var redisClient = visboRedis.VisboRedisInit();
  redisClient.get('vcSystem', function(err, vcSystemIdRedis) {
    if (err) {
      logger4js.warn("Visbo Redis System returned %O ", err);
      return;
    }
    vcSystemId = vcSystemIdRedis
    logger4js.trace("Visbo Task Schedule Found Redis System VC %s ", vcSystemId);
    var query = {};
		query.vcid = vcSystemId;
		query.type = 'Task';
		var queryVCSetting = VCSetting.find(query);
		queryVCSetting.exec(function (err, listTask) {
			if (err) {
				errorHandler(err, undefined, `DB: Get System Setting Task Select `, undefined)
        return;
      }
			if (listTask) {
				logger4js.trace("CheckNextRun Task found for System VC %d", listTask.length);
        // loop through tasks and decided which one needs to run
        var actual = new Date();
        for (var i=0; i < listTask.length; i++) {
          if (!listTask[i].value) {
            logger4js.warn("CheckNextRun Task(%s/%s): %s has no valid Value %O ", listTask[i].name, listTask[i]._id, listTask[i].name, listTask[i]);
            continue;
          } else {
            logger4js.trace("CheckNextRun Task(%s/%s): %s nextRun %s lockedUntil %s ", listTask[i].name, listTask[i]._id, listTask[i].name, listTask[i].value.nextRun, listTask[i].value.lockedUntil);
            if (listTask[i].value.nextRun > actual) {  // nextRun has not expired
              logger4js.trace("CheckNextRun Task(%s/%s): %s skip execution actual %s next %s", listTask[i].name, listTask[i]._id, listTask[i].name, actual.toISOString(), listTask[i].value.nextRun.toISOString());
              continue;
            } else {  // nextRun has expired already
              if (listTask[i].value.lockedUntil) {  // Task was locked
                if (listTask[i].value.lockedUntil < actual) { // lock expired
                  logger4js.debug("CheckNextRun Task(%s/%s): %s has an expired lock %s lastRun %s", listTask[i].name, listTask[i]._id, listTask[i].name, listTask[i].value.lockedUntil, listTask[i].value.lastRun);
                } else {
                  logger4js.info("CheckNextRun Task(%s/%s): %s is locked %s lastRun %s ", listTask[i].name, listTask[i]._id, listTask[i].name, listTask[i].value.lockedUntil, listTask[i].value.lastRun);
                  continue;
                }
              }
            }
          }
          // update task entry lock & next run
          listTask[i].value.nextRun = new Date(); // to guarantee that it is set
          listTask[i].value.nextRun.setTime(actual.getTime() + listTask[i].value.interval * 1000);
          if (listTask[i].value.interval == 60 * 60) { // start at the beginning of the hour
            listTask[i].value.nextRun.setMinutes(0);
            listTask[i].value.nextRun.setSeconds(0);
          } else if (listTask[i].value.interval == 60 * 60 * 24) { // start at the beginning of the day
            listTask[i].value.nextRun.setHours(0);
            listTask[i].value.nextRun.setMinutes(0);
            listTask[i].value.nextRun.setSeconds(0);
          } else if (listTask[i].value.interval == 60 * 60 * 24 * 30) { // start at the beginning of the month
            listTask[i].value.nextRun.setDate(0);
            listTask[i].value.nextRun.setHours(0);
            listTask[i].value.nextRun.setMinutes(0);
            listTask[i].value.nextRun.setSeconds(0);
          }
          var lockPeriod = 5*60
          lockPeriod = lockPeriod > listTask[i].value.interval ? listTask[i].value.interval / 2 : lockPeriod;
          listTask[i].value.lockedUntil = new Date(actual);
          listTask[i].value.lockedUntil.setTime(listTask[i].value.lockedUntil.getTime() + lockPeriod * 1000);
          listTask[i].value.lastRun = new Date(); // now set it to current date as the last StartDate
          logger4js.debug("CheckNextRun Task(%s/%s): %s needs execution next %s new lock %s", listTask[i].name, listTask[i]._id, listTask[i].name, listTask[i].value.nextRun.toISOString(), listTask[i].value.lockedUntil.toISOString());
          // MS TODO: Do not update if locked and check result that it has updated the item
          var updateQuery = {_id: listTask[i]._id, "$or": [{"value.lockedUntil": {$exists: false}}, {"value.lockedUntil": {$lt: new Date()}}]};
        	var updateOption = {upsert: false};
      		var updateUpdate = {$set : {'value.lastRun' : listTask[i].value.lastRun, 'value.nextRun' : listTask[i].value.nextRun, 'value.lockedUntil' : listTask[i].value.lockedUntil} };
          var task = listTask[i];

        	VCSetting.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
              if (err) {
                errorHandler(err, undefined, `DB: Update Task`, undefined)
              }
              logger4js.debug("CheckNextRun Task (%s/%s) Saved Items %s", task.name, task._id, result.nModified);
              if (result.nModified == 1) {
                // call specific operation for task
                switch(task.name) {
                  case 'Audit Cleanup':
                    visboAudit.cleanupAudit(task, finishedTask);
                    break;
                  case 'Audit Squeeze':
                    visboAudit.squeezeAudit(task, finishedTask);
                    break;
                  case 'Lock Cleanup':
                    lock.cleanupAllVPLock(task, finishedTask);
                    break;
                  case 'System Config':
                    refreshSystemSetting(task, finishedTask);
                    break;
                  case 'Task Test':
                    taskTest(task, finishedTask);
                    break;
                  default:
                    finishedTask(task, false)
                }
              } else {
                logger4js.info("CheckNextRun Task (%s/%s) locked already by another Server", task.name, task._id);
              }
        	})
          // execute only one per round, otherwise task Object is incorrect
          break;
        }
			}
		});
  });
}

function taskTest(task, finishedTask) {
  if (!task && !task.value) {
    finishedTask(task, true)
  }
  logger4js.trace("TaskTest Execute %s Value %O", task && task._id, task.value);
  task.value.taskSpecific = {};
  task.value.taskSpecific.lastPeriod = new Date();
  task.value.taskSpecific.lastPeriod.setHours(0);
  task.value.taskSpecific.lastPeriod.setMinutes(0);
  task.value.taskSpecific.lastPeriod.setSeconds(0);

  finishedTask(task, true)
  logger4js.debug("TaskTest Done %s Result %O", task._id, task.value.taskSpecific);
}

function visboTaskScheduleInit() {
	logger4js.trace("Visbo Task Schedule Init! ");
	setInterval(checkNextRun, 5000);
}

module.exports = {
	visboTaskScheduleInit: visboTaskScheduleInit
};
