var express = require('express'); // MS Commment
var path = require('path');
var cors = require('cors');
var logger = require('morgan');
var fs = require('fs');
var i18n = require('i18n');
// var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var delay = require('delay');
var environment = require('dotenv');
var moment = require('moment');
var process = require('process');
var os = require( 'os' );

var passport = require('passport')

var logging = require('./components/logging');
var log4js = require('log4js');
var logger4js = log4js.getLogger('OTHER');
var logger4jsRest = log4js.getLogger('REST');

var visboTaskSchedule = require('./components/visboTaskSchedule');
var visboTaskScheduleInit = visboTaskSchedule.visboTaskScheduleInit;
//initialize mongoose schemas
require('./models/users');
require('./models/visbogroup');
require('./models/visboaudit');
require('./models/visbocenter');
require('./models/visboproject');
require('./models/visboprojectversion');
require('./models/visboportfolio');
require('./models/vcrole');
require('./models/vccost');
require('./models/vcsetting');

var systemVC = require('./components/systemVC');

// include the route modules
var user = require('./routes/user');
var token = require('./routes/token');
var vc = require('./routes/visbocenter');
var vp = require('./routes/visboproject');
var vpv = require('./routes/visboprojectversion');
var audit = require('./routes/audit');
var sysLog = require('./routes/syslog');
var sysUser = require('./routes/sysuser');
var status = require('./routes/status');

var visboAudit = require('./components/visboAudit');

// Require mongoose
var mongoose = require('mongoose');
var dbOptions = {
  keepAlive: 200,
  // autoReconnect: true,
  // reconnectInterval: 3000,
  useNewUrlParser: true,
  useUnifiedTopology: true
};

// CORS Config, whitelist is an array
// var whitelist = [
//   'https://my.visbo.net', // Production Support
//   'https://staging.visbo.net', // Staging Support
//   'http://localhost:4200', // Development
//   'https://dev.visbo.net' // Development AWS Support
// ]
// corsoptions is an object consisting of a property origin, the function is called if property is requested
var uiUrl = undefined;

var corsOptions = {
  origin: function (origin, callback) {
    if (!uiUrl) uiUrl = systemVC.getSystemUrl();
    // check if the origin is from same system or not set in case of ClientApp or Postman
    if (!origin || origin == uiUrl) {
      callback(null, true);
    } else {
      logger4js.warn('CorsOptions deny  %s vs allowed %s', origin, uiUrl);
      callback(origin + ' is not allowed to access', null);
    }
  }
};

var options = {
  dotfiles: 'ignore',
  etag: false,
  extensions: ['htm', 'html'],
  index: 'index.html',
  maxAge: '1d',
  redirect: false,
  setHeaders: function (res /*, path , stat*/) {
    res.set('x-timestamp', Date.now());
  }
};

var reconnectTries = 0;
var trialDelay = 1;

function delayString(seconds) {
  var sec = seconds % 60;
  seconds -= sec;
  var min = seconds / 60;
  var temp = min;
  min %= 60;
  var hour = (temp - min) / 60;

  var str = '';
  if (hour>0) {
    str += hour;
    str += ' hour';
    if (hour>1) str += 's';
    if (min>0 || sec>0) str += ', ';
  }
  if (min>0) {
    str += min;
    str += ' minute';
    if (min>1) str += 's';
    if (sec>0) str += ', ';
  }
  if (sec>0) {
    str += sec;
    str += ' second';
    if (sec>1) str += 's';
  }
  return str;
}

var initLogStatus = false;
function initLog() {
  if (!initLogStatus) {
    // configure log4js
    var fsLogPath = process.env.LOGPATH || (__dirname + '/logging');
    var stats;
    try {
      stats = fs.statSync(fsLogPath);
    } catch (err) {
      console.log('LogPath %s does not exists or user has no permission: %O', fsLogPath, err);
      throw err;
    }
    if ( !stats.isDirectory()) {
      console.log('LogPath %s exists but is no directory');
    } else {
      // now check for the Folder Hostname if not exists try to create
      var hostname = os.hostname();
      hostname = hostname.split('.')[0];
      // console.log('Hostname %s', hostname );
      fsLogPath = path.join(fsLogPath, hostname);
      try {
        stats = fs.statSync(fsLogPath);
      } catch (err) {
        try {
          fs.mkdirSync(fsLogPath, { recursive: false });
        } catch (err) {
          console.log('Host Folder could not be created %s', fsLogPath);
          throw err;
        }
      }
      if ( !stats.isDirectory()) {
        console.log('LogPath %s exists but is no directory');
      }
      // now all is in place fsLogPath exists for this server
    }
    logger4js = log4js.getLogger('OTHER');
    logging.initLog4js(fsLogPath);
    // initialise with default debug
    var settingDebugInit = {'VC': 'info', 'VP': 'info', 'VPV': 'info', 'USER':'info', 'OTHER': 'info', 'ALL': 'debug'};
    logging.setLogLevelConfig(settingDebugInit);
    initLogStatus = true;
  }
}

function dbConnect(dbconnection, launchServer) {
  if (!dbconnection) {
    logger4js.fatal('Connecting string missing in .env');
  } else {
    var position = dbconnection.indexOf(':') + 1;
    position = dbconnection.indexOf(':', position) + 1;
    var cleanString = dbconnection.substring(0, position);
    position = dbconnection.indexOf('@', position + 1);
    cleanString = cleanString.concat('XX..XX', dbconnection.substring(position, dbconnection.length));
    logger4js.mark('Connecting database %s', cleanString);
    mongoose.connect(
      // Replace CONNECTION_URI with your connection uri
      dbconnection,
      dbOptions
    ).then(function() {
      logger4js.warn('Server is fully functional DB Connected');
      // mongoose.set('debug', function (coll, method, query, doc, options) {
      //    logger4js.trace('Mongo: %s.%s(%s, %s)', coll, method, JSON.stringify(query), doc ? JSON.stringify(doc) : '');
      // });
      systemVC.createSystemVC({ users: [ { 'email':'support@visbo.de' } ]}, launchServer);
    }, function(err) {
      logger4js.fatal('Database connection failed: %O', err);

      reconnectTries++;
      logger4js.fatal('Reconnecting after '+delayString(trialDelay));
      logger4js.fatal('Reconnect trial: '+reconnectTries);
      delay(trialDelay*1000).then(function() {
        trialDelay += trialDelay;
        if (trialDelay>7200) trialDelay = 7200;
        // enable recurtion
        dbConnect(dbconnection, launchServer);
      });
    });
  }
}

function launchServer() {
  logger4js.warn('launch Server started', app? 'app defined' : 'app undefined');

  visboTaskScheduleInit();
  app.use(express.static(path.join(__dirname, 'public'), options));
  // app.use(cookieParser());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json({limit: '5mb', type: 'application/json'}));

  // simple logger for this router's requests
  // all requests to this router will first hit this middleware
  app.use(function(req, res, next) {
    logger4js.trace('Method %s %s', req.method, req.url);
    next();
  });

  app.use(passport.initialize());
  logger4js.warn('OAuth Google done');

  // Register the main routes
  app.use('/user', user);
  //app.use('/admin', admin);
  app.use('/token', token);
  app.use('/vc', vc);
  app.use('/vp', vp);
  app.use('/vpv', vpv);
  app.use('/audit', audit);
  app.use('/sysuser', sysUser);
  app.use('/syslog', sysLog);
  app.use('/status', status);

  // catch 404 and forward to error handler
  app.use(function(req, res /*, next*/) {
    logger4js.warn('Error 404 OriginalURL :%s: Parameter %O; Query %O', req.originalUrl, req.params, req.query);
    return res.status(404).send({
      state: 'failure',
      message: 'Sorry can\'t find the URL',
      url: req.originalUrl
    });
  });

  // error handlers

  // development error handler
  // will print stacktrace
  if (process.env.NODE_ENV === 'development') {
    app.use(function(err, req, res /*, next*/) {
      var errCode = err.status || 500;
      var errMessage = errCode == 400 ? 'Bad Request' : 'Server Error';
      logger4js.warn('Error %s :%s: Error %O; Parameter %O; Query %O', req.originalUrl, errCode, err, req.params, req.query);
      res.status(errCode);
      res.send({
        state: 'failure',
        message: errMessage,
        error: err
      });
    });
  } else {
    // production error handler
    // no stacktraces leaked to user
    app.use(function(err, req, res /*, next*/) {
      var errCode = err.status || 500;
      var errMessage = errCode == 400 ? 'Bad Request' : 'Server Error';
      logger4js.warn('Error %s :%s: Error %O; Parameter %O; Query %O', req.originalUrl, errCode, err, req.params, req.query);
      res.status(errCode);
      res.send({
        state: 'failure',
        message: errMessage
      });
    });
  }
}

// setup environment variables
environment.config();

// start express app
var app = express();

initLog();
logger4js.warn('Starting in Environment %s', process.env.NODE_ENV);
logger4js.warn('Starting Version %s', process.env.VERSION_REST);

i18n.configure({
    locales:['en', 'de'],
    directory: __dirname + '/i18n'
});
app.use(i18n.init);
logger4js.warn('Internationalisation done');

app.set('view engine', 'ejs');
app.engine('.html', require('ejs').renderFile);

// define the log entry for processing pages
app.use(logger(function (tokens, req, res) {
  // ignore calls for OPTIONS
  if (['GET', 'POST', 'PUT', 'DELETE'].indexOf(tokens.method(req, res)) >= 0 ) {
    visboAudit.visboAudit(tokens, req, res);
    var webLog = [
      tokens.method(req, res),
      // 'base url', req.baseUrl,
      //'Url', req.originalUrl,
      tokens.url(req, res),
      tokens.status(req, res),
      tokens.res(req, res, 'content-length')||0+' Bytes',
      Math.round(tokens['response-time'](req, res))+'ms',
      req.headers['x-real-ip'] || req.ip,
      req.get('User-Agent'),
      ''
    ].join(' ');
    logger4jsRest.info(webLog);
    webLog = moment().format('YYYY-MM-DD HH:mm:ss:SSS:') + ' ' + webLog;
  }
  if (tokens.status(req, res) == 500) {
    var headers = JSON.parse(JSON.stringify(req.headers));
    headers['access-key'] = undefined;
    logger4js.fatal('Server Error: Method %s URL %s Headers %s', tokens.method(req, res), req.url, JSON.stringify(headers).substring(0.200));
  }
  return webLog;
}));

// set CORS Options (Cross Origin Ressource Sharing)
app.use(cors(corsOptions));

logger4js.warn('Connecting Database');
dbConnect(process.env.NODE_VISBODB, launchServer);

module.exports = app;
