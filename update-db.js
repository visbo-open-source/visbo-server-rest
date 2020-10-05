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

// dateBlock = "2000-01-01T00:00:00"
// if (currentVersion < dateBlock) {
//   // Prototype Block for additional upgrade topics run only once
//   // Set the currentVersion in Script and in DB
//   db.vcsettings.updateOne({vcid: systemvc._id, name: 'DBVersion'}, {$set: {value: {version: dateBlock}, updatedAt: new Date()}}, {upsert: false})
//   currentVersion = dateBlock
// }

// Add an System Update Audit Entry
var auditUpgrade = {};
auditUpgrade.action = "PUT";
if (oldVersion != currentVersion) {
  auditUpgrade.actionInfo = "From " + (oldVersion || '') + " to " + (currentVersion || '');
} else {
  auditUpgrade.actionInfo = "Without DB Changes";
}
auditUpgrade.actionDescription = "System Upgrade";
auditUpgrade.user = {"email": "System"};
auditUpgrade.createdAt = new Date();
auditUpgrade.updatedAt = new Date();
auditUpgrade.result = {};
auditUpgrade.result.time = 0;
auditUpgrade.result.status = 200;

db.visboaudits.insert(auditUpgrade)
// print(JSON.stringify(auditUpgrade))
