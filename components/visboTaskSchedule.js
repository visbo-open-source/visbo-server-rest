var mongoose = require('mongoose');
// mongoose.Promise = require('q').Promise;
require('../models/visbocenter');
require('../models/vcsetting');
require('../models/visboaudit');
var VisboCenter = mongoose.model('VisboCenter');
var VCSetting = mongoose.model('VCSetting');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var events = require('events');
var eventEmitter = new events.EventEmitter();
var visboRedis = require('./../components/visboRedis');
var errorHandler = require('./../components/errorhandler').handler;
var visboAudit = require('./../components/visboAudit');
var refreshSystemSetting = require('./../components/systemVC').refreshSystemSetting;

//Create an event handler:
function finishedTask(taskID, valueSpecific, startDate) {
  logger4js.debug("Task Finished, Task %s", taskID);
  var updateQuery = {_id: taskID};
  var updateOption = {upsert: false};
  var currentDate = new Date();
  var duration = startDate > 0 ? currentDate - startDate : -1;
  var updateUpdate = {$unset : {'value.lockedUntil' : ''}, $set : {'value.lastRun' : currentDate, 'value.lastDuration': duration} };
  if (valueSpecific) {
    updateUpdate = {$unset : {'value.lockedUntil' : ''}, $set : {'value.lastRun' : currentDate, 'value.lastDuration': duration, 'value.taskSpecific': valueSpecific} };
  }

  logger4js.trace("finishedTask Task(%s) unlock %O", taskID, updateUpdate);
  VCSetting.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
      if (err) {
        errorHandler(err, undefined, `DB: Update Task Unlock`, undefined)
      }
      logger4js.debug("Finished Task Task(%s) unlocked %s", taskID, result.nModified);
  })
}

//Fire the 'TaskFinished' event:
// eventEmitter.emit('TaskFinished', 'taskid');

// visboEvents.eventEmitter.on('scream', myEventHandlerStats);

function checkNextRun() {
	logger4js.trace("Visbo Task Schedule, check what to start");
	// get all Tasks
  var redisClient = visboRedis.VisboRedisInit();
  redisClient.get('vcSystem', function(err, vcSystemId) {
    if (err) {
      logger4js.warn("Visbo Redis System returned %O ", err);
      return;
    }
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
            logger4js.warn("CheckNextRun Task(%s/%s): %s has no valid Value %O ", i, listTask[i]._id, listTask[i].name, listTask[i]);
            continue;
          } else {
            logger4js.trace("CheckNextRun Task(%s/%s): %s nextRun %s lockedUntil %s ", i, listTask[i]._id, listTask[i].name, listTask[i].value.nextRun, listTask[i].value.lockedUntil);
            if (listTask[i].value.nextRun > actual) {  // nextRun has not expired
              logger4js.trace("CheckNextRun Task(%s/%s): %s skip execution actual %s next %s", i, listTask[i]._id, listTask[i].name, actual.toISOString(), listTask[i].value.nextRun.toISOString());
              continue;
            } else {  // nextRun has expired already
              if (listTask[i].value.lockedUntil) {  // Task was locked
                if (listTask[i].value.lockedUntil < actual) { // lock expired
                  logger4js.debug("CheckNextRun Task(%s/%s): %s has an expired lock %s lastRun %s", i, listTask[i]._id, listTask[i].name, listTask[i].value.lockedUntil, listTask[i].value.lastRun);
                } else {
                  logger4js.info("CheckNextRun Task(%s/%s): %s is locked %s lastRun %s ", i, listTask[i]._id, listTask[i].name, listTask[i].value.lockedUntil, listTask[i].value.lastRun);
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
          logger4js.debug("CheckNextRun Task(%s/%s): %s needs execution next %s new lock %s", i, listTask[i]._id, listTask[i].name, listTask[i].value.nextRun.toISOString(), listTask[i].value.lockedUntil.toISOString());
          var updateQuery = {_id: listTask[i]._id};
        	var updateOption = {upsert: false};
      		var updateUpdate = {$set : {'value.nextRun' : listTask[i].value.nextRun, 'value.lockedUntil' : listTask[i].value.lockedUntil} };

        	VCSetting.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
              if (err) {
                errorHandler(err, undefined, `DB: Update Task`, undefined)
              }
              logger4js.trace("CheckNextRun Task Saved %O", result);
        	})
          // call specific operation for task
          switch(listTask[i].name) {
            case 'Audit Cleanup':
              visboAudit.cleanupAudit(listTask[i]._id, finishedTask, listTask[i].value, new Date());
              break;
            case 'Audit Squeeze':
              visboAudit.squeezeAudit(listTask[i]._id, finishedTask, listTask[i].value, new Date());
              break;
            case 'System Config':
              refreshSystemSetting(listTask[i]._id, finishedTask, listTask[i].value, new Date());
              break;
            case 'Task Test':
              taskTest(listTask[i]._id, finishedTask, listTask[i].value, new Date());
              break;
            default:
              finishedTask(listTask[i]._id, new Date())
          }
        }
			}
		});
  });
}

function taskTest(taskID, finishedTask, value, startDate) {
  logger4js.debug("TaskTest Execute %s Value %O", taskID, value);
  if (value && value.taskSpecific) {
    value.taskSpecific.lastPeriod = new Date();
    value.taskSpecific.lastPeriod.setHours(0);
    value.taskSpecific.lastPeriod.setMinutes(0);
    value.taskSpecific.lastPeriod.setSeconds(0);
  }
  finishedTask(taskID, value.taskSpecific, startDate)
  logger4js.trace("TaskTest Done %s", taskID);
}

function visboTaskScheduleInit() {
	logger4js.trace("Visbo Task Schedule Init! ");
	setInterval(checkNextRun, 5000);
}

module.exports = {
	visboTaskScheduleInit: visboTaskScheduleInit
};
