var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var groupUserSchema = new Schema({
	userId: {type: Schema.Types.ObjectId, ref: 'User'},
	email: {type: String, required: true}
});

var visboGroupSchema = new mongoose.Schema({
	groupType: {type: String, required: true},
	internal: {type: Boolean, required: true},
	global: {type: Boolean, required: true},
	name: {type: String, required: true},
	vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter', required: false},
	vpids: [{type: Schema.Types.ObjectId, ref: 'VisboProject', required: false}],
	permission: {
		system: { type: Number, required: false},
		vc: { type: Number, required: false},
		vp: { type: Number, required: false}
	},
	users: [{type: groupUserSchema, required: false}]
});
// Set Creation and modification date automatically
visboGroupSchema.set('timestamps', true);

// declare a model
mongoose.model('VisboGroup', visboGroupSchema);
mongoose.model('VisboGroupUser', groupUserSchema);
// mongoose.model('VisboPermSystem', systemPerm);
// mongoose.model('VisboPermVC', vcPerm);
// mongoose.model('VisboPermVP', vpPerm);
