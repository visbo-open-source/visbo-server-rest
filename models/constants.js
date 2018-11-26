// Permission Values
var constPermSystem = Object.freeze({
		"View":1, "ViewAudit":2, "ViewLog":4, "ManagePerm":32,
		"ViewVC":128, "CreateVC":256, "ManageVC":512, "DeleteVC":1024
	})
const constPermSystemAll = 1959;

var constPermVC = Object.freeze({
	"View":1, "ViewAudit":2, "Modify":16, "ManagePerm":32, "CreateVP":256
});
const constPermVCAll = 307;
var constPermVP = Object.freeze({
	"View":1, "ViewAudit":2, "Modify":16, "ManagePerm":32, "CreateVariant":256, "Delete":1024
})
const constPermVPAll = 1331;

module.exports = {
	constPermSystem: constPermSystem,
	constPermVC: constPermVC,
	constPermSystemAll: constPermSystemAll,
	constPermVCAll: constPermVCAll,
	constPermVPAll: constPermVPAll,
	constPermVP: constPermVP
};
