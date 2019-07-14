/*
This file is original from https://www.npmjs.com/package/node-rtsp-stream.
Thanks to kyriesent.
 */

const ws = require('ws');

const http = require('http');

const util = require('util');

const events = require('events');

const Mpeg1Muxer = require('./mpeg1muxer');

const STREAM_MAGIC_BYTES = "jsmp"; // Must be 4 bytes

let VideoStream = function(options) {
  this.options = options;
  //this.name = options.name;
  this.streamUrl = options.streamUrl;
  this.width = options.width;
  this.height = options.height;
  this.host = options.host;
  this.wsPort = options.wsPort;
  this.wsPath = options.wsPath;
  this.inputStreamStarted = false;
  this.stream = undefined;
  this.startMpeg1Stream();
  this.pipeStreamToSocketServer();
  return this
};

util.inherits(VideoStream, events.EventEmitter);

VideoStream.prototype.stop = function() {
  this.wsServer.close();
  this.stream.kill();
  this.inputStreamStarted = false;
  return this
};

VideoStream.prototype.startMpeg1Stream = function() {
  let gettingInputData, gettingOutputData, inputData, outputData;
  this.mpeg1Muxer = new Mpeg1Muxer({
    ffmpegOptions: this.options.ffmpegOptions,
    url: this.streamUrl
  });
  this.stream = this.mpeg1Muxer.stream;
  if (this.inputStreamStarted) {
    return
  }
  this.mpeg1Muxer.on('mpeg1data', (data) => {
    return this.emit('camdata', data)
  });
  gettingInputData = false;
  inputData = [];
  gettingOutputData = false;
  outputData = [];
  this.mpeg1Muxer.on('ffmpegStderr', (data) => {
    let size;
    data = data.toString();
    if (data.indexOf('Input #') !== -1) {
      gettingInputData = true
    }
    if (data.indexOf('Output #') !== -1) {
      gettingInputData = false;
      gettingOutputData = true
    }
    if (data.indexOf('frame') === 0) {
      gettingOutputData = false
    }
    if (gettingInputData) {
      //this.console.log(JSON.stringify(data));
      inputData.push(data.toString());
      size = data.match(/\d+x\d+/);
      if (size != null) {
        size = size[0].split('x');
        if (this.width == null) {
          this.width = parseInt(size[0], 10)
        }
        if (this.height == null) {
          return this.height = parseInt(size[1], 10)
        }
      }
    }
  });
  this.mpeg1Muxer.on('ffmpegStderr', function(data) {
    return global.process.stderr.write(data)
  });
  this.mpeg1Muxer.on('exitWithError', () => {
    return this.emit('exitWithError')
  });
  return this
};

VideoStream.prototype.pipeStreamToSocketServer = function() {
   const server = http.createServer();

   //server.write('hello');
   /*
 this.wsServer = new ws.Server({
   server
 });
 this.wsServer.on("connection", (socket) => {
   //return this.onSocketConnect(socket);
   socket.send('Hello');
 });



 this.wsServer.send = function(data, opts) {
   let results;
   results = [];
   for (let client of this.clients) {
     if (client.readyState === 1) {
       results.push(client.send(data, opts))
     } else {
       results.push(console.log("Error: Client (" + this.clients[client] + ") not connected."))
     }
   }
   return results
 };


 this.on('camdata', (data) => {
   this.wsServer.send(data)
 });
 */

  server.listen(9999, this.host);

};

VideoStream.prototype.onSocketConnect = function(socket) {
  let streamHeader;
  // Send magic bytes and video size to the newly connected socket
  // struct { char magic[4]; unsigned short width, height;}
  streamHeader = new Buffer(8);
  streamHeader.write(STREAM_MAGIC_BYTES);
  streamHeader.writeUInt16BE(this.width, 4);
  streamHeader.writeUInt16BE(this.height, 6);
  socket.send(streamHeader, {
    binary: true
  });
  console.log(`${this.name}: New WebSocket Connection (` + this.wsServer.clients.size + " total)");
  return socket.on("close", (code, message) => {
    return console.log(`${this.name}: Disconnected WebSocket (` + this.wsServer.clients.size + " total)")
  })
};

module.exports = VideoStream;