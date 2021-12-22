// Organisation Object
function VisboOrga(validFrom) {
	this.allRoles = [];
	this.allCosts = [];
	this.validFrom = validFrom ? new Date(validFrom) : undefined;
}

function VisboOrgaRole(uid, name) {
	this.uid = uid;
	this.name = name;
}

function VisboOrgaCost(uid, name) {
	this.uid = uid;
	this.name = name;
}

// var flatOrgaSchema = new Schema({
// 	name: {type: String, required: true},
// 	uid: {type: Number, required: true},
// 	path: {type: String, required: true},
// 	entryDate: {type: Date, required: false},
// 	exitDate: {type: Date, required: false},
// 	isExternRole: {type: String, required: false},
// 	defaultKapa: {type: Number, required: false},
// 	tagessatz: {type: Number, required: true},
// 	employeeNr: {type: String, required: false},
// 	defaultDayCapa: {type: Number, required: false},
// 	aliases: {type: String, required: false},
// 	type: {type: Number, required: false},
// 	isAggregationRole: {type: String, required: false},
// 	isSummaryRole: {type: String, required: false},
// 	isActDataRelevant: {type: String, required: false},
// 	level: {type: Number, required: false},
// 	isTeam: {type: String, required: false},
// 	percent: {type: Number, required: false},
// });

module.exports = {
	VisboOrgaRole: VisboOrgaRole,
	VisboOrgaCost: VisboOrgaCost,
	VisboOrga: VisboOrga
};
