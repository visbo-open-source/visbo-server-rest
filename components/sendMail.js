
var logModule = 'MAIL';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);
var getSystemUrl = require('./../components/systemVC').getSystemUrl;

var moment = require('moment');
moment.locale('de');

var useragent = require('useragent');
var validate = require('./../components/validate');

var mail = require('./../components/mail');
var eMailTemplates = "/../emailTemplates/";
var ejs = require('ejs');


var visboParseUA = function(agent, stringUA) {
	var shortUA = stringUA;
	var index = stringUA.indexOf('(');
	if (index >= 0) shortUA = shortUA.substring(0, index-1);
	logger4js.trace('User Agent Shortened1 %s to %s', stringUA, shortUA);

	index = shortUA.indexOf('/');
	if (index >= 0) {
		agent.family = shortUA.substring(0, index);
		shortUA = shortUA.substring(index+1, shortUA.length );
		logger4js.trace('User Agent Shortened2 %s to %s', agent.family, shortUA);
		index = shortUA.indexOf('.');
		if (index >= 0) {
			agent.major = shortUA.substring(0, index);
			agent.minor = shortUA.substring(index+1, shortUA.length );
			logger4js.trace('User Agent Major %s Minor %s', agent.major, agent.minor);
		}
	}
};

// Send Mail about account locked
function accountLocked(req, res, user) {
	// now send an e-Mail to the user for pw change

	var lang = validate.evaluateLanguage(req);
	var template = __dirname.concat(eMailTemplates, lang, '/passwordRetriesExceeded.ejs');
	var uiUrl =  getSystemUrl();
	var eMailSubject = res.__('Mail.Subject.UserLocked');
	var info = {};
	logger4js.trace('E-Mail template %s, url %s', template, uiUrl);
	info.changedAt = moment().format('DD.MM.YY HH:mm:ss');
	info.ip = req.headers['x-real-ip'] || req.ip;
	var agent = useragent.parse(req.get('User-Agent'));
	visboParseUA(agent, req.headers['user-agent']);
	info.userAgent = agent.toString();
	info.lockedUntil = moment(user.status.lockedUntil).format('HH:mm');
	ejs.renderFile(template, {userTo: user, url: uiUrl, info}, function(err, emailHtml) {
		if (err) {
			logger4js.warn('E-Mail Rendering failed %s', err.message);
		} else {
			var message = {
					to: user.email,
					subject: eMailSubject,
					html: '<p> '.concat(emailHtml, ' </p>')
			};
			logger4js.info('Now send mail from %s to %s', message.from || 'System', message.to);
			mail.VisboSendMail(message);
		}
	});
}

// Send Mail about password expired
function passwordExpired(req, res, user) {
	// Send Mail to password forgotten
	var lang = validate.evaluateLanguage(req);
	var template = __dirname.concat(eMailTemplates, lang, '/passwordExpired.ejs');
	var uiUrl =  getSystemUrl();
	uiUrl = uiUrl.concat('/pwforgotten', '?email=', user.email);
	var eMailSubject = res.__('Mail.Subject.PWExpired');
	ejs.renderFile(template, {userTo: user, url: uiUrl}, function(err, emailHtml) {
		if (err) {
			logger4js.warn('E-Mail Rendering failed %s', err.message);
		} else {
			// logger4js.debug('E-Mail Rendering done: %s', emailHtml);
			var message = {
					to: user.email,
					subject: eMailSubject,
					html: '<p> '.concat(emailHtml, ' </p>')
			};
			logger4js.info('Now send expired password mail to %s', message.to);
			mail.VisboSendMail(message);
		}
	});
}

// Send Mail about password expires soon
function passwordExpiresSoon(req, res, user, expiresAt) {
	// send Mail to User about Password expiration
	var lang = validate.evaluateLanguage(req);
	var template = __dirname.concat(eMailTemplates, lang, '/passwordExpiresSoon.ejs');
	var uiUrl =  getSystemUrl();
	uiUrl = uiUrl.concat('/login', '?email=', user.email);
	var eMailSubject = res.__('Mail.Subject.PWExpiresSoon');
	ejs.renderFile(template, {userTo: user, url: uiUrl, expiresAt: moment(expiresAt).format('DD.MM. HH:mm')}, function(err, emailHtml) {
		if (err) {
			logger4js.warn('E-Mail Rendering failed %s', err.message);
		} else {
			// logger4js.debug('E-Mail Rendering done: %s', emailHtml);
			var message = {
					to: user.email,
					subject: eMailSubject,
					html: '<p> '.concat(emailHtml, ' </p>')
			};
			logger4js.info('Now send expiration soon mail to %s', message.to);
			mail.VisboSendMail(message);
		}
	});
}

// Send Mail about user not registered
function accountNotRegistered(req, res, user) {
	var lang = validate.evaluateLanguage(req);
	var template = __dirname.concat(eMailTemplates, lang, '/userNotRegistered.ejs');
	var uiUrl =  getSystemUrl();
	uiUrl = uiUrl.concat('/register', '?email=', user.email);
	var eMailSubject = res.__('Mail.Subject.NotRegistered');
	ejs.renderFile(template, {userTo: user, url: uiUrl}, function(err, emailHtml) {
		if (err) {
			logger4js.warn('E-Mail Rendering failed %s', err.message);
		} else {
			// logger4js.debug('E-Mail Rendering done: %s', emailHtml);
			var message = {
					to: user.email,
					subject: eMailSubject,
					html: '<p> '.concat(emailHtml, ' </p>')
			};
			logger4js.info('Now send register mail to %s', message.to);
			mail.VisboSendMail(message);
		}
	});
}

// Send Mail about user not registered
function accountRegisteredSuccess(req, res, user) {
	var lang = validate.evaluateLanguage(req);
	var template = __dirname.concat(eMailTemplates, lang, '/userRegisteredSuccess.ejs');
	var uiUrl =  getSystemUrl();
	uiUrl = uiUrl.concat('/login', '?email=', user.email);
	var eMailSubject = res.__('Mail.Subject.RegisterSuccess');

	ejs.renderFile(template, {userTo: user, url: uiUrl}, function(err, emailHtml) {
		if (err) {
			logger4js.warn('E-Mail Rendering failed %s', err.message);
		} else {
			// logger4js.debug('E-Mail Rendering done: %s', emailHtml);
			var message = {
					to: user.email,
					subject: eMailSubject,
					html: '<p> '.concat(emailHtml, ' </p>')
			};
			logger4js.info('Now send register success mail to %s', message.to);
			mail.VisboSendMail(message);
		}
	});
}

// Send Mail about account locked
function accountNewLogin(req, res, user) {
	// now send an e-Mail to the user for pw change
	var lang = validate.evaluateLanguage(req);
	var template = __dirname.concat(eMailTemplates, lang, '/accountNewLogin.ejs');
	var uiUrl =  getSystemUrl();
	uiUrl = uiUrl.concat('/login', '?email=', user.email);
	var eMailSubject = res.__('Mail.Subject.NewLogin');
	var info = {};
	logger4js.trace('E-Mail template %s, url %s', template, uiUrl);
	info.changedAt = moment().format('DD.MM.YY HH:mm:ss');
	info.ip = req.headers['x-real-ip'] || req.ip;
	// var agent = useragent.parse(req.get('User-Agent'));
	// visboParseUA(agent, req.headers['user-agent']);
	// info.userAgent = agent.toString();
	info.userAgent = req.visboUserAgent;
	ejs.renderFile(template, {userTo: user, url: uiUrl, info}, function(err, emailHtml) {
		if (err) {
			logger4js.warn('E-Mail Rendering failed %s', err.message);
		} else {
			var message = {
					to: user.email,
					subject: eMailSubject,
					html: '<p> '.concat(emailHtml, ' </p>')
			};
			logger4js.info('Now send mail from %s to %s', message.from || 'System', message.to);
			mail.VisboSendMail(message);
		}
	});
}

module.exports = {
	accountLocked: accountLocked,
	passwordExpired: passwordExpired,
	passwordExpiresSoon: passwordExpiresSoon,
	accountNotRegistered: accountNotRegistered,
	accountRegisteredSuccess: accountRegisteredSuccess,
	accountNewLogin: accountNewLogin
};
