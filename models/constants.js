// Permission Values
var permSystem = Object.freeze({
		"View":1, "ViewAudit":2, "ViewLog":4, "ManagePerm":32,
		"ViewVC":128, "CreateVC":256, "ManageVC":512, "DeleteVC":1024
	})
const permSystemAll = 1959;

var permVC = Object.freeze({
	"View":1, "ViewAudit":2, "Modify":16, "ManagePerm":32, "CreateVP":256
});
const permVCAll = 307;
var permVP = Object.freeze({
	"View":1, "ViewAudit":2, "Modify":16, "ManagePerm":32, "CreateVPV":256, "Delete":1024
})
const permVPAll = 1331;

module.exports = {
	permSystem: permSystem,
	permVC: permVC,
	permVCAll: permVCAll,
	permVPAll: permVPAll,
	permVP: permVP
};
