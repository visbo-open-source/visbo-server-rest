var crypto = require('crypto');
var secrets = require('./../secrets/jwt.js');

var algorithm = 'aes-256-cbc';
var iv = undefined;

function getKey() {
	// Prefer key from environment for easier rotation and per-environment config
	if (process.env.INTERNAL_ENCRYPTION) {
		try {
			// Expect a hex-encoded key for AES-256 (32 bytes => 64 hex chars)
			return Buffer.from(process.env.INTERNAL_ENCRYPTION, 'hex');
		} catch (e) {
			// If parsing fails, fall back to legacy secret implementation
		}
	}
	// Legacy fallback: keep old behaviour for existing deployments
	return secrets.internalEncryption.secret;
}

function initIV (text) {
	if (iv != undefined) return;
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
