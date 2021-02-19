/* eslint-disable */

VCName='InstartGroup';
// VCName='Test-MS-VC Small';
VPName='^';

print('STDERR: Export VC: ', VCName);

var VCID='';

function annonymise(value) {
  strAnonymise = /[a-zA-Z]/g;
  if (!value || value == '') {
    return value;
  } else if (value) {
    return value.replace(strAnonymise, 'x');
  }
}

var exportList = [];
var vc = db.visbocenters.findOne({name: VCName, deletedAt: {$exists: false}});
if (vc) {
  print('STDERR: VC found ', vc.name, vc._id);
  VCID = vc._id;
  var item = {};
  item.exportType = 'VC';
  item._id = '' + vc._id;
  item.name = '' + vc._id
  item.description = annonymise(vc.description);
  item.detail = undefined;
  exportList.push(item);
}

len = exportList.length;
var vcSettingList = db.vcsettings.find({vcid: VCID, deletedAt: {$exists: false} }).sort({timestamp:1}).toArray();
vcSettingList.forEach(setting => {
  var item = {};
  item.exportType = 'VCSetting';
  item.name = '' + setting.name;
  item.type = setting.type;
  item.timestamp = setting.timestamp;
  if (setting.type == 'organisation' && setting.value && setting.value.allRoles) {
    // annonymise the user names
    setting.value.allRoles.forEach(orgaUnit => {
      orgaUnit.name = 'U'.concat(orgaUnit.uid, '-', annonymise(orgaUnit.name));
    })
  }
  item.value = JSON.stringify(setting.value);
  if (setting.type != 'customroles' && !setting.userId) {
    exportList.push(item);
  }
})
print('STDERR: VCSettings found ', vcSettingList.length, 'exported', exportList.length - len);

len = exportList.length;
vpIDList = [];
var vpList = db.visboprojects.find({vcid: VCID, name: {$regex : VPName}, deletedAt: {$exists: false} }).toArray();
vpList.forEach(vp => {
  vpIDList.push(vp._id);
  var item = {};
  item.exportType = 'VP';
  item._id = '' + vp._id;
  item.name = '' + vp._id
  item.vpType = '' + vp.vpType;
  item.description = annonymise(vp.description);
  if (vp.kundennummer) item.kundennummer = annonymise(vp.kundennummer);

  let variant = [];
  vp.variant.forEach(element => variant.push(element.variantName));
  item.detail = JSON.stringify(variant);
  exportList.push(item);
})
print('STDERR: VPs found ', vpList.length, 'exported', exportList.length - len);

len = exportList.length;
var vpvList = db.visboprojectversions.find({vpid: {$in: vpIDList}, deletedAt: {$exists: false}}).sort({timestamp:1}).toArray();
vpvList.forEach(vpv => {
  var item = {};
  item.exportType = 'VPV';
  item._id = '' + vpv._id;
  item.vpid = '' + vpv.vpid;
  item.name = '' + vpv.vpid;
  item.timestamp = vpv.timestamp;
  // strAnonymise VPV
  delete vpv.updatedAt;
  if (vpv.hierarchy && vpv.hierarchy.allNodes) {
    vpv.hierarchy.allNodes.forEach(node => {
      delete node._id;
      if (node.hryNodeKey) node.hryNodeKey = annonymise(node.hryNodeKey);
      if (node.hryNode) {
        delete node.hryNode._id;
        node.hryNode.childNodeKeys.forEach((key, index) => {
          node.hryNode.childNodeKeys[index] = annonymise(key);
        })
        if (node.hryNode.elemName) node.hryNode.elemName = annonymise(node.hryNode.elemName);
        if (node.hryNode.origName) node.hryNode.origName = annonymise(node.hryNode.origName);
        if (node.hryNode.parentNodeKey) node.hryNode.parentNodeKey = annonymise(node.hryNode.parentNodeKey);
      }
    })
  }
  vpv.customDblFields.forEach(customfield => {
    delete customfield._id;
    customfield.strkey = annonymise(customfield.strkey);
  });
  vpv.customStringFields.forEach(customfield => {
    delete customfield._id;
    customfield.strkey = annonymise(customfield.strkey);
    customfield.strvalue = annonymise(customfield.strvalue);
  });
  vpv.AllPhases.forEach(phase => {
      delete phase._id;
      if (phase.deliverables && typeof phase.deliverables == 'object') {
        phase.deliverables.forEach((delivery, index) => {
          if (delivery) phase.deliverables[index] = annonymise(delivery) || 'UNKNOWN'; // not allowed to be empty
        });
      }
      phase.AllRoles.forEach(role => {
        delete role._id;
      });
      phase.AllCosts.forEach(cost => {
        delete cost._id;
        cost.name = annonymise(cost.name);
      });
      phase.AllResults.forEach(result => {
        delete result._id;
        result.deliverables.forEach((delivery, index) => {
          if (delivery) result.deliverables[index] = annonymise(delivery) || 'UNKNOWN'; // not allowed to be empty
        });
        result.bewertungen.forEach( item => {
          delete item._id;
          if (item.bewertung) {
            delete item.bewertung._id;
            if (item.bewertung.description) item.bewertung.description = annonymise(item.bewertung.description);
            if (item.bewertung.deliverables) item.bewertung.deliverables = annonymise(item.bewertung.deliverables) || 'UNKNOWN'; // not allowed to be empty
            if (item.bewertung.bewerterName) item.bewertung.bewerterName = annonymise(item.bewertung.bewerterName);
          }
        });
        if (result.name) result.name = annonymise(result.name);
        if (result.verantwortlich) result.verantwortlich = annonymise(result.verantwortlich);
        if (result.shortName) result.shortName = annonymise(result.shortName);
        if (result.originalName) result.originalName = annonymise(result.originalName);
      });
      phase.AllBewertungen.forEach( item => {
        delete item._id;
        if (item.bewertung) {
          delete item.bewertung._id;
          if (item.bewertung.description) item.bewertung.description = annonymise(item.bewertung.description);
          if (item.bewertung.deliverables) item.bewertung.deliverables = annonymise(item.bewertung.deliverables) || 'UNKNOWN'; // not allowed to be empty
          if (item.bewertung.bewerterName) item.bewertung.bewerterName = annonymise(item.bewertung.bewerterName);
        }
      });
      if (phase.responsible) phase.responsible = annonymise(phase.responsible)
      if (phase.ampelErlaeuterung) phase.ampelErlaeuterung = annonymise(phase.ampelErlaeuterung)
      if (phase.name) phase.name = annonymise(phase.name)
      if (phase.shortName) phase.shortName = annonymise(phase.shortName)
      if (phase.originalName) phase.originalName = annonymise(phase.originalName)
  });
  delete vpv.name; delete vpv._id;
  if (vpv.keyMetrics) delete vpv.keyMetrics._id;
  if (vpv.variantDescription) vpv.variantDescription = annonymise(vpv.variantDescription)
  if (vpv.leadPerson) vpv.leadPerson = annonymise(vpv.leadPerson)
  if (vpv.ampelErlaeuterung) vpv.ampelErlaeuterung = annonymise(vpv.ampelErlaeuterung)
  if (vpv.VorlagenName) vpv.VorlagenName = annonymise(vpv.VorlagenName)
  if (vpv.description) vpv.description = annonymise(vpv.description)
  if (vpv.businessUnit) vpv.businessUnit = annonymise(vpv.businessUnit)
  if (vpv.VorlagenName) vpv.VorlagenName = annonymise(vpv.VorlagenName)

  item.detail = JSON.stringify(vpv);
  exportList.push(item);
})
print('STDERR: VPVs found ', vpvList.length, 'exported', exportList.length - len);

len = exportList.length;
var vpfList = db.visboportfolios.find({vpid: {$in: vpIDList}, deletedAt: {$exists: false}}).sort({timestamp:1}).toArray();
vpfList.forEach(vpf => {
  var item = {};
  item.exportType = 'VPF';
  item._id = '' + vpf._id;
  item.vpid = '' + vpf.vpid;
  item.name = '' + vpf.vpid;
  item.timestamp = vpf.timestamp;
  // strAnonymise VPF
  delete vpf.updatedAt;
  delete vpf.updatedFrom;

  vpf.allItems && vpf.allItems.forEach(item => {
      delete item._id;
      item.vpid = '' + item.vpid;
      item.name = '' + item.vpid;
      item.reasonToInclude = annonymise(item.reasonToInclude);
      item.reasonToExclude = annonymise(item.reasonToExclude);
  });
  vpf.sortList = [];
  delete vpf.name; delete vpf._id;

  item.detail = JSON.stringify(vpf);
  exportList.push(item);
})
print('STDERR: VPFs found ', vpfList.length, 'exported', exportList.length - len);

print('STDERR: Exported Total ', exportList.length);

print(JSON.stringify(exportList));
