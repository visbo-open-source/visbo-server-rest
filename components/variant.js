var logging = require('./../components/logging');
var debuglevel = 9;

// return the variant index for a given variantName, -1 if not found
findVariant = function(vp, variantName) {
	// debuglog(9, "findVariant Check Lock for VP %s for User %s and Variant :%s: Locks %O", vp._id, useremail, variantName, vp.lock);
	if (vp.variant) {
		for (i = 0; i < vp.variant.length; i++) {
			// debuglog(9, "Check Variant: Nr. %d %s", i, vp.variant[i].variantName);
			if (vp.variant[i].variantName == variantName){ // Variant found
				return i;
			}
		}
	}
	debuglog(8, "findVariant Variant :%s: not found", variantName);
	return -1;
};

// return the variant index for a given variantId, -1 if not found
findVariantId = function(vp, variantId) {
	// debuglog(9, "findVariant Check Lock for VP %s for User %s and Variant :%s: Locks %O", vp._id, useremail, variantId, vp.lock);
	if (vp.variant) {
		for (i = 0; i < vp.variant.length; i++) {
			// debuglog(9, "Check Variant: Nr. %d %s", i, vp.variant[i].variantId);
			if (vp.variant[i]._id == variantId){ // Variant found
				return i;
			}
		}
	}
	debuglog(8, "findVariant Variant :%s: not found", variantId);
	return -1;
};

module.exports = {
	findVariant: findVariant,
	findVariantId: findVariantId
};
