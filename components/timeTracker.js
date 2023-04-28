var mongoose = require('mongoose');

var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var TimeTracker = mongoose.model('TimeTracker');

async function createTimeEntry(userId, transaction) {
    var timeTracker = new TimeTracker({ userId: userId, ...transaction });
    await timeTracker.save();
    return timeTracker;
}

async function updateTimeEntry(id, transaction) {
    const entry = await TimeTracker.findById(id);
    if (entry.status === 'Approved') {
        logger4js.error('Cannot update approved time record with id: %s', id);
    } else {
        await TimeTracker.updateOne({ _id: id }, transaction);
        var updatedEntry = await TimeTracker.findById(id);
        return updatedEntry;
    }
}

async function deleteTimeEntry(id) {
    var timeEntry = await TimeTracker.findByIdAndRemove(id);
    return timeEntry;
}

async function getTimeEntry(id) {
    var timeEntry = await TimeTracker.find({ userId: id });
    return timeEntry;
}

module.exports = {
    createTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    getTimeEntry
};