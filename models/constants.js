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

module.exports = {
	constPermSystem: constPermSystem,
	constPermVC: constPermVC,
	constPermSystemAll: constPermSystemAll,
	constPermVCAll: constPermVCAll,
	constPermVPAll: constPermVPAll,
	constPermVP: constPermVP
};
