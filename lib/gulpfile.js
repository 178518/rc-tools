var gulp = require('gulp');
var path = require('path');
var cwd = process.cwd();
var pkg = require(path.join(cwd, 'package.json'));
var fs = require('fs-extra');
var through2 = require('through2');
var webpack = require('webpack');
var shelljs = require('shelljs');
var serverFn = path.join(cwd, 'server-fn.js');
var serverExists = fs.existsSync(serverFn);
var jsx2example = require('gulp-jsx2example');
var getWebConfig = require('./getWebConfig');
var ghHistory = require('gh-history');


function startServer(cb) {
  var app;
  if (serverExists) {
    app = require(serverFn)();
  } else {
    app = require('rc-server')();
  }
  app.listen(function () {
    var port = this.address().port;
    console.log('start server at port:', port);
    cb.call(this, port);
  });
}

gulp.task('browser-test', function (done) {
  startServer(function (port) {
    var server = this;
    shelljs.exec(['mocha-phantomjs', 'http://localhost:' + port + '/tests/runner.html'].join(' '), function (code) {
      server.close(function (error) {
        done(error || code);
      });
    });
  });

});

// coveralls need lib
gulp.task('browser-test-cover', ['compile'], function (done) {
  startServer(function (port) {
    var server = this;
    shelljs.exec(['mocha-phantomjs', '-R',
      'node_modules/rc-server/node_modules/node-jscover-coveralls/lib/reporters/mocha',
      'http://localhost:' + port + '/tests/runner.html?coverage'].join(' '), function (code) {
      server.close(function (error) {
        done(error || code);
      });
    });
  });
});

function runCmd(cmd, args, fn) {
  args = args || [];
  var runner = require('child_process').spawn(cmd, args, {
    // keep color
    stdio: 'inherit'
  });
  runner.on('close', function (code) {
    if (fn) {
      fn(code);
    }
  });
}

gulp.task('lint', function (done) {
  var eslintBin = path.join(__dirname, '../node_modules/.bin/eslint');
  var eslintConfig = path.join(__dirname, '../.eslintrc');
  var args = [eslintBin, '-c', eslintConfig, '--ext', '.js,.jsx', 'src'];
  runCmd('node', args, done);
});

function printResult(stats) {
  stats = stats.toJson();

  (stats.errors || []).forEach(function (err) {
    console.error('error', err);
  });

  stats.assets.forEach(function (item) {
    var size = (item.size / 1024.0).toFixed(2) + 'kB';
    console.log('generated', item.name, size);
  });
}

gulp.task('webpack', ['clean', 'compile'], function (done) {
  webpack(getWebConfig(), function (err, stats) {
    if (err) {
      console.error('error', err);
    }
    printResult(stats);
    done(err);
  });
});

gulp.task('clean', function () {
  shelljs.rm('-rf', path.join(cwd, 'build'));
  shelljs.rm('-rf', path.join(cwd, 'lib'));
});

gulp.task('gh-pages', ['build'], function (done) {
  var ghPages = require('gh-pages');
  ghPages.publish(path.join(cwd, 'build'), {
    depth: 1,
    logger: function (message) {
      console.log(message);
    }
  }, done);
});

gulp.task('build', ['webpack'], function () {
  return gulp
    .src([path.join(cwd, './examples/') + '*.*'])
    .pipe(jsx2example({
      dest:'build/examples/'
    })) // jsx2example(options)
    .pipe(gulp.dest('build/examples/'));
});

gulp.task('less', function () {
  var less = require('gulp-less');
  var autoprefixer = require('autoprefixer-core');
  return gulp.src('./assets/' + '*.less')
    .pipe(less())
    .pipe(through2.obj(function (file, encoding, next) {
      file.contents = new Buffer(autoprefixer.process(file.contents.toString(encoding)).css, encoding);
      this.push(file);
      next();
    }))
    .pipe(gulp.dest('./assets/'));
});

gulp.task('tag', function () {
  var version = pkg.version;
  shelljs.cd(cwd);
  shelljs.exec('git tag ' + version);
  shelljs.exec('git push origin ' + version + ':' + version);
  shelljs.exec('git push origin master:master');
});

gulp.task('history', function (done) {

  var repository = pkg.repository.url;
  var info = repository.match(/git@github.com:([^/]+)\/([^.]+).git/);
  if (info && info.length) {
    ghHistory.generateHistoryMD({
      user: info[1],
      repo: info[2],
      mdFilePath: './HISTORY.md'
    }, function () {
      done();
    });
  }
});

var rcConfig = {};
var rcConfigFile = path.join(cwd, 'rc.config.js');
if (fs.existsSync(rcConfigFile)) {
  rcConfig = require(rcConfigFile);
}
gulp.task('saucelabs', function (done) {
  startServer(function (port) {
    var server = this;
    var saucelabsConfig = rcConfig.saucelabs || {};
    require('saucelabs-runner')({
      url: 'http://localhost:' + port + '/tests/runner.html',
      browsers: saucelabsConfig.browsers || [
        {browserName: 'chrome'},
        {browserName: 'firefox'},
        {browserName: 'internet explorer', version: 8},
        {browserName: 'internet explorer', version: 9},
        {browserName: 'internet explorer', version: 10},
        {browserName: 'internet explorer', version: 11, platform: 'Windows 8.1'}
      ]
    }).fin(function () {
      server.close(function (error) {
        done(error);
        setTimeout(function () {
          process.exit(0);
        }, 1000);
      });
    });
  });
});


var babel = require('gulp-babel');


gulp.task('compile', ['clean', 'less'], function () {
  return gulp.src(['src/' + '**/' + '*.js', 'src/' + '**/' + '*.jsx'])
    .pipe(babel())
    .pipe(gulp.dest('lib'));
});

gulp.task('check-deps', function (done) {
  require('./checkDep')(done);
});

gulp.task('precommit', ['lint', 'check-deps', 'compile']);
