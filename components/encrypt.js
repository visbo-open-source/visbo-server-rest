var crypto = require('crypto');
var secrets = require('./../secrets/jwt.js');
var log4js = require('log4js');
var logger4js = log4js.getLogger('OTHER');

var algorithm = 'aes-256-cbc';
var iv = undefined;

function getKey() {
	// Prefer key from environment for easier rotation and per-environment config
	if (process.env.INTERNAL_ENCRYPTION) {
		var keyBuffer = undefined;
		try {
			// Expect a hex-encoded key for AES-256 (32 bytes => 64 hex chars)
			keyBuffer = Buffer.from(process.env.INTERNAL_ENCRYPTION, 'hex');
		} catch (e) {
			// If parsing fails, log and fall back to legacy secret implementation
			logger4js.warn('INTERNAL_ENCRYPTION could not be parsed as hex, falling back to legacy internalEncryption.secret. Error: %s', e.message);
		}
		// Validate that the key length matches AES-256 requirements
		if (keyBuffer && keyBuffer.length === 32) {
			return keyBuffer;
		}
		if (keyBuffer) {
			logger4js.warn('INTERNAL_ENCRYPTION has invalid length %d bytes, expected 32. Falling back to legacy internalEncryption.secret.', keyBuffer.length);
		} else {
			logger4js.warn('INTERNAL_ENCRYPTION is set but resulted in an undefined key buffer, falling back to legacy internalEncryption.secret.');
		}
	}
	// Legacy fallback: keep old behaviour for existing deployments
	return secrets.internalEncryption.secret;
}

function initIV (text) {
	if (iv != undefined) return;
	// Prefer IV from environment for easier rotation per environment.
	// INTERNAL_IV is expected as plain string; we take the first 16 bytes.
	if (process.env.INTERNAL_IV && process.env.INTERNAL_IV.length >= 16) {
		iv = Buffer.from(process.env.INTERNAL_IV.slice(0, 16), 'utf8');
		return;
	}
	// Legacy behavior (backward compatible): use fixed or text-derived IV
	if (!text || text.length < 16) iv = 'visbovisbo123456';
	else iv = text.substr(0, 16);
}

function encrypt(text){
	initIV();
	var cipher = crypto.createCipheriv(algorithm,
						getKey(), iv);
  var crypted = cipher.update(text, 'utf8', 'hex');
  crypted += cipher.final('hex');
  return crypted;
}

// Decryption
function decrypt(text){
	initIV();
	var decipher = crypto.createDecipheriv(algorithm,
						getKey(), iv);
	var dec = decipher.update(text, 'hex', 'utf8');
	dec += decipher.final('utf8');
	return dec;
}

module.exports = {
	initIV: initIV,
	encrypt: encrypt,
	decrypt: decrypt
};
