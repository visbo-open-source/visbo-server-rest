var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var vcCapacitySchema = new mongoose.Schema({
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true},
	roleID: { type: Number, required: true},
	startOfYear: { type: Date, required: true},
	capaPerMonth: [{ type: Number, required: true}]
});
// prevent duplicate capacity definitions for same VC, role and year
vcCapacitySchema.index({ vcid: 1, roleID: 1, startOfYear: 1 }, { unique: true });
// Set Creation and modification date automatically
vcCapacitySchema.set('timestamps', true);
// declare a model
mongoose.model('VCCapacity', vcCapacitySchema);
