var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var vcRoleSchema = new mongoose.Schema({
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true},
	name: { type: String, required: true, maxlength: 100},
	uid: { type: Number, required: false},
	subRoleIDs : {type: Schema.Types.Mixed},
	farbe: { type: Number, required: false},
	defaultKapa	: { type: Number, required: false},
	tagessatzIntern	: { type: Number, required: false},
	tagessatzExtern	: { type: Number, required: false},
	kapazitaet : [{type: Number}],
	externeKapazitaet : [{type: Number}],
	timestamp: { type: Date, required: true},
	startOfCal: { type: Date, required: false}
});
// Set Creation and modification date automatically
vcRoleSchema.set('timestamps', true);

// declare a model
mongoose.model('VCRole', vcRoleSchema);
