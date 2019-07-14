/*
This file is original from https://www.npmjs.com/package/node-rtsp-stream.
Thanks to kyriesent.
 */


const child_process = require('child_process');

const util = require('util');

const events = require('events');

let Mpeg1Muxer = function(options) {
  let key;
  this.url = options.url;
  this.ffmpegOptions = options.ffmpegOptions;
  this.exitCode = undefined;
  this.additionalFlags = [];
  if (this.ffmpegOptions) {
    for (key in this.ffmpegOptions) {
      this.additionalFlags.push(key);
      if (String(this.ffmpegOptions[key]) !== '') {
        this.additionalFlags.push(String(this.ffmpegOptions[key]))
      }
    }
  }
  this.spawnOptions = [
    "-i",
    this.url,
    '-f',
    'mpegts',
    '-codec:v',
    'libx264',
    // additional ffmpeg options go here
    ...this.additionalFlags,
    '-'
  ]
  this.stream = child_process.spawn(`${__dirname}/ffmpeg_bin`, this.spawnOptions, {
    detached: false
  })
  this.inputStreamStarted = true;
  this.stream.stdout.on('data', (data) => {
    return this.emit('libx264', data)
  });
  this.stream.stderr.on('data', (data) => {
    return this.emit('ffmpegStderr', data)
  });
  this.stream.on('exit', (code, signal) => {
    if (code === 1) {
      console.error('RTSP stream exited with error');
      this.exitCode = 1;
      return this.emit('exitWithError')
    }
  });
  return this
};

util.inherits(Mpeg1Muxer, events.EventEmitter);

module.exports = Mpeg1Muxer;
