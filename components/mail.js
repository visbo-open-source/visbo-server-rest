var nodemailer = require('nodemailer');
var moment = require('moment');

var initialised = false;
var debug = false;

// Send Mail to User
function VisboSendMail(message) {

// MS Todo: move parameters to config later
	var smtpConfig = {
		host: 'smtp.strato.de',
		port: 465,
		secure: true,
		connectionTimeout: 500,
		greetingTimeout: 300,
		debug: true,
		auth: {
				user: 'visbo@seyfried.bayern',
				pass: 'visbo123'
		},
		tls: {
				// do not fail on invalid certs
				rejectUnauthorized: false
		}
	};
	if (debug) console.log("%s: Send Mail to :%s:", moment().format('YYYY-MM-DD HH:MM:ss'), message.to);		// MS Log
	// MS Todo: move mail inititialisation make only once or refresh if closed later
	if (!initialised) {
		if (debug) console.log("%s: Initialise e-Mail sending connection for %s", moment().format('YYYY-MM-DD HH:MM:ss'), smtpConfig.auth.user);
		let transporter = nodemailer.createTransport(smtpConfig)
		initialised = true;
	}
	//console.log("%s: Setup Mailer", moment().format('YYYY-MM-DD HH:MM:ss'));
	// verify connection configuration
	transporter.verify(function(error, success) {
		 if (error) {
					console.log(error);
		 } else {
					if (debug) console.log('%s: Mail Server is ready to take our messages', moment().format('YYYY-MM-DD HH:MM:ss'));
					;
		 }
	});
	//transporter.sendMail(data[, callback])
	transporter.sendMail(message);
};

module.exports = {
	VisboSendMail: VisboSendMail
};
