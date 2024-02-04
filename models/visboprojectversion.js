var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var clsHierarchyNode = new Schema({
	elemName: { type: String },
	origName: { type: String },
	indexOfElem: { type: Number },
	parentNodeKey: { type: String },
	childNodeKeys: [{ type: String }]
});

var clsBewertung = new Schema({
	color: { type: Number },
	description: { type: String },
	deliverables: { type: String },
	bewerterName: { type: String },
	datum: { type: String }
});

var clsRole = new Schema({
	RollenTyp: { type: Number },
	teamID: {type: Number},
	Bedarf: [{ type: Number }]
});

var clsKostenart = new Schema({
	KostenTyp: { type: Number },
	name: { type: String },
	Bedarf: [{ type: Number }]
});

var clsResult = new Schema({
	bewertungen:[{key: {type: String, required: true}, bewertung: {type: clsBewertung, required: true}}],
	name: { type: String },
	verantwortlich: { type: String },
	offset: { type: Number },
	alternativeColor: { type: Number },
	shortName: { type: String },
	originalName: { type: String },
	appearance: { type: String },
	deliverables: [{ type: String, required: true }],
	percentDone: { type: Number },
	invoice: { type: Schema.Types.Mixed },
	penalty: { type: Schema.Types.Mixed }
	// invoice: { value: { type: Number }, termsOfPayment: { type: Number } },
	// penalty: { penaltyDate: { type: Date }, value: { type: Number } }
});

var clsPhase = new Schema({
	AllRoles: [{ type: clsRole, required: true }],
	AllCosts: [{ type: clsKostenart, required: true}],
	AllResults: [{ type: clsResult, required: true }],
	AllBewertungen: [{key: {type: String, required: true}, bewertung: {type: clsBewertung, required: true}}],
	percentDone: { type: Number },
	invoice: { type: Schema.Types.Mixed },
	penalty: { type: Schema.Types.Mixed },
	// invoice: { value: { type: Number }, termsOfPayment: { type: Number } },
	// penalty: { value: { type: Number }, penaltyDate: { type: Date } },
	responsible: { type: String },
	deliverables: [{ type: String , required: true}],
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
	shortName: { type: String },
	originalName: { type: String },
	appearance: { type: String }
});

var clsKeyMetrics = new Schema({
	RACBaseLast: { type: Number },
	RACCurrent: { type: Number },
	RACBaseLastActual: { type: Number },
	RACCurrentActual: { type: Number },
	costCurrentActual: { type: Number },
	costCurrentTotal: { type: Number },
	costCurrentTotalPredict: { type: Number },
	costBaseLastActual: { type: Number },
	costBaseLastTotal: { type: Number },
	timeCompletionCurrentActual: { type: Number },
	timeCompletionBaseLastActual: { type: Number },
	timeCompletionCurrentTotal: { type: Number },
	timeCompletionBaseLastTotal: { type: Number },
	timeDelayFinished: { type: Number },
  	timeDelayUnFinished: { type: Number },
	endDateCurrent: { type: Date },
	endDateBaseLast: { type: Date },
	deliverableCompletionCurrentActual: { type: Number },
	deliverableCompletionCurrentTotal: { type: Number },
	deliverableCompletionBaseLastActual: { type: Number },
	deliverableCompletionBaseLastTotal: { type: Number },
	deliverableDelayFinished: { type: Number },
  	deliverableDelayUnFinished: { type: Number },
	baselineDate: { type: Date },
	baselineVPVID: {type: Schema.Types.ObjectId, ref: 'visboProjectVersionSchema', required: false}
});


var visboProjectVersionSchema = new mongoose.Schema({
	name: { type: String, required: true, maxlength: 256},
	vpid: {type: Schema.Types.ObjectId, ref: 'VisboProject', required: true},
	variantName: { type: String, required: false, maxlength: 256},
	deletedAt: {type: Date, required: false },
	deletedByParent: {type: String, required: false, maxlength: 16 },
	variantDescription: { type: String, required: false, maxlength: 4096},
	Risiko: { type: Number, required: false},
	StrategicFit: { type: Number, required: false},
	customDblFields: [{str: {type: String, required: true}, dbl: {type: Number, required: true}}],
	customStringFields: [{strkey: {type: String, required: true}, strvalue: {type: String, required: true}}],
	customBoolFields: [{str: {type: String, required: true}, bool: {type: Boolean, required: true}}],
	Erloes: { type: Number, required: false},
	actualDataUntil: { type: Date, required: false},
	startDate: { type: Date, required: false},
	endDate: { type: Date, required: false},
	earliestStart: { type: Number, required: false},
	earliestStartDate: { type: Date, required: false},
	latestStart: { type: Number, required: false},
	latestStartDate: { type: Date, required: false},
	vpStatus: { type: String, required: false, maxlength: 50},
	status: { type: String, required: false, maxlength: 256},
	ampelStatus: { type: Number, required: false},
	ampelErlaeuterung: { type: String, required: false, maxlength: 4096},
	VorlagenName: { type: String, required: false, maxlength: 256},
	Dauer: { type: Number, required: false},
	AllPhases: [{ type: clsPhase, required: true}],
	hierarchy: {
		allNodes: [
			{hryNodeKey: {type: String, required: true}, hryNode: {type: clsHierarchyNode, required: true}}
		]
	},
	timestamp: { type: Date, required: false},
	complexity: { type: Number, required: false},
	description: { type: String, required: false, maxlength: 4096},
	businessUnit: { type: String, required: false, maxlength: 256},
	keyMetrics: { type: clsKeyMetrics }
});
// Set Creation and modification date automatically
visboProjectVersionSchema.set('timestamps', true);

// declare a model
mongoose.model('VisboProjectVersion', visboProjectVersionSchema);
