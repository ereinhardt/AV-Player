#!/usr/bin/env node

/**
 * Integrierter Art-Net Timeline Server
 * Hostet die Web-App und bietet Art-Net Bridge Service
 */

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
        
        this.webPort = 3001; // Web-Server Port
        this.artNetSendIP = '127.0.0.1'; // Default: localhost for safe testing
        this.artNetSendPort = 6454; // Standard Art-Net port
        this.clients = new Set();
        
        // UDP Trigger settings
        this.udpTriggerEnabled = false;
        this.udpTriggerIP = '192.168.178.255'; // Broadcast to all devices
        this.udpTriggerPort = 9998;  // Changed to 9998
        this.udpTriggerMessage = 'START';
        
        this.setupStaticFileServer();
        this.setupWebSocketServer();
        this.setupUDPSockets();
        this.setupRoutes();
    }
    
    setupStaticFileServer() {
        // Serve static files (HTML, CSS, JS)
        this.app.use(express.static(__dirname));
        
        // Serve index.html at root
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });
    }
    
    setupRoutes() {
        // Minimal routes - remove unused API endpoint
        // All communication happens via WebSocket
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
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Invalid message format'
                    }));
                }
            });
            
            ws.on('close', () => {
                this.clients.delete(ws);
            });
            
            ws.on('error', (error) => {
                this.clients.delete(ws);
            });
        });
    }
    
    setupUDPSockets() {
        // Art-Net UDP socket
        this.udpSocket = dgram.createSocket('udp4');
        this.udpSocket.on('error', (error) => {
            // Silent error handling
        });
        
        // UDP Trigger socket
        this.udpTriggerSocket = dgram.createSocket('udp4');
        this.udpTriggerSocket.on('error', (error) => {
            // Silent error handling
        });
        
        // Enable broadcast for UDP trigger socket
        this.udpTriggerSocket.bind(() => {
            this.udpTriggerSocket.setBroadcast(true);
        });
    }
    
    handleClientMessage(ws, data) {
        if (data.type === 'artnet-timecode') {
            // Direct Art-Net forwarding - simplified
            this.forwardTimecodePacket(data, ws);
        } else if (data.type === 'configure-artnet') {
            // Update Art-Net configuration
            this.updateArtNetConfiguration(data, ws);
        } else if (data.type === 'udp-trigger-config') {
            // Update UDP Trigger configuration
            this.updateUDPTriggerConfiguration(data, ws);
        } else if (data.type === 'udp-trigger-send') {
            // Send UDP trigger message
            this.sendUDPTriggerMessage(data, ws);
        } else {
            // Unknown message type - silent handling
        }
    }

    updateArtNetConfiguration(data, ws) {
        try {
            const { ip, port } = data;
            
            // Validate IP
            if (ip && ip.trim().length > 0) {
                this.artNetSendIP = ip.trim();
            }
            
            // Validate port
            if (port && !isNaN(port) && port >= 1 && port <= 65535) {
                this.artNetSendPort = port;
            }
            
            // Send confirmation to client
            ws.send(JSON.stringify({
                type: 'config-updated',
                message: `Art-Net target updated to ${this.artNetSendIP}:${this.artNetSendPort}`,
                config: {
                    ip: this.artNetSendIP,
                    port: this.artNetSendPort
                }
            }));
            
        } catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to update Art-Net configuration'
            }));
        }
    }
    
    forwardTimecodePacket(data, senderWs) {
        try {
            const { packet, timecode } = data;
            const buffer = Buffer.from(packet);
            
            // Send UDP packet to configured target
            this.udpSocket.send(buffer, this.artNetSendPort, this.artNetSendIP, (error) => {
                if (error) {
                    senderWs.send(JSON.stringify({
                        type: 'error',
                        message: `Failed to send Art-Net: ${error.message}`
                    }));
                } else {
                    // Success notification
                    senderWs.send(JSON.stringify({
                        type: 'artnet-sent',
                        timecode: timecode.formatted,
                        target: `${this.artNetSendIP}:${this.artNetSendPort}`
                    }));
                }
            });
            
        } catch (error) {
            senderWs.send(JSON.stringify({
                type: 'error',
                message: 'Failed to send Art-Net packet'
            }));
        }
    }
    
    updateUDPTriggerConfiguration(data, ws) {
        try {
            const { enabled, ip, port, message } = data;
            
            // Update configuration
            if (typeof enabled === 'boolean') {
                this.udpTriggerEnabled = enabled;
            }
            
            if (ip && ip.trim().length > 0) {
                this.udpTriggerIP = ip.trim();
            }
            
            if (port && !isNaN(port) && port >= 1 && port <= 65535) {
                this.udpTriggerPort = port;
            }
            
            if (message && message.trim().length > 0) {
                this.udpTriggerMessage = message.trim();
            }
            
            // Send confirmation to client
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
            
        } catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to update UDP trigger configuration'
            }));
        }
    }
    
    sendUDPTriggerMessage(data, ws) {
        try {
            if (!this.udpTriggerEnabled) {
                ws.send(JSON.stringify({
                    type: 'udp-trigger-error',
                    message: 'UDP Trigger is disabled'
                }));
                return;
            }
            
            const { action } = data;
            let messageToSend = this.udpTriggerMessage;
            
            // Allow custom messages for different actions
            if (action === 'start') {
                messageToSend = data.customMessage || this.udpTriggerMessage;
            } else if (action === 'stop') {
                messageToSend = 'STOP';
            }
            
            // Validate and sanitize message (only ASCII printable characters)
            messageToSend = messageToSend.replace(/[^\x20-\x7E]/g, '');  // Remove non-printable chars
            if (messageToSend.length === 0) {
                messageToSend = 'START';  // Fallback to default
            }
            
            const messageBuffer = Buffer.from(messageToSend, 'ascii');  // Use ASCII instead of UTF-8
            
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
            
        } catch (error) {
            console.error('Error sending UDP trigger message:', error);
            ws.send(JSON.stringify({
                type: 'udp-trigger-error',
                message: 'Failed to send UDP trigger message'
            }));
        }
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

// Handle graceful shutdown
process.on('SIGINT', () => {
    process.exit(0);
});

process.on('SIGTERM', () => {
    process.exit(0);
});

// Handle uncaught exceptions to prevent server crashes
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Stack:', error.stack);
    // Server continues running
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Server continues running
});

// Start server if this file is run directly
if (require.main === module) {
    const server = new IntegratedArtNetServer();
    server.start();
}

module.exports = IntegratedArtNetServer;