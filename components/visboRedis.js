var logModule = "OTHER";
var log4js = require('log4js');
var logger4js = log4js.getLogger(logModule);

var redis = require('redis');
var bluebird = require('bluebird')
bluebird.promisifyAll(redis);

var initialised = false;
var redisClient;
var debug = false;

// Initialise Redis
function VisboRedisInit() {

	logger4js.trace("Redis Client Setup");

	// if there is no client initialised do it
	if (!initialised) {
		logger4js.trace("Redis Client  Init");
		redisClient = redis.createClient({host : 'localhost', port : 6379});

		// Check if Redis is up and running
		redisClient.on('ready',function() {
			logger4js.info('Redis is ready');
		});

		redisClient.on('error',function() {
			logger4js.fatal('Error in Redis: Take care that the redis server is installed and up and running');
		});

		initialised = true;
	}

	logger4js.trace("Redis all prepared return Client ");
	return redisClient;
};

module.exports = {
	VisboRedisInit: VisboRedisInit
};
