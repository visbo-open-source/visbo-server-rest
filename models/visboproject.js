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
	vpType: {type: Number, required: false},					// vpType: Project, Portfolio, ProjectTemplate
	description: { type: String, required: false },
	kundennummer: { type: String, required: false }, // customer project identifier
	vc: {
		name: { type: String, required: false, maxlength: 256},
		deletedAt: {type: Date, required: false}	
	},
	vpvCount: { type: Number, required: true },
	variant: [{type: variantSchema, required: false}],
	lock: [{type: lockSchema, required: false}],
	deletedAt: {type: Date, required: false }
});
// Set Creation and modification date automatically
visboProjectSchema.set('timestamps', true);

// declare a model
mongoose.model('VPUser', vpUserSchema);
mongoose.model('VisboProject', visboProjectSchema);
mongoose.model('Lock', lockSchema);
mongoose.model('Variant', variantSchema);
