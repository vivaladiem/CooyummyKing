var express = require('express')
	, path = require('path')
	, logger = require('morgan')
	, cookieParser = require('cookie-parser')
	, bodyParser = require('body-parser')
	, fs = require('fs')
	, uploadDir = __dirname + '/files'
	, userDir = __dirname + '/files/users'
	, recipeDir = __dirname + '/files/recipes'
	, battleUploadDir = __dirname + '/files/battles'
	, app = express();

/* set local develop environment */
app.set('config', require('./config/development.json'));

/* set common environment */
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.set('userDir', userDir);
app.set('recipeDir', recipeDir);
// app.set('battleUploadDir', battleUploadDir);

fs.exists(uploadDir, function(exist) {
	if (!exist) fs.mkdir(uploadDir);
	fs.exists(userDir, function(exist) { if (!exist) fs.mkdir(userDir); });
	fs.exists(recipeDir, function(exist) { if (!exist) fs.mkdir(recipeDir); });
});

/*
// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});
*/

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

/* set data model */
var db = app.get('config').db;
var knex = require('knex')({
	client: 'mysql',
	connection: {
		host: db.host,
		user: db.username,
		password: db.password,
		database: db.database
	},
	pool: {
		min: 0,
		max: 10
	}
});
app.set('knex', knex);

/* set router */
require('./routes').init(app);

/* start server */
var server = app.listen(app.get('port'), function() {
	console.log('Server Running at heroku');
});

process.on('uncaughtException', function(err) {
	console.error(err.stack);
});
