var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var clsHierarchyNode = new Schema({
	elemName: { type: String },
	origName: { type: String },
	indexOfElem: { type: Number },
	parentNodeKey: { type: String },
	childNodeKeys: [{ type: String }]
});

var clsRole = new Schema({
	RollenTyp: { type: Number },
	name: { type: String },
	farbe: { type: Number },
	startkapa: { type: Number },
	tagessatzIntern: { type: Number },
	tagessatzExtern: { type: Number },
	Bedarf: [{ type: Number }],
	isCalculated: { type: Boolean }
});

var clsKostenart = new Schema({
	KostenTyp: { type: Number },
	name: { type: String },
	farbe: { type: Number },
	Bedarf: [{ type: Number }]
});

var clsResult = new Schema({
	bewertungen:{type: Schema.Types.Mixed},
	name: { type: String },
	verantwortlich: { type: String },
	offset: { type: Number },
	alternativeColor: { type: Number },
	shortName: { type: String },
	originalName: { type: String },
	appearance: { type: String },
	deliverables: [{ type: String }],
	percentDone: { type: Number }
});

var clsPhase = new Schema({
	AllRoles: [{ type: clsRole }],
	AllCosts: [{ type: clsKostenart }],
	AllResults: [{ type: clsResult }],
	AllBewertungen: {type: Schema.Types.Mixed},

	percentDone: { type: Number },
	responsible: { type: String },
	deliverables: [{ type: String }],
	ampelStatus: { type: Number },
	ampelErlaeuterung: { type: String },
	earliestStart: { type: Number },
	latestStart: { type: Number },
	minDauer: { type: Number },
	maxDauer: { type: Number },
	relStart: { type: Number },
	relEnde: { type: Number },
	startOffsetinDays: { type: Number },
	dauerInDays: { type: Number },
	name: { type: String },
	farbe: { type: Number },
	shortName: { type: String },
	originalName: { type: String },
	appearance: { type: String }
});


var visboProjectVersionSchema = new mongoose.Schema({
//	_id: { type: String },												//MS is required as the ID was originally created manually and has self generated ids
	name: { type: String, required: true, maxlength: 100},
	vpid: {type: Schema.Types.ObjectId, ref: 'VisboProject', required: true},
	variantName: { type: String, required: false, maxlength: 100},
	deleted: {
		deletedAt: {type: Date, required: false },
		byParent: {type: Boolean}
	},
	variantDescription: { type: String, required: false, maxlength: 500},
	Risiko: { type: Number, required: false},
	StrategicFit: { type: Number, required: false},
  customDblFields: {type: Schema.Types.Mixed},
	customStringFields: {type: Schema.Types.Mixed},
	customBoolFields: {type: Schema.Types.Mixed},
	Erloes: { type: Number, required: false},
	leadPerson: { type: String, required: false, maxlength: 100},
	tfSpalte: { type: Number, required: false},
	tfZeile: { type: Number, required: false},
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
	AllPhases: [{ type: clsPhase, required: false}],
	hierarchy: {
		allNodes: {type: Schema.Types.Mixed}
	},
	timestamp: { type: Date, required: false},
	volumen: { type: Number, required: false},
	complexity: { type: Number, required: false},
	description: { type: String, required: false, maxlength: 500},
	businessUnit: { type: String, required: false, maxlength: 100}
});
// Set Creation and modification date automatically
visboProjectVersionSchema.set('timestamps', true);

// declare a model
mongoose.model('VisboProjectVersion', visboProjectVersionSchema);
