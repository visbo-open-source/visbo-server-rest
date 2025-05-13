var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var timeTracker = new mongoose.Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    vpid: { type: Schema.Types.ObjectId, ref: 'VisboProject', required: true },
    vcid: { type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true },
	vc: {
		deletedAt: {type: Date, required: false}
	},
    roleId: { type: Schema.Types.Number, required: true },
    date: { type: Schema.Types.Date, required: true },
    time: { type: Schema.Types.Decimal128, required: true },
    name: { type: Schema.Types.String, required: true },
    status: { type: Schema.Types.String, required: true },
    notes: { type: Schema.Types.String, required: false },
    approvalDate: { type: Schema.Types.Date, required: false },
    approvalId: { type: Schema.Types.ObjectId, required: false },
    failed: { type: Schema.Types.String, required: false },
}, { timestamps: true });


var constVTRFailed = Object.freeze([
	'wrong project status', 'month before start', 'month after end', 'finally imported'
]);


// declare a model
mongoose.model('TimeTracker', timeTracker);


module.exports = {
	constVTRFailed: constVTRFailed
};
