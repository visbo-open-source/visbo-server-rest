var mongoose = require('mongoose');
require('../models/visboproject');

var VisboProject = mongoose.model('VisboProject');

var errorHandler = require('./../components/errorhandler').handler;
var validate = require('./../components/validate');
var logModule = 'VP';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);


// check if Project has a valid lock/* 

 /* The lockStatus function checks whether a VisboProject (vp) is locked for a given user and variant. 
It iterates through the lock array in vp and determines if an active lock exists for the specified variantName.
If a lock is found, it checks whether the current user (useremail) is the one who locked it. 
*/
/* It returns
result  	– An object indicating lock status:
			false; lockindex: '-1'			If the project is not locked
			false; lockindex: number		If the project is locked but by the same user (number = index in lock-array)
			true; lockindex: number			If the project is locked by another user  (number = index in lock-array)
*/
function lockStatus(vp, useremail, variantName) {

	logger4js.trace('lockedVP Check Lock for VP %s for User %s and Variant :%s: Locks %O', vp._id, useremail, variantName, vp.lock);
	var result = {locked: false, lockindex: '-1'};
	var nowDate = new Date();
	if (vp.lock) {
		for (var i = 0; i < vp.lock.length; i++) {
			logger4js.debug('Check Lock: Nr. %d %O %s', i, vp.lock[i], variantName);
			if (vp.lock[i].expiresAt >= nowDate){	// lock is valid
				if (vp.lock[i].variantName == variantName){ // lock for the specific variant
					//lock for the current variant found
					result.locked = vp.lock[i].email == useremail ? false : true;
					result.lockindex = i;
					return result;
				}
			}
		}
	}
	// logger4js.debug('lockedVP check :%s: result %s', vp._id, result);
	return result;
}

// cleanup expired locks
function lockCleanup(listLock) {
	var listLockNew = [];
	var dateNow = new Date();
	logger4js.debug('lock CleanUP expired locks from list %d ', listLock.length);
	for (var i = 0; i < listLock.length; i++) {
		if (listLock[i].expiresAt >=  dateNow ){			// the lock is still valid
			listLockNew.push(listLock[i]); 							// keep the lock
		} else {
			logger4js.debug('POST Lock check lock %O expired %s', listLock[i], dateNow);
		}
	}
	return listLockNew;
}

/* The cleanupAllVPLock function removes expired locks from all VisboProject records in the database. This is driven by System Tasks
It determines the expiration threshold based on the last successful execution date (or a default date) and removes locks that have expired.
 */
function cleanupAllVPLock(task, finishedTask) {
	logger4js.debug('cleanuplock Execute %s', task && task._id);
	if (!task || !task.value) finishedTask(task, false);
	var startUnLock = new Date('2018-01-01');
	if (!task.value.taskSpecific) task.value.taskSpecific = {};
	if (validate.validateDate(task.value.taskSpecific.lastSuccess, false)) {
		startUnLock = new Date(task.value.taskSpecific.lastSuccess);
		startUnLock.setMonth(startUnLock.getMonth()-1); // one month back
		logger4js.debug('cleanuplock startUnLock %O', startUnLock);
	}

	var actDate = new Date();
	var updateQuery = {updatedAt: {$gt: startUnLock}, deletedAt: {$exists: false}, 'lock.expiresAt': {$lt: actDate}};
	var updateOption = {upsert: false};
	var updateUpdate = {$pull: { lock: { expiresAt: {$lt: actDate}}}};

	VisboProject.updateMany(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			errorHandler(err, undefined, 'DB: Problem updating all VPs', undefined);
			task.value.taskSpecific = {result: -1, resultDescription: 'Err: DB: cleanup expired Locks'};
			finishedTask(task, false);
			return;
		}
		task.value.taskSpecific = {lastSuccess: actDate, result: result.modifiedCount, resultDescription: `Updated ${result.modifiedCount} expired Lock Entries`};
		logger4js.info('Task: cleanuplock Result %d', result.modifiedCount);
		finishedTask(task, false);
	});
}

module.exports = {
	lockStatus: lockStatus,
	lockCleanup: lockCleanup,
	cleanupAllVPLock: cleanupAllVPLock
};
