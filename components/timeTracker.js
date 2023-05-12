var mongoose = require('mongoose');

var logModule = 'USER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var verifyManager = require('./../components/verifyVp').verifyManager;
var TimeTracker = mongoose.model('TimeTracker');
var VCSettings = mongoose.model('VCSetting');

async function createTimeEntry(userId, transaction) {
    var timeTracker = new TimeTracker({ userId: userId, ...transaction });
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
    if (entry.status === 'Yes') {
        return false;
    } else {
        return true;
    }
}

async function getTimeEntry(userId) {
    var timeEntry = TimeTracker.find({ userId: userId });
    return timeEntry;
}


async function findEntry(id) {
    var timeEntry = await TimeTracker.findById(id);
    return timeEntry;
}

async function getSettings(email) {
    var settings = await VCSettings.find({ value: { allRoles: { $elemMatch: { email: email } } } });
    return settings;
}

async function filterSubRoles(list, email) {
    const subRolesList = [];
    list.forEach((item) => {
        if (item.isSammaryRole === true && item.email === email) {
            subRolesList.push(item.subRoleIDs);
        }
    });
    return subRolesList;
}

async function findSubRolesTimeTracker(roles) {
    const flatArray = roles.flat();
    const timeEntries = [];
    flatArray.forEach(async (item) => {
        const timeTracker = await TimeTracker.find({ $and: [{ roleId: item }, { status: 'No' }] });
        timeEntries.push(timeTracker);
    });
    return timeEntries.flat();
}

module.exports = {
    createTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    getTimeEntry,
    updateMany,
    filterSubRoles,
    getSettings,
    findSubRolesTimeTracker,
    findEntry
};