var mongoose = require('mongoose');

var TimeTracker = mongoose.model('TimeTracker');

async function createTimeEntry(userId, transaction) {
    var timeTracker = new TimeTracker({ userId: userId, status: 'New', ...transaction });
    await timeTracker.save();
    return timeTracker;
}

async function updateMany(transaction) {
    const array = [];
    transaction.approvalList.forEach(async (id) => {
        await TimeTracker.updateOne({ _id: id }, { approvalDate: transaction.approvalDate, approvalId: transaction.approvalId, status: transaction.status });
        var updatedEntry = await TimeTracker.findById(id);
        array.push(updatedEntry);
    });
    return array;
}

async function updateTimeEntry(id, transaction) {
    await TimeTracker.updateOne({ _id: id }, transaction);
    var updatedEntry = await TimeTracker.findById(id);
    return updatedEntry;
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
    getTimeEntry,
    updateMany
};