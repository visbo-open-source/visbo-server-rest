var nodemailer = require('nodemailer');

var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var transporter;
var mailUser;
var initialised = false;
var debug = false;

// Send Mail to User
function VisboSendMail(message) {

	logger4js.level = debugLogLevel(logModule); // default level is OFF - which means no logs at all.
	var smtpConfig = undefined;
	logger4js.debug("MAIL Send Mail to :%s: Logger %s", message.to, debugLogLevel(logModule));

	// MS Todo: move mail inititialisation make only once or refresh if closed later
	if (!initialised) {
		if (process.env.SMTP != undefined) {
			smtpConfig = JSON.parse(process.env.SMTP);
		}
		if (!smtpConfig) {
			logger4js.fatal("MAIL SMTP Configuration Missing in Environment");
			return;
		} else {
			logger4js.debug("MAIL SMTP gateway %s with user %s", smtpConfig.host, smtpConfig.auth.user);
			mailUser = smtpConfig.auth.user;
		}
		logger4js.debug("MAIL Initialise e-Mail sending connection for %s", smtpConfig.auth.user);

		transporter = nodemailer.createTransport(smtpConfig)
		if (!transporter) {
			logger4js.error("MAIL Initialise e-Mail sending failed");
			return;
		} else {
			logger4js.info("MAIL Initialise e-Mail sending success");
			initialised = true;
		}
	}
	// verify connection configuration
	// logger4js.debug("Mail all prepared, now verify the eMail");
	transporter.verify(function(error, success) {
		if (error) {
			logger4js.error("MAIL Error sending Mail %s", error);
		} else {
			logger4js.warn("MAIL Mail Server is ready to take our messages");
		}
	});
	logger4js.warn("MAIL Mail all prepared, now fire the email to %s ", message.to);

	if (message.from && message.from != mailUser) {
		message.replyTo = message.from;
	}
	message.from = mailUser;
	transporter.sendMail(message, function(error, response){
    if (error) {
      logger4js.error("MAIL Mail delivery failed %s to %s", error, message.to);;
    } else {
      logger4js.debug("MAIL Mail delivery finished: %s", message.to);
    }
	});
};

module.exports = {
	VisboSendMail: VisboSendMail
};
