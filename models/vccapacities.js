var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var vcCapacitySchema = new mongoose.Schema({
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true},
	roleID: { type: Number, required: true},
	startOfYear: { type: Date, required: true},
	capaPerMonth: [{ type: Number, required: true}]
});
// Set Creation and modification date automatically
vcCapacitySchema.set('timestamps', true);
// declare a model
mongoose.model('VCCapacity', vcCapacitySchema);
