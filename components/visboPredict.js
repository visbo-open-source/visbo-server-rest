var mongoose = require('mongoose');
require('../models/visboprojectversion');
require('../models/vcsetting');
require('../models/predictkm');

var exec = require('child_process').exec;
var fs = require('fs');

var systemVC = require('./../components/systemVC');
var VisboProjectVersion = mongoose.model('VisboProjectVersion');
var VCSetting = mongoose.model('VCSetting');
var PredictKM = mongoose.model('PredictKM');

var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var errorHandler = require('./../components/errorhandler').handler;

function kmCollect(task, finishedTask, vcSystemId) {
	var startDate = new Date();
	logger4js.trace('kmCollect Execute %s System %s', task && task._id, vcSystemId);
	if (!task || !task.value) finishedTask(task, false);
	var querySetting = {
		type: '_VCConfig',
		name: 'EnableTraining',
		$or: [{ 'value.systemEnabled': true }, { 'value.sysVCEnabled': true }]
	};
	var queryVCSetting = VCSetting.find(querySetting);
	queryVCSetting.exec(function (err, vcSettings) {
		if (err){
			errorHandler(err, undefined, 'DB: Find kmCollect VC Settings', undefined);
			var actual = new Date();
			task.value.taskSpecific = {result: -1, resultDescription: 'Err: DB: Find kmCollect VC Settings', updated: actual.toISOString()};
			finishedTask(task, false);
			return;
		}
		var systemSetting = vcSettings.find(item => item.vcid == vcSystemId);
		if (!systemSetting) {
			logger4js.info('kmCollect Switched off for training');
			task.value.taskSpecific = {result: -1, resultDescription: 'Predict Training switched off in System'};
			finishedTask(task, false);
			return;
		}
		logger4js.trace('kmCollect Found VC Settings %s', vcSettings.length);
		var vcidList = [];
		vcSettings.forEach(item => {
			if (item.vcid != vcSystemId && item.value && item.value.sysVCEnabled) {
				vcidList.push(item.vcid);
			}
		});
		if (!vcidList.length) {
			logger4js.info('kmCollect Switched off for all VCs');
			task.value.taskSpecific = {result: 0, resultDescription: 'Predict Training switched off for all VCs'};
			finishedTask(task, false);
			return;
		}
		// Check if System Object is Enabled for Training
		logger4js.trace('kmCollect Found VC Enabled %s', vcidList.length);
		var query = [];
		query.push({$lookup: { from: 'visboprojects', localField: 'vpid', foreignField: '_id', as: 'vp' }});
		query.push({$project: { _id: 1, timestamp: 1, vpid: 1, keyMetrics: 1, vp: 1 }});
		query.push({$match: { keyMetrics: {$exists: true}, 'vp.vcid': {$in: vcidList} }});
		query.push({$addFields: { vcid: '$vp.vcid' }});
		query.push({$unwind: { path: '$vcid', preserveNullAndEmptyArrays: false }});
		query.push({$lookup: { from: 'predictkms', localField: '_id', foreignField: 'vpvid', as: 'predict' }});
		query.push({$match: { 'predict._id': {$exists: false} }});
		query.push({$limit: 100 });
		query.push({$project: { _id: 0, vpvid: '$_id', timestamp: 1, vpid: 1, vcid: 1, keyMetrics: 1 }});
		var queryVPV = VisboProjectVersion.aggregate(query);
		queryVPV.exec(function (err, listVPV) {
			if (err){
				task.value.taskSpecific = {result: -1, resultDescription: 'Err: DB: Find kmCollect VPVs'};
				finishedTask(task, false);
				return;
			}
			logger4js.debug('Task: kmCollect Result %d', listVPV.length);
			if (listVPV.length) logger4js.trace('Task: kmCollect First %O', listVPV[0]);

			// now we have the list of VPVs with keymetrics that we want to insert into predictkms
			PredictKM.insertMany(listVPV, function (err, resultList) {
				if (err){
					task.value.taskSpecific = {result: -1, resultDescription: 'Err: DB: Insert PredictKM'};
					finishedTask(task, false);
					return;
				}
				logger4js.debug('Task: kmCollect Inserted %d', resultList.length);
				var endDate = new Date();
				var duration = endDate.getTime() - startDate.getTime();
				task.value.taskSpecific = {result: listVPV.length, resultDescription: `Found ${listVPV.length} new VPVs for Training from ${endDate.toISOString()}`};
				logger4js.info('Task: kmCollect Result %d Duration %d ms', listVPV.length, duration);
				finishedTask(task, false);
			});
		});
	});
}

function isSameDay(first, second) {
	if (!first || !second) {
		return true;
	}
	var dateFirst = new Date(first);
	var dateSecond = new Date(second);
	dateFirst.setHours(0, 0, 0, 0);
	dateSecond.setHours(0, 0, 0, 0);
	return dateFirst.getTime() == dateSecond.getTime();
}

function convertFlat(vpv) {
	if (!vpv || !vpv.keyMetrics) return;
	vpv.costCurrentActual = vpv.keyMetrics.costCurrentActual;
	vpv.costCurrentTotal = vpv.keyMetrics.costCurrentTotal;
	vpv.costBaseLastActual = vpv.keyMetrics.costBaseLastActual;
	vpv.costBaseLastTotal = vpv.keyMetrics.costBaseLastTotal;
	vpv.timeCompletionCurrentActual = vpv.keyMetrics.timeCompletionCurrentActual;
	vpv.timeCompletionCurrentTotal = vpv.keyMetrics.timeCompletionCurrentTotal;
	vpv.timeCompletionBaseLastActual = vpv.keyMetrics.timeCompletionBaseLastActual;
	vpv.timeCompletionBaseLastTotal = vpv.keyMetrics.timeCompletionBaseLastTotal;
	vpv.timeDelayFinished = vpv.keyMetrics.timeDelayFinished;
	vpv.timeDelayUnFinished = vpv.keyMetrics.timeDelayUnFinished;
	vpv.endDateCurrent = vpv.keyMetrics.endDateCurrent;
	vpv.endDateBaseLast = vpv.keyMetrics.endDateBaseLast;
	vpv.deliverableCompletionCurrentActual = vpv.keyMetrics.deliverableCompletionCurrentActual;
	vpv.deliverableCompletionCurrentTotal = vpv.keyMetrics.deliverableCompletionCurrentTotal;
	vpv.deliverableCompletionBaseLastActual = vpv.keyMetrics.deliverableCompletionBaseLastActual;
	vpv.deliverableCompletionBaseLastTotal = vpv.keyMetrics.deliverableCompletionBaseLastTotal;
	vpv.deliverableDelayFinished = vpv.keyMetrics.deliverableDelayFinished;
	vpv.deliverableDelayUnFinished = vpv.keyMetrics.deliverableDelayUnFinished;
	delete vpv.keyMetrics;
}

function kmTraining(task, finishedTask, vcSystemId) {
	var startDate = new Date();
	logger4js.trace('kmTraining Execute %s System %s', task && task._id, vcSystemId);
	if (!task || !task.value) finishedTask(task, false);
	var querySetting = {
		vcid: vcSystemId,
		type: '_VCConfig',
		name: 'EnableTraining',
		'value.systemEnabled': true
	};
	var queryVCSetting = VCSetting.find(querySetting);
	queryVCSetting.exec(function (err, vcSettings) {
		if (err){
			var actual = new Date();
			task.value.taskSpecific = {result: -1, resultDescription: 'Err: DB: Find kmTraining VC Settings', updated: actual.toISOString()};
			finishedTask(task, false);
			return;
		}
		var systemSetting = vcSettings.find(item => item.vcid == vcSystemId);
		if (!systemSetting) {
			logger4js.info('kmTraining Switched off for training');
			task.value.taskSpecific = {result: -1, resultDescription: 'Predict Training switched off in System'};
			finishedTask(task, false);
			return;
		}

		var queryPredict = PredictKM.find({});
		queryPredict.sort({vpid:1, timestamp: -1});
		queryPredict.lean();
		queryPredict.exec(function (err, listVPV) {
			logger4js.debug('Task: kmTraining Starting Training for', listVPV.length);
			// filter duplicate entries same vpid and same day
			var oldVPV = {vpid: '', timestamp: new Date()};
			var reducedVPV = [];
			listVPV.forEach(vpv => {
				if (vpv.vpid.toString() == oldVPV.vpid && isSameDay(vpv.timestamp, oldVPV.timestamp)) {
					logger4js.trace('Task: kmTraining Skip Duplicate');
				} else {
					convertFlat(vpv);
					reducedVPV.push(vpv);
					oldVPV = vpv;
				}
			});
			var endDate = new Date();
			var duration = endDate.getTime() - startDate.getTime();
			if (reducedVPV.length < 500) {
				task.value.taskSpecific = {result: 0, resultDescription: `Not enough Versions for Training ${listVPV.length}`};
				logger4js.warn('Task: kmTraining Not enough results %d Duration %d ms', listVPV.length, duration);
				finishedTask(task, false);
				return;
			}
			logger4js.debug('Task: kmTraining Starting Training for', reducedVPV.length);

			var dir = systemVC.getPredictModel();
			if (!dir || !fs.existsSync(dir)) {
				task.value.taskSpecific = {result: 0, resultDescription: `Temp Folder for Training does not exists ${dir}`};
				logger4js.warn('Task: kmTraining Folder %s missing', dir);
				finishedTask(task, false);
				return;
			}
			var tmpfile = dir.concat('/predictkms.json');
			var content = JSON.stringify(reducedVPV);
			logger4js.debug('Task: kmTraining Converted to JSON %d kB', Math.round(content.length / 1024));
			fs.writeFileSync(tmpfile, content, {
													encoding: 'utf8',
													flag: 'w'
												});
			// export finished now run the training
			var cmd = './PredictKMTraining';
			cmd = cmd.concat(' \'', tmpfile, '\' ', dir);
			exec(cmd, function callback(error, stdout, stderr) {
				if (error) {
					logger4js.warn('Task: Error running Prediction Training', stderr);
					task.value.taskSpecific = {result: -1, resultDescription: 'Task: Error running Prediction Training'};
					finishedTask(task, false);
					return;
				}
				// var result = JSON.parse(stdout);
				var result = stdout;
				endDate = new Date();
				duration = endDate.getTime() - startDate.getTime();
				task.value.taskSpecific = {result: listVPV.length, resultDescription: `Found ${listVPV.length} VPVs for Training from ${endDate.toISOString()}`, detail: `${result}`};
				logger4js.info('Task: kmTraining Result %d Duration %d ms Output %s', listVPV.length, duration, result);
				finishedTask(task, false);
			});

		});
	});
}

module.exports = {
	kmCollect: kmCollect,
	kmTraining: kmTraining
};
