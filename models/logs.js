var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var logSchema = new mongoose.Schema({
	action: {type: String, required: true},
	actiongroup: {type: String, required: true},
	description: {type: String, required: true},
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: false},
	vpid: {type: Schema.Types.ObjectId, ref: 'VisboProject', required: false},
	email: {type: String, required: true},
	ipaddress: {type: String, required: false}
});
// Set Creation and modification date automatically
logSchema.set('timestamps', true);

// declare a model
mongoose.model('Log', logSchema);
