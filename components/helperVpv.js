var mongoose = require('mongoose');

var validate = require('./../components/validate');
var errorHandler = require('./../components/errorhandler').handler;

var VisboProject = mongoose.model('VisboProject');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');

var logModule = 'VPV';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

/* The updateVPVCount function is responsible for updating the VPV (Visbo Project Version) count of a specific project or its variant 
in the VisboProject database collection. 
It supports both direct updates to the main project and updates to a specific variant within the project.
 */
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
	// console.log('Update VP %s with vpvCount inc %d update: %O with %O', vpid, increment, updateQuery, updateUpdate);
	logger4js.debug('Update VP %s with vpvCount inc %d update: %O with %O', vpid, increment, updateQuery, updateUpdate);
		
	VisboProject.updateOne(updateQuery, updateUpdate, updateOption, function (err, result) {
		if (err){
			logger4js.error('Problem updating VP %s vpvCount: %s', vpid, err.message);
		}		
		logger4js.info('Updated VP %s vpvCount inc %d changed %d %d', vpid, increment, result.n, result.modifiedCount);
	});
};


/* The checkValidKeyMetrics function determines whether a given key metrics object (km) contains at least one valid metric. 
A metric is considered valid if both its current total and base last total values are greater than zero. 
The function checks three different metrics:
	Cost
	Time Completion
	Deliverable Completion
It returns:
	true	if at least one of these metrics meets the criteria
	false	otherwise
 */
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

/* The initVPV function initializes a new VisboProjectVersion object based on the input vpv object. 
It performs validation checks on essential fields before copying data to ensure data integrity. 
If the validation fails, the function logs an error and returns undefined. 
*/
/* It returns
	newVPV (Object | undefined) – A new VisboProjectVersion instance with copied attributes if validation succeeds.
	If validation fails, the function logs an error and returns undefined. 
*/
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
	newVPV.isCommited = vpv.isCommited || undefined;
	newVPV.complexity = vpv.complexity;
	newVPV.description = vpv.description;
	newVPV.businessUnit = vpv.businessUnit;
	newVPV.connectedTo = vpv.connectedTo;

	return newVPV;
}

/* The cleanupVPV function processes a VisboProjectVersion (vpv) object and removes or resets specific properties based on predefined conditions. 
This function helps maintain data integrity by cleaning up unnecessary or invalid values within project phases and results.

candidates are:
		phase.invoice: if not used the client sets it to 0
		phase.penalty: if not used the client sets it to 9999-12-31
		latestStart/earliestStart: if not used client sets it to -999
		minDauer/maxDauer: if not used the client sets it to 0

the cleanup has to be verified with the client that the client could handle it if no value is set
 */
/* It returns
The function modifies the input object in place.
If vpv is null or undefined, the function simply returns without making changes. 
*/
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

/* The cleanupKM function removes properties from a key metrics object by setting them to undefined. 
This function is useful for clearing out certain cost-related fields before processing or storing the object.
*/
/* It returns
The function modifies the input object in place.
If keyMetrics is null or undefined, the function returns immediately without making any changes. 
*/
function cleanupKM(keyMetrics) {
	if (!keyMetrics) {
		return;
	}
	keyMetrics.costCurrentActual = undefined;
	keyMetrics.costCurrentTotal = undefined;
	keyMetrics.costBaseLastActual = undefined;
	keyMetrics.costBaseLastTotal = undefined;
}

/* The getKeyAttributes function extracts essential attributes from a VisboProjectVersion object (newVPV) and returns a new instance containing only 
these key properties. This function is useful when only a subset of project version data is needed.
*/
/* it returns
	keyVPV 		A new VisboProjectVersion instance containing only selected key attributes.
	undefined 	if newVPV is null or undefined.
*/
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

/* The setKeyAttributes function updates the key attributes of a VisboProjectVersion object (newVPV) using values
from another VisboProjectVersion object (keyVPV). 
If keyVPV is not provided, newVPV remains unchanged. 
*/
/* It returns
	newVPV 				The modified newVPV object with updated attributes.
	undefined 			If newVPV is null or undefined.
 */
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

/* The createInitialVersions function is responsible for creating and storing a new VisboProjectVersion (VPV). 
If the new version is a "pfv" variant, the function also creates a base version from it. 
Additionally, it updates the version count and optionally calculates key metrics for the project. 
*/
/* It returns
		If an error occurs				the function calls errorHandler() and returns an error response.
		If the variant is "pfv"			a base project version is created, and a success response is sent.
		Otherwise,						a success response is sent after storing newVPV.
*/
function createInitialVersions(req, res, newVPV, calcKeyMetrics) {
	logger4js.debug('Store VPV for vpid %s/%s ', newVPV.vpid.toString(), newVPV.name);
	newVPV.timestamp = new Date();
	newVPV.save(function(err, oneVPV) {
		if (err) {
			errorHandler(err, res, 'DB: Create VP Template VPV(pfv) Save', 'Error creating Project Version ');
			return;
		}
		req.visboPFV = oneVPV;
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
				req.visboPFV = oneVPV;
				// update the version count only for the base version (variantName=''), not for pfv
				updateVPVCount(oneVPV.vpid, oneVPV.variantName, 1);
				return res.status(200).send({
					state: 'success',
					message: 'Successfully created new Project',
					vp: [ req.oneVP ]
				});
			});
		} else {
			// update the version count of the variant
			updateVPVCount(oneVPV.vpid, oneVPV.variantName, 1);
			return res.status(200).send({
				state: 'success',
				message: 'Successfully created new Project',
				vp: [ req.oneVP ]
			});
		}
	});
}

/* The setErloesWithSumOfInvoice function calculates the total sum of all invoice keys from the phases and results of a VisboProjectVersion (vpv).
If the sum is greater than 0, it assigns the total to vpv.Erloes. 
*/
/* It returns
		The function modifies vpv in place by updating its Erloes attribute.
		If vpv is null or undefined, the function returns immediately without making changes.
*/
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
