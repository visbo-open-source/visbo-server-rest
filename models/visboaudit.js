var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var visboAuditSchema = new mongoose.Schema({
	user: {
		userId: {type: Schema.Types.ObjectId, ref: 'User'},
		email: {type: String, required: true}
	},
	vc: {
		vcid: {type: Schema.Types.ObjectId, ref: 'VisboCenter'},
		name: {type: String, required: false},
		vcjson: {type: String, required: false}
	},
	vp: {
		vpid: {type: Schema.Types.ObjectId, ref: 'VisboProject'},
		name: {type: String, required: false},
		vpjson: {type: String, required: false}
	},
	vpv: {
		vpvid: {type: Schema.Types.ObjectId, ref: 'VisboProjectVersion'},
		name: {type: String, required: false}
	},
	actionDescription: {type: String, required: false},
	actionInfo: {type: String, required: false},
	action: {type: String, required: false},
	url: {type: String, required: false},
	ip: {type: String, required: false},
	host: {type: String, required: false},
	userAgent: {type: String, required: false},
	ttl: {type: Date, required: false},
	sysAdmin: {type: Boolean, required: false},
	result: {
		time: {type: Number, required: true},
		status: {type: String, required: true},
		statusText: {type: String, required: false},
		size: {type: Number, required: false}
	}
});
// Set Creation and modification date automatically
visboAuditSchema.set('timestamps', true);

// declare a model
mongoose.model('VisboAudit', visboAuditSchema);
