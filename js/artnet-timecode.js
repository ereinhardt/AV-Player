// Art-Net Timecode Sending Module
// Implements simplified Art-Net protocol for sending SMPTE timecode

class ArtNetTimecode {
    constructor() {
        this.enabled = true;
        this.ip = '127.0.0.1'; // Default to localhost
        this.port = 6454; // Standard Art-Net port
        this.fps = 25;
        this.ws = null;
        this.pendingConfiguration = false; // Flag to send config after connection
        this.initializeSettings();
        this.connectWebSocket(); // Initialize WebSocket immediately
    }

    initializeSettings() {
        // Start with localhost as default
        document.getElementById('artnet-ip').value = this.ip;
        
        // Detect network IP for advanced users, but don't auto-set it
        this.getUserIP().then(ip => {
            if (ip) {
                const ipParts = ip.split('.');
                const originalIP = ip;
                ipParts[3] = '255';
                const broadcastIP = ipParts.join('.');
                
                // Show detected IP as tooltip/hint, but keep localhost as default
                document.getElementById('artnet-ip').title = `Your computer IP: ${originalIP} (Broadcast: ${broadcastIP})`;
                
                const infoSpan = document.getElementById('ip-info');
                if (!infoSpan) {
                    const ipInput = document.getElementById('artnet-ip');
                    const infoElement = document.createElement('span');
                    infoElement.id = 'ip-info';
                    infoElement.className = 'ip-info';
                    infoElement.textContent = `(My IP in the current network: ${originalIP})`;
                    ipInput.parentNode.appendChild(infoElement);
                }
            }
            
            // Send initial configuration to server with localhost default
            this.pendingConfiguration = true;
            this.sendConfigurationToServerWhenReady();
            
        }).catch(error => {
            // Send initial configuration to server even if IP detection failed
            this.pendingConfiguration = true;
            this.sendConfigurationToServerWhenReady();
        });

        // Check if port input exists, if not we're probably in the standalone debug context
        const portInput = document.getElementById('artnet-port');
        if (portInput) {
            portInput.value = this.port;
        }

        // Initialize IP preset selector
        this.initializeIPPresets();

        document.getElementById('apply-settings-btn').addEventListener('click', () => {
            this.applySettings();
        });

        document.getElementById('artnet-enabled').addEventListener('change', (e) => {
            this.enabled = e.target.checked;
            this.showStatus(this.enabled ? 'Art-Net enabled' : 'Art-Net disabled', 'success');
            this.updateStatusDisplay();
        });

        // Initial status display update
        this.updateStatusDisplay();
    }

    applySettings() {
        try {
            const newFps = parseFloat(document.getElementById('fps-select').value);
            
            // Get IP from preset or input field
            const presetSelect = document.getElementById('artnet-ip-preset');
            const ipInput = document.getElementById('artnet-ip');
            let newIp;
            
            if (presetSelect && presetSelect.value !== 'custom' && presetSelect.value !== 'auto-broadcast') {
                newIp = presetSelect.value;
            } else {
                // For custom and auto-broadcast, use the value from the input field
                newIp = ipInput.value.trim();
            }
            
            const newPort = parseInt(document.getElementById('artnet-port').value);
            const newEnabled = document.getElementById('artnet-enabled').checked;

            if (!newIp || newIp.length === 0) {
                this.showStatus('Invalid IP address', 'error');
                return;
            }

            if (isNaN(newPort) || newPort < 1 || newPort > 65535) {
                this.showStatus('Invalid port number (1-65535)', 'error');
                return;
            }

            if (isNaN(newFps) || newFps <= 0) {
                this.showStatus('Invalid FPS value', 'error');
                return;
            }

            this.fps = newFps;
            this.ip = newIp;
            this.port = newPort;
            this.enabled = newEnabled;

            // Send configuration to server
            this.sendConfigurationToServer();

        } catch (error) {
            this.showStatus('Error applying settings', 'error');
        }
    }

    sendConfigurationToServerWhenReady() {
        // Check if WebSocket is ready, if not, mark as pending
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendConfigurationToServer();
            this.pendingConfiguration = false;
        } else {
            this.pendingConfiguration = true;
        }
    }

    sendConfigurationToServer() {
        // Send configuration update to server
        this.sendToServer({
            type: 'configure-artnet',
            ip: this.ip,
            port: this.port,
            enabled: this.enabled,
            fps: this.fps
        });
        
        // Update status display
        this.updateStatusDisplay();
    }

    updateStatusDisplay(currentTimecode = '00:00:00:00') {
        const statusDisplay = document.getElementById('artnet-status-display');
        if (statusDisplay) {
            const status = this.enabled ? 'connected' : '';
            const fpsText = `${this.fps}fps`;
            statusDisplay.textContent = `(${this.ip}:${this.port} / ${fpsText} / ${currentTimecode})`;
            statusDisplay.className = `artnet-status ${status}`;
        }
    }

    showStatus(message, type = 'success') {
        const statusSpan = document.getElementById('settings-status');
        if (statusSpan) {
            statusSpan.textContent = message;
            statusSpan.className = `settings-status ${type}`;
            
            setTimeout(() => {
                statusSpan.style.opacity = '0';
                setTimeout(() => statusSpan.textContent = '', 300); // Clear text after fade
            }, 3000);
        }
    }

    async getUserIP() {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun.stunprotocol.org:3478' }
                ]
            });
            
            pc.createDataChannel('');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            return new Promise((resolve) => {
                const foundIPs = new Set();
                let localIP = null;
                
                pc.onicecandidate = (ice) => {
                    if (!ice || !ice.candidate || !ice.candidate.candidate) return;
                    
                    const candidate = ice.candidate.candidate;
                    const ipMatches = candidate.match(/(\d+\.\d+\.\d+\.\d+)/g);
                    
                    if (ipMatches) {
                        ipMatches.forEach(ip => {
                            if (!ip.startsWith('127.') && 
                                !ip.startsWith('169.254.') && 
                                !ip.startsWith('0.')) {
                                foundIPs.add(ip);
                                
                                if (ip.startsWith('192.168.') || 
                                    ip.startsWith('10.') || 
                                    ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
                                    localIP = ip;
                                }
                            }
                        });
                        
                        if (localIP) {
                            pc.close();
                            resolve(localIP);
                        }
                    }
                };
                
                setTimeout(() => {
                    pc.close();
                    if (localIP) {
                        resolve(localIP);
                    } else if (foundIPs.size > 0) {
                        resolve(Array.from(foundIPs)[0]);
                    } else {
                        resolve(null);
                    }
                }, 5000);
            });
        } catch (error) {
            return null;
        }
    }

    timeToSMPTE(currentTime) {
        const hours = Math.floor(currentTime / 3600);
        const minutes = Math.floor((currentTime % 3600) / 60);
        const seconds = Math.floor(currentTime % 60);
        const frames = Math.floor((currentTime % 1) * this.fps);

        return {
            hours: hours,
            minutes: minutes,
            seconds: seconds,
            frames: frames,
            formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`
        };
    }

    createArtNetPacket(timecode) {
        const packet = new Uint8Array(18);
        
        // Art-Net Header
        packet[0] = 0x41; // 'A'
        packet[1] = 0x72; // 'r'
        packet[2] = 0x74; // 't'
        packet[3] = 0x2D; // '-'
        packet[4] = 0x4E; // 'N'
        packet[5] = 0x65; // 'e'
        packet[6] = 0x74; // 't'
        packet[7] = 0x00; // Null terminator
        
        // OpCode for TimeCode (0x9700 in little endian)
        packet[8] = 0x97;
        packet[9] = 0x00;
        
        // Protocol version (14)
        packet[10] = 0x00;
        packet[11] = 0x0E;
        
        // Filler
        packet[12] = 0x00;
        packet[13] = 0x00;
        
        // Timecode data
        packet[14] = timecode.frames;
        packet[15] = timecode.seconds;
        packet[16] = timecode.minutes;
        packet[17] = timecode.hours;
        
        return packet;
    }

    sendTimecode(currentTime) {
        if (!this.enabled) {
            return;
        }
        
        try {
            const timecode = this.timeToSMPTE(currentTime);
            const packet = this.createArtNetPacket(timecode);
            
            // Send via simple WebSocket message to server
            this.sendToServer({
                type: 'artnet-timecode',
                packet: Array.from(packet),
                timecode: timecode,
                ip: this.ip,
                port: this.port
            });
            
            // Update status display with current timecode
            this.updateStatusDisplay(timecode.formatted);
            
            return timecode;
        } catch (error) {
            return null;
        }
    }

    sendToServer(data) {
        // Simple WebSocket connection for Art-Net forwarding
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connectWebSocket();
        }
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    connectWebSocket() {
        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                // Silent connection
                
                // Send pending configuration if needed
                if (this.pendingConfiguration) {
                    this.sendConfigurationToServer();
                    this.pendingConfiguration = false;
                }
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleServerMessage(message);
                } catch (error) {
                    // Silent error handling
                }
            };
            
            this.ws.onclose = () => {
                // Auto-reconnect after 2 seconds
                setTimeout(() => this.connectWebSocket(), 2000);
            };
            
            this.ws.onerror = (error) => {
                // Silent error handling
            };
            
        } catch (error) {
            // Silent error handling
        }
    }

    handleServerMessage(message) {
        switch (message.type) {
            case 'config-updated':
                this.showStatus(message.message, 'success');
                break;
                
            case 'error':
                this.showStatus(message.message, 'error');
                break;
                
            case 'status':
            default:
                // Silent handling for status and unknown messages
                break;
        }
    }

    initializeIPPresets() {
        const presetSelect = document.getElementById('artnet-ip-preset');
        const ipInput = document.getElementById('artnet-ip');
        
        if (!presetSelect || !ipInput) return;

        // Set current IP in preset if it matches
        const currentIP = ipInput.value;
        let isPresetIP = false;
        for (let option of presetSelect.options) {
            if (option.value === currentIP) {
                presetSelect.value = currentIP;
                isPresetIP = true;
                break;
            }
        }
        
        // Hide input field initially if it's a preset IP
        if (isPresetIP) {
            ipInput.style.display = 'none';
        } else {
            presetSelect.value = 'custom';
            ipInput.style.display = 'block';
        }
        
        // Add event listener for preset changes
        presetSelect.addEventListener('change', () => {
            const selectedValue = presetSelect.value;
            if (selectedValue !== 'custom') {
                ipInput.value = selectedValue;
                ipInput.style.display = 'none';
            } else {
                ipInput.style.display = 'block';
                ipInput.value = '';
                ipInput.focus();
            }
        });
    }

}

// Initialize Art-Net when module loads
window.artNetTimecode = null;

function initializeArtNet() {
    window.artNetTimecode = new ArtNetTimecode();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ArtNetTimecode, initializeArtNet };
}