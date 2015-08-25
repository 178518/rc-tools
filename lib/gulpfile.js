var gulp = require('gulp');
var path = require('path');
var cwd = process.cwd();
var pkg = require(path.join(cwd, 'package.json'));
var through2 = require('through2');
var webpack = require('webpack');
var shelljs = require('shelljs');
var jsx2example = require('gulp-jsx2example');
var getWebpackConfig = require('./getWebpackConfig');
var ghHistory = require('gh-history');
var babel = require('gulp-babel');
var startServer = require('./util').startServer;
var runCmd = require('./util').runCmd;

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
gulp.task('browser-test-cover', function (done) {
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

gulp.task('lint', ['check-deps'], function (done) {
  var eslintBin = path.join(__dirname, '../node_modules/.bin/eslint');
  var eslintConfig = path.join(__dirname, './eslintrc');
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

function clean() {
  shelljs.rm('-rf', path.join(cwd, 'build'));
  shelljs.rm('-rf', path.join(cwd, 'lib'));
  shelljs.rm('-rf', path.join(cwd, 'assets/*.css'));
}

gulp.task('webpack', ['clean'], function (done) {
  webpack(getWebpackConfig(), function (err, stats) {
    if (err) {
      console.error('error', err);
    }
    printResult(stats);
    done(err);
  });
});

gulp.task('clean', clean);

gulp.task('gh-pages', ['build'], function (done) {
  var ghPages = require('gh-pages');
  ghPages.publish(path.join(cwd, 'build'), {
    depth: 1,
    logger: function (message) {
      console.log(message);
    },
  }, function () {
    clean();
    done();
  });
});

gulp.task('build', ['webpack'], function () {
  return gulp
    .src([path.join(cwd, './examples/') + '*.*'])
    .pipe(jsx2example({
      dest: 'build/examples/',
    })) // jsx2example(options)
    .pipe(gulp.dest('build/examples/'));
});

gulp.task('less', ['clean'], function () {
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
      mdFilePath: './HISTORY.md',
    }, function () {
      done();
    });
  }
});

gulp.task('saucelabs', function (done) {
  var karmaBin = path.join(__dirname, '../node_modules/.bin/karma');
  var karmaConfig = path.join(__dirname, './karma.saucelabs.conf.js');
  var args = [karmaBin, 'start', karmaConfig];
  runCmd('node', args, done);
});

gulp.task('babel', ['clean'], function () {
  return gulp.src(['src/' + '**/' + '*.js', 'src/' + '**/' + '*.jsx'])
    .pipe(babel())
    .pipe(gulp.dest('lib'));
});

gulp.task('compile', ['babel', 'less']);

gulp.task('check-deps', function (done) {
  require('./checkDep')(done);
});

gulp.task('karma', function (done) {
  var karmaBin = path.join(__dirname, '../node_modules/.bin/karma');
  var karmaConfig = path.join(__dirname, './karma.conf.js');
  var args = [karmaBin, 'start', karmaConfig];
  if (process.argv.indexOf('--single-run') !== -1) {
    args.push('--single-run');
  }
  runCmd('node', args, done);
});

gulp.task('publish', ['compile'], function (done) {
  var npm = process.argv.indexOf('--tnpm') !== -1 ? 'tnpm' : 'npm';
  shelljs.exec(npm + ' publish', function () {
    clean();
    done();
  });
});

gulp.task('pub', ['publish', 'tag']);
