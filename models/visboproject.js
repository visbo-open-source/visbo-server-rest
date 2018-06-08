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

var visboProjectSchema = new mongoose.Schema({
	name: { type: String, required: true, maxlength: 100},
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true},
	portfolio: { type: Boolean, reuqired: false },
	users: [{
		userId: {type: Schema.Types.ObjectId, ref: 'userId', required: false},
		email: {type: String, required: true},
		role: {type: String, required: true}
	}],
	vc: {
		name: { type: String, required: false, maxlength: 100}
	},
	vpvCount: { type: Number, reuqired: true },
	variant: [{type: variantSchema, required: false}],
	lock: [{type: lockSchema, required: false}]
});
// Set Creation and modification date automatically
visboProjectSchema.set('timestamps', true);

// declare a model
mongoose.model('VisboProject', visboProjectSchema);
mongoose.model('Lock', lockSchema);
mongoose.model('Variant', variantSchema);
