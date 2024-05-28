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
    if (list) {
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

async function getTimeEntry(userId, status, startDate, endDate) {
    var query = {};
	query.userId = userId;
    // ur:2024.05.08 new
    if (startDate && endDate){        
    query.date = { $gte: startDate , $lte: endDate};
    } 
    query.deletedAt =  {$exists: false};
    
    // ur:2024.05.08 new 

	// prevent that the user gets access to TimeRecords in a later deleted VC. 
	query['vc.deletedAt'] = {$exists: false}; // Do not deliver any VP from a deleted VC
    if (status) {
        query.status = status
    }
	logger4js.trace('Get TimeRecords Query %O', query);
	var timeEntry = TimeTracker.find(query);    
    return timeEntry ? timeEntry : [];
}


function getTimeTrackerRecords(vcid, vpid, userId, status) {
	var query = {};
    var listVTR = [];
   
    TimeTracker.aggregate([{ $sort: { vcid: 1, vpid: 1, name: -1, roleId: 1, date: -1 } }])
        .exec((error, result) => {
            if (error) {
                console.log(error);
            } else {
                console.log("Anzahl Einträge: %d ", result.length);
                console.log(result);
                listVTR = result.filter(item => ((item.vcid.toString() == vcid) && (item.vpid.toString() == vpid) && (item.userId.toString() == userId)));
                console.log("Anzahl Einträge gefiltert: %d ", listVTR.length);
            };
        });	
}

async function findEntry(id) {
    const entryForUpdate = await TimeTracker.findById(id);
    return entryForUpdate ? entryForUpdate : [];
}

async function getSettings(email) {
    //var settingList = await VCSettings.find({"type": "organisation", 'value.allRoles': {$elemMatch: { 'email': email, 'isSummaryRole': { $exists: true }}}});	
    var settingList = await VCSettings.find({"type": "organisation", 'value.allRoles': {$elemMatch: { 'email': email}}}).lean();	
    //var settingList = await VCSettings.find({ 'value.allRoles': { $elemMatch: { email: email, isSummaryRole: true } } });
    return settingList;
}


function isOrgaRoleinternPerson(role) {
    var result = false;

    if (role) {
        const isSummaryRole = role.isSummaryRole;
        const hasSubRoles = role.subRoleIDs ? (role.subRoleIDs.length > 0) : false;
        const isExternal = role.isExternRole ? role.isExternRole : false;
        result = (!isSummaryRole && !hasSubRoles && !isExternal);
    }

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

function generateIndexedTimeRecords(timerecordList, returnVPIDlist) {
    var indexedTimeRecords = [];
    var vpIDList = [];
    timerecordList?.forEach(item => {
        if (!indexedTimeRecords[item.vpid]) {
            vpIDList.push(item.vpid);
            indexedTimeRecords[item.vpid] = [];
        }
        indexedTimeRecords[item.vpid].push(item) ;        
    });
    if (returnVPIDlist) {
        return vpIDList;
    } else {
        return indexedTimeRecords; 
    }
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
            if (isOrgaRoleinternPerson(role))
            {
                if (!subRolesFound.includes(role)) {
                    subRolesFound.push(role)
                }
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
    if (subRolesFound.length > 0) {
        subRolesList.push({ vcid: vcid.toString(), subRoles: subRolesFound });    
    }
    return subRolesList;
}



async function findSubRolesTimeTracker(roles, startDate, endDate) {
    const subRoleEntries = [];
    for (let role of roles) {
        const roleEntry = await parseRoles(role, startDate, endDate);
        if (roleEntry.length > 0) {
            subRoleEntries.push(roleEntry);
        }
    }
    return subRoleEntries.flat();
}

async function parseRoles(lists, startDate, endDate) {
    const arrayList = [];
    for (let item of lists.subRoles) {
        // only entries with status NO
        //const timeTracker = await TimeTracker.find({ roleId: item.uid, status: 'No', vcid: lists.vcid });
        var query = {};
        // ur:2024.05.08 new
        if (startDate && endDate){          
            query.date = { $gte: startDate , $lte: endDate};       
        }
        // ur:2024.05.08 new 
        query.vcid = lists.vcid;
        query.roleId = item.uid;      
        query.deletedAt =  {$exists: false};
        query['vc.deletedAt'] = {$exists: false}; // Do not deliver any VP from a deleted VC      
        const timeTracker = await TimeTracker.find(query);
        // const timeTracker = await TimeTracker.find({ roleId: item.uid, vcid: lists.vcid });
        if (timeTracker.length > 0) {
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
    getTimeTrackerRecords,
    updateMany,
    filterSubRoles,
    getSettings,
    findSubRolesTimeTracker,
    findEntry,
    generateIndexedTimeRecords,
    isOrgaRoleinternPerson
};