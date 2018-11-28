var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var vpfItem = new Schema({
	vpid: {type: Schema.Types.ObjectId, ref: 'VisboProject', required: true},
	name: { type: String },
	variantName: { type: String, required: false, maxlength: 256},
	Start: { type: Date, required: false},
	show: { type: Boolean },
	zeile: { type: Number },
	reasonToInclude: { type: String },
	reasonToExclude: { type: String }
});

var visboPortfolioSchema = new mongoose.Schema({
	vpid: {type: Schema.Types.ObjectId, ref: 'VisboProject', required: true},
	variantName: { type: String, required: false, maxlength: 256},
	timestamp: { type: Date, required: true},
	name: { type: String, required: true, maxlength: 256},
	allItems: [{ type: vpfItem, required: true}],
	sortType: { type: Number, required: false},
	sortList: [{type: Schema.Types.ObjectId, ref: 'VisboProject'}],
	deleted: {
		deletedAt: {type: Date, required: false },
		byParent: {type: Boolean}
	}
});

// Set Creation and modification date automatically
visboPortfolioSchema.set('timestamps', true);

// declare a model
mongoose.model('VisboPortfolio', visboPortfolioSchema);
