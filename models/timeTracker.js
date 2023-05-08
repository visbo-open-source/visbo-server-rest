var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var timeTracker = new mongoose.Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    vpid: { type: Schema.Types.ObjectId, ref: 'VisboProject', required: true },
    vcid: { type: Schema.Types.ObjectId, ref: 'VisboCenter', required: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    date: { type: Schema.Types.Date, required: true },
    time: { type: Schema.Types.Decimal128, required: true },
    notes: { type: Schema.Types.String, required: false },
    approvalDate: { type: Schema.Types.Date, required: false },
    approvalId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    status: { type: Schema.Types.String, required: true },
}, { timestamps: true });

// declare a model
mongoose.model('TimeTracker', timeTracker);
