var mongoose = require('mongoose');

var logModule = 'USER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
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
        if (canUpdate) {
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

async function getTimeEntry(userId, status) {
    if (status) {
        var timeEntry = TimeTracker.find({ userId: userId , status: status});
    } else {
        var timeEntry = TimeTracker.find({ userId: userId });
    }    
    return timeEntry ? timeEntry : [];
}

async function findEntry(id) {
    const entryForUpdate = await TimeTracker.findById(id);
    return entryForUpdate ? entryForUpdate : [];
}

async function getSettings(email) {
    var settingList = await VCSettings.find({ 'value.allRoles': { $elemMatch: { email: email, isSummaryRole: true } } });
    return settingList;
}


function isOrgaRoleinternPerson(role) {
    const isSummaryRole = role && role.isSummaryRole? role.isSummaryRole : false;
    const hasSubRoles = role && role.subRoleIDs? (role.subRoleIDs?.length <= 0) : false;
    const isExternal = role && role.isExternRole? role.isExternRole : false;
    const result = (!isSummaryRole && !hasSubRoles && !isExternal);
	return result;
}

function generateIndexedRoles(allRoles) {
	let listOrga = [];
	if (!allRoles) {
		return listOrga;
	}
	allRoles.forEach(role => {
		listOrga[role.uid] = role;
	});
	return listOrga;
}

async function filterSubRoles(list, email, vcid) {
    const subRolesList = [];
    let listSubRoles = [];
    let subRolesFound = [];
    let listOrga = generateIndexedRoles(list);
    
    list.forEach(item => {
        if (item.isSummaryRole === true && item.email === email) {
            const hSubRoles = item.subRoleIDs;
            hSubRoles.forEach( hsr => listSubRoles.push(listOrga[hsr.key]));
            checkallSubroles(listSubRoles, listOrga, subRolesFound);
        }
    })

    function checkallSubroles(subRoleslist, listOrga, srFound) {        
        let srlist = [];
        subRoleslist?.forEach( sr => {
            let role = listOrga[sr.uid];
            if (isOrgaRoleinternPerson(role) && !subRolesFound.includes(role)) {
                subRolesFound.push(role)
            } else {
                const hSub = role.subRoleIDs;
                hSub?.forEach(hsr => srlist.push(listOrga[hsr.key]));
            }                    
        })
        srFound = srFound.concat(subRolesFound);  
        if (srlist.length > 0) {             
            checkallSubroles(srlist, listOrga, srFound);
        } 
    }

    subRolesList.push({ vcid: vcid.toString(), subRoles: subRolesFound });    
    return subRolesList;
}



async function findSubRolesTimeTracker(roles) {
    const subRoleEntries = [];
    for (let role of roles) {
        const roleEntry = await parseRoles(role);
        subRoleEntries.push(roleEntry);
    }
    return subRoleEntries.flat();
}

async function parseRoles(lists) {
    const arrayList = [];
    for (let item of lists.subRoles) {
        const timeTracker = await TimeTracker.find({ roleId: item.uid, status: 'No', vcid: lists.vcid });
        if (timeTracker) {
            arrayList.push(timeTracker);
        }
    }
    return arrayList.flat();
}

async function verifyManager(vpid, email, roleId) {
    const vp = await VCSettings.findOne({ vpid: vpid, type: 'organisation' });
    const role = vp.value.allRolles.find((item) => item.email === email);
    const subRoles = role.subRoleIDs.find((value) => value.key === roleId);
    if (subRoles) {
        return true;
    }
    else {
        return false;
    }
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