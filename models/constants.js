// Permission Values
var constPermSystem = Object.freeze({
		"View":1, "ViewAudit":2, "ViewLog":4, "Modify":16, "ManagePerm":32,
		"CreateVC":256, "DeleteVC":1024
	})
const constPermSystemAll = 1+2+4+16+32+256+1024;

var constPermVC = Object.freeze({
	"View":1, "ViewAudit":2, "Modify":16, "ManagePerm":32, "CreateVP":256
});
const constPermVCAll = 1+2+16+32+256;
var constPermVP = Object.freeze({
	"View":1, "ViewAudit":2, "Modify":16, "ManagePerm":32, "CreateVariant":256, "Delete":1024
})
const constPermVPAll = 1+2+16+32+256+1024;

// Permission Handling Object
function VisboPermission() {
  this.length = 0;
  this.permList = {};
  this.addPerm = function(id, perm) {
		if (perm == undefined) return;
		if (id == undefined) return;
		if (this.permList[id] == undefined) {
			this.permList[id] = {system: 0, vc: 0, vp: 0};
			this.length += 1;
		}
		this.permList[id].system = this.permList[id].system | perm.system;
		this.permList[id].vc = this.permList[id].vc | perm.vc;
		this.permList[id].vp = this.permList[id].vp | perm.vp;
	};
	this.getPerm = function(id) {
		var result = this.permList[id] || {system: 0, vc: 0, vp: 0};
		if (id) delete result.system;
		return result
	};
	this.getVCIDs = function(requiredPerm) {
		var idList = [];
		for (var id in this.permList) {
			if ((this.permList[id].vc & requiredPerm) == requiredPerm) {
				idList.push(id)
			}
		}
		return idList;
	}
	this.getVPIDs = function(requiredPerm) {
		var idList = [];
		for (var id in this.permList) {
			if ((this.permList[id].vp & requiredPerm) == requiredPerm) {
				idList.push(id)
			}
		}
		return idList;
	}
}

module.exports = {
	constPermSystem: constPermSystem,
	constPermVC: constPermVC,
	constPermSystemAll: constPermSystemAll,
	constPermVCAll: constPermVCAll,
	constPermVPAll: constPermVPAll,
	constPermVP: constPermVP,
	VisboPermission: VisboPermission
};
