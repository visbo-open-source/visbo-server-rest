var moment = require('moment');


// check if Visbo Project is Locked
lockedVP = function(vp, useremail, variantName) {
	// debuglog(9, "lockedVP Check Lock for VP %s for User %s and Variant :%s: Locks %O", vp._id, useremail, variantName, vp.lock);
	var result = false;
	var nowDate = new Date();
	if (!vp.lock) {
		result = false;	// no lock exists at all
	} else {
		for (i = 0; i < vp.lock.length; i++) {
			// debuglog(9, "Check Lock: Nr. %d %s", i, vp.lock[i]);
			if (vp.lock[i].expiresAt >= nowDate){	// lock is valid
				if (!variantName || vp.lock[i].variantName == variantName){ // all variants or a specific
					//lock for the current variant found
					result = vp.lock[i].email == useremail ? false : true;
				}
			}
		}
	}
	// debuglog(8, "lockedVP check :%s: result %s", vp._id, result);
	return false;
};

module.exports = {
	lockedVP: lockedVP
};
