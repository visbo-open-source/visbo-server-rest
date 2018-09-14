var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var vcCostSchema = new mongoose.Schema({
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true},
	name: { type: String, required: true, maxlength: 100},
	uid: { type: Number, required: false},
	farbe: { type: Number, required: false},
	timestamp: { type: Date, required: true}
});
// Set Creation and modification date automatically
vcCostSchema.set('timestamps', true);

// declare a model
mongoose.model('VCCost', vcCostSchema);
