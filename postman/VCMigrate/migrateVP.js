/* eslint-disable */

VPName='E3PA_Cayenne_v1';
VPName='Scania_DDW_TMS';
VPName='Scania_DDW_SCM_TMS_von_Siggy';
VPName='VW T7 CBT_TMS_L1';
VPName='VW';
// VPName='Audi_Q7NF_Q9_TMS_L1_PM';
// VPName='Scania_DDW_TMS_von_Siggy - Kopie';

print('STDERR: Export BHTC:', paramFrom);

var VCID='';
var from = new Date(paramFrom);
var to = new Date(paramFrom);
to.setMonth(to.getMonth() + 3);

var exportList = [];

var len = 0;
var fullLen = 0;

var vpvList = db.projects.find({
    // name: RegExp(VPName),
    $and: [
      { timestamp: {$gte: from} },
      { timestamp: {$lt: to} }
   ]
  }).sort({timestamp:1}).toArray();
print('STDERR: VPV List found ', vpvList.length);
// print('STDERR: Project List', vpNameList.length, vpNameList);
var vpvCount = 0;
var nameVPBaseline = [];
vpvList.forEach(vpv => {
  // to make the export smaller for some tests change the limit
  if (vpvCount++ > 10000) return;
  var item = {};
  item.exportType = 'VPV';
  // item._id = '' + vpv._id;
  // item.vpid = '' + vpv.vpid;
  var index = vpv.name.search("#".concat(vpv.variantName));
  if (vpv.variantName && index == vpv.name.length - vpv.variantName.length - 1) {
    item.name = vpv.name.substr(0, index);
  } else {
    item.name = vpv.name;
  }
  var variantName = '';
  if (vpv.variantName == 'TMS') {
    variantName = '';
  } else if (vpv.variantName == '') {
    variantName = 'orig';
  }
  vpv.variantName = variantName;
  item.timestamp = vpv.timestamp;
  item.baseline = 0;
  if (vpv.variantName == '' && nameVPBaseline.findIndex(entry => entry == item.name) < 0) {
    item.baseline = 1;
    nameVPBaseline.push(item.name);
  }
  var mappingName = [];
  var index = 0;
  delete vpv.updatedAt;
  // these fields were not used
  delete vpv.customBoolFields;
  delete vpv.customDblFields;
  delete vpv.customStringFields;
  delete vpv.updatedAt;
  var vpName = vpv.name;
  var vpTimestamp = vpv.timestamp.toISOString();
  delete vpv.name; delete vpv._id;
  if (vpv.keyMetrics) delete vpv.keyMetrics._id;

  vpv.AllPhases && vpv.AllPhases.forEach(phase => {
    phase.AllResults && phase.AllResults.forEach(result => {
      var newBewertungen = [];
      // print('STDERR: VPV Check bewertungen ', JSON.stringify(result.bewertungen));
      if (result.bewertungen) {
        const keys = Object.keys(result.bewertungen)
        // print('STDERR: VPV Before Convert bewertungen ', keys.length, JSON.stringify(keys));
        for (key in keys) {
          var newBewertung = {};
          newBewertung.key = keys[key];
          newBewertung.bewertung = result.bewertungen[keys[key]];
          const minDate = new Date('1900-01-01');
          if (newBewertung.bewertung && newBewertung.bewertung.datum) {
            const actDate = new Date(newBewertung.bewertung.datum);
            if (actDate.getTime() >= minDate.getTime()) {
              newBewertungen.push(newBewertung);
            } else {
              // print('STDERR: VPV Bewertung skipped date before 1900', key, JSON.stringify(newBewertung));
            }
          } else {
            // print('STDERR: VPV Bewertung skipped date undefined', key, JSON.stringify(newBewertung));
          }
          // print('STDERR: VPV Convert Done bewertungen ', key, JSON.stringify(newBewertung));
        }
      }
      result.bewertungen = newBewertungen;
      if (result.offset) result.offset = result.offset.valueOf();
      if (result.alternativeColor) result.alternativeColor = result.alternativeColor.valueOf();
    });
    var newGlobalBewertungen = [];
    if (phase.AllBewertungen) {
      // print('STDERR: VPV Check Global Bewertungen ', JSON.stringify(phase.AllBewertungen));
      const keys = Object.keys(phase.AllBewertungen)
      // print('STDERR: VPV Before Global Convert Bewertungen ', keys.length, JSON.stringify(keys));
      for (key in keys) {
        var newBewertung = {};
        newBewertung.key = keys[key];
        newBewertung.bewertung = phase.AllBewertungen[keys[key]];
        const minDate = new Date('1900-01-01');
        if (newBewertung.bewertung && newBewertung.bewertung.datum) {
          const actDate = new Date(newBewertung.bewertung.datum);
          if (actDate.getTime() >= minDate.getTime()) {
            newGlobalBewertungen.push(newBewertung);
          } else {
            // print('STDERR: VPV Bewertung(Global) skipped date before 1900', key, JSON.stringify(newBewertung));
          }
        } else {
          // print('STDERR: VPV Bewertung(Global) skipped date undefined', key, JSON.stringify(newBewertung));
        }
        // print('STDERR: VPV Convert Done Global Bewertungen ', key, JSON.stringify(newBewertung));
      }
      phase.AllBewertungen = newGlobalBewertungen;
    };
  });
  if (vpv.hierarchy) {
    var newAllNodes = [];
    if (vpv.hierarchy.allNodes) {
      // print('STDERR: VPV Check Hierarchy Node');
      const keys = Object.keys(vpv.hierarchy.allNodes)
      // print('STDERR: VPV Before Convert Hierarchy Node', keys.length);
      for (key in keys) {
        var newNode = {};
        var normalizedKey = keys[key];
        // replace sequence ~|° with .
        if (normalizedKey.search(/~\|°/) >= 0) {
          normalizedKey = normalizedKey.replace(/~\|°/g, ".");
          // print('STDERR: VPV Hierarchy strange dot sequence normalized ', vpName, vpTimestamp, normalizedKey);
        }
        var searchResult = normalizedKey.search(/[^a-zäöüßéA-ZÄÖÜ0-9()#*|“”'"´`–!§.,+-__&\/% ³°µ…~]/);
        if (searchResult >= 0) {
          // normalizedKey = normalizedKey.replace(/[^a-zäöüéA-ZÄÖÜ0-9()#*|“”'"§.,+-_&\/% ³µ…~]/g, "");
          print('STDERR: VPV Hierarchy strange name normalized (not done yet)', vpName, vpTimestamp, normalizedKey, searchResult,
            normalizedKey[searchResult ? searchResult - 1 : 0].charCodeAt(0).toString(16),
            normalizedKey[searchResult].charCodeAt(0).toString(16)
          );
        }
        newNode.hryNodeKey = normalizedKey;
        newNode.hryNode = {};
        const node = vpv.hierarchy.allNodes[keys[key]];
        newNode.hryNode.childNodeKeys = node.childNodeKeys;
        newNode.hryNode.elemName = node.elemName;
        newNode.hryNode.origName = node.origName;
        newNode.hryNode.parentNodeKey = node.parentNodeKey;
        newNode.hryNode.indexOfElem = node.indexOfElem;
        newAllNodes.push(newNode);
        // print('STDERR: VPV Convert Done Hierarchy Node', key, JSON.stringify(newNode));
      }
      newAllNodes.sort(function(a, b) { return a.hryNodeKey.localeCompare(b.hryNodeKey); });
    }
    vpv.hierarchy.allNodes = newAllNodes;
  }

  item.detail = JSON.stringify(vpv);
  exportList.push(item);
  len++;
  // if (exportList.length >= 100) {
  //   print('STDERR: Split Line ', exportList.length, fullLen, len);
  //   print(JSON.stringify(exportList));
  //   exportList = [];
  // }
})
print('STDERR: VPVs found ', vpvList.length, 'exported', len);

fullLen += len;
print('STDERR: Exported Total ', fullLen);

// exportList.forEach(item => {
//   print(JSON.stringify(item));
// });
if (exportList.length > 0) {
  print(JSON.stringify(exportList));
}
