var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var visboProjectVersionSchema = new mongoose.Schema({
	name: { type: String, required: true, maxlength: 100},
	vpid: {type: Schema.Types.ObjectId, ref: 'VisboProject', required: true},
	variantName: { type: String, required: false, maxlength: 100},
	variantDescription: { type: String, required: false, maxlength: 500},
	Risiko: { type: Number, required: false},
	StrategicFit: { type: Number, required: false},
	Erloes: { type: Number, required: false},
	leadPerson: { type: String, required: false, maxlength: 100},
	startDate: { type: Date, required: false},
	endDate: { type: Date, required: false},
	earliestStart: { type: Number, required: false},
	earliestStartDate: { type: Date, required: false},
	latestStart: { type: Number, required: false},
	latestStartDate: { type: Date, required: false},
	status: { type: String, required: false, maxlength: 100},
	ampelStatus: { type: Number, required: false},
	ampelErlaeuterung: { type: String, required: false, maxlength: 500},
	farbe: { type: Number, required: false},
	Schrift: { type: Number, required: false},
	Schriftfarbe: { type: Number, required: false},
	VorlagenName: { type: String, required: false, maxlength: 100},
	Dauer: { type: Number, required: false},
// Missing AllPhases
	timestamp: { type: Date, required: false},
	volumen: { type: Number, required: false},
	complexity: { type: Number, required: false},
	description: { type: String, required: false, maxlength: 500},
	businessUnit: { type: String, required: false, maxlength: 100}
});
// Set Creation and modification date automatically
visboProjectVersionSchema.set('timestamps', true);

// declare a model
mongoose.model('Project', visboProjectVersionSchema);
