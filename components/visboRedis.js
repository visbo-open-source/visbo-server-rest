var logModule = 'OTHER';
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var redis = require('redis');
var bluebird = require('bluebird');
bluebird.promisifyAll(redis);

var initialised = false;
var redisClient;
var currentHost = 'localhost';
var currentPort = 6379;
var maxErrorLog = 5;

// Initialise Redis
/* The VisboRedisInit function is responsible for initializing and managing a Redis client connection. 
   It:
		- Creates a Redis client if not already initialized.
		- Handles host and port changes dynamically.
		- Checks Redis connection status and logs errors appropriately.
		- Returns the Redis client instance for use.
	Key Features
	✔️ Ensures a Redis client is initialized only once.
	✔️ Handles Redis connection errors and logs warnings.
	✔️ Reinitializes Redis when the host or port changes.
	✔️ Returns the Redis client instance for external use. 
*/
function VisboRedisInit(host, port) {

	host = host || currentHost;
	port = port || currentPort;
	// logger4js.info('Redis Client Setup Host %s:%d', host, port);

	if (redisClient) {
		// redis Client already initialised check if host or port Changes
		if (host != currentHost || port != currentPort) {
			logger4js.trace('Redis Client Change Host %s:%d', host, port);
			redisClient.quit();
			initialised = false;
		}
	}

	// if there is no client initialised do it
	if (!initialised) {
		logger4js.trace('Redis Client  Init');
		currentHost = host;
		currentPort = port;
		redisClient = redis.createClient({host : currentHost, port : currentPort});

		// Check if Redis is up and running
		redisClient.on('ready',function() {
			logger4js.info('Redis is connected');
		});

		redisClient.on('error',function() {

			if (maxErrorLog > 0) {
				maxErrorLog -= 1;
                logger4js.warn('Error in Redis: Take care that the redis server is installed and up and running');
			}
			if (host != 'localhost') throw Error('Error connecting to Redis Server');
		});

		logger4js.trace('Redis initialised');
		initialised = true;
	}

	logger4js.trace('Redis all prepared return Client ');
	return redisClient;
}

module.exports = { VisboRedisInit: VisboRedisInit };
