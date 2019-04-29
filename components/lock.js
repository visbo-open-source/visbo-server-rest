var logModule = "VP";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// check if Visbo Project has a valid lock
lockStatus = function(vp, useremail, variantName) {

	logger4js.trace("lockedVP Check Lock for VP %s for User %s and Variant :%s: Locks %O", vp._id, useremail, variantName, vp.lock);
	var result = {locked: false, lockindex: "-1"};
	var nowDate = new Date();
	if (vp.lock) {
		for (i = 0; i < vp.lock.length; i++) {
			logger4js.debug("Check Lock: Nr. %d %O %s", i, vp.lock[i], variantName);
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
	// logger4js.debug("lockedVP check :%s: result %s", vp._id, result);
	return result;
};

// cleanup expired locks
lockCleanup = function(listLock) {
	var listLockNew = [];
	var dateNow = new Date();
	logger4js.debug("lock CleanUP expired locks from list %d ", listLock.length);
	for (var i = 0; i < listLock.length; i++) {
		if (listLock[i].expiresAt >=  dateNow ){			// the lock is still valid
			listLockNew.push(listLock[i]) 							// keep the lock
		} else {
			logger4js.debug("POST Lock check lock %O expired %s", listLock[i], dateNow);
		}
	}
	return listLockNew;
};

module.exports = {
	lockStatus: lockStatus,
	lockCleanup: lockCleanup
};
