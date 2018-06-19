var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var visboCenterSchema = new mongoose.Schema({
	name: { type: String, required: true, maxlength: 100 },
	users: [{
		userId: {type: Schema.Types.ObjectId, ref: 'User'},
		email: {type: String, required: true},
		role: {type: String, required: false}
	}],
	vpCount: { type: Number, reuqired: false },
	deleted: {
		deletedAt: {type: Date, required: false },
		byParent: {type: Boolean}
	},
	system: {type: Boolean}
});
// Set Creation and modification date automatically
visboCenterSchema.set('timestamps', true);

// declare a model
mongoose.model('VisboCenter', visboCenterSchema);
