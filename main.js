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


class Onvif_alt extends utils.Adapter {

    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'onvif-alt',
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

        await this.autoDiscover()
            .then( results => {
                this.log.info('Discovery ready');
                this.connectToCams();
            });

        //this.connectToCams();

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

            let patt = new RegExp('presets');
            let presets = patt.test(id);
            if(presets === true){
                let filter = ['delete', 'update', 'new'];
                let startPreset = false;
                for(let f in filter){
                    let patt = new RegExp(filter[f]);
                    let check = patt.test(id);
                    if(check === true){
                        startPreset = false;
                        break;
                    }else{
                        startPreset = true;
                    }
                }
                if(startPreset === true){
                    dp = 'presets';
                }


            }

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
                case 'scanwifi':
                    this.scanWifi(id);
                    break;
                case 'discover':
                    this.autoDiscover();
                    this.setState('discover', {val: false, ack: true});
                    break;
                case 'stop_movement':
                    this.stopMovement(id);
                    break;
                case 'start_movement':
                    this.startPTZmovement(id);
                    break;
                case 'continuous_movement':
                    this.startPTZcontinuous(id);
                    break;
                case 'presets':
                    this.gotoPTZPreset(id);
                    break;
                case 'delete':
                    this.deletePTZPreset(id);
                    break;
                case 'new':
                    this.newPTZPreset(id);
                    break;
                case 'update':
                    this.updatePTZPreset(id);
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

     		if(obj.command === 'updateDevice') {
                let keys = Object.keys(obj.message);
                for(let k in keys){
                    this.extendObject(keys[k], {
                        type: 'device',
                        common: {
                            name: obj.message[keys[k]].name
                        },
                        native: {
                            user: obj.message[keys[k]].user,
                            password: obj.message[keys[k]].password,
                            ip: obj.message[keys[k]].ip,
                            port: obj.message[keys[k]].port
                        }
                    });
                }

            }

     		if(obj.command === 'addDevice') {
     		    this.log.info('Manual add ' + JSON.stringify(obj.message));
     		    this.addManualCam(obj.message.ip, obj.message.port, obj.message.user, obj.message.password);
            }
     	}
    }


    rebootCamera(id){
         let cam_id = id.replace('.system.reboot', '');
         this.getObject(cam_id, (err, obj)=>{
             if(err){
                 this.log.error(err);
             }
             OnvifManager.connect(obj.native.ip)
                 .then(results =>{
                        results.core.systemReboot((msg)=>{
                            this.log.info(cam_id + ' reboot: ' + this.beautifyMsg(msg));
                        })
                 }, reject => {
                     this.log.error(cam_id + ' reboot:' + JSON.stringify(reject));
                 })

         })
    }

    async getSystemLog(id){
        let cam_id = id.replace('.logs.getlogs', '');
        this.getObject(cam_id, (err, obj)=>{
            if(err){
                this.log.error(err);
            }
            OnvifManager.connect(obj.native.ip, obj.native.port, obj.native.user, obj.native.password)
                .then(async results =>{
                    results.core.getSystemLog('System',(msg)=>{
                        this.log.info(cam_id + ' System Log: ' + this.beautifyMsg(msg));
                        this.setState(cam_id + '.logs.systemlog', {val: JSON.stringify(msg), ack: true});
                    });
                    results.core.getSystemLog('Access',(msg)=>{
                        this.log.info(cam_id + ' Access Log: ' + this.beautifyMsg(msg));
                        this.setState(cam_id + '.logs.accesslog', {val: JSON.stringify(msg), ack: true});
                    });
                }, reject => {
                    this.log.error(cam_id + ' get logs:' + JSON.stringify(reject));
                })
        })
    }

    scanWifi(id){   //WIP, extract interface token
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

    async getNetworkInterfaces(address){
            OnvifManager.connect(address)
                .then(async results =>{
                    let cam = await this.lookForDev(results.address, null);
                    await results.core.getNetworkInterfaces()
                        .then(async results => {
                            let name, token, enabled, hwAddress, ip_manual, ip_dhcp, ip_linkLocal, dhcp, ipv4_enabled, ipv6_dhcp, ipv6_enabled, ipv6_ip_dhcp, ipv6_ip_manual, ipv6_ip_link_local, ipv6_router_advert;
                            let ifaces = results.data.GetNetworkInterfacesResponse;
                            for(let i in ifaces){
                                name = ifaces[i]['Info']['Name'];
                                token = ifaces[i]['$']['token'];
                                enabled = ifaces[i]['Enabled'];
                                hwAddress = ifaces[i]['Info']['HwAddress'];

                                this.setObject(cam + '.network.' + token, {
                                    type: 'channel',
                                    common: {
                                        name: 'Network interface ' + token
                                    },
                                    native: {
                                        token: token,
                                        name: name,
                                        hwAddress: hwAddress
                                    }
                                });

                                this.setObjectNotExists(cam + '.network.' + token + '.enabled', {
                                    type: 'state',
                                    common: {
                                        name: 'Interfaces enabled',
                                        type: 'boolean',
                                        role: 'indicator',
                                        read: true,
                                        write: false,
                                    },
                                    native: {

                                    }
                                });

                                this.setState(cam + '.network.' + token + '.enabled', {val: enabled, ack: true});

                                //IPv4
                                if(ifaces[i]['IPv4'] !== undefined) {
                                    if (ifaces[i]['IPv4']['Enabled'] !== undefined) {
                                        ipv4_enabled = ifaces[i]['IPv4']['Enabled'];

                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv4_enabled', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv4 enabled',
                                                type: 'boolean',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv4_enabled', {val: ipv4_enabled, ack: true});
                                    }
                                    if (ifaces[i]['IPv4']['Config']['Manual'] !== undefined) {
                                        ip_manual = ifaces[i]['IPv4']['Config']['Manual']['Address'];

                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv4_manual', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv4 manual',
                                                type: 'string',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv4_manual', {val: ip_manual, ack: true});
                                    }

                                    if (ifaces[i]['IPv4']['Config']['FromDHCP'] !== undefined) {
                                        ip_dhcp = ifaces[i]['IPv4']['Config']['FromDHCP']['Address'];

                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv4_dhcp', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv4 DHCP',
                                                type: 'string',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv4_dhcp', {val: ip_dhcp, ack: true});
                                    }

                                    if (ifaces[i]['IPv4']['Config']['LinkLocal'] !== undefined) {
                                        ip_linkLocal = ifaces[i]['IPv4']['Config']['LinkLocal']['Address'];

                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv4_link_local', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv4 Link Local',
                                                type: 'string',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv4_link_local', {val: ip_linkLocal, ack: true});
                                    }

                                    if(ifaces[i]['IPv4']['Config']['DHCP'] !== undefined) {
                                        dhcp = ifaces[i]['IPv4']['Config']['DHCP'];
                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv4_dhcp', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv4 DHCP enabled',
                                                type: 'boolean',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {}
                                        });

                                        this.setState(cam + '.network.' + token + '.dhcp', {val: dhcp, ack: true});
                                    }
                                }

                                //IPv6
                                if(ifaces[i]['IPv6'] !== undefined){
                                    if(ifaces[i]['IPv6']['Enabled'] !== undefined){
                                        ipv6_enabled = ifaces[i]['IPv6']['Enabled'];
                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv6_enabled', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv6 enabled',
                                                type: 'boolean',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv6_enabled', {val: ipv6_enabled, ack: true});
                                    }

                                    if(ifaces[i]['IPv6']['Config']['DHCP'] !== undefined){
                                        ipv6_dhcp = ifaces[i]['IPv6']['Config']['DHCP'];
                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv6_dhcp', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv6 DHCP',
                                                type: 'string',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv6_dhcp', {val: ipv6_dhcp, ack: true});
                                    }

                                    if(ifaces[i]['IPv6']['Config'][''] !== undefined){
                                        ipv6_router_advert = ifaces[i]['IPv6']['Config']['AcceptRouterAdvert'];
                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv6_AcceptRouterAdvert', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv6 Accept Router Advert',
                                                type: 'boolean',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv6_AcceptRouterAdvert', {val: ipv6_router_advert, ack: true});
                                    }

                                    if(ifaces[i]['IPv6']['Config']['FromDHCP'] !== undefined){
                                        ipv6_ip_dhcp = ifaces[i]['IPv6']['Config']['FromDHCP']['Address'];
                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv6_ip_dhcp', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv6 IP from DHCP',
                                                type: 'string',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv6_ip_dhcp', {val: ipv6_ip_dhcp, ack: true});
                                    }

                                    if(ifaces[i]['IPv6']['Config']['Manual'] !== undefined){
                                        ipv6_ip_manual = ifaces[i]['IPv6']['Config']['Manual']['Address'];
                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv6_ip_manual', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv6 IP manual',
                                                type: 'string',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv6_ip_manual', {val: ipv6_ip_manual, ack: true});
                                    }

                                    if(ifaces[i]['IPv6']['Config']['LinkLocal'] !== undefined){
                                        ipv6_ip_link_local = ifaces[i]['IPv6']['Config']['LinkLocal']['Address'];
                                        this.setObjectNotExists(cam + '.network.' + token + '.ipv6_ip_link_local', {
                                            type: 'state',
                                            common: {
                                                name: 'IPv6 IP Link Local',
                                                type: 'string',
                                                role: 'indicator',
                                                read: true,
                                                write: false,
                                            },
                                            native: {

                                            }
                                        });

                                        this.setState(cam + '.network.' + token + '.ipv6_ip_link_local', {val: ipv6_ip_link_local, ack: true});
                                    }
                                }

                            }
                            return true;
                        }, reject => {
                            this.log.error(address + ' get network interfaces:' + JSON.stringify(reject));
                            return false
                        });
                }, reject => {
                    this.log.error(address + ' get network interfaces:' + JSON.stringify(reject));
                    return false;
                })
    }

    async getWLANcapabilities(address){
        OnvifManager.connect(address)
            .then(async results =>{
                results.core.getDot11Capabilities()
                    .then(results => {
                        console.log(results.data.GetDot11CapabilitiesResponse);

                    }, reject => {
                        this.log.error(address + ' get WLAN capabilities:' + JSON.stringify(reject));
                    });
            }, reject => {
                this.log.error(address + ' get WLAN capabilities:' + JSON.stringify(reject));
            })
    }

    async getEventProperties(address){
        OnvifManager.connect(address)
            .then(async results =>{
                results.events.getServiceCapabilities()
                    .then(results => {
                        console.log(results.data);
                    }, reject => {
                        this.log.error(address + ' get Event Properties:' + JSON.stringify(reject));
                    });
            }, reject => {
                this.log.error(address + ' get Event Properties:' + JSON.stringify(reject));
            })
    }

    async getNetworkProtocols(address){
        OnvifManager.connect(address)
            .then(async results =>{
                let cam = await this.lookForDev(results.address, null);
                results.core.getNetworkProtocols()
                    .then(async results => {
                        let netProtocols = results.data.GetNetworkProtocolsResponse.NetworkProtocols;

                        let name, enabled, port;
                        if(netProtocols.length !== undefined){
                            for(let n in netProtocols){

                                name = netProtocols[n]['Name'];
                                enabled = netProtocols[n]['Enabled'];
                                port = netProtocols[n]['Port'];

                                await this.createProtocolObjects(cam, name, enabled, port);
                            }
                        }else{
                            name = netProtocols['Name'];
                            enabled = netProtocols['Enabled'];
                            port = netProtocols['Port'];

                            await this.createProtocolObjects(cam, name, enabled, port);
                        }

                    }, reject => {
                        this.log.error(address + ' get network protocols:' + JSON.stringify(reject));
                    })
            }, reject => {
                this.log.error(address + ' get network protocols:' + JSON.stringify(reject));
            })
    }

    async createProtocolObjects(cam, name, enabled, port){
        this.setObjectNotExists(cam + '.network.protocols', {
            type: 'channel',
            common: {
                name: 'Network protocols'
            },
            native: {

            }
        });

        this.setObjectNotExists(cam + '.network.protocols.' + name, {
            type: 'channel',
            common: {
                name: name + ' protocol',
            },
            native: {

            }
        });

        this.setObjectNotExists(cam + '.network.protocols.' + name + '.enabled', {
            type: 'state',
            common: {
                name: 'Protocol enabled',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {

            }
        });

        this.setState(cam + '.network.protocols.' + name + '.enabled', {val: enabled, ack: true});

        this.setObjectNotExists(cam + '.network.protocols.' + name + '.port', {
            type: 'state',
            common: {
                name: 'Port',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {

            }
        });

        this.setState(cam + '.network.protocols.' + name + '.port', {val: port, ack: true});

        return true;
    }

    async getAudioOutputs(address, cam){
        OnvifManager.connect(address)
            .then(async results =>{
                results.media.getAudioOutputs()
                    .then(async results => {
                        this.log.info(JSON.stringify('get Audio outputs: ' + JSON.stringify(results.data.GetAudioOutputsResponse)));
                    }, reject => {
                        this.log.error(address + ' reject get audio outputs:' + JSON.stringify(reject));
                    })
            }, reject => {
                this.log.error(address + ' get audio outputs:' + JSON.stringify(reject));
            })
    }

    async getOSDs(address, cam){
        OnvifManager.connect(address)
            .then(async results =>{
                results.media.getOSDs()
                    .then(async results => {
                        this.log.info(JSON.stringify('get OSDs: ' + JSON.stringify(results.data)));
                    }, reject => {
                        this.log.error(address + ' reject get OSDs:' + JSON.stringify(reject));
                    })
            }, reject => {
                this.log.error(address + ' get OSDs:' + JSON.stringify(reject));
            })
    }

    async getPTZNodes(address){
        OnvifManager.connect(address)
            .then(async results =>{
                results.ptz.getNodes()
                    .then(async results => {
                        console.log(results.data.GetNodesResponse.PTZNode.SupportedPTZSpaces);
                    }, reject => {
                        this.log.error(address + ' get PTZ nodes outputs:' + JSON.stringify(reject));
                    })
            }, reject => {
                this.log.error(address + ' get PTZ nodes outputs:' + JSON.stringify(reject));
            })
    }

    async getPTZStatus(address){
        OnvifManager.connect(address)
            .then(results =>{
                results.ptz.getStatus()
                    .then(async results => {
                        console.log(results.data.GetStatusResponse.PTZStatus.Position);
                    }, reject => {
                        this.log.error(address + ' get PTZ status:' + JSON.stringify(reject));
                    })
            }, reject => {
                this.log.error(address + ' get PTZ status:' + JSON.stringify(reject));
            })
    }

    async getPTZConfigurations(address){
        OnvifManager.connect(address)
            .then(async results =>{
                let cam = await this.lookForDev(results.address, null);
                results.ptz.getConfigurations()
                    .then(async results => {
                        //console.log(results.data.GetConfigurationsResponse.PTZConfiguration);
                        if(results === null){
                            this.log.info(address + ' get PTZ configurations: Not supported');
                        }else{
                            this.log.info(address + ' get PTZ configurations: ' + JSON.stringify(results.data.GetConfigurationsResponse));
                            let confs = results.data.GetConfigurationsResponse;
                            let name, useCount, nodeToken, PTZspeedX, PTZspeedY, PTZspeedZ, PTZTimeout, xRangeMin, xRangeMax, yRangeMin, yRangeMax, zRangeMin, zRangeMax;

                            if(Object.keys(confs).length > 1){
                                for(let c in confs){
                                    console.log(Object.keys(confs).length);
                                    name = confs[c]['Name'];
                                    useCount = confs[c]['UseCount'];
                                    nodeToken = confs[c]['NodeToken'];
                                    PTZspeedX = confs[c]['DefaultPTZSpeed'];
                                    PTZTimeout = confs[c]['DefaultPTZTimeout'];

                                    console.log(confs[c]);

                                    //TODO: get information for multiple configurations and create option to choose
                                }
                            }else if(Object.keys(confs).length === 1){
                                name = confs['PTZConfiguration']['Name'];
                                useCount = confs['PTZConfiguration']['UseCount'];
                                nodeToken = confs['PTZConfiguration']['NodeToken'];
                                if(confs['PTZConfiguration']['DefaultPTZSpeed']){
                                    PTZspeedX = confs['PTZConfiguration']['DefaultPTZSpeed']['PanTilt']['$']['x'];
                                    PTZspeedY = confs['PTZConfiguration']['DefaultPTZSpeed']['PanTilt']['$']['y'];
                                }
                                PTZTimeout = confs['PTZConfiguration']['DefaultPTZTimeout'];

                                //TODO: write information to an object, which one?


                                if(confs['PTZConfiguration']['PanTiltLimits']['Range']['XRange']){
                                    xRangeMin = confs['PTZConfiguration']['PanTiltLimits']['Range']['XRange']['Min'];
                                    xRangeMax = confs['PTZConfiguration']['PanTiltLimits']['Range']['XRange']['Max'];
                                    this.setObjectNotExists(cam + '.ptz.x', {
                                        type: 'state',
                                        common: {
                                            name: 'X position for camera',
                                            type: 'number',
                                            role: 'state',
                                            read: true,
                                            write: true,
                                            min: xRangeMin,
                                            max: xRangeMax,
                                            def: 0
                                        },
                                        native: {

                                        }
                                    });
                                }

                                if(confs['PTZConfiguration']['PanTiltLimits']['Range']['YRange']) {
                                    yRangeMin = confs['PTZConfiguration']['PanTiltLimits']['Range']['YRange']['Min'];
                                    yRangeMax = confs['PTZConfiguration']['PanTiltLimits']['Range']['YRange']['Max'];
                                    this.setObjectNotExists(cam + '.ptz.y', {
                                        type: 'state',
                                        common: {
                                            name: 'Y position for camera',
                                            type: 'number',
                                            role: 'state',
                                            read: true,
                                            write: true,
                                            min: yRangeMin,
                                            max: yRangeMax,
                                            def: 0
                                        },
                                        native: {}
                                    });
                                }


                                this.setObjectNotExists(cam + '.ptz.z', {
                                    type: 'state',
                                    common: {
                                        name: 'Zoom',
                                        type: 'number',
                                        role: 'state',
                                        read: true,
                                        write: true,
                                        def: 0
                                    },
                                    native: {

                                    }
                                });

                            }

                        }
                    }, reject => {
                        this.log.error(address + ' get PTZ configurations: ' + this.beautifyMsg(reject))
                    })

            }, reject => {
                this.log.error(address + ' get PTZ configurations:' + JSON.stringify(reject));
            })
    }

    getPTZConfiguration(address, confToken){
        OnvifManager.connect(address)
            .then(results =>{
                let token;
                if(confToken === null){
                    token = results.profileList.PTZConfiguration.$.token;
                }else{
                    token = confToken;
                }
                results.ptz.getConfiguration(token, (msg)=>{
                    if(msg === null){
                        this.log.info(address + ' get PTZ configuration: Not supported');
                    }else{
                        this.log.info(address + ' get PTZ configuration: ' + this.beautifyMsg(msg));
                    }

                })
            }, reject => {
                this.log.error(address + ' get PTZ configuration:' + JSON.stringify(reject));
            })
    }

    async getPTZPresets(address, profileToken){
         OnvifManager.connect(address)
            .then(async results =>{
                let token;
                if(profileToken === null){
                    token = results.ptz.defaultProfileToken;
                }else{
                    token = profileToken;
                }

                let cam = await this.lookForDev(results.address, null);

                results.ptz.getPresets( token )
                    .then(results =>{
                        let presets = results.data.GetPresetsResponse.Preset;

                        this.setObjectNotExists(cam + '.ptz.presets.new', {
                            type: 'state',
                            common: {
                                name: 'Create new preset on actual position',
                                type: 'boolean',
                                role: 'button',
                                read: true,
                                write: true
                            },
                            native: {
                            }
                        });

                        this.setObjectNotExists(cam + '.ptz.presets.new.name', {
                            type: 'state',
                            common: {
                                name: 'Name for the new preset',
                                type: 'string',
                                role: 'text',
                                read: true,
                                write: true
                            },
                            native: {
                            }
                        });

                        for(let p in presets){
                            this.setObjectNotExists(cam + '.ptz.presets.' + presets[p]['Name'], {
                                type: 'state',
                                common: {
                                    name: presets[p]['Name'],
                                    type: 'boolean',
                                    role: 'button',
                                    read: true,
                                    write: true
                                },
                                native: {
                                    xsi_type: presets[p]['$']['xsi:type'],
                                    token: presets[p]['$']['token']
                                }
                            });

                            this.setObjectNotExists(cam + '.ptz.presets.' + presets[p]['Name'] + '.delete', {
                                type: 'state',
                                common: {
                                    name: 'Delete preset ' + presets[p]['Name'],
                                    type: 'boolean',
                                    role: 'button',
                                    read: true,
                                    write: true
                                },
                                native: {
                                }
                            });

                            this.setObjectNotExists(cam + '.ptz.presets.' + presets[p]['Name'] + '.update', {
                                type: 'state',
                                common: {
                                    name: 'Update preset ' + presets[p]['Name'],
                                    type: 'boolean',
                                    role: 'button',
                                    read: true,
                                    write: true
                                },
                                native: {
                                }
                            });
                        }
                }, reject => {
                        this.log.error(address + ' get PTZ presets:' + JSON.stringify(reject));
                    });

            }, reject => {
                this.log.error(address + ' get PTZ presets:' + JSON.stringify(reject));
            })
    }

    async gotoPTZPreset(id, profileToken){
         let dev = id.replace(/\.ptz.*/g, '');
         let device = await this.getObjectAsync(dev);
         let address = device.native.ip;
        OnvifManager.connect(address)
            .then(async results => {
                let preset = await this.getObjectAsync(id);
                let presetToken = preset.native.token;

                let speed_x = await this.getStateAsync(dev + '.ptz.speed.x');
                let speed_y = await this.getStateAsync(dev + '.ptz.speed.y');
                let speed_z = await this.getStateAsync(dev + '.ptz.speed.z');
                let speed = {x: speed_x.val, y: speed_y.val, z: speed_z.val};

                let token;
                if (profileToken === null) {
                    token = results.ptz.defaultProfileToken;
                } else {
                    token = profileToken;
                }


                results.ptz.gotoPreset( token, presetToken, speed )
                    .then(results =>{
                        if(results.data.GotoPresetResponse !== ''){
                            this.log.info('PTZ goto preset: ' + JSON.stringify(results.data));
                        }
                    }, reject =>{
                        this.log.error('PTZ goto preset: ' + JSON.stringify(reject));
                    });


            });
    }

    async deletePTZPreset(id, profileToken){
        let dev = id.replace(/\.ptz.*/g, '');
        let device = await this.getObjectAsync(dev);
        let address = device.native.ip;
        OnvifManager.connect(address)
            .then(async results => {
                    id = id.replace('.delete', '');
                    let preset = await this.getObjectAsync(id);
                    let presetToken = preset.native.token;



                let token;
                if (profileToken === null) {
                    token = results.ptz.defaultProfileToken;
                } else {
                    token = profileToken;
                }

                results.ptz.removePreset( token, presetToken )
                    .then(results =>{
                        if(results.data.RemovePresetResponse !== ''){
                            this.log.info('PTZ delete preset: ' + JSON.stringify(results.data.RemovePresetResponse));
                        }
                        this.delObjectAsync(id);
                        this.delObjectAsync(id + '.delete');
                        this.delObjectAsync(id + '.update');
                    }, reject =>{
                        this.log.error('reject PTZ delete preset: ' + JSON.stringify(reject));
                    });


            });
    }

    async newPTZPreset(id, profileToken){
        let dev = id.replace(/\.ptz.*/g, '');
        let device = await this.getObjectAsync(dev);
        let address = device.native.ip;
        OnvifManager.connect(address)
            .then(async results => {
                let preset = await this.getStateAsync(id + '.name');
                let presetToken = preset.val;

                let token;
                if (profileToken === null) {
                    token = results.ptz.defaultProfileToken;
                } else {
                    token = profileToken;
                }

                results.ptz.setPreset( token, presetToken, presetToken )
                    .then(results =>{
                        if(results.data.RemovePresetResponse !== ''){
                            this.log.info('PTZ create new preset: ' + JSON.stringify(results.data.RemovePresetResponse));
                        }
                        this.getPTZPresets(address);
                    }, reject =>{
                        this.log.error('reject PTZ create new preset: ' + JSON.stringify(reject));
                    });


            });
    }

    async updatePTZPreset(id, profileToken){
        let dev = id.replace(/\.ptz.*/g, '');
        let device = await this.getObjectAsync(dev);
        let address = device.native.ip;
        OnvifManager.connect(address)
            .then(async results => {
                id = id.replace('.update', '');
                let preset = await this.getObjectAsync(id);
                let presetToken = preset.native.token;
                //let name = preset.common.name;

                let token;
                if (profileToken === null) {
                    token = results.ptz.defaultProfileToken;
                } else {
                    token = profileToken;
                }

                results.ptz.setPreset( token, presetToken )
                    .then(results =>{
                        if(results.data.RemovePresetResponse !== ''){
                            this.log.info('PTZ update preset: ' + JSON.stringify(results.data.RemovePresetResponse));
                        }
                    }, reject =>{
                        this.log.error('reject PTZ update preset: ' + JSON.stringify(reject));
                    });


            });
    }

    async startPTZmovement(id){
        let device = id.replace('.ptz.start_movement', '');
        let x = await this.getStateAsync(device + '.ptz.x');
        let y = await this.getStateAsync(device + '.ptz.y');
        let z = await this.getStateAsync(device + '.ptz.z');
        let reference = await this.getStateAsync(device + '.ptz.reference');
        let speed_x = await this.getStateAsync(device + '.ptz.speed.x');
        let speed_y = await this.getStateAsync(device + '.ptz.speed.y');
        let speed_z = await this.getStateAsync(device + '.ptz.speed.z');
        let object = await this.getObjectAsync(device);

        let speed = {x: speed_x.val, y: speed_y.val, z: speed_z.val};

        let movement = {};
        if(x.val !== null){

            movement.x = x.val;
        }else{
            movement.x = 0;
        }

        if(y.val !== null){
            movement.y = y.val;
        }else{
            movement.y = 0;
        }

        if(z.val !== null){
            movement.z = z.val;
        }else{
            movement.z = 0;
        }


        if(reference.val === 0){
            let path = object.native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);

            OnvifManager.connect(object.native.ip, object.native.port, object.native.user, object.native.password, path)
                .then(async results =>{
                    this.log.debug('start movment: ' + JSON.stringify(movement));
                    results.ptz.absoluteMove(null, movement, speed)
                        .then(async results => {
                            if(results.data.AbsoluteMoveResponse !== ''){
                                this.log.info(object.native.ip + ' PTZ start movment: ' + JSON.stringify(results.data));
                            }

                        }, reject => {
                            this.log.info(object.native.ip + ' PTZ start movment: ' + JSON.stringify(reject));
                        });


                }, reject => {
                    this.log.error(object.native.ip + ' reject PTZ start movment:' + JSON.stringify(reject));
                })

        }else if(reference.val === 1){
            let path = object.native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);

            OnvifManager.connect(object.native.ip, object.native.port, object.native.user, object.native.password, path)
                .then(async results =>{
                    this.log.info('start movment: ' + JSON.stringify(movement));
                    results.ptz.relativeMove(null, {x: 1, y: 1, z: 0}, speed)
                        .then(async results =>{
                            this.log.info(object.native.ip + ' PTZ start movment: ' + JSON.stringify(results.data));
                        }, reject =>{
                            this.log.info(object.native.ip + ' PTZ start movment: ' + JSON.stringify(reject));
                        });


                }, reject => {
                    this.log.error(object.native.ip + ' PTZ start movment:' + JSON.stringify(reject));
                })
        }

    }

    async startPTZcontinuous(id){
        let device = id.replace('.ptz.continuous_movement', '');
        let x = await this.getStateAsync(device + '.ptz.x');
        let y = await this.getStateAsync(device + '.ptz.y');
        let z = await this.getStateAsync(device + '.ptz.z');
        let speed_x = await this.getStateAsync(device + '.ptz.speed.x');
        let speed_y = await this.getStateAsync(device + '.ptz.speed.y');
        let speed_z = await this.getStateAsync(device + '.ptz.speed.z');
        let object = await this.getObjectAsync(device);

        let speed = {x: speed_x.val, y: speed_y.val, z: speed_z.val};

        let movement = {};
        if(x.val !== null){

            movement.x = x.val;
        }else{
            movement.x = 0;
        }

        if(y.val !== null){
            movement.y = y.val;
        }else{
            movement.y = 0;
        }

        if(z.val !== null){
            movement.z = z.val;
        }else{
            movement.z = 0;
        }


            let path = object.native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);

            OnvifManager.connect(object.native.ip, object.native.port, object.native.user, object.native.password, path)
                .then(async results =>{
                    this.log.debug('continuous movment: ' + JSON.stringify(movement));
                    results.ptz.continuousMove(null, speed, 0)
                        .then(async results => {
                            if(results.data.ContinuousMoveResponse !== ''){
                                this.log.info(object.native.ip + ' PTZ continuous movment: ' + JSON.stringify(results.data));
                            }

                        }, reject => {
                            this.log.info(object.native.ip + 'reject PTZ continuous movment: ' + JSON.stringify(reject));
                        });


                }, reject => {
                    this.log.error(object.native.ip + ' reject PTZ continuous movment:' + JSON.stringify(reject));
                })

    }

    stopMovement(id){
         let device = id.replace('.ptz.stop_movement', '');
         this.getObject(device, (err, obj)=>{
             let path = obj.native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);
             OnvifManager.connect(obj.native.ip, obj.native.port, obj.native.user, obj.native.password, path)
                 .then(results =>{
                     results.ptz.stop(null, null, null,(msg)=>{
                         this.log.info(obj.native.ip + ' PTZ stop movment: ' + this.beautifyMsg(msg));
                     })
                 }, reject => {
                     this.log.error(obj.native.ip + ' PTZ stop movment:' + JSON.stringify(reject));
                 })
         });

    }

    async addManualCam(ip, port, user, password){

        await OnvifManager.connect(ip, port, user, password)
            .then(async results => {
                let camera = results;

                await this.setObjectAsync( camera.deviceInformation.SerialNumber, {
                    type: 'device',
                    common: {
                        name: camera.deviceInformation.Name,
                        role: 'camera'
                    },
                    native: {
                        ip: camera.address,
                        port: port,
                        user: user,
                        password: password,
                        service: camera.core.serviceAddress.href
                    }
                });

                let c = await this.createStatesByServices(camera);
                let d = await this.updateMainInfo(camera);

                this.createStandardObj(camera.deviceInformation.SerialNumber);

            }, reject => {
                //this.log.error('Connect to cams:' + JSON.stringify(reject));
                this.log.error('Connect to cam:' + ip + ' ' + JSON.stringify(reject));
            })
    }

    async connectToCams(){

        let devices = await this.getDevicesAsync();

        this.log.debug('devices for connection: ' + JSON.stringify(devices));
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
                }else{

                ip = devices[x].native.ip;
                port = devices[x].native.service.match(/(?<=:)\d{2,}/gm);
                path = devices[x].native.service.match(/(?<=:\d{2,})\/.*\/.*$/gm);

                await OnvifManager.connect(ip,port, path)
                    .then(results => {
                        this.log.info('results: ' + JSON.stringify(results));
                        let camera = results;
                        let c = this.createStatesByServices(camera);
                        let d = this.updateMainInfo(camera);

                        //new this.receiveEvents(ip, port, path);

                    }, reject => {
                        //this.log.error('Connect to cams:' + JSON.stringify(reject));
                        this.log.error('Connect to cams:' + ip + ' ' + JSON.stringify(reject));
                    })
            }
        }
    }

    receiveEvents(ip, port, path){
         this.log.info('Event receiver');
        OnvifManager.connect(ip,port, path)
            .then(results => {
                let camera = results;

                camera.events.on('messages', messages => {
                    console.log('Messages Received:', messages)
                });

                camera.events.on('messages:error', error => {
                    console.error('Messages Error:', error)
                });

                camera.events.startPull()
            }, reject => {
                //this.log.error('Connect to cams:' + JSON.stringify(reject));
                this.log.error('Connect to cam:' + ip + ' ' + JSON.stringify(reject));
            })
    }

    async createStatesByServices(list){
         //extend device object with additional information

        let id = await this.lookForDev(list.address, null);
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
                    };
                    //this.getPTZConfiguration(list.address, l['PTZConfiguration']['$']['token']);
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

                this.setObjectNotExists(cam + '.ptz.speed.x', {
                    type: 'state',
                    common: {
                        name: 'Speed for x',
                        type: 'number',
                        role: 'state',
                        read: true,
                        write: true,
                        def: 0.5
                    },
                    native: {

                    }
                });

                this.setObjectNotExists(cam + '.ptz.speed.y', {
                    type: 'state',
                    common: {
                        name: 'Speed for y',
                        type: 'number',
                        role: 'state',
                        read: true,
                        write: true,
                        def: 0.5
                    },
                    native: {

                    }
                });

                this.setObjectNotExists(cam + '.ptz.speed.z', {
                    type: 'state',
                    common: {
                        name: 'Speed for z',
                        type: 'number',
                        role: 'state',
                        read: true,
                        write: true,
                        def: 0.5
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

                this.setObjectNotExists(cam + '.ptz.continuous_movement', {
                    type: 'state',
                    common: {
                        name: 'Continuous movment',
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true
                    },
                    native: {

                    }
                });


                //this.getPTZNodes(list.address);
                //this.getPTZStatus(list.address);
                await this.getPTZConfigurations(list.address);
                await this.getPTZPresets(list.address, null);
            }


            //get additional information
            await this.getNetworkInterfaces(list.address, cam);
            await this.getNetworkProtocols(list.address, cam);
            //await this.getWLANcapabilities(list.address);
            await this.getEventProperties(list.address);
            await this.getAudioOutputs(list.address, cam);
            //this.getOSDs(list.address, cam);

    }

    async updateMainInfo(list){
        let dInfo = list.deviceInformation;
        let id = await this.lookForDev(list.address, null);

                this.extendObject(id, {
                    native: {
                        port: list.port,
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
                });

    }

    async lookForDev(ip, urn){
        let id = await this.getDevicesAsync()
            .then(result => {
                for(let x in result){
                    let ipCheck = false;
                    let urnCheck = false;

                    if(ip !== null && result[x].native.ip === ip){
                        ipCheck = true;
                    }
                    if(urn !== null && result[x].native.urn === urn){
                        urnCheck = true;
                    }
                    if(ipCheck === true || urnCheck === true){
                        return result[x]._id;
                    }
                }
            }, reject =>{
                console.log(reject);
            });

        return id;
    }


    async autoDiscover(){
        OnvifManager.add('discovery');
        let deviceList = await OnvifManager.discovery.startProbe();

        for(let x in deviceList){

            let urn = deviceList[x]['urn'];
            let serial = urn.split('-');
            serial = serial.pop();

            let cameras = await this.getDevicesAsync();
            let check = this.catchNonOnvif(deviceList[x]['types']);
            if(check === true) {
                //if there is no devices can create the new one
                await this.setObjectNotExistsAsync(serial, {
                    type: 'device',
                    common: {
                        name: deviceList[x]['name'],
                        role: 'camera'
                    },
                    native: {
                        user: "",
                        password: "",
                        ip: deviceList[x]['address'],
                        port: '',
                        urn: deviceList[x]['urn'],
                        service: deviceList[x]['service'],
                        hardware: deviceList[x]['hardware'],
                        location: deviceList[x]['location'],
                        types: deviceList[x]['types'],
                        scopes: deviceList[x]['scopes']
                    }
                });
                /*if(first){
                setTimeout(()=>{
                    this.connectToCams();
                }, 3000);*/

                this.createStandardObj(serial);

            }
        }
        return true;
     }

     async createStandardObj(serial){
         this.setObject(serial + '.system.reboot', {
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


         this.setObject(serial + '.logs.getlogs', {
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

         this.setObject(serial + '.logs.systemlog', {
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

         this.setObject(serial + '.logs.accesslog', {
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
    }


    beautifyMsg(message){
        let statusCode = message.statusCode;
        let body = message.body;
        return `Status code: ${statusCode}, ${body}`;
    }

    catchNonOnvif(types){
        for(let t in types){
            let patt = new RegExp('NetworkVideoTransmitter');
            let res = patt.test(types);
            if(res === true){
                return true;
            }else{
                return false;
            }
        }
    }



}



// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Onvif_alt(options);
} else {
    // otherwise start the instance directly
    new Onvif_alt();
}