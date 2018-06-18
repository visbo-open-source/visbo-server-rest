var logging = require('./../components/logging');

// check if Visbo Project has a valid lock
lockedVP = function(vp, useremail, variantName) {
	// debuglog(9, "lockedVP Check Lock for VP %s for User %s and Variant :%s: Locks %O", vp._id, useremail, variantName, vp.lock);
	var result = {locked: false, lockindex: "-1"};
	var nowDate = new Date();
	if (vp.lock) {
		for (i = 0; i < vp.lock.length; i++) {
			// debuglog(9, "Check Lock: Nr. %d %s", i, vp.lock[i]);
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
	// debuglog(8, "lockedVP check :%s: result %s", vp._id, result);
	return result;
};

// cleanup expired locks
lockCleanupVP = function(listLock) {
	var listLockNew = [];
	var dateNow = new Date();
	debuglog("VP", 9, "lock CleanUP expired locks from list %d ", listLock.length);
	for (var i = 0; i < listLock.length; i++) {
		if (listLock[i].expiresAt >=  dateNow ){			// the lock is still valid
			listLockNew.push(listLock[i]) 							// keep the lock
		} else {
			debuglog("VP", 9, "POST Lock check lock %O expired %s", listLock[i], dateNow);
		}
	}
	return listLockNew;
};

module.exports = {
	lockedVP: lockedVP,
	lockCleanupVP: lockCleanupVP
};
