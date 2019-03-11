var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userAgentSchema = new Schema({
	userAgent: { type: String, reuqired: true },
	createdAt: { type: Date, reuqired: true },
	lastUsedAt: { type: Date, reuqired: true }
});

var userSchema = new mongoose.Schema({
	email: {type: String, required: true},
	name: {type: String, required: false, maxlength: 100},
	password: {type: String, required: false},
	profile: {
		// address: {type: String, maxlength: 100, minlength: 5, default: 'not set'},
		firstName: {type: String, required: false, maxlength: 100},
		lastName: {type: String, required: false, maxlength: 100},
		company: {type: String, maxlength: 100},
		phone: {type: String, maxlength: 20},
		address: {
			street: {type: String, maxlength: 100},
			city: {type: String, maxlength: 100},
			zip: {type: String, maxlength: 10},
			state: {type: String, maxlength: 100},
			country: {type: String, maxlength: 100}
		}
	},
	status: {
		registeredAt: {type: Date, required: false},
		lockedUntil: {type: Date, required: false},
		lastLoginAt: {type: Date, required: false},
		lastLoginFailedAt: {type: Date},
		loginRetries: {type: Number, required: false},
		lastPWResetAt: {type: Date, required: false},
		expiresAt: {type: Date, required: false}
	},
	userAgents: [{type: userAgentSchema, required: false}],
	session: {
		ip: {type: String, required: false},
		ticket: {type: String, required: false}
	}
});
// Set Creation and modification date automatically
userSchema.set('timestamps', true);

// declare a model
mongoose.model('User', userSchema);
