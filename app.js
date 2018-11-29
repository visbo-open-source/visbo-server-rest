var express = require('express'); // MS Commment
var path = require('path');
var favicon = require('serve-favicon');
var cors = require('cors');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var delay = require('delay');
var environment = require('dotenv');
var moment = require('moment');

var log4js = require('log4js');
var logger4js = log4js.getLogger("OTHER");
var logger4jsRest = log4js.getLogger("REST");


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

var systemVC = require('./components/sytemVC');

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
  autoReconnect: true,
  reconnectInterval: 3000,
  useNewUrlParser: true
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
    str += ' hour'
    if (hour>1) str += 's';
    if (min>0 || sec>0) str += ', ';
  }
  if (min>0) {
    str += min;
    str += ' minute'
    if (min>1) str += 's';
    if (sec>0) str += ', ';
  }
  if (sec>0) {
    str += sec;
    str += ' second'
    if (sec>1) str += 's';
  }
  return str;
}
function dbConnect(dbconnection) {
  if (!dbconnection) {
    logger4js.fatal('Connecting string missing in .env');
    // exit();
  } else {
    logger4js.mark('Connecting database %s', dbconnection.substring(0, 15).concat('...').concat(dbconnection.substring(dbconnection.length-10, dbconnection.length)));
    mongoose.connect(
      // Replace CONNECTION_URI with your connection uri
      dbconnection,
      dbOptions
    ).then(function() {
      //mongoose.set('debug', true);
      logger4js.mark('Server is fully functional DB Connected');
      // mongoose.set('debug', true);
      mongoose.set('debug', function (coll, method, query, doc, options) {
         logger4js.trace('Mongo: %s.%s(%s, %s)', coll, method, JSON.stringify(query), doc ? JSON.stringify(doc) : '');
      });
    }, function(err) {
      logger4js.fatal('Database connection failed: %O', err);

      reconnectTries++;
      logger4js.fatal('Reconnecting after '+delayString(trialDelay));
      logger4js.fatal('Reconnect trial: '+reconnectTries);
      delay(trialDelay*1000).then(function() {
        trialDelay += trialDelay;
        if (trialDelay>7200) trialDelay = 7200;
        // enable recurtion
        dbConnect();
      });
    });
  }
}

// dbConnect();

// CORS Config, whitelist is an array
var whitelist = [
  undefined, // POSTMAN Support
  'http://localhost:3484', // DEV Support
  'https://my.visbo.net', // Production Support
  'https://staging.visbo.net', // Staging Support
  'http://localhost:4200' // MS Todo UI Support DEV Support
]
// corsoptions is an object consisting of a property origin, the function is called if property is requested
var corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      logger4js.fatal("CorsOptions deny  %s", origin);
      //callback(null, true) // temporary enable cors for all sites
      callback(new Error(origin + ' is not allowed to access'))
    }
  }
}
// setup environment variables
environment.config();

// start express app
var app = express();
// configure log4js
var fsLogPath = __dirname + '/logging';
if (process.env.LOGPATH != undefined) {
  fsLogPath = process.env.LOGPATH;
}

log4js.configure({
  appenders: {
    out: { type: 'stdout' },
    everything: { type: 'dateFile', filename: fsLogPath + '/all-the-logs.log', maxLogSize: 4096000, backups: 30, daysToKeep: 30 },
    emergencies: {  type: 'file', filename: fsLogPath + '/oh-no-not-again.log', maxLogSize: 4096000, backups: 30, daysToKeep: 30 },
    'just-errors': { type: 'logLevelFilter', appender: 'emergencies', level: 'error' },
    'just-errors2': { type: 'logLevelFilter', appender: 'out', level: 'warn' }
  },
  categories: {
    default: { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
    "VC": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
    "VP": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
    "VPV": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
    "USER": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
    "MAIL": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
    "ALL": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' },
    "OTHER": { appenders: ['just-errors', 'just-errors2', 'everything'], level: 'debug' }
  }
});
logger4js.level = 'info';

logger4js.debug("LogPath %s", fsLogPath)
logger4js.warn("Starting in Environment %s", process.env.NODE_ENV);
logger4js.warn("Starting Version %s", process.env.VERSION_REST);

// view engine setup
//app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.engine('.html', require('ejs').renderFile);
// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// set CORS Options (Cross Origin Ressource Sharing)
app.use(cors(corsOptions));

// define the log entry for processing pages
//app.use(logger('common'));
app.use(logger(function (tokens, req, res) {
  visboAudit.visboAudit(tokens, req, res);
  var webLog = [
    tokens.method(req, res),
    // 'base url', req.baseUrl,
    //'Url', req.originalUrl,
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.res(req, res, 'content-length')||0+' Bytes',
    Math.round(tokens['response-time'](req, res))+'ms',
    req.headers["x-real-ip"] || req.ip,
    req.get('User-Agent'),
    ''
  ].join(' ');
  logger4jsRest.info(webLog);
  webLog = moment().format('YYYY-MM-DD HH:mm:ss:SSS:') + ' ' + webLog;
  return webLog
}));

dbConnect(process.env.NODE_VISBODB);

var sysVC = systemVC.createSystemVC(
    { users: [
        { "email":"support@visbo.de", "role": "Admin" }
     ]}
   )

var options = {
  dotfiles: 'ignore',
  etag: false,
  extensions: ['htm', 'html'],
  index: 'index.html',
  maxAge: '1d',
  redirect: false,
  setHeaders: function (res, path, stat) {
    res.set('x-timestamp', Date.now())
  }
}
app.use(express.static(path.join(__dirname, 'public'), options));
app.use(cookieParser());
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json({limit: '5mb', type: 'application/json'}));

// simple logger for this router's requests
// all requests to this router will first hit this middleware
app.use(function(req, res, next) {
  logger4js.trace('Method %s %s', req.method, req.url);
  next();
});

// // Catch all routes from the ui client and return the index file
// app.get('/ui/*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public/ui/index.html'));
// });
//

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
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  logger4js.fatal("Error 404 OriginalURL :%s: Parameter %O; Query %O", req.originalUrl, req.params, req.query);
  err.status = 404;
  res.status(404).send("Sorry can't find the URL:" + req.originalUrl + ":") // MS added
});


// error handlers

// development error handler
// will print stacktrace
if (process.env.NODE_ENV === 'development') {
//if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.send({
      state: 'failure',
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.send({
    state: 'failure',
    message: err.message,
    error: err
  });
});

module.exports = app;
