var mongoose = require('mongoose');

var TimeTracker = mongoose.model('TimeTracker');

async function createTimeEntry(transaction) {
    var timeTracker = new TimeTracker(transaction);
    await timeTracker.save();
    return timeTracker;
}

async function updateTimeEntry(id, transaction) {
    var timeEntry = TimeTracker.findByIdAndUpdate(id, transaction);
    return timeEntry;
}

async function deleteTimeEntry(id) {
    var timeEntry = TimeTracker.findByIdAndRemove(id);
    return timeEntry;
}

async function getTimeEntry(id) {
    var timeEntry = TimeTracker.find({ userId: id });
    return timeEntry;
}

module.exports = {
    createTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    getTimeEntry
};