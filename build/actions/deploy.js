// Generated by CoffeeScript 1.12.6
var Promise, dockerUtils, formatImageName, getBuilderLogPushEndpoint, getBuilderPushEndpoint, getBundleInfo, parseInput, performUpload, pushProgress, renderProgress, uploadLogs, uploadToPromise;

Promise = require('bluebird');

dockerUtils = require('../utils/docker');

getBuilderPushEndpoint = function(baseUrl, owner, app) {
  var args, querystring;
  querystring = require('querystring');
  args = querystring.stringify({
    owner: owner,
    app: app
  });
  return "https://builder." + baseUrl + "/v1/push?" + args;
};

getBuilderLogPushEndpoint = function(baseUrl, buildId, owner, app) {
  var args, querystring;
  querystring = require('querystring');
  args = querystring.stringify({
    owner: owner,
    app: app,
    buildId: buildId
  });
  return "https://builder." + baseUrl + "/v1/pushLogs?" + args;
};

formatImageName = function(image) {
  return image.split('/').pop();
};

parseInput = Promise.method(function(params, options) {
  var appName, image, source;
  if (params.appName == null) {
    throw new Error('Need an application to deploy to!');
  }
  appName = params.appName;
  image = void 0;
  if (params.image != null) {
    if (options.build || (options.source != null)) {
      throw new Error('Build and source parameters are not applicable when specifying an image');
    }
    options.build = false;
    image = params.image;
  } else if (options.build) {
    source = options.source || '.';
  } else {
    throw new Error('Need either an image or a build flag!');
  }
  return [appName, options.build, source, image];
});

renderProgress = function(percentage, stepCount) {
  var _, bar, barCount, spaceCount;
  if (stepCount == null) {
    stepCount = 50;
  }
  _ = require('lodash');
  percentage = Math.max(0, Math.min(percentage, 100));
  barCount = Math.floor(stepCount * percentage / 100);
  spaceCount = stepCount - barCount;
  bar = "[" + (_.repeat('=', barCount)) + ">" + (_.repeat(' ', spaceCount)) + "]";
  return bar + " " + (percentage.toFixed(1)) + "%";
};

pushProgress = function(imageSize, request, logStreams, timeout) {
  var ansiEscapes, logging, progressReporter;
  if (timeout == null) {
    timeout = 250;
  }
  logging = require('../utils/logging');
  ansiEscapes = require('ansi-escapes');
  logging.logInfo(logStreams, 'Initializing...');
  return progressReporter = setInterval(function() {
    var percent, sent;
    sent = request.req.connection._bytesDispatched;
    percent = (sent / imageSize) * 100;
    if (percent >= 100) {
      clearInterval(progressReporter);
      percent = 100;
    }
    process.stdout.write(ansiEscapes.cursorUp(1));
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    return logging.logInfo(logStreams, renderProgress(percent));
  }, timeout);
};

getBundleInfo = function(options) {
  var helpers;
  helpers = require('../utils/helpers');
  return helpers.getAppInfo(options.appName).then(function(app) {
    return [app.arch, app.device_type];
  });
};

performUpload = function(image, token, username, url, size, appName, logStreams) {
  var post, request;
  request = require('request');
  post = request.post({
    url: getBuilderPushEndpoint(url, username, appName),
    auth: {
      bearer: token
    },
    body: image
  });
  return uploadToPromise(post, size, logStreams);
};

uploadLogs = function(logs, token, url, buildId, username, appName) {
  var request;
  request = require('request');
  return request.post({
    json: true,
    url: getBuilderLogPushEndpoint(url, buildId, username, appName),
    auth: {
      bearer: token
    },
    body: Buffer.from(logs)
  });
};

uploadToPromise = function(request, size, logStreams) {
  var logging;
  logging = require('../utils/logging');
  return new Promise(function(resolve, reject) {
    var handleMessage;
    handleMessage = function(data) {
      var e, obj;
      data = data.toString();
      logging.logDebug(logStreams, "Received data: " + data);
      try {
        obj = JSON.parse(data);
      } catch (error) {
        e = error;
        logging.logError(logStreams, 'Error parsing reply from remote side');
        reject(e);
        return;
      }
      if (obj.type != null) {
        switch (obj.type) {
          case 'error':
            return reject(new Error("Remote error: " + obj.error));
          case 'success':
            return resolve(obj);
          case 'status':
            return logging.logInfo(logStreams, "Remote: " + obj.message);
          default:
            return reject(new Error("Received unexpected reply from remote: " + data));
        }
      } else {
        return reject(new Error("Received unexpected reply from remote: " + data));
      }
    };
    request.on('error', reject).on('data', handleMessage);
    return pushProgress(size, request, logStreams);
  });
};

module.exports = {
  signature: 'deploy <appName> [image]',
  description: 'Deploy a container to a resin.io application',
  help: 'Use this command to deploy and optionally build an image to an application.\n\nUsage: deploy <appName> ([image] | --build [--source build-dir])\n\nNote: If building with this command, all options supported by `resin build`\nare also supported with this command.\n\nExamples:\n	$ resin deploy myApp --build --source myBuildDir/\n	$ resin deploy myApp myApp/myImage',
  permission: 'user',
  options: dockerUtils.appendOptions([
    {
      signature: 'build',
      boolean: true,
      description: 'Build image then deploy',
      alias: 'b'
    }, {
      signature: 'source',
      parameter: 'source',
      description: 'The source directory to use when building the image',
      alias: 's'
    }, {
      signature: 'nologupload',
      description: "Don't upload build logs to the dashboard with image (if building)",
      boolean: true
    }
  ]),
  action: function(params, options, done) {
    var _, logStreams, logging, logs, resin, tmp, tmpNameAsync, upload;
    _ = require('lodash');
    tmp = require('tmp');
    tmpNameAsync = Promise.promisify(tmp.tmpName);
    resin = require('resin-sdk-preconfigured');
    logging = require('../utils/logging');
    logStreams = logging.getLogStreams();
    tmp.setGracefulCleanup();
    logs = '';
    upload = function(token, username, url) {
      var docker;
      docker = dockerUtils.getDocker(options);
      return parseInput(params, options).then(function(arg) {
        var appName, build, imageName, source;
        appName = arg[0], build = arg[1], source = arg[2], imageName = arg[3];
        return tmpNameAsync().then(function(tmpPath) {
          options = _.assign({}, options, {
            appName: appName
          });
          params = _.assign({}, params, {
            source: source
          });
          return Promise["try"](function() {
            if (build) {
              return dockerUtils.runBuild(params, options, getBundleInfo, logStreams);
            } else {
              return {
                image: imageName,
                log: ''
              };
            }
          }).then(function(arg1) {
            var buildLogs, imageName;
            imageName = arg1.image, buildLogs = arg1.log;
            logs = buildLogs;
            return Promise.join(dockerUtils.bufferImage(docker, imageName, tmpPath), token, username, url, dockerUtils.getImageSize(docker, imageName), params.appName, logStreams, performUpload);
          })["finally"](function() {
            return require('mz/fs').unlink(tmpPath)["catch"](_.noop);
          });
        });
      }).tap(function(arg) {
        var buildId, imageName;
        imageName = arg.image, buildId = arg.buildId;
        logging.logSuccess(logStreams, "Successfully deployed image: " + (formatImageName(imageName)));
        return buildId;
      }).then(function(arg) {
        var buildId, imageName;
        imageName = arg.image, buildId = arg.buildId;
        if (logs === '' || (options.nologupload != null)) {
          return '';
        }
        logging.logInfo(logStreams, 'Uploading logs to dashboard...');
        return Promise.join(logs, token, url, buildId, username, params.appName, uploadLogs)["return"]('Successfully uploaded logs');
      }).then(function(msg) {
        if (msg !== '') {
          return logging.logSuccess(logStreams, msg);
        }
      }).asCallback(done);
    };
    return Promise.join(resin.auth.getToken(), resin.auth.whoami(), resin.settings.get('resinUrl'), upload);
  }
};
