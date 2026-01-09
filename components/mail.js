var nodemailer = require('nodemailer');

var logModule = 'MAIL';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var fs = require('fs');
var path = require('path');
var systemVC = require('./../components/systemVC');
var getSystemVCSetting = systemVC.getSystemVCSetting;

var transporter;
var mailUser;
var initialised = false;

// Send Mail to User

/* The VisboSendMail function sends an email using Nodemailer with SMTP settings fetched from the system. 
It initializes the SMTP transport if not already set up, verifies the connection, and sends the email. 
If DKIM (DomainKeys Identified Mail) is configured, it attempts to load a private key for signing emails.
 */
/* Returns
Nothing (void) 				– The function sends an email and logs relevant events.
If SMTP is not configured, 	- logs a fatal error and exits.
*/
function VisboSendMail(message) {
	var smtpConfig = undefined;
	var smtpSetting = undefined;
	logger4js.debug('MAIL Send Mail to :%s:', message.to);

	// make mail inititialisation only once or refresh if closed later
	if (!initialised) {
		logger4js.info('MAIL Evaluate SMTP Config');
		smtpSetting = getSystemVCSetting('SMTP');
		smtpConfig = smtpSetting && smtpSetting.value;
		logger4js.debug('MAIL Check Config %O', smtpConfig);
		if (smtpConfig) {
			if (smtpConfig.dkim) {
				logger4js.debug('MAIL SMTP Config has DKIM Setting %O', smtpConfig.dkim);
				// now check if we have the private key for the domain
				var dkimPrivKeyFile = path.join('/etc/visbo/', smtpConfig.dkim.domainName.concat('.priv'));
				var stats = undefined;
				var dkimPrivKey = '';
				var keyStatusOk = false;
				try {
					// Query the entry and catch exception if file does not exists
					stats = fs.statSync(dkimPrivKeyFile);
					logger4js.debug('MAIL SMTP Config DKIM File Length %s', stats.size);
					if (!stats.isDirectory()) {
						var content = fs.readFileSync(dkimPrivKeyFile);
						logger4js.debug('MAIL SMTP Config has DKIM Key Start %s ', content.toString().substring(0,50));
						dkimPrivKey = content.toString();
						keyStatusOk = true;
					}
				}
				catch (e) {
					logger4js.debug('MAIL SMTP Config Access to DKIM Key File %s failed %O', dkimPrivKeyFile);
				}
				if (keyStatusOk) {
					logger4js.debug('MAIL SMTP Config has DKIM key in %s', dkimPrivKeyFile);
					smtpConfig.dkim.privateKey = dkimPrivKey;
				} else {
					logger4js.warn('MAIL SMTP Config has no corresponding DKIM key for %s in %s', smtpConfig.dkim.domainName, dkimPrivKeyFile);
					delete smtpConfig.dkim;
				}
			}
			logger4js.debug('MAIL SMTP gateway %s with user %s', smtpConfig.host, smtpConfig.auth.user);
			mailUser = smtpConfig.auth.user;

			// ============================================================
			// FIX: Accept self-signed certificates in development environment
			// This is necessary when the SMTP server uses a self-signed certificate
			// which Node.js/nodemailer would otherwise reject.
			// IMPORTANT: This setting is ONLY applied in development mode!
			// ============================================================
			if (process.env.NODE_ENV === 'development') {
				if (!smtpConfig.tls) {
					smtpConfig.tls = {};
				}
				smtpConfig.tls.rejectUnauthorized = false;
				logger4js.warn('MAIL TLS certificate validation disabled for development environment');
			}
			// ============================================================

		} else {
			logger4js.fatal('MAIL SMTP Configuration Missing in Environment');
			return;
		}
		logger4js.debug('MAIL Initialise e-Mail sending connection for %s', smtpConfig.auth.user);

		transporter = nodemailer.createTransport(smtpConfig);
		if (!transporter) {
			logger4js.error('MAIL Initialise e-Mail sending failed');
			return;
		} else {
			logger4js.info('MAIL Initialise e-Mail sending success');
			initialised = true;
		}
	}
	// verify connection configuration
	// logger4js.debug('Mail all prepared, now verify the eMail');
	transporter.verify(function(error) {
		if (error) {
			logger4js.error('MAIL Error sending Mail %s', error);
		} else {
			logger4js.trace('MAIL Mail Server is ready to take our messages');
		}
	});
	logger4js.debug('MAIL Mail all prepared, now fire the email to %s ', message.to);

	if (message.from && message.from != mailUser) {
		message.replyTo = message.from;
	}
	message.from = mailUser;
	transporter.sendMail(message, function(error) {
    if (error) {
      logger4js.error('MAIL Mail delivery failed %s to %s', error, message.to);
    } else {
      logger4js.debug('MAIL Mail delivery finished: %s', message.to);
    }
	});
}

module.exports =
	{ VisboSendMail: VisboSendMail };
