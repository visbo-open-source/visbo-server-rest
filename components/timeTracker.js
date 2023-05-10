var mongoose = require('mongoose');

var logModule = 'USER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var verifyManager = require('./../components/verifyVp').verifyManager;
var TimeTracker = mongoose.model('TimeTracker');
var User = mongoose.model('User');

async function createTimeEntry(userId, transaction) {
    var user = await User.findById(userId);
    var timeTracker = new TimeTracker({ userId: userId, status: 'New', name: user.name, ...transaction });
    await timeTracker.save();
    return timeTracker;
}

async function updateMany(transaction) {
    const list = transaction.approvalList;
    const array = [];
    for (var i = 0; i < list.length; i++) {
        var canUpdate = validateStatus(list[i].id);
        var isManager = verifyManager(list[i].vpid, transaction.approvalId);
        if (canUpdate && isManager) {
            await TimeTracker.updateOne({ _id: list[i].id }, { approvalDate: transaction.approvalDate, approvalId: transaction.approvalId, status: transaction.status });
            var updatedEntry = await TimeTracker.findById(list[i].id);
            array.push(updatedEntry);
        } else {
            logger4js.error('Error in updating time entry with id %s', list[i].id);
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

async function getTimeEntry(userId) {
    var timeEntry = await TimeTracker.find({ userId: userId });
    return timeEntry;
}


async function findEntry(id) {
    var timeEntry = await TimeTracker.findById(id);
    return timeEntry;
}

module.exports = {
    createTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    getTimeEntry,
    updateMany,
    findEntry,
    
};