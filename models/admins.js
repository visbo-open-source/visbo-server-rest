var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var adminSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true
	},
	name: {
		type: String,
		required: true,
		maxlength: 100
	},
	password: {
		type: String,
		required: true
	},
	created_at: {
		type: Date,
		default: Date.now
	},
	profile: {
		dob: {
			type: Date,
			required: true
		},
		address: {
			type: String,
			maxlength: 100,
			minlength: 5,
			default: 'not set'
		},
		company: {
			type: String,
			maxlength: 100,
			minlength: 2,
			default: 'not set'
		},
		phone: {
			type: String,
			minlength: 6,
			maxlength: 20,
			default: 'not set'
		},
		updated_at: { type: Date }
	},
	logs: [{
		type: Schema.Types.ObjectId,
		ref: 'Log'
	}]
});

// declare a model
mongoose.model('Admin', adminSchema);
