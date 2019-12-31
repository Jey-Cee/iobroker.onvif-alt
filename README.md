![Logo](admin/onvif.png)
# ioBroker.onvif

[![NPM version](http://img.shields.io/npm/v/iobroker.onvif.svg)](https://www.npmjs.com/package/iobroker.onvif)
[![Downloads](https://img.shields.io/npm/dm/iobroker.onvif.svg)](https://www.npmjs.com/package/iobroker.onvif)
[![Dependency Status](https://img.shields.io/david/jey-cee/iobroker.onvif.svg)](https://david-dm.org/Author/iobroker.onvif)
[![Known Vulnerabilities](https://snyk.io/test/github/jey-cee/ioBroker.onvif/badge.svg)](https://snyk.io/test/github/jey-cee/ioBroker.onvif)

[![NPM](https://nodei.co/npm/iobroker.onvif.png?downloads=true)](https://nodei.co/npm/iobroker.onvif/)

**Tests:**: [![Travis-CI](http://img.shields.io/travis/jey-cee/ioBroker.onvif/master.svg)](https://travis-ci.org/jey-cee/ioBroker.onvif)

## Onvif - IP camera protocol

The aim of this adapter is to find and control cameras that supports the Onvif protocol

## Manual

1. Install adapter and start instance. 
After a while (~30 seconds) all cameras on your network should be found and objects are created.
2. Then go to Instance configuration and enter the credentials for the cameras. Leave IP and Port unchanged.
3. It takes some time to connect with cameras and get all capabilities of the cameras.


## Changelog

### 0.1.0
* (jey-cee) fixed get system log
* (jey-cee) fixed reboot
* (jey-cee) scanWifi added, function WIP
* (jey-cee) make PTZ movement work

## License
MIT License

Copyright (c) 2019 Jey Cee <jey-cee@live.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.