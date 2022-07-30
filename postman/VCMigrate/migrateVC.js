/* eslint-disable */

VPName='E3PA_Cayenne_v1';
VPName='Scania_DDW_TMS';
VPName='VW T7 CBT_TMS_L1';
VPName='Scania_DDW_SCM_TMS_von_Siggy';
VPName='VW T7 CBT_TMS_L1';
VPName='VW';
// VPName='Audi_Q7NF_Q9_TMS_L1_PM';
// VPName='Scania_DDW_TMS_von_Siggy - Kopie';

print('STDERR: Export BHTC');

var VCID='';

var exportList = [];

var len = 0;
var fullLen = 0;
var vcSettingList = db.appearances.find({}).toArray();
vcSettingList.forEach(setting => {
  var item = {};
  item.exportType = 'VCSetting';
  item.name = 'appearance';
  item.type = 'appearance';
  delete setting._id;
  item.value = JSON.stringify(setting);
  exportList.push(item);
  len++;
})
// vcSettingList = db.customizations.find({}).toArray();
// vcSettingList.forEach(setting => {
//   var item = {};
//   item.exportType = 'VCSetting';
//   item.name = 'customization';
//   item.type = 'customization';
//   delete setting._id;
//   item.value = JSON.stringify(setting);
//   exportList.push(item);
//   len++;
// })
print('STDERR: VCSettings found ', vcSettingList.length, 'exported', len);
fullLen += len;
len = 0;
vpNameList = [];
var vpList = db.projects.aggregate(
  [{
   $match: {
     // name: RegExp(VPName),
     variantName: ''
   }
  }, {
   $project: {
     name: 1
   }
  }, {
   $group: {
     _id: '$name',
     VPCount: {
     $sum: 1
    }
   }
  }, {
    $addFields: {
      name: '$_id'
    }
}]
).toArray();

// print('STDERR: VP List found ', vpList.length);
vpList.forEach(vp => {
  vpNameList.push(vp.name);
  vpNameList.push(vp.name.concat("#TMS"));
  var item = {};
  item.exportType = 'VP';
  item.name = vp.name;
  if (vp.name.search(/[^a-zäöüA-ZÄÖÜ0-9§.,+-_&\/%µ ]/) >= 0) {
    vp.name = vp.name.replace(/[^a-zäöüA-ZÄÖÜ0-9§.,+-_&\/%µ ]/g, "");
    print('STDERR: VP strange name normalized ', vp.name);
  }
  // item.vpType = vp.name.search('Template') >= 0 ? 2 : 0;
  item.vpType = 0;
  item.description = vp.description;

  let variant = [];
  variant.push("pfv");
  variant.push("orig");
  item.detail = JSON.stringify(variant);

  exportList.push(item);
  len++;
})
print('STDERR: VPs found ', vpList.length, 'exported', len);

fullLen += len;
len = 0;
print('STDERR: Exported Total ', fullLen);

// exportList.forEach(item => {
//   print(JSON.stringify(item));
// });
if (exportList.length > 0) {
  print(JSON.stringify(exportList));
}
