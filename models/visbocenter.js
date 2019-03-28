var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var visboCenterSchema = new mongoose.Schema({
	name: { type: String, required: true, maxlength: 256 },
	description: { type: String, required: false, maxlength: 4096 },
	vpCount: { type: Number, reuqired: false },
	deletedAt: {type: Date, required: false },
	system: {type: Boolean}
});
// Set Creation and modification date automatically
visboCenterSchema.set('timestamps', true);

// declare a model
mongoose.model('VisboCenter', visboCenterSchema);
