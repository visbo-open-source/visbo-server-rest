/* eslint-disable */
// Version History
//
// Version 2018-12-01T00:00:00  Upgrade Permission System for System/VC/VP
// Version 2018-12-02T00:00:00  Upgrade Deleted Flags
print ("Visbo DB Upgrade Process")
var dateBlock = ""

var continueFlag = true
var vcList = db.visbocenters.find({system: true}).toArray();
if (!vcList) {
    print ("System VC not found")
    continueFlag = false;
} else if (vcList.length != 1) {
  print ("System VC List empty or not unique, length ", vcList.length)
  continueFlag = false;
} else {
  var systemvc = vcList[0];
}

var oldVersion = "";
if (continueFlag) {
  var setting = db.vcsettings.findOne({vcid: systemvc._id, name: 'DBVersion'});
  if (!setting) {
    print ("System DB Version not set")
    oldVersion = '2018-01-01T00:00:00'
    db.vcsettings.insertOne({vcid: systemvc._id, name: 'DBVersion', type: "SysValue", value: {version: oldVersion}, createdAt: new Date(), updatedAt: new Date()})
  } else {
    oldVersion = setting.value.version;
  }
  print("Upgrade DB from Version ", oldVersion)
}

var currentVersion = oldVersion;

dateBlock = "2018-12-01T00:00:00";
if (continueFlag && currentVersion < dateBlock) {
  // DB Collection and Index Checks
  print ("Upgrade DB: Migrate to Group Permission System")
  var collectionName = 'visbogroups';
  var collection = db.getCollectionInfos({name: collectionName});
  // print ("VisboGroup Collection  ", JSON.stringify(collection))
  if (!collection || collection.length == 0) {
    // print ("Need to Create Visbo Groups Collection ", collectionName)
    db.createCollection( collectionName );
    db.visbogroups.createIndex( { vcid: 1 }, { name: "vcid" } );
    db.visbogroups.createIndex( { vpids: 1 }, { name: "vpid" } );
    db.visbogroups.createIndex( { 'users.userId': 1 }, { name: "userId" } );
    print ("Visbo Groups Collection Created")
  }
  var collectionName = 'vcsettings';
  var collection = db.getCollectionInfos({name: collectionName});
  // print ("VisboGroup Collection  ", JSON.stringify(collection))
  if (!collectionName || collection.length == 0) {
    // print ("Need to Create Visbo Settings Collection ")
    db.createCollection( collectionName );
    db.vcsettings.createIndex( { vcid: 1, type: 1, name: 1, timestamp: 1, userId: 1 }, { name: "unique", unique: true } );
    print ("Visbo Settings Collection Created")
  }

  // Migrate System Permission once to New Permission System with groups and permissions
  // Special Case for System VC as the groups will be named different compared to VC and the permission is different also
  // Steps:
  //    - check if a group already exists, stop if true
  //    - create two groups SysAdmin and SysAdminRead
  //    - Copy the users from the Admin/User Definition to the new groups

  print ("System VC found ", systemvc._id, systemvc.name)
  // check the groups now
  var groupList = db.visbogroups.find({vcid: systemvc._id}).toArray();
  if (!groupList ) {
      print ("System VC group issue ")
      continueFlag = false;
  } else if (groupList.length != 0) {
    print ("System VC Group exists, count  ", groupList.length)
    continueFlag = false;
  }
  if (continueFlag) {
    print ("System VC has to Create Groups ")

    var groupAdminMembers = [];
    var groupUserMembers = [];
    for (var i = 0; i < systemvc.users.length; i++) {
      var newUser = {}
      newUser.email = systemvc.users[i].email;
      newUser.userId = systemvc.users[i].userId;
      print('Add new User ', JSON.stringify(systemvc.users[i]))
      if (systemvc.users[i].role == 'Admin')
        groupAdminMembers.push(newUser)
      else
        groupUserMembers.push(newUser)
    }
    // print("Admins ", JSON.stringify(groupAdminMembers))
    // print("Users ", JSON.stringify(groupUserMembers))

    // now create the two groups
    var groupAdmin = {}
    groupAdmin.groupType = 'System'
    groupAdmin.internal = true
    groupAdmin.global = true;
    groupAdmin.name = 'Visbo System Admin'
    groupAdmin.vcid = systemvc._id
    groupAdmin.permission = {system: 1959, vc: 35, vp: 3}
    groupAdmin.users = groupAdminMembers

    var groupUser = {}
    groupUser.groupType = 'System'
    groupAdmin.internal = false
    groupUser.global = false;
    groupUser.name = 'Visbo System Admin Read'
    groupUser.vcid = systemvc._id
    groupUser.permission = {system: 7}
    groupUser.users = groupUserMembers

    db.visbogroups.insert(groupAdmin)
    db.visbogroups.insert(groupUser)
    print("System groups created")
  }
  // System VC Permission Migration done

  // Migrate Permission for VC once to New Permission System with groups and permissions
  // Steps:
  //    - find all VCs except systemVC
  //    - check if a group already exists, stop if true
  //    - create two groups "Visbo Center Admin" and "Visbo Center Read Access"
  //    - Copy the users from the Admin/User Definition to the new groups

  // db.visbogroups.deleteMany({groupType: {$in: ['VC', 'VC Custom']}})

  var continueFlag = true
  var vcList = db.visbocenters.find({system: {$exists: false}}).toArray();
  if (!vcList) {
      print ("Find VC issue")
      continueFlag = false;
  } else if (vcList.length == 0) {
    print ("VC List is empty nothing to convert ")
    continueFlag = false;
  }

  if (continueFlag) {
    print("VC List Length ", vcList.length)
    for (var j=0; j < vcList.length; j++) {
      var vc = vcList[j];
      // print ("Check  ", vc._id, vc.name)
      // check the groups now
      var groupList = db.visbogroups.find({vcid: vc._id}).toArray();
      if (!groupList ) {
          print ("VC group issue ", vc._id)
          continueFlag = false;
      } else if (groupList.length != 0) {
        // print ("VC Group exists, _id & count  ", vc._id, groupList.length)
      } else {
        // print ("VC has to Create Groups ", vc._id, groupList.length)

        var groupAdminMembers = [];
        var groupUserMembers = [];
        for (var i = 0; i < vc.users.length; i++) {
          var newUser = {}
          newUser.email = vc.users[i].email;
          newUser.userId = vc.users[i].userId;
          // print('Add new User ', JSON.stringify(vc.users[i]))
          if (vc.users[i].role == 'Admin')
            groupAdminMembers.push(newUser)
          else
            groupUserMembers.push(newUser)
        }
        // print("Admins ", JSON.stringify(groupAdminMembers))
        // print("Users ", JSON.stringify(groupUserMembers))

        // now create the two groups
        var groupAdmin = {}
        groupAdmin.groupType = 'VC'
        groupAdmin.internal = true
        groupAdmin.global = false;
        groupAdmin.name = 'Visbo Center Admin'
        groupAdmin.vcid = vc._id
        groupAdmin.permission = {vc: 307}
        groupAdmin.users = groupAdminMembers

        var groupUser = {}
        groupUser.groupType = 'VC'
        groupUser.internal = false;
        groupUser.global = false;
        groupUser.name = 'Visbo Center Read Access'
        groupUser.vcid = vc._id
        groupUser.permission = {vc: 3}
        groupUser.users = groupUserMembers

        db.visbogroups.insert(groupAdmin)
        db.visbogroups.insert(groupUser)
      }
    }
    print("VC Groups created")
  }
  // VC Permission Migration done

  // Migrate Permission for VP once to New Permission System with groups and permissions
  // Steps:
  //    - find all VPs
  //    - check if a group already exists, stop if true
  //    - create two groups Visbo Project Admin, Project Read Access
  //    - Copy the users from the Admin/User Definition to the new groups

  var continueFlag = true
  var vpList = db.visboprojects.find({users:{$exists: true}}).toArray();
  if (!vpList) {
      print ("Find VP issue")
      continueFlag = false;
  } else if (vpList.length == 0) {
    print ("VP List is empty nothing to convert ")
    continueFlag = false;
  }
  print("VP List Length ", vpList.length)

  if (continueFlag) {
    for (var j=0; j < vpList.length; j++) {
      var vp = vpList[j];
      // print ("Check  ", vp._id, vp.name)
      // check the groups now
      var groupList = db.visbogroups.find({groupType: 'VP', vpids: vp._id}).toArray();
      if (!groupList ) {
          print ("VP group issue ", vp._id)
          continueFlag = false;
      } else if (groupList.length != 0) {
        // print ("VP Group exists, _id & count  ", vp._id, groupList.length)
      } else {
        // print ("VP has to Create Groups ", vp._id)

        var groupAdminMembers = [];
        var groupUserMembers = [];
        for (var i = 0; i < vp.users.length; i++) {
          var newUser = {}
          newUser.email = vp.users[i].email;
          newUser.userId = vp.users[i].userId;
          // print('Add new User ', JSON.stringify(vp.users[i]))
          if (vp.users[i].role == 'Admin')
            groupAdminMembers.push(newUser)
          else
            groupUserMembers.push(newUser)
        }
        // print("Admins ", JSON.stringify(groupAdminMembers))
        // print("Users ", JSON.stringify(groupUserMembers))

        // now create the two groups
        var groupAdmin = {}
        groupAdmin.groupType = 'VP'
        groupAdmin.internal = true
        groupAdmin.global = false;
        groupAdmin.name = 'Visbo Project Admin'
        groupAdmin.vcid = vp.vcid
        groupAdmin.vpids = [];
        groupAdmin.vpids.push(vp._id)
        groupAdmin.permission = {vp: 1331}
        groupAdmin.users = groupAdminMembers

        var groupUser = {}
        groupUser.groupType = 'VP'
        groupUser.internal = false;
        groupUser.global = false;
        groupUser.name = 'Project Read Access'
        groupUser.vcid = vp.vcid
        groupUser.vpids = [];
        groupUser.vpids.push(vp._id)
        groupUser.permission = {vp: 3}
        groupUser.users = groupUserMembers

        db.visbogroups.insert(groupAdmin)
        db.visbogroups.insert(groupUser)
      }
    }
    print("VP Groups created")
  }
  // VP Permission Migration done
  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
} // Permission Migration done

dateBlock = "2018-12-02T00:00:00"
if (currentVersion < dateBlock) {
  // Migrate DeletedAt Flag from VC
  print ("Upgrade DB: Change Deleted Flag for VC/VP")

  var vcListAll = db.visbocenters.find({deleted: {$exists: true}, deletedAt: {$exists: false}}).toArray();
  print("VC List Deleted Length ", vcListAll.length)

  var vc;
  for (var i=0; i<vcListAll.length; i++) {
    vc = vcListAll[i]
    db.visbocenters.updateOne({_id: vc._id}, {$set: {deletedAt: vc.deleted.deletedAt}})
  }
  print(vcListAll.length, " VCs Deleted Flag Updated")

  // Migrate DeletedAt Flag from VP

  var vpListAll = db.visboprojects.find({deleted: {$exists: true}, deletedAt: {$exists: false}}).toArray();
  print("VP List Deleted Length ", vpListAll.length)

  var vp;
  for (var i=0; i<vpListAll.length; i++) {
    vp = vpListAll[i];
    if (vp.deleted.byParent)
      db.visboprojects.updateOne({_id: vp._id}, {$set: {deletedAt: vp.deleted.deletedAt, 'vc.deletedAt': vp.deleted.deletedAt}})
    else
      db.visboprojects.updateOne({_id: vp._id}, {$set: {deletedAt: vp.deleted.deletedAt}})
  }
  print(vpListAll.length, " VPs Deleted Flag Updated")

  // Migrate DeletedAt Flag from VPV

  var vpvListAll = db.visboprojectversions.find({deleted: {$exists: true}, deletedAt: {$exists: false}}).toArray();
  print("VPV List Deleted Length ", vpvListAll.length)

  var vpv;
  for (var i=0; i<vpvListAll.length; i++) {
    vpv = vpvListAll[i];
    db.visboprojectversions.updateOne({_id: vpv._id}, {$set: {deletedAt: vpv.deleted.deletedAt}})
  }
  print(vpvListAll.length, " VPVs Deleted Flag Updated")

  db.visbocenters.updateMany({deleted: {$exists: true}, deletedAt: {$exists: true}}, {$unset: {deleted: ''}})
  db.visboprojects.updateMany({deleted: {$exists: true}, deletedAt: {$exists: true}}, {$unset: {deleted: ''}})
  db.visboprojectversions.updateMany({deleted: {$exists: true}, deletedAt: {$exists: true}}, {$unset: {deleted: ''}})

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2019-01-25T00:00:00"
if (currentVersion < dateBlock) {
  // Remove Users from VC & VP afetr they were migrated to groups
  print ("Upgrade DB: Remove Users from VC & VP documents, Set TTL for Audit Trail")

  var vcListConverted = db.visbogroups.find({groupType: {$in: ['VC', 'System']}}).toArray()
  var vcidList = [];
  for (var i=0; i<vcListConverted.length; i++) {
    vcidList.push(vcListConverted[i].vcid)
  }
  var vcListAll = db.visbocenters.find({}).toArray();
  var vcList = db.visbocenters.find({users: {$exists: true}, _id: {$in: vcidList}}).toArray();
  var vcListUsers = db.visbocenters.find({users: {$exists: true}}).toArray();
  print("VC List Converted Length All VC ", vcListAll.length, ' VCs with Users & Groups ', vcList.length, ' Total VCs with Users ', vcListUsers.length)

  db.visbocenters.updateMany({users: {$exists: true}, _id: {$in: vcidList}}, {$unset: {users: ''}})

  var vpListConverted = db.visbogroups.find({groupType: {$in: ['VC', 'VP']}}).toArray()
  var vpidList = [];
  for (var i=0; i<vpListConverted.length; i++) {
    if (vpListConverted[i].vpids && vpListConverted[i].vpids.length > 0) {
      for (var j=0; j<vpListConverted[i].vpids.length; j++) {
        vpidList.push(vpListConverted[i].vpids[j]);
      }
    }
  }

  var vpListAll = db.visboprojects.find({}).toArray();
  var vpList = db.visboprojects.find({users: {$exists: true}, _id: {$in: vpidList}}).toArray();
  var vpListUsers = db.visboprojects.find({users: {$exists: true}}).toArray();
  print("VP List Converted Length All VP ", vpListAll.length, ' VPs with Users & Groups ', vpList.length, ' Total VPs with Users ', vpListUsers.length)

  db.visboprojects.updateMany({users: {$exists: true}, _id: {$in: vpidList}}, {$unset: {users: ''}})
  print("VP Users updated ")

  // Set TTL for old Audit trail entries
  var auditArray = db.visboaudits.find( { action: "GET", url: { $regex: /^\/v[cp]$/ } }, {url:1} ).toArray()
  print("Check TTL Items: Count Base URL " + auditArray.length)

  // find all items with base url /vc or /vp with query parameter
  var auditArray = db.visboaudits.find( { action: "GET", url: { $regex: /^\/v[cp]\?/ } }, {url:1} ).toArray()
  print("Check TTL Items: Count Query URL " + auditArray.length)

  // find all items with base url /status
  var auditArray = db.visboaudits.find( { action: "GET", url: { $regex: /^\/status/ } }, {url:1} ).toArray()
  print("Check TTL Items: Count Status URL " + auditArray.length)

  db.visboaudits.updateMany({ action: "GET", url: { $regex: /^\/vc/ } },
    {$set: {ttl: new Date()}}, {upsert: false, multi: "true"}
  )

  db.visboaudits.updateMany({ action: "GET", url: { $regex: /^\/vp/ } },
    {$set: {ttl: new Date()}}, {upsert: false, multi: "true"}
  )

  db.visboaudits.updateMany({ action: "GET", url: { $regex: /^\/vpv/ } },
    {$set: {ttl: new Date()}}, {upsert: false, multi: "true"}
  )

  db.visboaudits.updateMany({ action: "GET", url: { $regex: /^\/status/ } },
    {$set: {ttl: new Date()}}, {upsert: false, multi: "true"}
  )

  db.visboaudits.updateMany({ action: "GET", url: { $regex: /^\/json/ } },
    {$set: {ttl: new Date()}}, {upsert: false, multi: "true"}
  )

  db.visboaudits.updateMany({ action: "GET", url: { $regex: /^\/apidoc/ } },
    {$set: {ttl: new Date()}}, {upsert: false, multi: "true"}
  )

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2019-02-07T00:00:00"
if (currentVersion < dateBlock) {
  // Set deletedByParent Flag in Visbo groups for Deleted VCs and VPs
  var vpArray = db.visboprojects.find( {deletedAt: {$exists: true}}, {_id:1} ).toArray()
  print("Check Deleted VPs: Count Base " + vpArray.length)
  var vpidList = [];
  for (var i=0; i<vpArray.length; i++) {
    vpidList.push(vpArray[i]._id)
  }
  print("VP List Converted Length Deleted VP ", vpidList.length)
  db.visbogroups.updateMany({groupType: 'VP', vpids: {$in: vpidList}}, {$set: {deletedByParent: 'VP'}})

  var vcArray = db.visbocenters.find( {deletedAt: {$exists: true}}, {_id:1} ).toArray()
  print("Check Deleted VCs: Count Base " + vcArray.length)
  var vcidList = [];
  for (var i=0; i<vcArray.length; i++) {
    vcidList.push(vcArray[i]._id)
  }
  print("VC List Converted Length Deleted VC ", vcidList.length)
  db.visbogroups.updateMany({vcid: {$in: vcidList}, deletedByParent: {$exists: false}}, {$set: {deletedByParent: 'VC'}})

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2019-02-08T01:00:00"
if (currentVersion < dateBlock) {
  // Remove deleted VPs from global VC Groups

  var vpArray = db.visboprojects.find({deletedAt: {$exists: true}}, {_id:1, name:1, vcid:1}).toArray()
  print("Handle Deleted VPs in global VC Groups: " + vpArray.length)
  var vpidList = [];
  for (var i=0; i<vpArray.length; i++) {
    vpidList.push(vpArray[i]._id)
  }
  db.visbogroups.updateMany({groupType: 'VC', global: true}, {$pull: {vpids: {$in: vpidList}}})

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2019-02-24T00:00:00"
if (currentVersion < dateBlock) {
  // Create the vpv index to get versions sorted

  print ("Check if VPV Index Exists")
  indexes = db.visboprojectversions.getIndexes();
  var found = false;
  for (var i=0; i<indexes.length; i++) {
    if (indexes[i].name == 'vpv') {
      found = true
      break
    }
  }
  if (!found) {
    // create the indexes
    print ("Create VPV Index")
    db.visboprojectversions.createIndex( { vpid: 1, variantName: 1, timestamp: -1 }, { name: "vpv", unique: false } );
  }

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2019-02-27T00:00:00"
if (currentVersion < dateBlock) {
  // Reduce Audit Trail (Portfolio JSON removed from Audit)
  db.visboaudits.updateMany(
    {actionDescription: /Visbo Portfolio/, action: {$ne: "GET"}, "vp.vpjson": {$exists: true}},
    {$unset: {"vp.vpjson": true}}
  )

  // remove Component vcjson for very large settings (organisation)
  var first = true;
  var auditIDs = ''
  db.visboaudits.find({actionDescription: /Visbo Center Setting/, "vc.vcjson": {$exists: true}}).forEach(function(obj)
  {
    if (Object.bsonsize(obj) >= 2048) {
      if (first) {first = false; auditIDs = auditIDs.concat(''+obj._id) }
      else auditIDs = auditIDs.concat(',', ''+obj._id)
    }
  })
  var auditIDArray = []
  auditIDArray = auditIDs.split(',')
  print("Check Long Audit Settings: Count " + auditIDArray.length + ' Array ' + auditIDArray)

  var auditObjectIDArray = [];
  for (var i=0; i<auditIDArray.length; i++) {
    auditObjectIDArray.push(ObjectId(auditIDArray[i]))
  }
  db.visboaudits.updateMany({_id: {$in: auditObjectIDArray}}, {$unset: {"vc.vcjson": true}})
  db.visboaudits.find({_id: {$in: auditObjectIDArray}}, {_id:1, actionDescription:1}).sort({createdAt:-1})

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}


dateBlock = "2019-04-29T00:00:00"
if (currentVersion < dateBlock) {
  // add tasks for regular execution of clean up
  // remove items from Audit Trail that have expired already
  var taskName = 'Audit Cleanup'
  var setting = db.vcsettings.findOne({vcid: systemvc._id, type: "Task", name: taskName});
  if (!setting) {
    print ("Create Task " + taskName)
    db.vcsettings.insertOne({vcid: systemvc._id, name: taskName, type: "Task", value: {lastRun: new Date(), interval: 86400}, createdAt: new Date(), updatedAt: new Date()})
  }
  // remove duplicate get VPV from same user in same period and keep only first. Run once a day and recognise only entries older than 30 days
  var taskName = 'Audit Squeeze'
  var setting = db.vcsettings.findOne({vcid: systemvc._id, type: "Task", name: taskName});
  if (!setting) {
    print ("Create Task " + taskName)
    db.vcsettings.insertOne({vcid: systemvc._id, name: taskName, type: "Task", value: {lastRun: new Date(), interval: 86400, skipDays: 30}, createdAt: new Date(), updatedAt: new Date()})
  }

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2019-05-06T00:00:00"
if (currentVersion < dateBlock) {
  // change Config Value Types
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion', type: 'Internal'}, {$set: {type: "SysValue", updatedAt: new Date()}}, {upsert: false})
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DEBUG', type: 'Internal'}, {$set: {type: "SysConfig", updatedAt: new Date()}}, {upsert: false})
  // add additional config values
  db.vcsettings.insertOne({vcid: systemvc._id, name: 'PW Policy', type: "SysConfig", value: {PWPolicy: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^a-zA-Z\\d\\s])(?!.*[\\"\\\'\\\\]).{8,}$', Description: 'At least 8 characters, at least one character of each type: alpha, capital alpha, number, special. No quotes and backslash.'}, createdAt: new Date(), updatedAt: new Date()})
  // db.vcsettings.insertOne({vcid: systemvc._id, name: 'UI URL', type: "SysConfig", value: {UIUrl: 'http://localhost:4200'}, createdAt: new Date(), updatedAt: new Date()})
  var taskName = 'System Config'
  var setting = db.vcsettings.findOne({vcid: systemvc._id, type: "Task", name: taskName});
  if (!setting) {
    print ("Create Task " + taskName)
    db.vcsettings.insertOne({vcid: systemvc._id, name: taskName, type: "Task", value: {lastRun: new Date(), interval: 60}, createdAt: new Date(), updatedAt: new Date()})
  }

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2019-06-07T00:00:00"
if (currentVersion < dateBlock) {
  // change Config Value Types
  var taskName = 'Lock Cleanup'
  var setting = db.vcsettings.findOne({vcid: systemvc._id, type: "Task", name: taskName});
  if (!setting) {
    print ("Create Task " + taskName)
    db.vcsettings.insertOne({vcid: systemvc._id, name: taskName, type: "Task", value: {lastRun: new Date(), interval: 86400}, createdAt: new Date(), updatedAt: new Date()})
  }

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2019-06-29T00:00:00"
if (currentVersion < dateBlock) {
  // add Config Values fpr REDIS && Log File Handling
  db.vcsettings.insertOne({vcid: systemvc._id, name: "REDIS", type: "SysConfig", value: {host: "localhost", port: 6379}, createdAt: new Date(), updatedAt: new Date()})
  db.vcsettings.insertOne({vcid: systemvc._id, name: "Log Age", type: "SysConfig", value: {duration: 30}, createdAt: new Date(), updatedAt: new Date()})

  var taskName = 'Log File Cleanup'
  var setting = db.vcsettings.findOne({vcid: systemvc._id, type: "Task", name: taskName});
  if (!setting) {
    print ("Create Task " + taskName)
    db.vcsettings.insertOne({vcid: systemvc._id, name: taskName, type: "Task", value: {lastRun: new Date(), interval: 86400}, createdAt: new Date(), updatedAt: new Date()})
  }

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2019-10-31T00:00:00"
if (currentVersion < dateBlock) {
  // Create Portfolio Version Index if not exists

  print ("Check if Portfolio Versions Index Exists")
  indexes = db.visboportfolios.getIndexes();
  var found = false;
  for (var i=0; i<indexes.length; i++) {
    if (indexes[i].name == 'refDate') {
      found = true
      break
    }
  }
  if (!found) {
    // create the indexes
    print ("Create Portfolio Versions Index")
    db.visboportfolios.createIndex( { vpid: 1, variantName: 1, timestamp: -1 }, { name: "refDate", unique: false } );
  }

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2020-05-25T00:00:00"
if (currentVersion < dateBlock) {
  // remove VC Groups without VC Connection
  var groups = db.visbogroups.aggregate([
    {$project: {_id: 1, vcid:1, name:1, vpids:1, updatedAt:1}},
    {$lookup: {
         from: "visbocenters",
         localField: "vcid",    // field in the groups collection
         foreignField: "_id",  // field in the vc collection
         as: "vc"
      }
    },
    {$project: {_id: 1, vcid:1, updatedAt:1, "visbogroups.name":1, "vc._id":1, "vc.name":1}},
    {$addFields: {vcname: '$vc.name'}},

    {$match: {"vc.name": {$exists:false}}},
    { $sort : {updatedAt: -1}}
  ]).toArray();
  if (groups.length > 0) {
    print("Number of Groups to delete: " + groups.length)
    var groupIDs = [];
    for (var i=0; i < groups.length; i++) {
      groupIDs.push(groups[i]._id);
    }
    db.visbogroups.deleteMany({_id: {$in: groupIDs}});
  }

  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2020-07-03T00:00:00"
if (currentVersion < dateBlock) {
  // Upgrade organisation setting to have a timestamp always either validFrom or createdAt
  var vcSettings =
          db.visbocenters.aggregate(
            [
              { $match: {system: {$exists: false}, deletedAt: {$exists: false}}},
              { $project: {_id: 1, name:1}},
              { $lookup: {
                   from: "vcsettings",
                   localField: "_id",    // field in the orders collection
                   foreignField: "vcid",  // field in the items collection
                   as: "vcsetting"
                }
              },
              { $unwind: "$vcsetting" },
              { $addFields: { settingType: "$vcsetting.type", settingTimestamp: "$vcsetting.timestamp", settingId: "$vcsetting._id" }},
              { $match: {settingType: 'organisation', settingTimestamp: {$exists: false}}},
              { $project: {_id: 1, name:1, settingType:1, settingTimestamp:1, settingId:1}}
            ]
          ).toArray()
  if (vcSettings.length) {
    print("Process VC Settings", vcSettings.length);
    for (var i=0; i<vcSettings.length; i++) {
      // print("Process VC Setting", vcSettings[i]._id, vcSettings[i].settingTimestamp);
      if (!vcSettings[i].settingTimestamp) {
        print("Set VC Setting Timestamp", vcSettings[i]._id, 'SettingID', vcSettings[i].settingId);
        var vcSettingId = vcSettings[i].settingId;
        var actSetting = db.vcsettings.findOne({_id: vcSettingId}, {_id:1, "value.validFrom": 1, createdAt: 1});
        var validFrom = actSetting.value.validFrom || actSetting.createdAt;
        print("ActSetting ID", vcSettingId, "New Timestamp", validFrom, "validFrom", actSetting.value.validFrom, "createdAt", actSetting.createdAt);
        db.vcsettings.updateOne({_id: vcSettingId}, {$set: {timestamp: validFrom}});
      }
    }
  }
  print("Process VC Settings, set timestamp for orgnaisations done");


  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}


dateBlock = "2020-09-07T00:00:00"
if (currentVersion < dateBlock) {
  // Update the Visbo Center Setting "organisation" to start with the beginning of month

  // Update the Visbo Center Setting "organisation" to start with the beginning of month

  var vcSettingList = db.vcsettings.find({type: 'organisation'}, {_id: 1, vcid: 1, type: 1, name: 1, timestamp: 1, createdAt: 1, updatedAt: 1}).toArray();
  var fixCount = 0;
  for (var i = 0; i < vcSettingList.length; i++) {
    var timestamp =  vcSettingList[i].timestamp;
    timestamp = timestamp ? new Date(timestamp) : new Date();
    var normalised = new Date(timestamp);
    normalised.setDate(1);
    normalised.setHours(0,0,0,0);
    if (timestamp.toISOString() !== normalised.toISOString()) {
      // print ("vcsetting ", JSON.stringify(vcSettingList[i]));
      print("Fix vcSetting _id:", vcSettingList[i]._id, " vcid: ", vcSettingList[i].vcid, " Timestamp ", timestamp.toISOString(), " normalisedTimestamp ", normalised.toISOString(), "UpdatedAt:", vcSettingList[i].updatedAt.toISOString());
      db.vcsettings.updateOne({_id: vcSettingList[i]._id}, {$set: {"timestamp": normalised, "updatedAt": new Date()}})
      fixCount += 1;
    }
  }
  print("Finished Fix Orga Date ", fixCount);

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2020-09-27T00:00:00"
if (currentVersion < dateBlock) {
  // unset tagessatzExtern
  var vcidlist = db.vcsettings.find({type: 'organisation', $or:[{'value.allRoles.tagessatzExtern': {$exists: true}}, {'value.allRoles.externeKapazitaet': {$exists: true}}]}, {vcid:1} ).toArray();
  var vcids = [];
  for (var i = 0; i < vcidlist.length; i++) {
    vcids.push(vcidlist[i].vcid)
  }
  print ("Unset tagessatzExtern for VisboCenters: Count: " + vcids.length);

  var vcorgs = db.vcsettings.find({vcid: {$in: vcids}, type: 'organisation'}, {_id:1, type:1, name:1, 'value.allRoles.tagessatzExtern':1}).toArray();
  print ("Unset tagessatzExtern for VisboCenter Organisations: Count: " + vcorgs.length);

  if (vcorgs.length > 0) {
    db.vcsettings.updateMany(
        {vcid: {$in: vcids}, type: 'organisation'},
        {$unset: {'value.allRoles.$[elem].tagessatzExtern': true}},
        {arrayFilters: [ { "elem.tagessatzExtern": { $eq: 0 } } ] }
      );

    db.vcsettings.updateMany(
        {vcid: {$in: vcids}, type: 'organisation'},
        {$unset: {'value.allRoles.$[elem].externeKapazitaet': true}},
        {arrayFilters: [ { "elem.externeKapazitaet": { $eq: null } } ] }
      );
  }
  print("Finished Fix Cleanup external Tagessatz & Kapazitaet ", vcorgs.length);
  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2020-10-15T00:00:00"
if (currentVersion < dateBlock) {
  // update the vpfCount in visboprojects for main variant and real variants
  db.visboprojects.update({vpType:1, vpfCount: {$exists: false}}, {$set: {vpfCount: 0}}, {multi: true})

  // get the real vpfCount by counting the projectversions per vpid and join it with visboproject
  var vpfList = db.visboportfolios.aggregate(
    [
      {$match: {variantName: {$eq: ""}}},
      {$project: {_id: 1, vpid:1}},
      {$group:{_id: "$vpid", vpfCountNew: {$sum : 1}}},
      {$lookup: {
           from: "visboprojects",
           localField: "_id",    // field in the vp collection
           foreignField: "_id",  // field in the items collection
           as: "vp"
        }
     }
    ]
  ).toArray();
  print("Found VPs with Portfolio Lists", vpfList.length)
  for (var i = 0; i < vpfList.length; i++) {
    if (vpfList[i].vp.length > 0) {
      if (vpfList[i].vpfCountNew != vpfList[i].vp[0].vpfCount) {
        print("Visbo Project Portfolio Count Mismatch:", vpfList[i]._id, vpfList[i].vp[0]._id, vpfList[i].vpfCountNew, vpfList[i].vp[0].vpfCount);
        db.visboprojects.updateOne({_id: vpfList[i]._id}, {$set: {vpfCount: vpfList[i].vpfCountNew}})
      }
    } else {
      print("Visbo Project already destroyed:", vpfList[i]._id, vpfList[i].vpvCountNew)
    }
  }
  print("Visbo Project vpfCount maintenance finished")

  // Create the vpfCount in VP Variant if it does not exist

  // update the variant vpfCount to 0 if it does not exists
  db.visboprojects.update(
     { vpType: 1, variant: { $elemMatch: { _id: {$exists: true}, vpfCount: {$exists: false} } } },
     { $set: { "variant.$[elem].vpfCount" : 0 } },
     {
       multi: true,
       arrayFilters: [ { "elem.vpfCount": { $exists: false } } ]
     }
  )

  // check and update the vpfCount of VP Variant by counting the versions for each varian in vpf
  var vpfList = db.visboportfolios.aggregate(
    [
      // { $match: {vpid: ObjectId('5b1fd29c46beb42c5997be7b'), variantName: {$ne: ""}}},
      { $match: {variantName: {$ne: ""}, deletedAt: {$exists: false}}},
      { $project: {_id: 1, vpid:1, variantName:1}},
      { $group:{_id: {vpid: "$vpid", variantName: "$variantName"}, vpfCountNew: {$sum : 1}}},
      { $lookup: {
           from: "visboprojects",
           localField: "_id.vpid",    // field in the orders collection
           foreignField: "_id",  // field in the items collection
           as: "vp"
        }
     },
     { $unwind: "$vp" },
     { $unwind: "$vp.variant" },
     { $addFields: { vpfCountOrg: "$vp.variant.vpfCount", vpfVariantNameOrg: "$vp.variant.variantName" } },
     { $project: {_id: 1, vpfCountNew:1, vpfCountOrg:1, vpfVariantNameOrg:1}}
    ]
  ).toArray();
  print("Found Projects Portfolios", vpfList.length)
  // print (JSON.stringify(vpfList))

  for (var i = 0; i < vpfList.length; i++) {
    // print("Process Item ", JSON.stringify(vpfList[i]))
    if (vpfList[i].vpfVariantNameOrg) {
      var variantNameNew = vpfList[i]._id.variantName;
      var variantNameOrg = vpfList[i].vpfVariantNameOrg;
      var vpid = vpfList[i]._id.vpid;
      var vpfCountNew = vpfList[i].vpfCountNew;
      var vpfCountOrg = vpfList[i].vpfCountOrg;

      if ( variantNameNew == variantNameOrg) {
        // print("Visbo Project Variant Match compare Counts:", vpid, variantNameNew, vpfCountNew, vpfCountOrg);
        if (vpfCountNew != vpfCountOrg) {
          print("Visbo Project Variant Count Mismatch:", vpid, variantNameNew, vpfCountNew, vpfCountOrg);
          // update visbo project set the vpfCount in the Variant correct
          var vp = db.visboprojects.findOne({_id: vpid})
          if (vp == undefined) {
            print("Project NOT FOUND ", vpid)
          } else if (vp.variant == undefined ){
            print("Project has no VARIANT ", vpid)
          } else {
            // find the correct variant
            for (var j = 0; j< vp.variant.length; j++) {
              // print("Check Variant ", variantName, vp.variant[j].variantName)
              if (vp.variant[j].variantName == variantNameNew) {
                vp.variant[j].vpfCount = vpfCountNew;
                print ("update Variant ", vpid, variantNameNew, vp.variant[j].vpfCount);
                // print ("updated VP ", JSON.stringify(vp));
                // delete vp._id;
                db.visboprojects.replaceOne({_id: vpid}, vp)
              }
            }
          }
        }
      } else {
        // print("Ignore wrong variant ", vpid, variantNameOrg, variantNameNew)
      }
    } else {
      print("Visbo Project already deleted:", vpfList[i]._id.vpid, vpfList[i].vpfCountNew)
    }
    //  db.visbocenters.updateOne({_id: vpList[i].vcid}, {$inc: {vpCount: 1}})
  }
  print("Visbo Project Variant vpfCount maintenance finished")

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2020-11-06T00:00:00"
if (currentVersion < dateBlock) {
  // convert organisation
  var vcidlist = db.vcsettings.find({type: 'organisation'}, {vcid:1} ).toArray();
  var vcids = [];
  vcidlist.forEach(item => vcids.push(item.vcid));
  print ("Convert Organisation for VisboCenters: Count: " + vcids.length);

  var query = {vcid: {$in: vcids}, type: 'organisation', 'value.allRoles.isTeamParent': true};
  var vcorgs = db.vcsettings.find(query, {_id:1, type:1}).toArray();
  print ("convert isTeamParent for VisboCenter Organisations: Count: " + vcorgs.length);
  if (vcorgs.length > 0) {
    // set isTeam Attribute to true for isTeamParent = true
    db.vcsettings.updateMany(
        query,
        {$set: {'value.allRoles.$[elem].isTeam': true}},
        {arrayFilters: [ { "elem.isTeamParent": { $eq: true } } ] }
      );
  }

  var query = {vcid: {$in: vcids}, type: 'organisation'};
  var vcorgs = db.vcsettings.find(query).toArray();
  print ("convert tagessatz and subRoleIDs for VisboCenter Organisations: Count: " + vcorgs.length);
  var updateCount = 0;
  for (var i=0; i < vcorgs.length; i++) {
    // print("check vcorgs", vcorgs[i].name, vcorgs[i]._id.toString());
    var update = false;
    var allRoles = vcorgs[i] && vcorgs[i].value && vcorgs[i].value.allRoles;
    for (var j=0; j < allRoles.length; j++) {
      if (allRoles[j].tagessatzIntern > 0 && allRoles[j].tagessatzIntern != allRoles[j].tagessatz) {
        // print("modify vcorgs tagessatz", vcorgs[i].name, "Role", allRoles[j].uid);
        allRoles[j].tagessatz = allRoles[j].tagessatzIntern;
        update = true;
      }
      if (allRoles[j].subRoleIDs && allRoles[j].subRoleIDs.length > 0 ) {
        // print("verify subRoleIDS", vcorgs[i].name, "Role", allRoles[j].uid, "Length", allRoles[j].subRoleIDs.length);
        for (var k=0; k < allRoles[j].subRoleIDs.length; k++) {
          var subRole = allRoles[j].subRoleIDs[k];
          // print("verify subRole", typeof subRole.key, typeof subRole.value, JSON.stringify(subRole));
          if (typeof subRole.key == 'string' || typeof subRole.value == 'string') {
            subRole.key = Number(subRole.key);
            var str = subRole.value.replace(',', '.');
            subRole.value = Number(str);
            // print("update subRole", JSON.stringify(subRole));
            update = true;
          }
        }
      }
      if (allRoles[j].teamIDs && allRoles[j].teamIDs.length > 0 ) {
        // print("verify teamIDs", vcorgs[i].name, "Role", allRoles[j].uid, "Length", allRoles[j].teamIDs.length);
        for (var k=0; k < allRoles[j].teamIDs.length; k++) {
          var subTeam = allRoles[j].teamIDs[k];
          // print("verify subTeam", typeof subTeam.key, typeof subTeam.value, JSON.stringify(subTeam));
          if (typeof subTeam.key == 'string' || typeof subTeam.value == 'string') {
            subTeam.key = Number(subTeam.key);
            var str = subTeam.value.replace(',', '.');
            subTeam.value = Number(str);
            print("update subTeam", JSON.stringify(subTeam));
            update = true;
          }
        }
      }
    }
    if (update) {
      print("update orga", vcorgs[i].name, vcorgs[i]._id.toString());
      db.vcsettings.replaceOne({_id: vcorgs[i]._id}, vcorgs[i]);
      updateCount += 1;
    }
  }

  print("Finished Fix Change Orga tagessatzIntern, subRoleIDs ", updateCount);

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2021-02-08T00:00:00"
if (currentVersion < dateBlock) {
  // Delete unused Properties from vpv
  db.visboprojectversions.updateMany({farbe: {$exists: true}}, {$unset: {farbe: '', Schrift: '', Schriftfarbe: '', volumen: ''}});

  db.visboprojectversions.updateMany({'AllPhases.farbe': {$exists: true}},
    {$unset: {'AllPhases.$[elem].farbe': ''}},
    {arrayFilters: [ { "elem.farbe": { $exists: true } } ] }
  );

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2021-04-20T00:00:00"
if (currentVersion < dateBlock) {
  // Set busniessUnit Property in VP if not set, copy it from VPV

  // Set arrays for customFieldString and customFieldDouble for all Projects
  db.visboprojects.update({}, {$set: {customFieldString: []}}, {multi: true})
  db.visboprojects.update({}, {$set: {customFieldDouble: []}}, {multi: true})

  var vpList = db.visboprojects.find({deletedAt: {$exists: false}, 'customFieldString.name': {$nin: ['_businessUnit']}}, {_id: 1}).toArray()
  var vpidList = [];
  vpList.forEach(vp => vpidList.push(vp._id));
  var vpvList = db.visboprojectversions.find({deletedAt: {$exists: false}, variantName: '', businessUnit: {$exists: true}, businessUnit: {$ne: ''}, vpid: {$in: vpidList}}, {_id: 1, vpid: 1, businessUnit: 1, timestamp: 1}).sort({vpid: 1, variantName: 1, timestamp: -1}).toArray();
  print("Found VPV", vpList.length, vpvList.length);
  // print("VPV List", JSON.stringify(vpvList));
  var vpIDLast, count = 0;
  vpvList.forEach(vpv => {
    if (vpv.vpid.toString() != vpIDLast && vpv.businessUnit) {
      // update VP with businessUnit
      db.visboprojects.updateOne({_id: vpv.vpid}, {$push: { customFieldString: {
        name: '_businessUnit',
        value: vpv.businessUnit
      }}})
      vpIDLast = vpv.vpid.toString();
      count += 1;
    }
  })
  print("Updated VP _businessUnit", count);

  var vpList = db.visboprojects.find({deletedAt: {$exists: false}, 'customFieldDouble.name': {$nin: ['_risk']}}, {_id: 1}).toArray()
  var vpidList = [];
  vpList.forEach(vp => vpidList.push(vp._id));
  var vpvList = db.visboprojectversions.find({deletedAt: {$exists: false}, variantName: '', Risiko: {$gte: 0}, vpid: {$in: vpidList}}, {_id: 1, vpid: 1, Risiko: 1, timestamp: 1}).sort({vpid: 1, variantName: 1, timestamp: -1}).toArray();
  print("Found VPV", vpList.length, vpvList.length);
  // print("VPV List", JSON.stringify(vpvList));
  vpIDLast = undefined; count = 0;
  vpvList.forEach(vpv => {
    if (vpv.vpid.toString() != vpIDLast) {
      // update VP with risk
      // print("Update VP _risk", vpv.vpid.toString(), vpv._id.toString(), vpv.Risiko);
      db.visboprojects.updateOne({_id: vpv.vpid}, {$push: { customFieldDouble: {
        name: '_risk',
        value: vpv.Risiko
      }}});
      count += 1;
      vpIDLast = vpv.vpid.toString();
    }
  })
  print("Updated VP _risk", count);

  var vpList = db.visboprojects.find({deletedAt: {$exists: false}, 'customFieldDouble.name': {$nin: ['_strategicFit']}}, {_id: 1}).toArray()
  var vpidList = [];
  vpList.forEach(vp => vpidList.push(vp._id));
  var vpvList = db.visboprojectversions.find({deletedAt: {$exists: false}, variantName: '', StrategicFit: {$gte: 0}, vpid: {$in: vpidList}}, {_id: 1, vpid: 1, StrategicFit: 1, timestamp: 1}).sort({vpid: 1, variantName: 1, timestamp: -1}).toArray();
  print("Found VPV", vpList.length, vpvList.length);
  // print("VPV List", JSON.stringify(vpvList));
  vpIDLast = undefined; count = 0;
  vpvList.forEach(vpv => {
    if (vpv.vpid.toString() != vpIDLast) {
      // update VP with businessUnit
      // print("Update VP _risk", vpv.vpid.toString(), vpv._id.toString(), vpv.Risiko);
      db.visboprojects.updateOne({_id: vpv.vpid}, {$push: { customFieldDouble: {
        name: '_strategicFit',
        value: vpv.StrategicFit
      }}});
      count += 1;
      vpIDLast = vpv.vpid.toString();
    }
  })
  print("Updated VP _strategicFit", count);

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2021-05-02T00:00:00"
if (currentVersion < dateBlock) {
  // insert _VCConfig Setting for EnablePredict

  var name = 'EnablePredict';
  var type = '_VCConfig';

  var settingList = db.vcsettings.find({vcid: systemvc._id, type: type, name: name}, {_id: 1}).toArray();
  if (settingList.length == 0) {
    var value = {level: 2, systemLimit: true, systemEnabled: false}
    db.vcsettings.insertOne({vcid: systemvc._id, name: name, type: type, value: value, createdAt: new Date(), updatedAt: new Date()})
    // add the settings for all VCs even deleted
    var vcList = db.visbocenters.find({system: {$exists: false}}, {_id:1}).toArray();
    print("Update Predict Settings for VCs", vcList.length);
    settingList = [];
    vcList.forEach(item => settingList.push({vcid: item._id, name: name, type: type, value: value, createdAt: new Date(), updatedAt: new Date()}))
    // print("Prepared VCs", settingList.length);
    db.vcsettings.insertMany(settingList);
    db.vcsettings.deleteOne({name: 'Predict', type: 'SysConfig', vcid: systemvc._id})
  }

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2021-05-18T00:00:00"
if (currentVersion < dateBlock) {
  // insert _VCConfig Setting for EnableTraining

  var name = 'EnableTraining';
  var type = '_VCConfig';

  var settingList = db.vcsettings.find({vcid: systemvc._id, type: type, name: name}, {_id: 1}).toArray();
  if (settingList.length == 0) {
    var value = {level: 1, systemLimit: true, systemEnabled: false}
    db.vcsettings.insertOne({vcid: systemvc._id, name: name, type: type, value: value, createdAt: new Date(), updatedAt: new Date()})
    // add the settings for all VCs even deleted
    var vcList = db.visbocenters.find({system: {$exists: false}}, {_id:1}).toArray();
    print("Update EnableTraining Settings for VCs", vcList.length);
    settingList = [];
    vcList.forEach(item => settingList.push({vcid: item._id, name: name, type: type, value: value, createdAt: new Date(), updatedAt: new Date()}))
    // print("Prepared VCs", settingList.length);
    db.vcsettings.insertMany(settingList);
    db.vcsettings.deleteOne({name: 'Predict', type: 'SysConfig', vcid: systemvc._id})
  }
  var collectionName = 'predictkms';
  var collection = db.getCollectionInfos({name: collectionName});
  // print ("VisboGroup Collection  ", JSON.stringify(collection))
  if (!collectionName || collection.length == 0) {
    // print ("Need to Create Visbo Collection " + collectionName)
    db.createCollection( collectionName );
    db.predictkms.createIndex( { vpvid: 1 }, { name: "vpvid", unique: true } );
    db.predictkms.createIndex( { vpid: 1, timestamp:1 }, { name: "vpvidTS" } );
    print ("Visbo Collection Created" + collectionName)
  }
  // add task to initiate training on a daily base
  var taskName = 'Predict Collect'
  var setting = db.vcsettings.findOne({vcid: systemvc._id, type: "Task", name: taskName});
  if (!setting) {
    print ("Create Task " + taskName)
    db.vcsettings.insertOne({vcid: systemvc._id, name: taskName, type: "Task", value: {lastRun: new Date(), interval: 3600}, createdAt: new Date(), updatedAt: new Date()})
  }
  var taskName = 'Predict Training'
  var setting = db.vcsettings.findOne({vcid: systemvc._id, type: "Task", name: taskName});
  if (!setting) {
    print ("Create Task " + taskName)
    db.vcsettings.insertOne({vcid: systemvc._id, name: taskName, type: "Task", value: {lastRun: new Date(), interval: 86400}, createdAt: new Date(), updatedAt: new Date()})
  }

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2021-05-29T00:00:00"
if (currentVersion < dateBlock) {
  // remove outdated vccosts and vcroles from mongo
  db.vccosts.drop();
  db.vcroles.drop();

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2021-08-31T00:00:00"
if (currentVersion < dateBlock) {
  // Migrate status from vpv to vpStatus of VP

  db.visboprojects.update({vpStatus: {$exists: false}}, {$set: {vpStatus: 'initialized'}}, {multi: true});
  var vpList = db.visboprojects.find({deletedAt: {$exists: false}, vpStatus: 'initialized'}, {_id: 1}).toArray()
  var vpidList = [];
  vpList.forEach(vp => vpidList.push(vp._id));
  var vpvList = db.visboprojectversions.find({deletedAt: {$exists: false}, variantName: '', status: {$exists: true}, status: {$ne: ''}, vpid: {$in: vpidList}}, {_id: 1, vpid: 1, status: 1, timestamp: 1}).sort({vpid: 1, variantName: 1, timestamp: -1}).toArray();
  print("Found VPV", vpList.length, vpvList.length);
  var vpIDLast, count = 0;
  vpvList.forEach(vpv => {
    if (vpv.vpid.toString() != vpIDLast) {
      // update VP with vpStatus
      var vpStatus;
      if (vpv.status == 'beauftragt') vpStatus = 'ordered';
      else if (vpv.status == 'beauftragt, Änderung noch nicht freigegeben') vpStatus = 'ordered'
      else if (vpv.status == 'geplant') vpStatus = 'proposed'
      else if (vpv.status == 'planning') vpStatus = 'proposed'
      db.visboprojects.updateOne({_id: vpv.vpid}, {$set: { vpStatus: vpStatus}})
      vpIDLast = vpv.vpid.toString();
      count += 1;
    }
  })
  print("Updated VP Status", count);

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}
dateBlock = "2022-01-16T00:00:00"
if (currentVersion < dateBlock) {
  // DB Collection and Index Checks
  print ("Upgrade DB: Migrate Split Orga & Capacity")
  var collectionName = 'vccapacities';
  var collection = db.getCollectionInfos({name: collectionName});
  if (!collection || collection.length == 0) {
    // print ("Need to Create Visbo Capacity Collection ", collectionName)
    db.createCollection( collectionName );
    db.vccapacities.createIndex( { vcid: 1, roleID: 1, startOfYear: -1 }, { name: "unique", unique: true } );
    print ("Visbo Capacity Collection Created")
  }
  // migrate capacity from latest orga per VC to vccapacities
  var vcList = db.visbocenters.find({system: {$exists: false}}).toArray();
  var vcIDList = [];
  vcList.forEach(vc => {vcIDList.push(vc._id);});

  var vcOrgaList = db.vcsettings.find({type: 'organisation', vcid: {$in: vcIDList}, 'value.allRoles.kapazitaet': {$exists: true}}).toArray();
  print ("VC Orga List for capacity conversion", vcOrgaList.length)

  vcList.forEach(vc => {
    // print ("VC capacity conversion", vc.name, vc._id);
    var orga = vcOrgaList.find(item => item.vcid.toString() == vc._id.toString());
    if (!orga) {
      // print ("VC has no capacity to convert", vc.name);
      return;
    }
    // print ("VC has orga", vc.name, orga.name, orga.type, orga.timestamp.toISOString());
    orgaHasCapacity = 0;
    if (orga.value && orga.value.allRoles) {
      orga.value.allRoles.forEach(role => {
        if (role.kapazitaet && role.kapazitaet.length > 0) {
          // print ("Role Add kapazitaet", role.name, role.kapazitaet.length, role.startOfCal.toISOString());
          orgaHasCapacity += 1;
        }
      });
    }
    if (orgaHasCapacity) {
      print ("VC has orga with old capacity", vc.name, orgaHasCapacity);
      // remove capacity information from vccapacities
      result = db.vccapacities.deleteMany({vcid: vc._id});
      if (result.deletedCount) print ("VC old capacity deleted", result.deletedCount);
      var allRoles = orga.value.allRoles;
      var newCapacities = 0;
      allRoles.forEach(role => {
        if (role.kapazitaet && role.kapazitaet.length > 0) {
          role.kapazitaet.shift(); // first element is unused
          var startOfCal = new Date(role.startOfCal);
          var startMonth = startOfCal.getMonth();
          var startOfYear = new Date(startOfCal);
          startOfYear.setMonth(0);
          startOfYear.setDate(1);
          startOfYear.setHours(0, 0, 0, 0);
          while (role.kapazitaet.length > 0) {
            var capaPerMonth = [role.defaultKapa, role.defaultKapa, role.defaultKapa,
                                role.defaultKapa, role.defaultKapa, role.defaultKapa,
                                role.defaultKapa, role.defaultKapa, role.defaultKapa,
                                role.defaultKapa, role.defaultKapa, role.defaultKapa
                                ];
            // print ("Role Add kapazitaet", role.name, role.kapazitaet.length, role.startOfCal.toISOString(), startMonth);
            for (var i = startMonth; i < 12 && role.kapazitaet.length > 0; i++) {
              capaPerMonth[i] = role.kapazitaet.shift();
            }
            // create the new capacity entry for one year
            db.vccapacities.insertOne({vcid: vc._id, roleID: role.uid, startOfYear: startOfYear, capaPerMonth: capaPerMonth, createdAt: new Date(), updatedAt: new Date()})
            startMonth = 0;
            startOfYear.setFullYear(startOfYear.getFullYear() + 1);
            newCapacities++;
          }
        }
      });
      print ("VC new capacity created", newCapacities);
    }
    // remove the old kapazitaet & startOfCal
    var result = db.vcsettings.updateMany(
        {vcid: vc._id, type: 'organisation'},
        {$unset: {'value.allRoles.$[elem].kapazitaet': true}},
        {arrayFilters: [ { "elem.kapazitaet": { $exists: true } } ] }
      )
    db.vcsettings.updateMany(
        {vcid: vc._id, type: 'organisation'},
        {$unset: {'value.allRoles.$[elem].startOfCal': true}},
        {arrayFilters: [ { "elem.startOfCal": { $exists: true } } ] }
      )
    print ("VC updated Orgas for VC", vc.name, result.matchedCount, result.modifiedCount);
  });

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2022-01-31T00:00:00"
if (currentVersion < dateBlock) {
  // Remove capa values without VC and remove (only in 2022) capa values for 2024 and later the far future (240 month array)
  var vcList = db.visbocenters.find({system: {$exists: false}}).toArray();
  var vcIDList = [];
  vcList.forEach(vc => {vcIDList.push(vc._id);});

  var resultOrphan = db.vccapacities.deleteMany({vcid: {$nin: vcIDList}});
  if (resultOrphan.deletedCount) print ("Removed orphan capacity entries for destroyed VCs", resultOrphan.deletedCount);

  var resultFuture = db.vccapacities.deleteMany({startOfYear: {$gt: new Date('2023-12-01')}});
  if (resultFuture.deletedCount) print ("Removed far future capacity entries", resultFuture.deletedCount);

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2022-01-31T10:00:00"
if (currentVersion < dateBlock) {
  // set ttl for Create&Delete Lock
  var ttlDate = new Date();
  ttlDate.setMonth(ttlDate.getMonth() - 3);
  var result = db.visboaudits.updateMany({ actionDescription: {$in: ['Project Lock Create', 'Project Lock Delete']} },
    {$set: {ttl: ttlDate}}, {upsert: false, multi: "true"}
  )
  print("Updated TTL for Lock Items: ", result.modifiedCount);

  // remove farbe & tagessatzIntern from organisation
  var result = db.vcsettings.updateMany(
      {type: 'organisation'},
      {$unset: {'value.allRoles.$[elem].tagessatzIntern': true}},
      {arrayFilters: [ { "elem.tagessatz": { $exists: true } } ] }
    )
  print ("Updated VC Orgas removed tagessatzIntern", result.modifiedCount);

  result = db.vcsettings.updateMany(
      {type: 'organisation'},
      {$unset: {'value.allRoles.$[elem].farbe': true}},
      {arrayFilters: [ { "elem.farbe": { $exists: true } } ] }
    )
  print ("Updated VC Orgas removed farbe", result.modifiedCount);

  result = db.visboprojectversions.updateMany(
      {leadPerson: {$exists: true}},
      {$unset: {leadPerson: true}}
    )
  print ("Updated VPVs removed leadPerson", result.modifiedCount);

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2022-02-15T00:00:00"
if (currentVersion < dateBlock) {
  // Update type of role/cost in Organisation
  result = db.vcsettings.updateMany(
      {type: 'organisation'},
      {$set: {'value.allRoles.$[elem].type': 2}},
      {arrayFilters: [ { "elem.isTeam": true } ] }
    )
  print ("Updated VC Orgas set team type 2", result.modifiedCount);
  result = db.vcsettings.updateMany(
      {type: 'organisation'},
      {$set: {'value.allRoles.$[elem].type': 1}},
      {arrayFilters: [ { "elem.isTeam": {$exists: false} } ] }
    )
  print ("Updated VC Orgas set orga unit type 1", result.modifiedCount);
  result = db.vcsettings.updateMany(
      {type: 'organisation'},
      {$set: {'value.allCosts.$[elem].type': 3}},
      {arrayFilters: [ { "elem.uid": {$exists: true} } ] }
    )
  print ("Updated VC Orgas set cost type 3", result.modifiedCount);

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

dateBlock = "2022-02-16T00:00:00"
if (currentVersion < dateBlock) {
  // Change Orga Terms to english
  // Duplicate fields in organisation (tagessatz - dailyRate, defaultKapa - defCapaMonth, defaultDayCapa - defCapaDay)
  var OrgListAll = db.vcsettings.find({type: 'organisation'}).toArray();
  print("Orga List Length ", OrgListAll.length)
  var updatedCount = 0;
  OrgListAll.forEach(orga => {
    orga.value.allRoles.forEach(role => {
      role.dailyRate = role.tagessatz;
      role.defCapaMonth = role.defaultKapa;
      role.defCapaDay = role.defCapaDay;
    });
    result = db.vcsettings.replaceOne({_id: orga._id}, orga);
    updatedCount += result.matchedCount;
  });
  print("Orgas Updated", updatedCount);

  // Set the currentVersion in Script and in DB
  db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
  currentVersion = dateBlock
}

// dateBlock = "2000-01-01T00:00:00"
// if (currentVersion < dateBlock) {
//   // Prototype Block for additional upgrade topics run only once
//   // Set the currentVersion in Script and in DB
//   db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
//   currentVersion = dateBlock
// }

// Add an System Update Audit Entry
print("update to version: ", VERSION_REST)
var auditUpgrade = {};
auditUpgrade.action = "PUT";
if (oldVersion != currentVersion) {
  auditUpgrade.actionInfo = "From " + (oldVersion || '') + " to " + (currentVersion || '');
} else {
  auditUpgrade.actionInfo = "Without DB Changes";
}
auditUpgrade.actionInfo = "ReST Version " + VERSION_REST + " " + auditUpgrade.actionInfo;
auditUpgrade.actionDescription = "System Upgrade";
auditUpgrade.user = {"email": "System"};
auditUpgrade.createdAt = new Date();
auditUpgrade.updatedAt = new Date();
auditUpgrade.result = {};
auditUpgrade.result.time = 0;
auditUpgrade.result.status = 200;

db.visboaudits.insert(auditUpgrade)
// print(JSON.stringify(auditUpgrade))
