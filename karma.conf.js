// Karma configuration

const webpack = require('webpack');
const path = require('path');
const Dotenv = require('dotenv-webpack');
const coverageReporters = [{
  type: 'text-summary'
}];

const reporters = [
  'progress',
  'coverage'
];

if (process.env.TRAVIS) {
  console.log('On Travis sending coveralls');
  coverageReporters.push({
    type: 'lcov',
    dir: 'coverage'
  });
  reporters.push('coveralls');
} else {
  console.log('Not on Travis so not sending coveralls');
}

module.exports = function(config) {
  let settings = {
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['mocha'],

    client: {
      mocha: {
        opts: 'mocha.opts'
      }
    },

    // list of files / patterns to load in the browser
    files: [
      'test/*.test.js'
    ],


    // list of files to exclude
    exclude: [
    ],


    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      'test/*.test.js': ['webpack'],
      'src/**/*.js': ['coverage']
    },

    webpack: {
      devtool: 'inline-source-map',
      module: {
        loaders: [
          {
            test: /\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader',
            options: {
              presets: ['es2015'],
              plugins: ['transform-runtime']
            }
          },
          {
            test: /\.js$/,
            include: /src\/.*\.js$/,
            exclude: /node_modules/,
            loader: 'istanbul-instrumenter-loader',
            enforce: 'post'
          }
        ]
      },
      output: {
        path: path.resolve('test'),
        filename: 'test.out.js'
      },
      plugins: [
        new webpack.EnvironmentPlugin([
          'FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID'
        ])
      ],
      resolve: {
        alias: {
          'backbone.firestore': path.resolve('src/driver.js')
        }
      }
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters,

    coverageReporter: {
      reporters: coverageReporters
    },

    coverageIstanbulReporter: {
      reports: ['text-summary'],
      fixWebpackSourcePaths: true
    },

    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    //browsers: ['Chrome', 'Firefox'],
    browsers: ['Chrome'],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity
  };
  if (!process.env.TRAVIS) {
    settings.webpack.plugins.unshift(new Dotenv());
  }
  config.set(settings);
};
