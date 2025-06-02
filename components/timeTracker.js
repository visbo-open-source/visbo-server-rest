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

/* The updateMany function processes a list of time tracking entries that need to be updated with an approval date, approval ID, and status. 
It validates each entry before updating it and returns an array of successfully updated entries.
 */
/* Returns
        array of updated TimeTracker entries    (if updates were successful).
        empty array                             (if no entries were updated or approvalList is empty/null). 
*/
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

/* The updateTimeEntry function updates a single time tracking entry in the TimeTracker collection. 
Before updating, it validates the entry's status using validateStatus(id). If validation fails, it logs an error and do not change anything.
 */
/* Returns
        The updated time entry  - if successful
        undefined               - if validation fails or the update is unsuccessful
 */
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

/* The deleteTimeEntry function deletes a time tracking entry from the TimeTracker collection based on the provided ID. 
It returns the deleted entry if successful.
 */
async function deleteTimeEntry(id) {
    var timeEntry = await TimeTracker.findByIdAndRemove(id);
    return timeEntry;
}

/* The validateStatus function checks the status of a time tracking entry in the TimeTracker collection.
It ensures that an entry cannot be updated if its status is "Yes".
*/
async function validateStatus(id) {
    var entry = TimeTracker.findById(id);
    if (entry.status === 'Yes') {
        return false;
    } else {
        return true;
    }
}


/* The getTimeEntry function retrieves time tracking records for a specified user. It filters records based on status, date range, 
and ensures that deleted records and records from deleted VCs are not returned.
*/
/* Returns
            array of time tracking records       - if records are found
            empty array                          - if no matching records exist 
*/
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

/* The getTimeTrackerRecords function retrieves time tracking records from the TimeTracker collection using an aggregation query. 
It sorts records based on various fields and then filters them based on vcid, vpid, and userId.
*/
/* Returns
        array of time tracking records      (if found).
        empty array                         (if no records match the criteria).
 */
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
/* The getSettings function retrieves organization settings for a given user based on their email address from the VCSettings collection. 
It filters settings where the email appears in the value.allRoles field.
 */
/* Returns
        array of settings         (if found).
        empty array              (if no matching settings exist). 
*/
async function getSettings(email) {
    //var settingList = await VCSettings.find({"type": "organisation", 'value.allRoles': {$elemMatch: { 'email': email, 'isSummaryRole': { $exists: true }}}});	
    var settingList = await VCSettings.find({"type": "organisation", 'value.allRoles': {$elemMatch: { 'email': email}}}).lean();	
    //var settingList = await VCSettings.find({ 'value.allRoles': { $elemMatch: { email: email, isSummaryRole: true } } });
    return settingList;
}

/* The isOrgaRoleinternPerson function determines whether a given role represents an internal person within an organization. 
It returns true if the role is not a summary role, has no sub-roles, and is not marked as external.
*/
/* Returns
        true        (if the role qualifies as an internal person).
        false       (otherwise, or if the role object is missing/invalid).
 */
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

/* The generateIndexedRoles function converts an array of roles into an indexed object (associative array) 
where each role is stored under its unique uid key. This makes lookup operations more efficient.
*/
/* Returns
        object                      where keys are uid values and values are role objects.
        empty object {}             if allRoles is null or undefined.
 */
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
/* The generateIndexedTimeRecords function organizes a list of time records by vpid (Visbo Project ID) into an indexed structure. 
It also allows retrieving a list of unique vpids when returnVPIDlist is true.
*/
/* Returns
        object indexed by vpid  (if returnVPIDlist == false):
            {
                "vp1": [ { vpid: "vp1", userId: "user123", date: "2024-02-18", hours: 5 } ],
                "vp2": [ { vpid: "vp2", userId: "user456", date: "2024-02-19", hours: 3 } ]
            }
        array of unique vpids   (if returnVPIDlist == true):
            [ "vp1", "vp2" ]

        empty array {} or []    if timerecordList is empty or null.
*/
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

/* The filterSubRoles function filters and retrieves all sub-roles associated with a summary role for a given email within a vcid. 
It recursively checks and collects sub-roles, ensuring that only internal person roles are included.
*/
/* Returns
        array of objects, where each object contains:
                [
                    { vcid: "123", subRoles: [{ uid: "role456", name: "Manager" }, { uid: "role789", name: "Employee" }] }
                ]
        empty array []      if no sub-roles are found 
*/
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

/* The findSubRolesTimeTracker function retrieves time tracking records for a given list of roles within a specified date range.
 It calls the parseRoles function for each role, collects the results, and flattens the final array.
*/
/* Returns
        array of time tracking entries for the given roles:
            [
                { roleId: "role1", userId: "user123", date: "2024-02-18", hours: 5 },
                { roleId: "role2", userId: "user456", date: "2024-02-19", hours: 3 }
            ]
        empty array []          If no entries are found
 */
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

/* The parseRoles function retrieves time tracking records from the TimeTracker collection for each sub-role within a specified date range. It ensures that:
        - Only entries within the provided startDate and endDate are retrieved.
        - Only active time entries (deletedAt does not exist) are returned.
        - No time entries from deleted VCs are included. 
*/
/* Returns
        array of time tracking entries:
            [
                { roleId: "role1", userId: "user123", date: "2024-02-18", hours: 5 },
                { roleId: "role2", userId: "user456", date: "2024-02-19", hours: 3 }
            ]
        empty array [].         If no records are found
*/
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

// async function verifyManager(vpid, email, roleId) {
//     const vp = await VCSettings.findOne({ vpid: vpid, type: 'organisation' });
//     const role = vp.value.allRolles.find((item) => item.email === email);
//     const subRoles = role.subRoleIDs.find((value) => value.key === roleId);
//     if (subRoles) {
//         return true;
//     }
//     else {
//         return false;
//     }
// }

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