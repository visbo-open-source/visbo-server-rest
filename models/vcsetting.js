var mongoose = require('mongoose');
var Schema = mongoose.Schema;

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
