var log4js = require('log4js');
var logger4js = log4js.getLogger('OTHER');

var crypto = require('crypto')
var secrets = require('./../secrets/jwt.js');

var algorithm = 'aes-256-cbc'
var iv = undefined;

function initIV (text) {
	if (iv != undefined) return;
	if (!text || text.length < 16) iv = 'visbovisbo123456'
	else iv = text.substr(0, 16)
}

function encrypt(text){
	initIV();
	var cipher = crypto.createCipheriv(algorithm,
						secrets.internalEncryption.secret, iv);
  var crypted = cipher.update(text, 'utf8', 'hex');
  crypted += cipher.final('hex');
	// logger4js.trace("Encrypted %s to %s", text, crypted);
  return crypted;
}

// Decryption
function decrypt(text){
	initIV();
	var decipher = crypto.createDecipheriv(algorithm,
						secrets.internalEncryption.secret, iv);
	var dec = decipher.update(text, 'hex', 'utf8')
	dec += decipher.final('utf8')
	// logger4js.trace("Decrypted %s to %s", text, dec);
	return dec;
}

module.exports = {
	initIV: initIV,
	encrypt: encrypt,
	decrypt: decrypt
};
