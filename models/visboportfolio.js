var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var vpfItem = new Schema({
	vpid: {type: Schema.Types.ObjectId, ref: 'VisboProject', required: true},
	name: { type: String },
	variantName: { type: String, required: false, maxlength: 100},
	Start: { type: Date, required: false},
	show: { type: Boolean },
	zeile: { type: Number },
	reasonToInclude: { type: String },
	reasonToExclude: { type: String }
});

var visboPortfolioSchema = new mongoose.Schema({
	vpid: {type: Schema.Types.ObjectId, ref: 'VisboProject', required: true},
	variantName: { type: String, required: false, maxlength: 100},
	timestamp: { type: Date, required: true},
	name: { type: String, required: true, maxlength: 100},
	allItems: [{ type: vpfItem, required: true}],
	sortType: { type: Number, required: false},
	sortList: {type: Schema.Types.Mixed},
	lastCustomList: {type: Schema.Types.Mixed}
});

// Set Creation and modification date automatically
visboPortfolioSchema.set('timestamps', true);

// declare a model
mongoose.model('VisboPortfolio', visboPortfolioSchema);
