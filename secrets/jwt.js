
require('dotenv').config();

module.exports = {
	user: {
		'secret': process.env.USER_SECRET,
		'expiresIn': 3600
	},
	admin: {
		'secret': process.env.ADMIN_SECRET,
		'expiresIn': 3600
	},
	register: {
		'secret': process.env.REGISTER_SECRET,
		'expiresIn': 900
	},
	internalEncryption:
		{ 'secret': 'M}*/n5jg3P1KLro0)_1-81?/ORBG;W0.' }
};
