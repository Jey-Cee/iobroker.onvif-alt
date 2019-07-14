'use strict';

/*
 * Created with @iobroker/create-adapter v1.15.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const OnvifManager = require('onvif-nvt');
const unzipper = require('unzipper');
const OS = require('os');
const https = require('https');
const fs = require('fs');
const exec = require('child_process').exec;
const rtsp = require('./lib/videoStream.js');

// Load your modules here, e.g.:
// const fs = require("fs");



class Onvif extends utils.Adapter {

    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'onvif',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }



    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {


        if(this.config.ffmpeg_installed === false){
            this.log.info('Checking for ffmpeg');
            fs.access(`${__dirname}/lib/ffmpeg`, fs.constants.F_OK, (err) => {
                //this.log.debug(`${__dirname}/lib/ffmpeg ${err ? 'does not exist' : 'exists'}`);
                if(err){
                    this.log.info('ffmpeg is not isnstalled, will install it now');
                    this.installFFMPEG(this);
                }else{
                    this.log.info('ffmpeg is already there');
                    this.config.ffmpeg_installed = true;
                }
            });

        }

        this.autoDiscover();

        this.connectToCams();

        //this.convert_stream();

        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates('*');

    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            //this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            let tmp = id.split('.');
            let dp = tmp.pop();

            switch (dp){
                case 'snapshot':
                    break;
                case 'reboot':
                    this.log.info('reboot state change');
                    this.rebootCamera(id);
                    break;
                case 'getlogs':
                    this.getSystemLog(id);
                    break;
                case 'discover':
                    this.autoDiscover();
                    break;
                case 'stop_movement':
                    this.stopMovement(id);
                    break;
                case 'start_movement':
                    this.startPTZmovement(id);
                    break;
            }
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

     /**
      * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
      * Using this method requires "common.message" property to be set to true in io-package.json
      * @param {ioBroker.Message} obj
      */
     onMessage(obj) {
     	if (typeof obj === 'object' && obj.message) {
     		if (obj.command === 'send') {
     			// e.g. send email or pushover or whatever
     			this.log.info('send command');

     			// Send response in callback if required
     			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
     		}
     	}
    }

    //rtsp stream test
    convert_stream(){
         let stream = new rtsp({
             //name: 'test',
             streamURL: 'rtsp://192.168.0.82:554/videoMain',
             host: '0.0.0.0',
             wsPort: 9999,
             wsPath: '/video.mp4',
             ffmpegOptions: {
                 '-stats': '',
                 '-r': 30
             }
         })
    }

    rebootCamera(id){
         let cam_id = id.replace('.reboot', '');
         this.getObject(cam_id, (err, obj)=>{
             if(err){
                 this.log.error(err);
             }
             OnvifManager.connect(obj.native.ip)
                 .then(results =>{
                        results.core.systemReboot((msg)=>{
                            this.log.info(cam_id + ' reboot: ' + JSON.stringify(msg));
                        })
                 }, reject => {
                     this.log.error(cam_id + ' reboot:' + JSON.stringify(reject));
                 })

         })
    }

    getSystemLog(id){
        let cam_id = id.replace('.logs.getlogs', '');
        this.getObject(cam_id, (err, obj)=>{
            if(err){
                this.log.error(err);
            }
            OnvifManager.connect(obj.native.ip)
                .then(results =>{
                    results.core.getSystemLog('system',(msg)=>{
                        this.log.info(cam_id + ' System Log: ' + JSON.stringify(msg));
                        this.setState(cam_id + '.logs.systemlog', {val: JSON.stringify(msg), ack: true});
                    });
                    results.core.getSystemLog('access',(msg)=>{
                        this.log.info(cam_id + ' Access Log: ' + JSON.stringify(msg));
                        this.setState(cam_id + '.logs.accesslog', {val: JSON.stringify(msg), ack: true});
                    });
                }, reject => {
                    this.log.error(cam_id + ' get logs:' + JSON.stringify(reject));
                })
        })
    }

    scanWifi(id){   //WIP, add catcher for button press and extract interface token
        let cam_id = id.replace('.network.scanwifi', '');
        this.getObject(cam_id, (err, obj)=>{
            if(err){
                this.log.error(err);
            }
            OnvifManager.connect(obj.native.ip)
                .then(results =>{
                    results.core.systemReboot((msg)=>{
                        this.log.info(cam_id + ' reboot: ' + JSON.stringify(msg));
                    })
                }, reject => {
                    this.log.error(cam_id + ' reboot:' + JSON.stringify(reject));
                })

        })
    }

    getNetworkInterfaces(address, cam){
            OnvifManager.connect(address)
                .then(results =>{
                    results.core.getNetworkInterfaces((msg)=>{
                        this.log.info(address + ' get network interfaces: ' + JSON.stringify(msg));
                        if(msg !== null && msg.statusCode !== 400){
                            this.setObject(cam + '.network.scanwifi', {
                                type: 'state',
                                common: {
                                    name: 'Scan for available Wifi networks ',
                                    type: 'boolean',
                                    role: 'button',
                                    read: false,
                                    write: true
                                },
                                native: {

                                }
                            });

                            this.setObject(cam + '.network.availablewifi', {
                                type: 'state',
                                common: {
                                    name: 'Available Wifi networks ',
                                    type: 'string',
                                    role: 'text',
                                    read: true,
                                    write: false
                                },
                                native: {

                                }
                            });
                        }
                    })
                }, reject => {
                    this.log.error(address + ' get network interfaces:' + JSON.stringify(reject));
                })
    }

    getNetworkProtocols(address, cam){
        OnvifManager.connect(address)
            .then(results =>{
                results.core.getNetworkProtocols((msg)=>{
                    this.log.info(address + ' get network protocols: ' + JSON.stringify(msg));
                })
            }, reject => {
                this.log.error(address + ' get network protocols:' + JSON.stringify(reject));
            })
    }

    getAudioOutputs(address, cam){
        OnvifManager.connect(address)
            .then(results =>{
                results.media.getAudioOutputs((msg)=>{
                    this.log.info(address + ' get audio outputs: ' + JSON.stringify(msg));
                })
            }, reject => {
                this.log.error(address + ' get audio outputs:' + JSON.stringify(reject));
            })
    }

    getPTZNodes(address){
        OnvifManager.connect(address)
            .then(results =>{
                results.ptz.getNodes((msg)=>{
                    this.log.info(address + ' get PTZ nodes outputs: ' + JSON.stringify(msg));
                })
            }, reject => {
                this.log.error(address + ' get PTZ nodes outputs:' + JSON.stringify(reject));
            })
    }

    getPTZStatus(address){
        OnvifManager.connect(address)
            .then(results =>{
                results.ptz.getNodes((msg)=>{
                    this.log.info(address + ' get PTZ status: ' + JSON.stringify(msg));
                })
            }, reject => {
                this.log.error(address + ' get PTZ status:' + JSON.stringify(reject));
            })
    }

    getPTZConfigurations(address){
        OnvifManager.connect(address)
            .then(results =>{
                results.ptz.getConfigurations((msg)=>{
                    this.log.info(address + ' get PTZ configurations: ' + JSON.stringify(msg));
                })
            }, reject => {
                this.log.error(address + ' get PTZ configurations:' + JSON.stringify(reject));
            })
    }

    getPTZPresets(address){
        OnvifManager.connect(address)
            .then(results =>{
                results.ptz.getPresets((msg)=>{
                    this.log.info(address + ' get PTZ presets: ' + JSON.stringify(msg));
                })
            }, reject => {
                this.log.error(address + ' get PTZ presets:' + JSON.stringify(reject));
            })
    }

    /*
    startPTZmovement(id){
        this.log.info('start movment');
        let device = id.replace('.ptz.start_movement', '');
        this.getState(device + '.ptz.reference', (err, state)=>{
            //state.val: 0 = absolute, 1 = relative
            if(state.val === 0){
                this.log.info('start movment');
                this.getObject(device, (err, obj)=>{
                    let path = obj.native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);
                    this.log.info('start movment');
                    OnvifManager.connect(obj.native.ip, obj.native.port, obj.native.user, obj.native.password, path)
                        .then(results =>{
                            this.log.info('start movment');
                            results.ptz.absoluteMove(null, {x: 5}, null, (msg)=>{
                                this.log.info(obj.native.ip + ' PTZ start movment: ' + JSON.stringify(msg));
                            })
                        }, reject => {
                            this.log.error(obj.native.ip + ' PTZ start movment:' + JSON.stringify(reject));
                        })
                });

            }else if(state.val === 1){
                this.getObject(device, (err, obj)=>{
                    let path = obj.native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);
                    OnvifManager.connect(obj.native.ip, obj.native.port, obj.native.user, obj.native.password, path)
                        .then(results =>{
                            results.ptz.absoluteMove(null, 5, null, (msg)=>{
                                this.log.info(obj.native.ip + ' PTZ start movment: ' + JSON.stringify(msg));
                            })
                        }, reject => {
                            this.log.error(obj.native.ip + ' PTZ start movment:' + JSON.stringify(reject));
                        })
                });

            }
        })
    }
    */

    async startPTZmovement(id){
        let device = id.replace('.ptz.start_movement', '');
        let x = await this.getStateAsync(device + '.ptz.x');
        let y = await this.getStateAsync(device + '.ptz.y');
        let z = await this.getStateAsync(device + '.ptz.z');
        let reference = await this.getStateAsync(device + '.ptz.reference');
        let object = await this.getObjectAsync(device);


        if(reference.val === 0){
            let path = object.native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);
            let movement = {};
            if(x.val !== ''){
                movement.x = x.val;
            }
            /*
            if(y.val !== ''){
                movement.y = y.val;
            }
            if(z.val !== '' && z.val !== 0){
                movement.z = z.val;
            }
            */

            this.log.info('movement: ' + JSON.stringify(movement));

            OnvifManager.connect(object.native.ip, object.native.port, object.native.user, object.native.password, path)
                .then(results =>{
                    this.log.info('start movment: ' + JSON.stringify(movement));
                    results.ptz.absoluteMove(null, movement, null, (msg)=>{
                        this.log.info(object.native.ip + ' PTZ start movment: ' + JSON.stringify(msg));
                    })
                }, reject => {
                    this.log.error(object.native.ip + ' PTZ start movment:' + JSON.stringify(reject));
                })

        }else if(reference.val === 1){
            let path = object.native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);
            let movement = {};
            if(x.val !== ''){
                movement.x = x.val;
            }
            /*
            if(y.val !== ''){
                movement.y = y.val;
            }
            if(z.val !== '' && z.val !== 0){
                movement.z = z.val;
            }
            */

            this.log.info('movement: ' + JSON.stringify(movement));

            OnvifManager.connect(object.native.ip, object.native.port, object.native.user, object.native.password, path)
                .then(results =>{
                    this.log.info('start movment: ' + JSON.stringify(movement));
                    results.ptz.relativeMove(null, movement, null, (msg)=>{
                        this.log.info(object.native.ip + ' PTZ start movment: ' + JSON.stringify(msg));
                    })
                }, reject => {
                    this.log.error(object.native.ip + ' PTZ start movment:' + JSON.stringify(reject));
                })
        }
    }



    stopMovement(id){
         let device = id.replace('.ptz.stop_movement', '');
         this.getObject(device, (err, obj)=>{
             let path = obj.native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);
             OnvifManager.connect(obj.native.ip, obj.native.port, obj.native.user, obj.native.password, path)
                 .then(results =>{
                     results.ptz.stop(null, null, null,(msg)=>{
                         this.log.info(obj.native.ip + ' PTZ stop movment: ' + JSON.stringify(msg));
                     })
                 }, reject => {
                     this.log.error(obj.native.ip + ' PTZ stop movment:' + JSON.stringify(reject));
                 })
         });

    }

    async connectToCams(){
        this.log.info('connecting');

        let devices = await this.getDevicesAsync();

        this.log.info('devices for connection: ' + JSON.stringify(devices));
        for(let x in devices){
            let ip, port, path;

            if(devices[x].native.user !== '' && devices[x].native.password !== ''){
                ip = devices[x].native.ip;
                port = devices[x].native.service.match(/(?<=:)\d{2,}/gm);
                path = devices[x].native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);

                await OnvifManager.connect(ip, port, devices[x].native.user, devices[x].native.password, path)
                    .then(results => {
                        this.log.info('results: ' + JSON.stringify(results));
                        let camera = results;
                        let c = this.createStatesByServices(camera);
                        let d = this.updateMainInfo(camera);
                        }, reject => {
                            //this.log.error('Connect to cams:' + JSON.stringify(reject));
                            this.log.error('Connect to cams:' + ip + ' ' + JSON.stringify(reject));
                        })
                }


            }


    }

    createStatesByServices(list){
         //extend device object with additional information
        this.lookForDev(list.address, null, (id)=>{
            this.log.info(id);
            let cam = id.replace(/onvif.\d./g, '');
            //create objects for each profile
            for(let x in list.profileList){
                let l = list.profileList[x];

                let default_profile = false;

                if(list.defaultProfile.Name === l.Name){
                    default_profile = true;
                }

                let video_source_configuration, audio_source_configuration, video_encoder_configuration, audio_encoder_configuration, ptz_configuration;

                if(l['VideoSourceConfiguration']){
                    video_source_configuration = {
                        name: l['VideoSourceConfiguration']['Name'],
                        use_count: l['VideoSourceConfiguration']['UseCount'],
                        token: l['VideoSourceConfiguration']['$']['token'],
                        x: l['VideoSourceConfiguration']['Bounds']['$']['x'],
                        y: l['VideoSourceConfiguration']['Bounds']['$']['y'],
                        width: l['VideoSourceConfiguration']['Bounds']['$']['width'],
                        height: l['VideoSourceConfiguration']['Bounds']['$']['height']
                    }
                }

                if(l['AudioSourceConfiguration']){
                    audio_source_configuration = {
                        name: l['AudioSourceConfiguration']['Name'],
                        use_count: l['AudioSourceConfiguration']['UseCount'],
                        token: l['AudioSourceConfiguration']['$']['token']
                    }
                }

                if(l['VideoEncoderConfiguration']){
                    video_encoder_configuration = {
                            name: l['VideoEncoderConfiguration']['Name'],
                            use_count: l['VideoEncoderConfiguration']['UseCount'],
                            token: l['VideoEncoderConfiguration']['$']['token'],
                            encoding: l['VideoEncoderConfiguration']['Encoding'],
                            quality: l['VideoEncoderConfiguration']['Quality'],
                            resolution: {
                                width: "",
                                height: ""
                            },
                            h264: {
                                gov_length: "",
                                h264_profile: ""
                            },
                            rate_control: {
                                frame_rate_limit: "",
                                encoding_interval: "",
                                bitrate_limit: ""
                            },
                            multicast: {
                                ipv4: "",
                                port: "",
                                ttl: "",
                                auto_start: ""
                            },
                            session_timeout: l['VideoEncoderConfiguration']['SessionTimeout']
                    };

                    if (l['VideoEncoderConfiguration']['Resolution']) {
                        video_encoder_configuration.resolution.width = l['VideoEncoderConfiguration']['Resolution']['Width'];
                        video_encoder_configuration.resolution.height = l['VideoEncoderConfiguration']['Resolution']['Height'];
                    }

                    if (l['VideoEncoderConfiguration']['H264']) {
                        video_encoder_configuration.h264.gov_length = l['VideoEncoderConfiguration']['H264']['GovLength'];
                        video_encoder_configuration.h264.h264_profile = l['VideoEncoderConfiguration']['H264']['H264Profile'];
                        }

                    if(l['VideoEncoderConfiguration']['RateControl']){
                        video_encoder_configuration.rate_control.frame_rate_limit = l['VideoEncoderConfiguration']['RateControl']['FrameRateLimit'];
                        video_encoder_configuration.rate_control.encoding_interval = l['VideoEncoderConfiguration']['RateControl']['EncodingInterval'];
                        video_encoder_configuration.rate_control.bitrate_limit = l['VideoEncoderConfiguration']['RateControl']['BitrateLimit'];
                    }

                    if(l['VideoEncoderConfiguration']['Multicast']){
                        video_encoder_configuration.multicast.ipv4 = l['VideoEncoderConfiguration']['Multicast']['Address']['IPv4Address'];
                        video_encoder_configuration.multicast.port = l['VideoEncoderConfiguration']['Multicast']['Port'];
                        video_encoder_configuration.multicast.ttl = l['VideoEncoderConfiguration']['Multicast']['TTL'];
                        video_encoder_configuration.multicast.auto_start = l['VideoEncoderConfiguration']['Multicast']['AutoStart'];
                    }
                }

                if(l['AudioEncoderConfiguration']){
                    audio_encoder_configuration ={
                        name: l['AudioEncoderConfiguration']['Name'],
                        use_count: l['AudioEncoderConfiguration']['UseCount'],
                        token: l['AudioEncoderConfiguration']['$']['token'],
                        encoding: l['AudioEncoderConfiguration']['Encoding'],
                        bitrate: l['AudioEncoderConfiguration']['Bitrate'],
                        sample_rate: l['AudioEncoderConfiguration']['SampleRate'],
                        multicast: {
                            ipv4: l['AudioEncoderConfiguration']['Multicast']['Address']['IPv4Address'],
                            port: l['AudioEncoderConfiguration']['Multicast']['Port'],
                            ttl: l['AudioEncoderConfiguration']['Multicast']['TTL'],
                            auto_start: l['AudioEncoderConfiguration']['Multicast']['AutoStart']
                        },
                        session_timeout: l['AudioEncoderConfiguration']['SessionTimeout']
                    }
                }

                if(l['PTZConfiguration']){
                    ptz_configuration = {
                        name: l['PTZConfiguration']['name'],
                        use_count: l['PTZConfiguration']['UseCount'],
                        token: l['PTZConfiguration']['$']['token'],
                        session_timeout: l['PTZConfiguration']['DefaultPTZTimeout']
                    }
                }

                this.setObject(cam + '.profiles.' + x, {
                    type: 'channel',
                    common: {
                        name: l['Name'],
                        role: 'state'
                    },
                    native: {
                        default_profile: default_profile,
                        video_source_configuration,
                        audio_source_configuration,
                        video_encoder_configuration,
                        audio_encoder_configuration,
                        ptz_configuration
                    }
                });

                this.setObject(cam + '.profiles.' + x + '.stream_uri', {
                    type: 'state',
                    common: {
                        name: l['Name'] + ' Stream URI',
                        type: 'string',
                        role: 'text.url',
                        read: true,
                        write: false
                    },
                    native: {
                        invalid_after_connect: l['StreamUri']['InvalidAfterConnect'],
                        invalid_after_reboot: l['StreamUri']['InvalidAfterReboot'],
                        timeout: l['StreamUri']['Timeout']
                    }
                });

                this.setState(cam + '.profiles.' + x + '.stream_uri', {val: l['StreamUri']['Uri'], ack: true});

                this.setObject(cam + '.profiles.' + x + '.snapshot_uri', {
                    type: 'state',
                    common: {
                        name: l['Name'] + ' Snapshot URI',
                        type: 'string',
                        role: 'text.url',
                        read: true,
                        write: false
                    },
                    native: {
                        invalid_after_connect: l['SnapshotUri']['InvalidAfterConnect'],
                        invalid_after_reboot: l['SnapshotUri']['InvalidAfterReboot'],
                        timeout: l['SnapshotUri']['Timeout'],
                        uri: l['SnapshotUri']['Uri']
                    }
                });

                this.setState(cam + '.profiles.' + x + '.snapshot_uri', {val: l['SnapshotUri']['Uri'], ack: true});


            }

            //create objects for PTZ if the feature is available
            if(list.ptz !== null){
                this.setObject(cam + '.ptz', {
                    type: 'channel',
                    common: {
                        name: 'PTZ controls'
                    },
                    native: {
                        default_profile_token: list['ptz']['defaultProfileToken']
                    }
                });

                this.setObjectNotExists(cam + '.ptz.x', {
                    type: 'state',
                    common: {
                        name: 'X position for camera',
                        type: 'number',
                        role: 'state',
                        read: true,
                        write: true
                    },
                    native: {

                    }
                });

                this.setObjectNotExists(cam + '.ptz.y', {
                    type: 'state',
                    common: {
                        name: 'Y position for camera',
                        type: 'number',
                        role: 'state',
                        read: true,
                        write: true
                    },
                    native: {

                    }
                });

                this.setObjectNotExists(cam + '.ptz.z', {
                    type: 'state',
                    common: {
                        name: 'Zoom',
                        type: 'number',
                        role: 'state',
                        read: true,
                        write: true
                    },
                    native: {

                    }
                });

                this.setObjectNotExists(cam + '.ptz.reference', {
                    type: 'state',
                    common: {
                        name: 'Reference',
                        type: 'number',
                        role: 'state',
                        read: true,
                        write: true,
                        def: 0,
                        states: {0:'absolute',1:'relative'}
                    },
                    native: {

                    }
                });

                this.setObjectNotExists(cam + '.ptz.stop_movement', {
                    type: 'state',
                    common: {
                        name: 'Stop movment',
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true
                    },
                    native: {

                    }
                });

                this.setObjectNotExists(cam + '.ptz.start_movement', {
                    type: 'state',
                    common: {
                        name: 'Start movment',
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true
                    },
                    native: {

                    }
                });


                this.getPTZNodes(list.address);
                this.getPTZStatus(list.address);
                this.getPTZConfigurations(list.address);
                this.getPTZPresets(list.address);
            }


            //get additional information
            this.getNetworkInterfaces(list.address, cam);
            this.getNetworkProtocols(list.address, cam);
            this.getAudioOutputs(list.address, cam);
        })

    }

    updateMainInfo(list){
        let dInfo = list.deviceInformation;
        this.lookForDev(list.address, null, (id)=>{
            this.log.info(id);
            this.extendObject(id, {
                native: {
                    port: list.port[0],
                    manufacturer: dInfo.Manufacturer,
                    model: dInfo.Model,
                    firmware: dInfo.FirmwareVersion,
                    serial: dInfo.SerialNumber,
                    hardware_id: dInfo.HardwareId,
                    ptz: dInfo.Ptz,
                    video_encoder: dInfo.VideoEncoder,
                    name: dInfo.Name,
                    hardware: dInfo.Hardware,
                    profile_s: dInfo.ProfileS,
                    country: dInfo.Country,
                    city: dInfo.City

                }
            })

        })
    }

    lookForDev(ip, urn, callback){
        this.getDevices((err, devices)=>{
            for(let x in devices){
                let ipCheck = false;
                let urnCheck = false;

                if(ip !== null && devices[x].native.ip === ip){
                    ipCheck = true;
                }
                if(urn !== null && devices[x].native.urn === urn){
                    urnCheck = true;
                }
                if(ipCheck === true || urnCheck === true){
                    callback(devices[x]._id);
                }

            }
        })
    }


    async autoDiscover(){
        OnvifManager.add('discovery');
        let deviceList = await OnvifManager.discovery.startProbe();

        for(let x in deviceList){
            let cameras = await this.getDevicesAsync();

            if(cameras.length === 0){
                //if there is no devices can create the new one
                let first = await this.setObjectNotExistsAsync(deviceList[x]['name'], {
                    type: 'device',
                    common: {
                        name: deviceList[x]['name'],
                        role: 'camera'
                    },
                    native: {
                        user: "",
                        password: "",
                        ip: deviceList[x]['address'],
                        urn: deviceList[x]['urn'],
                        service: deviceList[x]['service'],
                        hardware: deviceList[x]['hardware'],
                        location: deviceList[x]['location'],
                        types: deviceList[x]['types'],
                        scopes: deviceList[x]['scopes']
                    }
                });
                    if(first){
                    setTimeout(()=>{
                        this.connectToCams();
                    }, 3000);

                    this.log.info('create test object');


                        this.setObject(deviceList[x]['name']  + '.system.reboot', {
                            type: 'state',
                            common: {
                                name: 'Reboot ',
                                type: 'boolean',
                                role: 'button',
                                read: false,
                                write: true
                            },
                            native: {

                            }
                        });


                        this.setObject(deviceList[x]['name']  + '.logs.getlogs', {
                            type: 'state',
                            common: {
                                name: 'Get Logs from camera',
                                type: 'boolean',
                                role: 'button',
                                read: false,
                                write: true
                            },
                            native: {

                            }
                        });

                        this.setObject(deviceList[x]['name']  + '.logs.systemlog', {
                            type: 'state',
                            common: {
                                name: 'System Log ',
                                type: 'string',
                                role: 'text',
                                read: true,
                                write: false
                            },
                            native: {

                            }
                        });

                        this.setObject(deviceList[x]['name']  + '.logs.accesslog', {
                            type: 'state',
                            common: {
                                name: 'Access Log ',
                                type: 'string',
                                role: 'text',
                                read: true,
                                write: false
                            },
                            native: {

                            }
                        });
                }

            }else{
                //if there are devices, than check if it is already there
                this.log.debug('Registered Devices: ' + JSON.stringify(cameras));

                let nr = null;
                let exists = false;

                for(let z in cameras){

                    if(cameras[z].native.urn === deviceList[x]['urn']){
                        //check for changes in provided meta data
                        if(cameras[z].native.ip !== deviceList[x]['address'] || cameras[z].native.service !== deviceList[x]['service'] || cameras[z].native.location !== deviceList[x]['location'] || cameras[z].native.types !== deviceList[x]['types'] || cameras[z].native.scopes !== deviceList[x]['scopes']){
                            await this.extendObject(cameras[z]._id, {
                                native: {
                                    ip: deviceList[x]['address'],
                                    service: deviceList[x]['service'],
                                    location: deviceList[x]['location'],
                                    types: deviceList[x]['types'],
                                    scopes: deviceList[x]['scopes']
                                }
                            })
                        }
                        exists = true;


                    }else{

                        let n = cameras[z]._id;
                        n = n.match(/_\d\d\d$/gm);
                        if(n !== null){
                            n = n.toString();
                            n = n.replace(/_/g, '');
                            n = parseInt(n);
                            if(n > nr){
                                nr = n;
                            }
                        }
                    }


                }
                if(nr === null && exists === false){
                    nr = '001';

                    let next = await this.setObjectNotExistsAsync(deviceList[x]['name'] + '_' + nr, {
                        type: 'device',
                        common: {
                            name: deviceList[x]['name'],
                            role: 'camera'
                        },
                        native: {
                            user: "",
                            password: "",
                            ip: deviceList[x]['address'],
                            urn: deviceList[x]['urn'],
                            service: deviceList[x]['service'],
                            hardware: deviceList[x]['hardware'],
                            location: deviceList[x]['location'],
                            types: deviceList[x]['types'],
                            scopes: deviceList[x]['scopes']
                        }
                    });



                        this.setObject(deviceList[x]['name'] + '_001.system.reboot', {
                            type: 'state',
                            common: {
                                name: 'Reboot ',
                                type: 'boolean',
                                role: 'button',
                                read: false,
                                write: true
                            },
                            native: {}
                        });


                        this.setObject(deviceList[x]['name'] + '_001.logs.getlogs', {
                            type: 'state',
                            common: {
                                name: 'Get Logs from camera',
                                type: 'boolean',
                                role: 'button',
                                read: false,
                                write: true
                            },
                            native: {}
                        });

                        this.setObject(deviceList[x]['name'] + '_001.logs.systemlog', {
                            type: 'state',
                            common: {
                                name: 'System Log ',
                                type: 'string',
                                role: 'text',
                                read: true,
                                write: false
                            },
                            native: {}
                        });

                        this.setObject(deviceList[x]['name'] + '_001.logs.accesslog', {
                            type: 'state',
                            common: {
                                name: 'Access Log ',
                                type: 'string',
                                role: 'text',
                                read: true,
                                write: false
                            },
                            native: {}
                        });

                        setTimeout(() => {
                            this.connectToCams();
                        }, 3000);


                }else if(exists === false){
                    this.log.info('Gerät nicht vorhanden');
                    nr = nr + 1;
                    nr = nr.toString();
                    nr = nr.padStart(3, '0');

                    let next = await this.setObjectNotExists(deviceList[x]['name'] + '_' + nr, {
                        type: 'device',
                        common: {
                            name: deviceList[x]['name'],
                            role: 'camera'
                        },
                        native: {
                            user: "",
                            password: "",
                            ip: deviceList[x]['address'],
                            urn: deviceList[x]['urn'],
                            service: deviceList[x]['service'],
                            hardware: deviceList[x]['hardware'],
                            location: deviceList[x]['location'],
                            types: deviceList[x]['types'],
                            scopes: deviceList[x]['scopes']
                        }
                    });

                        this.setObject(deviceList[x]['name'] + '_' + nr + '.system.reboot', {
                            type: 'state',
                            common: {
                                name: 'Reboot ',
                                type: 'boolean',
                                role: 'button',
                                read: false,
                                write: true
                            },
                            native: {

                            }
                        });


                        this.setObject(deviceList[x]['name'] + '_' + nr + '.logs.getlogs', {
                            type: 'state',
                            common: {
                                name: 'Get Logs from camera',
                                type: 'boolean',
                                role: 'button',
                                read: false,
                                write: true
                            },
                            native: {

                            }
                        });

                        this.setObject(deviceList[x]['name'] + '_' + nr + '.logs.systemlog', {
                            type: 'state',
                            common: {
                                name: 'System Log ',
                                type: 'string',
                                role: 'text',
                                read: true,
                                write: false
                            },
                            native: {

                            }
                        });

                        this.setObject(deviceList[x]['name'] + '_' + nr + '.logs.accesslog', {
                            type: 'state',
                            common: {
                                name: 'Access Log ',
                                type: 'string',
                                role: 'text',
                                read: true,
                                write: false
                            },
                            native: {

                            }
                        });

                        setTimeout(()=>{
                            this.connectToCams();
                        }, 3000);

                }


            }

        }

    };


    installFFMPEG(that) {
         let arch = OS.arch();
         let platform = OS.platform();
         let release = OS.release();
         let type = OS.type();

         //download links
        const linux_amd64 = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
        const linux_i686 = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-i686-static.tar.xz';
        const linux_arm64 = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz';
        const linux_armhf = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-armhf-static.tar.xz';
        const win_64 = 'https://ffmpeg.zeranoe.com/builds/win64/static/ffmpeg-20190608-b6ca032-win64-static.zip';
        const win_32 = 'https://ffmpeg.zeranoe.com/builds/win32/static/ffmpeg-20190608-b6ca032-win32-static.zip';
        const macos_64 = 'https://ffmpeg.zeranoe.com/builds/macos64/static/ffmpeg-20190608-b6ca032-macos64-static.zip';

         that.log.debug('Arch: ' + arch + '\n Platform: ' + platform + '\n Release: ' + release + '\n Type: ' + type);

        arch = arch.toString();

        let pkg;
        let unzip;
        let request;


         switch(platform.toString()){
             case 'linux':
                 switch(arch){
                     case 'x64':
                         pkg = fs.createWriteStream(__dirname + "/lib/ffmpeg.tar.xz");
                         request = https.get(linux_amd64, (response)=>{
                             response.pipe(pkg);
                         });
                         pkg.on('finish', ()=>{
                            exec(`tar -xf ${__dirname}/lib/ffmpeg.tar.xz -C ${__dirname}/lib/`, (err, stdout, stderr)=>{
                                if(err){
                                    this.log.error('Error: ' + err);
                                }else{
                                    this.log.error('Stderr: ' + stderr);
                                    this.log.debug('Stdout: ' + stdout);
                                    //remove tar.xz
                                    exec(`rm ${__dirname}/lib/ffmpeg.tar.xz`, ()=>{
                                        fs.readdir(`${__dirname}/lib`, (err, files)=>{
                                            for(let x in files){
                                                let patt = new RegExp(/ffmpeg.*static/g);
                                                let test = patt.test(files[x]);

                                                if(test === true){
                                                    //rename extracted folder to generic 'ffmpeg'
                                                    fs.rename(`${__dirname}/lib/${files[x]}`, `${__dirname}/lib/ffmpeg`, (err)=>{
                                                        if(err){
                                                            this.log.error(err);
                                                        }
                                                        //create symlink to executable of ffmpeg
                                                        fs.symlink(`${__dirname}/lib/ffmpeg/ffmpeg`, `${__dirname}/lib/ffmpeg_bin`, (err)=>{
                                                            if(err){
                                                                this.log.error(err);
                                                            }
                                                        });
                                                    })
                                                }
                                            }
                                        })
                                    });

                                }

                            })
                         });

                         break;
                     case 'x32':
                         pkg = fs.createWriteStream("lib/ffmpeg.tar.xz");
                         request = https.get(linux_i686, (response)=>{
                             response.pipe(pkg);
                         });

                         pkg.on('finish', ()=>{
                             exec(`tar -xf ${__dirname}/lib/ffmpeg.tar.xz -C ${__dirname}/lib/`, (err, stdout, stderr)=>{
                                 if(err){
                                     this.log.error('Error: ' + err);
                                 }else{
                                     this.log.error('Stderr: ' + stderr);
                                     this.log.debug('Stdout: ' + stdout);
                                     //remove tar.xz
                                     exec(`rm ${__dirname}/lib/ffmpeg.tar.xz`, ()=>{
                                         fs.readdir(`${__dirname}/lib`, (err, files)=>{
                                             for(let x in files){
                                                 let patt = new RegExp(/ffmpeg.*static/g);
                                                 let test = patt.test(files[x]);

                                                 if(test === true){
                                                     //rename extracted folder to generic 'ffmpeg'
                                                     fs.rename(`${__dirname}/lib/${files[x]}`, `${__dirname}/lib/ffmpeg`, (err)=>{
                                                         if(err){
                                                             this.log.error(err);
                                                         }
                                                         //create symlink to executable of ffmpeg
                                                         fs.symlink(`${__dirname}/lib/ffmpeg/ffmpeg`, `${__dirname}/lib/ffmpeg_bin`, (err)=>{
                                                             if(err){
                                                                 this.log.error(err);
                                                             }
                                                         });
                                                     })
                                                 }
                                             }
                                         })
                                     });

                                 }

                             })
                         });
                         break;
                     case 'arm':
                         pkg = fs.createWriteStream("lib/ffmpeg.tar.xz");
                         request = https.get(linux_armhf, (response)=>{
                             response.pipe(pkg);
                         });

                         pkg.on('finish', ()=>{
                             exec(`tar -xf ${__dirname}/lib/ffmpeg.tar.xz -C ${__dirname}/lib/`, (err, stdout, stderr)=>{
                                 if(err){
                                     this.log.error('Error: ' + err);
                                 }else{
                                     this.log.error('Stderr: ' + stderr);
                                     this.log.debug('Stdout: ' + stdout);
                                     //remove tar.xz
                                     exec(`rm ${__dirname}/lib/ffmpeg.tar.xz`, ()=>{
                                         fs.readdir(`${__dirname}/lib`, (err, files)=>{
                                             for(let x in files){
                                                 let patt = new RegExp(/ffmpeg.*static/g);
                                                 let test = patt.test(files[x]);

                                                 if(test === true){
                                                     //rename extracted folder to generic 'ffmpeg'
                                                     fs.rename(`${__dirname}/lib/${files[x]}`, `${__dirname}/lib/ffmpeg`, (err)=>{
                                                         if(err){
                                                             this.log.error(err);
                                                         }
                                                         //create symlink to executable of ffmpeg
                                                         fs.symlink(`${__dirname}/lib/ffmpeg/ffmpeg`, `${__dirname}/lib/ffmpeg_bin`, (err)=>{
                                                             if(err){
                                                                 this.log.error(err);
                                                             }
                                                         });
                                                     })
                                                 }
                                             }
                                         })
                                     });

                                 }

                             })
                         });
                         break;
                     case 'arm64':
                         pkg = fs.createWriteStream("lib/ffmpeg.tar.xz");
                         request = https.get(linux_arm64, (response)=>{
                             response.pipe(pkg);
                         });

                         pkg.on('finish', ()=>{
                             exec(`tar -xf ${__dirname}/lib/ffmpeg.tar.xz -C ${__dirname}/lib/`, (err, stdout, stderr)=>{
                                 if(err){
                                     this.log.error('Error: ' + err);
                                 }else{
                                     this.log.error('Stderr: ' + stderr);
                                     this.log.debug('Stdout: ' + stdout);
                                     //remove tar.xz
                                     exec(`rm ${__dirname}/lib/ffmpeg.tar.xz`, ()=>{
                                         fs.readdir(`${__dirname}/lib`, (err, files)=>{
                                             for(let x in files){
                                                 let patt = new RegExp(/ffmpeg.*static/g);
                                                 let test = patt.test(files[x]);

                                                 if(test === true){
                                                     //rename extracted folder to generic 'ffmpeg'
                                                     fs.rename(`${__dirname}/lib/${files[x]}`, `${__dirname}/lib/ffmpeg`, (err)=>{
                                                         if(err){
                                                             this.log.error(err);
                                                         }
                                                         //create symlink to executable of ffmpeg
                                                         fs.symlink(`${__dirname}/lib/ffmpeg/ffmpeg`, `${__dirname}/lib/ffmpeg_bin`, (err)=>{
                                                             if(err){
                                                                 this.log.error(err);
                                                             }
                                                         });
                                                     })
                                                 }
                                             }
                                         })
                                     });

                                 }

                             })
                         });
                         break;
                 }
                 break;
             case 'win32':
                 switch(arch){
                     case 'x64':
                         pkg = fs.createWriteStream("lib/ffmpeg.zip");
                         request = https.get(win_64, (response)=>{
                             response.pipe(pkg);
                         });

                         pkg.on('finish', ()=>{
                             unzip = fs.createReadStream(`${__dirname}/lib/ffmpeg.zip`)
                                 .pipe(unzipper.Extract({ path: `${__dirname}/lib/` }))
                                 .on('finish', ()=>{
                                     //remove tar.xz
                                     exec(`rm ${__dirname}/lib/ffmpeg.tar.xz`, ()=>{
                                         fs.readdir(`${__dirname}/lib`, (err, files)=>{
                                             for(let x in files){
                                                 let patt = new RegExp(/ffmpeg.*static/g);
                                                 let test = patt.test(files[x]);

                                                 if(test === true){
                                                     //rename extracted folder to generic 'ffmpeg'
                                                     fs.rename(`${__dirname}/lib/${files[x]}`, `${__dirname}/lib/ffmpeg`, (err)=>{
                                                         if(err){
                                                             this.log.error(err);
                                                         }
                                                         //create symlink to executable of ffmpeg
                                                         fs.symlink(`${__dirname}/lib/ffmpeg/bin/ffmpeg.exe`, `${__dirname}/lib/ffmpeg_bin`, (err)=>{
                                                             if(err){
                                                                 this.log.error(err);
                                                             }
                                                         });
                                                     })
                                                 }
                                             }
                                         })
                                     });
                                 });
                         });
                         break;
                     case 'x32':
                         pkg = fs.createWriteStream("lib/ffmpeg.zip");
                         request = https.get(win_32, (response)=>{
                             response.pipe(pkg);
                         });

                         pkg.on('finish', ()=>{
                             unzip = fs.createReadStream(`${__dirname}/lib/ffmpeg.zip`)
                                 .pipe(unzipper.Extract({ path: `${__dirname}/lib/` }))
                                 .on('finish', ()=>{
                                     //remove tar.xz
                                     exec(`rm ${__dirname}/lib/ffmpeg.tar.xz`, ()=>{
                                         fs.readdir(`${__dirname}/lib`, (err, files)=>{
                                             for(let x in files){
                                                 let patt = new RegExp(/ffmpeg.*static/g);
                                                 let test = patt.test(files[x]);

                                                 if(test === true){
                                                     //rename extracted folder to generic 'ffmpeg'
                                                     fs.rename(`${__dirname}/lib/${files[x]}`, `${__dirname}/lib/ffmpeg`, (err)=>{
                                                         if(err){
                                                             this.log.error(err);
                                                         }
                                                         //create symlink to executable of ffmpeg
                                                         fs.symlink(`${__dirname}/lib/ffmpeg/bin/ffmpeg.exe`, `${__dirname}/lib/ffmpeg_bin`, (err)=>{
                                                             if(err){
                                                                 this.log.error(err);
                                                             }
                                                         });
                                                     })
                                                 }
                                             }
                                         })
                                     });
                                 });
                         });
                         break;
                 }
                 break;
             case 'darwin':
                 pkg = fs.createWriteStream("lib/ffmpeg.zip");
                 request = https.get(macos_64, (response)=>{
                     response.pipe(pkg);
                 });

                 pkg.on('finish', ()=>{
                     unzip = fs.createReadStream(`${__dirname}/lib/ffmpeg.zip`)
                         .pipe(unzipper.Extract({ path: `${__dirname}/lib/` }))
                         .on('finish', ()=>{
                             //remove tar.xz
                             exec(`rm ${__dirname}/lib/ffmpeg.tar.xz`, ()=>{
                                 fs.readdir(`${__dirname}/lib`, (err, files)=>{
                                     for(let x in files){
                                         let patt = new RegExp(/ffmpeg.*static/g);
                                         let test = patt.test(files[x]);

                                         if(test === true){
                                             //rename extracted folder to generic 'ffmpeg'
                                             fs.rename(`${__dirname}/lib/${files[x]}`, `${__dirname}/lib/ffmpeg`, (err)=>{
                                                 if(err){
                                                     this.log.error(err);
                                                 }
                                                 //create symlink to executable of ffmpeg
                                                 fs.symlink(`${__dirname}/lib/ffmpeg/bin/ffmpeg`, `${__dirname}/lib/ffmpeg_bin`, (err)=>{
                                                     if(err){
                                                         this.log.error(err);
                                                     }
                                                 });
                                             })
                                         }
                                     }
                                 })
                             });
                         });
                 });
                 break;
         }
         this.config.ffmpeg_installed = true;
    }



}



// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Onvif(options);
} else {
    // otherwise start the instance directly
    new Onvif();
}