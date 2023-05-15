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
    return timeEntry ? timeEntry : [];
}

async function getSettings(email) {
    var settings = await VCSettings.find({ 'value.allRoles': { $elemMatch: { email: email, isSummaryRole: true } } });
    return settings;
}

async function filterSubRoles(list, email, vcid) {
    const subRolesList = [];
    list.forEach((item) => {
        if (item.isSummaryRole === true && item.email === email) {
            subRolesList.push({ vcid: vcid, subRoles: item.subRoleIDs });
        }
    });
    return subRolesList;
}

async function findSubRolesTimeTracker(roles) {
    const subRoleEntries = [];
    for(let role of roles) {
        const roleEntry = await parseRoles(role);
        subRoleEntries.push(roleEntry);
    }
    return subRoleEntries.flat();
}

async function parseRoles(lists) {
    const arrayList = [];
    for (let item of lists.subRoles) {
        const timeTracker = await TimeTracker.find({ roleId: item.key, status: 'No', vcid: lists.vcid });
        if (timeTracker) {
            arrayList.push(timeTracker);
        }
    }
    return arrayList.flat();
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
};