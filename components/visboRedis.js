/**
 * Redis client wrapper using redis v4 with async/await
 */

const logModule = 'OTHER';
const log4js = require('log4js');
const logger4js = log4js.getLogger(logModule);

const { createClient } = require('redis');

let redisClient = null;
let currentHost = 'localhost';
let currentPort = 6379;
let maxErrorLog = 5;
let isConnecting = false;

/**
 * Initialize and return Redis client (redis v4)
 * Returns a connected client instance
 */
async function VisboRedisInit(host, port) {
	host = host || currentHost;
	port = port || currentPort;

	// If client exists and host/port changed, disconnect and reinit
	if (redisClient && (host !== currentHost || port !== currentPort)) {
		logger4js.trace('Redis Client Change Host %s:%d', host, port);
		await redisClient.quit();
		redisClient = null;
	}

	// Create new client if needed
	if (!redisClient) {
		logger4js.trace('Redis Client Init');
		currentHost = host;
		currentPort = port;

		redisClient = createClient({
			socket: {
				host: currentHost,
				port: currentPort
			}
		});

		redisClient.on('ready', () => {
			logger4js.info('Redis is connected');
		});

		redisClient.on('error', (err) => {
			if (maxErrorLog > 0) {
				maxErrorLog -= 1;
				logger4js.warn('Error in Redis: %s', err.message);
			}
		});

		// Connect if not already connecting
		if (!isConnecting && !redisClient.isOpen) {
			isConnecting = true;
			try {
				await redisClient.connect();
				logger4js.trace('Redis connected successfully');
			} catch (err) {
				logger4js.warn('Redis connection failed: %s', err.message);
			} finally {
				isConnecting = false;
			}
		}
	}

	logger4js.trace('Redis all prepared return Client');
	return redisClient;
}

/**
 * Get the current Redis client (sync, for backward compatibility)
 * Returns null if not initialized
 */
function getRedisClient() {
	return redisClient;
}

module.exports = { 
	VisboRedisInit,
	getRedisClient
};
