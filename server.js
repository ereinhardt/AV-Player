#!/usr/bin/env node

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');
const path = require('path');

class IntegratedArtNetServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.webPort = 3001;
        this.artNetSendIP = '127.0.0.1';
        this.artNetSendPort = 6454;
        this.clients = new Set();
        
        this.udpTriggerEnabled = false;
        this.udpTriggerIP = '192.168.178.255';
        this.udpTriggerPort = 9998;
        this.udpTriggerMessage = 'START';
        
        this.setupStaticFileServer();
        this.setupWebSocketServer();
        this.setupUDPSockets();
    }
    
    setupStaticFileServer() {
        this.app.use(express.static(__dirname));
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });
    }
    
    setupWebSocketServer() {
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            
            ws.send(JSON.stringify({
                type: 'status',
                message: `Connected to Art-Net sender. Target: ${this.artNetSendIP}:${this.artNetSendPort}`
            }));
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleClientMessage(ws, data);
                } catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
                }
            });
            
            ws.on('close', () => this.clients.delete(ws));
            ws.on('error', () => this.clients.delete(ws));
        });
    }
    
    setupUDPSockets() {
        this.udpSocket = dgram.createSocket('udp4');
        this.udpTriggerSocket = dgram.createSocket('udp4');
        
        this.udpTriggerSocket.bind(() => {
            this.udpTriggerSocket.setBroadcast(true);
        });
    }
    
    handleClientMessage(ws, data) {
        switch(data.type) {
            case 'artnet-timecode':
                this.forwardTimecodePacket(data, ws);
                break;
            case 'configure-artnet':
                this.updateArtNetConfiguration(data, ws);
                break;
            case 'udp-trigger-config':
                this.updateUDPTriggerConfiguration(data, ws);
                break;
            case 'udp-trigger-send':
                this.sendUDPTriggerMessage(data, ws);
                break;
        }
    }

    updateArtNetConfiguration(data, ws) {
        const { ip, port } = data;
        
        if (ip?.trim()) this.artNetSendIP = ip.trim();
        if (port && port >= 1 && port <= 65535) this.artNetSendPort = port;
        
        ws.send(JSON.stringify({
            type: 'config-updated',
            message: `Art-Net target updated to ${this.artNetSendIP}:${this.artNetSendPort}`,
            config: { ip: this.artNetSendIP, port: this.artNetSendPort }
        }));
    }
    
    forwardTimecodePacket(data, senderWs) {
        const { packet, timecode } = data;
        const buffer = Buffer.from(packet);
        
        this.udpSocket.send(buffer, this.artNetSendPort, this.artNetSendIP, (error) => {
            if (error) {
                // For broadcast IPs, some errors are expected and normal
                const isBroadcast = this.artNetSendIP.endsWith('.255');
                if (!isBroadcast) {
                    senderWs.send(JSON.stringify({
                        type: 'error',
                        message: `Failed to send Art-Net: ${error.message}`
                    }));
                }
                // For broadcast IPs, silently ignore common errors
            } else {
                senderWs.send(JSON.stringify({
                    type: 'artnet-sent',
                    timecode: timecode.formatted,
                    target: `${this.artNetSendIP}:${this.artNetSendPort}`
                }));
            }
        });
    }
    
    updateUDPTriggerConfiguration(data, ws) {
        const { enabled, ip, port, message } = data;
        
        if (typeof enabled === 'boolean') this.udpTriggerEnabled = enabled;
        if (ip?.trim()) this.udpTriggerIP = ip.trim();
        if (port && port >= 1 && port <= 65535) this.udpTriggerPort = port;
        if (message?.trim()) this.udpTriggerMessage = message.trim();
        
        ws.send(JSON.stringify({
            type: 'udp-trigger-config-updated',
            message: 'UDP Trigger configuration updated successfully',
            config: {
                enabled: this.udpTriggerEnabled,
                ip: this.udpTriggerIP,
                port: this.udpTriggerPort,
                message: this.udpTriggerMessage
            }
        }));
    }
    
    sendUDPTriggerMessage(data, ws) {
        if (!this.udpTriggerEnabled) {
            ws.send(JSON.stringify({ type: 'udp-trigger-error', message: 'UDP Trigger is disabled' }));
            return;
        }
        
        const { action } = data;
        let messageToSend = this.udpTriggerMessage;
        
        if (action === 'start') {
            messageToSend = data.customMessage || this.udpTriggerMessage;
        } else if (action === 'stop') {
            messageToSend = 'STOP';
        }
        
        messageToSend = messageToSend.replace(/[^\x20-\x7E]/g, '') || 'START';
        const messageBuffer = Buffer.from(messageToSend, 'ascii');
        
        this.udpTriggerSocket.send(
            messageBuffer,
            this.udpTriggerPort,
            this.udpTriggerIP,
            (error) => {
                if (error) {
                    ws.send(JSON.stringify({
                        type: 'udp-trigger-error',
                        message: `Failed to send UDP message: ${error.message}`
                    }));
                } else {
                    ws.send(JSON.stringify({
                        type: 'udp-trigger-sent',
                        message: `Message "${messageToSend}" sent successfully`,
                        details: {
                            message: messageToSend,
                            ip: this.udpTriggerIP,
                            port: this.udpTriggerPort,
                            action: action
                        }
                    }));
                }
            }
        );
    }
    
    start() {
        this.server.listen(this.webPort, () => {
            console.log(`Web Interface: http://localhost:${this.webPort}`);
        });
    }
    
    stop() {
        this.wss.close();
        this.udpSocket.close();
        this.udpTriggerSocket.close();
        this.server.close();
    }
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

if (require.main === module) {
    const server = new IntegratedArtNetServer();
    server.start();
}

module.exports = IntegratedArtNetServer;