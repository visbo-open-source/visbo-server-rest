var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var restrictSchema = new Schema({
	name: { type: String, maxlength: 256, required: true },
	groupid: { type: Schema.Types.ObjectId, ref: 'VisboGroup', required: true },
	user: {
		userId: {type: Schema.Types.ObjectId, ref: 'User'},
		email: {type: String, required: false}
	},
	elementPath: [{ type: String, reuqired: true }],
	inclChildren: {type: Boolean, required: false},
	validUntil: { type: Date, reuqired: false },
	createdAt: { type: Date, reuqired: true }
});

var lockSchema = new Schema({
	variantName: { type: String, maxlength: 256 },
	email: { type: String, required: true, maxlength: 256 },
	createdAt: { type: Date, reuqired: true },
	expiresAt: { type: Date, reuqired: true }
});

var variantSchema = new Schema({
	variantName: { type: String, required: true, maxlength: 256 },
	description: { type: String, required: false, maxlength: 4096 },
	email: { type: String, required: false, maxlength: 256 },
	createdAt: { type: Date, reuqired: true },
	vpvCount: { type: Number, reuqired: true },
	vpfCount: { type: Number, reuqired: false }
});

var visboProjectSchema = new mongoose.Schema({
	name: { type: String, required: true, maxlength: 256},
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true},
	vpType: {type: Number, required: false},					// vpType: Project, Portfolio, ProjectTemplate
	vpStatus: { type: String, required: false, maxlength: 50 },
	managerId: {type: Schema.Types.ObjectId, ref: 'User', required: false},
	description: { type: String, required: false, maxlength: 4096 },
	kundennummer: { type: String, required: false, maxlength: 256 }, // customer project identifier
	customFieldDouble: [{
		name: {type: String, required: true},
		value: {type: Number, required: true},
		type: {type: String, required: false}
	}],
	customFieldString: [{
		name: {type: String, required: true},
		value: {type: String, required: true},
		type: {type: String, required: false}
	}],
	customFieldDate: [{
		name: {type: String, required: true},
		value: {type: Date, required: true},
		type: {type: String, required: false}
	}],
	vc: {
		name: { type: String, required: false, maxlength: 256},
		deletedAt: {type: Date, required: false}
	},
	vpvCount: { type: Number, required: true },
	vpfCount: { type: Number, reuqired: false },
	variant: [{type: variantSchema, required: false}],
	lock: [{type: lockSchema, required: false}],
	restrict: [{type: restrictSchema, required: false}],
	deletedAt: {type: Date, required: false }
});
// Set Creation and modification date automatically
visboProjectSchema.set('timestamps', true);

var constSystemCustomName = Object.freeze([
	'_businessUnit', '_risk', '_strategicFit', '_customerID', '_PMCommit'
]);

var constVPStatus = Object.freeze([
	'initialized', 'proposed', 'ordered', 'paused', 'finished', 'stopped'
]);

// declare a model
mongoose.model('VisboProject', visboProjectSchema);
mongoose.model('Lock', lockSchema);
mongoose.model('Variant', variantSchema);
mongoose.model('Restrict', restrictSchema);

module.exports = {
	constSystemCustomName: constSystemCustomName,
	constVPStatus: constVPStatus
};
