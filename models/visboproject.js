var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var lockSchema = new Schema({
	variantName: { type: String },
	email: { type: String, required: true },
	createdAt: { type: Date, reuqired: true },
	expiresAt: { type: Date, reuqired: true }
});

var variantSchema = new Schema({
	variantName: { type: String, required: true },
	email: { type: String, required: false },
	createdAt: { type: Date, reuqired: true },
	vpvCount: { type: Number, reuqired: true }
});

var vpUserSchema = new Schema({
	userId: {type: Schema.Types.ObjectId, ref: 'User'},
	email: {type: String, required: true},
	role: {type: String, required: false}
});

var visboProjectSchema = new mongoose.Schema({
	name: { type: String, required: true, maxlength: 256},
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true},
//	portfolio: { type: Boolean, reuqired: false },
	vpType: {type: Number, required: false},					// vpType: 1 Project, 2 Portfolio, 3 ProjectTemplate
	description: { type: String, required: false },
	kundennummer: { type: String, required: false }, // customer project identifier
	vpPublic: {type: Boolean, required: false}, 			// Public means visible for all VC Users
	users: [{type: vpUserSchema, required: true }],
	vc: {
		name: { type: String, required: false, maxlength: 256}
	},
	vpvCount: { type: Number, reuqired: true },
	variant: [{type: variantSchema, required: false}],
	lock: [{type: lockSchema, required: false}],
	deleted: {
		deletedAt: {type: Date, required: false },
		byParent: {type: Boolean}
	}
});
// Set Creation and modification date automatically
visboProjectSchema.set('timestamps', true);

// declare a model
mongoose.model('VPUser', vpUserSchema);
mongoose.model('VisboProject', visboProjectSchema);
mongoose.model('Lock', lockSchema);
mongoose.model('Variant', variantSchema);
