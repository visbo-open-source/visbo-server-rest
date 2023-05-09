var mongoose = require('mongoose');

var logModule = 'VC';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var TimeTracker = mongoose.model('TimeTracker');

async function createTimeEntry(userId, transaction) {
    var timeTracker = new TimeTracker({ userId: userId, status: 'New', ...transaction });
    await timeTracker.save();
    return timeTracker;
}

async function updateMany(transaction) {
    const list = transaction.approvalList;
    const array = [];
    for (var i = 0; i < list.length; i++) {
        var canUpdate = validateStatus(list[i]);
        if (canUpdate) {
            await TimeTracker.updateOne({ _id: list[i] }, { approvalDate: transaction.approvalDate, approvalId: transaction.approvalId, status: transaction.status });
            var updatedEntry = await TimeTracker.findById(list[i]);
            array.push(updatedEntry);
        } else {
            logger4js.error('Error in updating approved time entry with id %s', list[i]);
            continue;
        }
    }
    return array;
}

async function updateTimeEntry(id, transaction) {
    var canUpdate = validateStatus(id);
    if (canUpdate) {
        await TimeTracker.updateOne({ _id: id }, transaction);
        var updatedEntry = await TimeTracker.findById(id);
        return updatedEntry;
    } else {
        logger4js.error('Error in updating approved time entry with id %s', id);
        return;
    }
}

async function deleteTimeEntry(id) {
    var timeEntry = await TimeTracker.findByIdAndRemove(id);
    return timeEntry;
}

async function validateStatus(id) {
    var entry = TimeTracker.findById(id);
    if (entry.status === 'Approved') {
        return false;
    } else {
        return true;
    }
}

async function getTimeEntry(id) {
    var timeEntry = await TimeTracker.find({ userId: id });
    return timeEntry;
}

module.exports = {
    createTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    getTimeEntry,
    updateMany
};