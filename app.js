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

//initialize mongoose schemas
require('./models/users');
require('./models/audit');
require('./models/visbocenter');
require('./models/visboproject');
require('./models/visboprojectversion');
require('./models/visboportfolio');
require('./models/vcrole');
require('./models/vccost');

// include the route modules
var user = require('./routes/user');
var token = require('./routes/token');
var vc = require('./routes/visbocenter');
var vp = require('./routes/visboproject');
var vpv = require('./routes/visboprojectversion');
var visboAudit = require('./components/visboAudit');

// Require mongoose
var mongoose = require('mongoose');
var dbOptions = {
  keepAlive: 200,
  autoReconnect: true,
  reconnectInterval: 3000
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
  console.log('%s: Connecting database %s', moment().format('YYYY-MM-DD HH:mm:ss:SSS'), dbconnection.substring(0, 15).concat('...').concat(dbconnection.substring(dbconnection.length-10, dbconnection.length)));
  mongoose.connect(
    // Replace CONNECTION_URI with your connection uri
    dbconnection,
    dbOptions
  ).then(function() {
    //mongoose.set('debug', true);
    console.log('%s: Server is fully functional DB Connected', moment().format('YYYY-MM-DD HH:mm:ss:SSS'));
  }, function(err) {
    console.log('%s: Database connection failed: %O', moment().format('YYYY-MM-DD HH:mm:ss'), err);

    reconnectTries++;
    console.log('%s: Reconnecting after '+delayString(trialDelay), moment().format('YYYY-MM-DD HH:mm:ss'));
    console.log('%s: Reconnect trial: '+reconnectTries, moment().format('YYYY-MM-DD HH:mm:ss'));
    delay(trialDelay*1000).then(function() {
      trialDelay += trialDelay;
      if (trialDelay>7200) trialDelay = 7200;
      // enable recurtion
      dbConnect();
    });
  });
}

// dbConnect();

// CORS Config, whitelist is an array
var whitelist = [
  undefined, // POSTMAN Support
  'http://localhost:3484', // DEV Support
  'http://visbo.myhome-server.de:3484', // Production Support
  'http://localhost:4200' // MS Todo UI Support DEV Support
]
// corsoptions is an object consisting of a property origin, the function is called if property is requested
// MS Todo: check where Corsoptions is called with undefined
var corsOptions = {
  origin: function (origin, callback) {
    //console.log("%s Check CorsOptions %s", moment().format('YYYY-MM-DD HH:mm:ss'), origin);
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      //callback(null, true) // temporary enable cors for all sites
      callback(new Error(origin + ' is not allowed to access'))
    }
  }
}
// setup environment variables
environment.config();
console.log("%s: Starting in Environment %s", moment().format('YYYY-MM-DD HH:mm:ss'), process.env.NODE_ENV);

// start express app
var app = express();

// console.log("Body Size Limit %d", app.Limit);		// MS Log

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
  // console.log("LOGGER");
  visboAudit.visboAudit(tokens, req, res);
  return [
    moment().format('YYYY-MM-DD HH:mm:ss:SSS:'),
    tokens.method(req, res),
    // 'base url', req.baseUrl,
    //'Url', req.originalUrl,
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.res(req, res, 'content-length')||0+' Bytes',
    Math.round(tokens['response-time'](req, res))+'ms',
    req.ip,
    req.get('User-Agent'),
    ''
  ].join(' ')
}));

dbConnect(process.env.NODE_VISBODB);


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
// app.use(function(req, res, next) {
//   console.log('%s: Method %s %s', moment().format('YYYY-MM-DD HH:mm:ss'), req.method, req.url);
//   next();
// });

// Catch all routes from the ui client and return the index file
app.get('/ui/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/ui/index.html'));
});


// Register the main routes
app.use('/user', user);
//app.use('/admin', admin);
app.use('/token', token);
app.use('/vc', vc);
app.use('/vp', vp);
app.use('/vpv', vpv);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  console.log("Error 404 OriginalURL :%s: Parameter %O; Query %O", req.originalUrl, req.params, req.query);		// MS Log
  err.status = 404;
  res.status(404).send("Sorry can't find the URL:" + req.originalUrl + ":") // MS added
  //next(err);
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
