var logModule = "VP";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// return the variant index for a given variantName, -1 if not found
function findVariant(vp, variantName) {
	logger4js.trace("findVariant Check Lock for VP %s and Variant :%s: Locks %O", vp._id, variantName, vp.lock);
	if (vp.variant) {
		for (var i = 0; i < vp.variant.length; i++) {
			// logger4js.debug("Check Variant: Nr. %d %s", i, vp.variant[i].variantName);
			if (vp.variant[i].variantName == variantName){ // Variant found
				return i;
			}
		}
	}
	logger4js.debug("findVariant Variant :%s: not found", variantName);
	return -1;
}

// return the variant index for a given variantId, -1 if not found
function findVariantId(vp, variantId) {
	logger4js.trace("findVariant Check Lock for VP %s for Variant :%s: Locks %O", vp._id, variantId, vp.lock);
	if (vp.variant) {
		for (var i = 0; i < vp.variant.length; i++) {
			// logger4js.trace("Check Variant: Nr. %d %s", i, vp.variant[i].variantId);
			if (vp.variant[i]._id == variantId){ // Variant found
				return i;
			}
		}
	}
	logger4js.debug("findVariant Variant :%s: not found", variantId);
	return -1;
}

module.exports = {
	findVariant: findVariant,
	findVariantId: findVariantId
};
