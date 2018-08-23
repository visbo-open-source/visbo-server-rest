var nodemailer = require('nodemailer');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var transporter;
var initialised = false;
var debug = false;

// Send Mail to User
function VisboSendMail(message) {

	// MS Todo: move parameters to config later
	var smtpConfig = {
		pool: true,
		host: 'smtp.strato.de',
		port: 465,
		secure: true,
  	requireTLS: true,
		connectionTimeout: 500,
		greetingTimeout: 300,
		// logger: true,
		// debug: true,
		auth: {
				user: 'visbo@seyfried.bayern',
				pass: 'visbo123'
		},
		// tls: {
		// 		// do not fail on invalid certs
		// 		rejectUnauthorized: false
		// }
	};
	// var smtpConfig = {
	// 	service: 'gmail',
	// 	host: "smtp.gmail.com",
	// 	auth: {
	// 			user: 'xxx@gmail.com',
	// 			pass: 'xxx'
	// 	}
	// };
	logger4js.debug("Send Mail to :%s:", message.to);

	// MS Todo: move mail inititialisation make only once or refresh if closed later
	if (!initialised) {
		logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
		logger4js.debug("Initialise e-Mail sending connection for %s", smtpConfig.auth.user);
		transporter = nodemailer.createTransport(smtpConfig)
		if (!transporter) logger4js.error("Initialise e-Mail sending failed");
		else logger4js.info("Initialise e-Mail sending success");

		initialised = true;
	}
	// verify connection configuration
	// logger4js.debug("Mail all prepared, now verify the eMail");
	transporter.verify(function(error, success) {
		if (error) {
			logger4js.error("Error sending Mail %s", error);
		} else {
			logger4js.info("Mail Server is ready to take our messages");
		}
	});
	logger4js.debug("Mail all prepared, now fire the email to %s ", message.to);

	message.replyTo = message.from;
	message.from = smtpConfig.auth.user;
	transporter.sendMail(message, function(error, response){
    if (error) {
      logger4js.error("Mail delivery failed %s to %s", error, message.to);;
    } else {
      logger4js.debug("Mail delivery finished: %s", message.to);
    }
	});
};

module.exports = {
	VisboSendMail: VisboSendMail
};
