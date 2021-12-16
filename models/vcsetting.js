var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var flatOrgaSchema = new Schema({
	name: {type: String, required: true},
	uid: {type: Number, required: true},
	path: {type: String, required: true},
	entryDate: {type: Date, required: false},
	exitDate: {type: Date, required: false},
	isExternRole: {type: String, required: false},
	defaultKapa: {type: Number, required: false},
	tagessatz: {type: Number, required: true},
	employeeNr: {type: String, required: false},
	defaultDayCapa: {type: Number, required: false},
	aliases: {type: String, required: false},
	type: {type: Number, required: false},
	isAggregationRole: {type: String, required: false},
	isSummaryRole: {type: String, required: false},
	isActDataRelevant: {type: String, required: false},
	level: {type: Number, required: false},
	isTeam: {type: String, required: false},
	percent: {type: Number, required: false},
});

var roleSchema = new Schema({
	uid: {type: Number, required: true},
	name: {type: String, required: true},
	subRoleIDs: [{
		key: {type: Number, required: true},
		value: {type: Number, required: true}
	}],
	teamIDs: [{					// duplicate definition: used for users to document in which teams they are member
		key: {type: Number, required: true},
		value: {type: Number, required: true}
	}],
	employeeNr: {type: String, required: false},
	entryDate: {type: Date, required: false},
	exitDate: {type: Date, required: false},
	aliases: {type: String, required: false},
	farbe: {type: Number, required: false},
	tagessatz: {type: Number, required: true},
	defaultKapa: {type: Number, required: false},
	defaultDayCapa: {type: Number, required: false},
	kapazitaet: [{type: Number, required: false}],
	startOfCal: {type: Date, required: false},
	isExternRole: {type: Boolean, required: false},
	isActDataRelevant: {type: Boolean, required: false},
	isAggregationRole: {type: Boolean, required: false},
	isSummaryRole: {type: Boolean, required: false},
	isTeam: {type: Boolean, required: false}
});

var costSchema = new Schema({
	uid: {type: Number, required: true},
	name: {type: String, required: true},
	subCostIDs: [{
		key: {type: Number, required: true},
		value: {type: Number, required: true}
	}],
	farbe: {type: Number, required: false}
});

var fullOrgaSchema = new Schema({
	allRoles: [{type: roleSchema, required: false}],
	allCosts: [{type: costSchema, required: false}],
	validFrom: {type: Date, required: true}
});

var vcSettingSchema = new mongoose.Schema({
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true},
	type: { type: String, required: true, maxlength: 20},
	name: { type: String, required: true, maxlength: 100},
	userId: {type: Schema.Types.ObjectId, ref: 'User', required: false},
	timestamp: { type: Date, required: false},
	value: { type: Schema.Types.Mixed, required: true }
});
// Set Creation and modification date automatically
vcSettingSchema.set('timestamps', true);
// declare a model
mongoose.model('VCSetting', vcSettingSchema);
