var mongoose = require('mongoose');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
// var VisboPortfolio = mongoose.model('VisboPortfolio');
// var VCSetting = mongoose.model('VCSetting');

var logModule = 'VPV';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

// updates the VPV Count in the VP after create/delete/undelete VISBO Project
var updateVPVCount = function(vpid, variantName, increment){
	var updateQuery = {_id: vpid};
	var updateOption = {upsert: false};
	var updateUpdate;

	if (!variantName) {
		updateUpdate = {$inc: {vpvCount: increment}};
	} else {
		// update a variant and increment the version counter
		updateQuery['variant.variantName'] = variantName;
		updateUpdate = {$inc : {'variant.$.vpvCount' : increment} };
	}
	logger4js.debug('Update VP %s with vpvCount inc %d update: %O with %O', vpid, increment, updateQuery, updateUpdate);
	VisboProject.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error('Problem updating VP %s vpvCount: %s', vpid, err.message);
		}
		logger4js.trace('Updated VP %s vpvCount inc %d changed %d %d', vpid, increment, result.n, result.nModified);
	});
};

// check if keyMetrics from Client is valid
function checkValidKeyMetrics(km) {
	var countKM = 0;
	if (km) {
		if (km.costCurrentTotal > 0 && km.costBaseLastTotal > 0) {
			countKM += 1;
		}
		if (km.timeCompletionCurrentTotal > 0 && km.timeCompletionBaseLastTotal > 0) {
			countKM += 1;
		}
		if (km.deliverableCompletionCurrentTotal > 0 && km.deliverableCompletionBaseLastTotal > 0) {
			countKM += 1;
		}
	}
	return countKM > 0;
}

function initVPV(vpv) {
	var newVPV = new VisboProjectVersion();
	if (!vpv
		|| !validate.validateName(vpv.variantDescription, true)
		|| !validate.validateName(vpv.ampelErlaeuterung, true)
		|| !validate.validateName(vpv.VorlagenName, true)
		|| !validate.validateName(vpv.description, true)
		|| !validate.validateDate(vpv.timestamp, true)
		|| !validate.validateDate(vpv.startDate, true)
		|| !validate.validateDate(vpv.endDate, true)
		|| !validate.validateDate(vpv.earliestStartDate, true)
		|| !validate.validateDate(vpv.latestStartDate, true)
	) {
		logger4js.info('InitVPV bad content', JSON.stringify(vpv));
		return undefined;
	}

	// keep unchangable attributes
	newVPV.name = vpv.name;
	newVPV.vpid = vpv.vpid;
	if (vpv.variantName) {
		newVPV.variantName = vpv.variantName;
	} else {
		newVPV.variantName = '';
	}
	if (vpv.timestamp && Date.parse(vpv.timestamp)) {
		newVPV.timestamp = new Date(vpv.timestamp);
	} else {
		newVPV.timestamp = new Date();
	}
	newVPV.variantDescription = vpv.variantDescription;
	newVPV.Risiko = vpv.Risiko;
	newVPV.StrategicFit = vpv.StrategicFit;
	newVPV.customDblFields = vpv.customDblFields;
	newVPV.customStringFields = vpv.customStringFields;	
	newVPV.customBoolFields = vpv.customBoolFields;
	newVPV.actualDataUntil = vpv.actualDataUntil;
	newVPV.Erloes = vpv.Erloes;
	newVPV.startDate = vpv.startDate;
	newVPV.endDate = vpv.endDate;
	newVPV.earliestStart = vpv.earliestStart;
	newVPV.earliestStartDate = vpv.earliestStartDate;
	newVPV.latestStart = vpv.latestStart;
	newVPV.latestStartDate = vpv.latestStartDate;
	newVPV.vpStatus = vpv.vpStatus;
	newVPV.ampelStatus = vpv.ampelStatus;
	newVPV.ampelErlaeuterung = vpv.ampelErlaeuterung;
	newVPV.VorlagenName = vpv.VorlagenName;
	newVPV.Dauer = vpv.Dauer;
	newVPV.AllPhases = vpv.AllPhases;
	newVPV.hierarchy = vpv.hierarchy;
	newVPV.complexity = vpv.complexity;
	newVPV.description = vpv.description;
	newVPV.businessUnit = vpv.businessUnit;

	return newVPV;
}

// cleanup properties that the client sets as default but are not used
// candidates are:
//		phase.invoice: if not used the client sets it to 0
//		phase.penalty: if not used the client sets it to 9999-12-31
//		latestStart/earliestStart: if not used client sets it to -999
//		minDauer/maxDauer: if not used the client sets it to 0
//
// the cleanup has to be verified with the client that the client could handle it if no value is set

function cleanupVPV(vpv) {
	if (!vpv) {
		return;
	}
	// if (vpv.latestStart == -999) { vpv.latestStart = undefined; }
	// if (vpv.earliestStart == -999) { vpv.earliestStart = undefined; }
	if (vpv.AllPhases) {
		vpv.AllPhases.forEach(phase => {
			// if (phase.latestStart == -999) { phase.latestStart = undefined; }
			// if (phase.earliestStart == -999) { phase.earliestStart = undefined; }
			if (phase?.invoice?.Key == 0 && phase.invoice.Value == 0) { phase.invoice = undefined; }
			if (phase?.penalty?.Key.indexOf('9999-12-31') == 0 && phase.penalty.Value == 0) { phase.penalty = undefined; }
			if (phase.AllResults) {
				phase.AllResults.forEach(result => {
					if (result.invoice && result.invoice.Key == 0 && result.invoice.Value == 0) { result.invoice = undefined; }
					if (result.penalty && result.penalty.Key.indexOf('9999-12-31') == 0 && result.penalty.Value == 0) { result.penalty = undefined; }
				});
			}
		});
	}
}

function cleanupKM(keyMetrics) {
	if (!keyMetrics) {
		return;
	}
	keyMetrics.costCurrentActual = undefined;
	keyMetrics.costCurrentTotal = undefined;
	keyMetrics.costBaseLastActual = undefined;
	keyMetrics.costBaseLastTotal = undefined;
	keyMetrics.costCurrentTotalPredict = undefined;
}

function getKeyAttributes(newVPV) {
	if (!newVPV) return undefined;
	var keyVPV = new VisboProjectVersion();
	keyVPV.name = newVPV.name;
	keyVPV.variantName = newVPV.variantName;
	keyVPV.VorlagenName = newVPV.VorlagenName;
	keyVPV._id = newVPV._id;
	keyVPV.vpid = newVPV.vpid;
	keyVPV.timestamp = newVPV.timestamp;
	return keyVPV;
}

function setKeyAttributes(newVPV, keyVPV) {
	if (!newVPV) return undefined;
	if (!keyVPV) return newVPV;

	newVPV.name = keyVPV.name;
	newVPV.variantName = keyVPV.variantName;
	newVPV.VorlagenName = keyVPV.VorlagenName;
	newVPV._id = keyVPV._id;
	newVPV.vpid = keyVPV.vpid;
	newVPV.timestamp = keyVPV.timestamp;
	return newVPV;
}

function createInitialVersions(req, res, newVPV, calcKeyMetrics) {
	logger4js.debug('Store VPV for vpid %s/%s ', newVPV.vpid.toString(), newVPV.name);
	newVPV.timestamp = new Date();
	newVPV.save(function(err, oneVPV) {
		if (err) {
			errorHandler(err, res, 'DB: Create VP Template VPV(pfv) Save', 'Error creating Project Version ');
			return;
		}
		// req.visboPFV = oneVPV;
		// update the version count of the base version or the variant
		updateVPVCount(oneVPV.vpid, oneVPV.variantName, 1);
		if (oneVPV.variantName == 'pfv') {
			// now create a copy of the pfv version as the first version of the project
			var baseVPV = initVPV(oneVPV);
			baseVPV.variantName = '';
			baseVPV.timestamp = new Date();
			baseVPV.keyMetrics = calcKeyMetrics ? calcKeyMetrics(baseVPV, oneVPV, req.visboOrganisation) : undefined;
			if (baseVPV.keyMetrics) {
				baseVPV.keyMetrics.baselineDate = oneVPV.timestamp;
				baseVPV.keyMetrics.baselineVPVID = oneVPV._id;
			}
			baseVPV.save(function(err, oneVPV) {
				if (err) {
					errorHandler(err, res, 'DB: Create VP Template VPV Save', 'Error creating Project Version ');
					return;
				}
				// req.visboPFV = oneVPV;
				updateVPVCount(oneVPV.vpid, oneVPV.variantName, 1);
				return res.status(200).send({
					state: 'success',
					message: 'Successfully created new Project',
					vp: [ req.oneVP ]
				});
			});
		} else {
			return res.status(200).send({
				state: 'success',
				message: 'Successfully created new Project',
				vp: [ req.oneVP ]
			});
		}
	});
}


function setErloesWithSumOfInvoice(vpv) {

	var sumOfInvoice = 0;
	if (!vpv) {
		return;
	}

	if (vpv.AllPhases) {
		vpv.AllPhases.forEach(phase => {
			if (phase && phase.invoice && phase.invoice.Key && phase?.invoice?.Key !== 0 ) { sumOfInvoice += phase.invoice.Key; }
			if (phase.AllResults) {
				phase.AllResults.forEach(result => {
					if (result && result.invoice && result.invoice.Key && result?.invoice?.Key !== 0  ) { sumOfInvoice += result.invoice.Key; }
				});
			}
		});	

		if (sumOfInvoice > 0 ) {
			vpv.Erloes = sumOfInvoice;
		}	
	}
}


module.exports = {
	updateVPVCount: updateVPVCount,
	createInitialVersions: createInitialVersions,
	initVPV: initVPV,
	cleanupVPV: cleanupVPV,
	getKeyAttributes: getKeyAttributes,
	setKeyAttributes: setKeyAttributes,
	checkValidKeyMetrics: checkValidKeyMetrics,
	cleanupKM: cleanupKM,
	setErloesWithSumOfInvoice: setErloesWithSumOfInvoice
};
