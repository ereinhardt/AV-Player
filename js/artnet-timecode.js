// Art-Net Timecode Sending Module
// Implements simplified Art-Net protocol for sending SMPTE timecode

class ArtNetTimecode {
    constructor() {
        this.enabled = false;
        this.ip = '127.0.0.1';
        this.port = 6454;
        this.fps = 25;
        this.ws = null;
        this.pendingConfiguration = false;
        this.initializeSettings();
        this.connectWebSocket();
    }
    
    // Helper functions
    getElement(id) {
        return document.getElementById(id);
    }
    
    isValidIP(ip) {
        return ip && ip.length > 0;
    }
    
    isValidPort(port) {
        return !isNaN(port) && port >= 1 && port <= 65535;
    }
    
    isValidFPS(fps) {
        return !isNaN(fps) && fps > 0;
    }

    initializeSettings() {
        // Set checkbox to match default state
        const enabledCheckbox = this.getElement('artnet-enabled');
        if (enabledCheckbox) enabledCheckbox.checked = this.enabled;
        
        // Set initial values
        this.getElement('artnet-ip').value = this.ip;
        const portInput = this.getElement('artnet-port');
        if (portInput) portInput.value = this.port;
        
        // Setup IP detection and presets
        this.setupIPDetection();
        this.initializeIPPresets();
        
        // Add event listeners
        this.getElement('apply-settings-btn').addEventListener('click', () => this.applySettings());
        this.getElement('artnet-enabled').addEventListener('change', (e) => {
            this.enabled = e.target.checked;
            this.showStatus(this.enabled ? 'Art-Net enabled' : 'Art-Net disabled', 'success');
            this.updateStatusDisplay();
        });
        
        this.updateStatusDisplay();
    }
    
    setupIPDetection() {
        this.getUserIP().then(ip => {
            if (ip) {
                const ipParts = ip.split('.');
                const broadcastIP = [...ipParts.slice(0, 3), '255'].join('.');
                
                this.getElement('artnet-ip').title = `Your computer IP: ${ip} (Broadcast: ${broadcastIP})`;
                
                if (!this.getElement('ip-info')) {
                    const ipInput = this.getElement('artnet-ip');
                    const infoElement = document.createElement('span');
                    infoElement.id = 'ip-info';
                    infoElement.className = 'ip-info';
                    infoElement.textContent = `(My IP in the current network: ${ip})`;
                    ipInput.parentNode.appendChild(infoElement);
                }
            }
            this.pendingConfiguration = true;
            this.sendConfigurationToServerWhenReady();
        }).catch(() => {
            this.pendingConfiguration = true;
            this.sendConfigurationToServerWhenReady();
        });
    }

    applySettings() {
        try {
            const newFps = parseFloat(this.getElement('fps-select').value);
            const newIp = this.getIPFromForm();
            const newPort = parseInt(this.getElement('artnet-port').value);
            const newEnabled = this.getElement('artnet-enabled').checked;

            // Validate inputs
            if (!this.isValidIP(newIp)) {
                this.showStatus('Invalid IP address', 'error');
                return;
            }
            if (!this.isValidPort(newPort)) {
                this.showStatus('Invalid port number (1-65535)', 'error');
                return;
            }
            if (!this.isValidFPS(newFps)) {
                this.showStatus('Invalid FPS value', 'error');
                return;
            }

            // Apply settings
            this.fps = newFps;
            this.ip = newIp;
            this.port = newPort;
            this.enabled = newEnabled;

            this.sendConfigurationToServer();
        } catch (error) {
            this.showStatus('Error applying settings', 'error');
        }
    }
    
    getIPFromForm() {
        const presetSelect = this.getElement('artnet-ip-preset');
        const ipInput = this.getElement('artnet-ip');
        
        if (presetSelect && presetSelect.value !== 'custom' && presetSelect.value !== 'auto-broadcast') {
            return presetSelect.value;
        }
        return ipInput.value.trim();
    }

    sendConfigurationToServerWhenReady() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendConfigurationToServer();
            this.pendingConfiguration = false;
        } else {
            this.pendingConfiguration = true;
        }
    }

    sendConfigurationToServer() {
        this.sendToServer({
            type: 'configure-artnet',
            ip: this.ip,
            port: this.port,
            enabled: this.enabled,
            fps: this.fps
        });
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
        const statusSpan = this.getElement('settings-status');
        if (!statusSpan) return;
        
        statusSpan.textContent = message;
        statusSpan.className = `settings-status ${type}`;
        
        setTimeout(() => {
            statusSpan.style.opacity = '0';
            setTimeout(() => statusSpan.textContent = '', 300);
        }, 3000);
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
                    if (!ice?.candidate?.candidate) return;
                    
                    const ipMatches = ice.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/g);
                    if (!ipMatches) return;
                    
                    ipMatches.forEach(ip => {
                        if (this.isValidLocalIP(ip)) {
                            foundIPs.add(ip);
                            if (this.isPrivateIP(ip)) localIP = ip;
                        }
                    });
                    
                    if (localIP) {
                        pc.close();
                        resolve(localIP);
                    }
                };
                
                setTimeout(() => {
                    pc.close();
                    resolve(localIP || (foundIPs.size > 0 ? Array.from(foundIPs)[0] : null));
                }, 5000);
            });
        } catch (error) {
            return null;
        }
    }
    
    isValidLocalIP(ip) {
        return !ip.startsWith('127.') && !ip.startsWith('169.254.') && !ip.startsWith('0.');
    }
    
    isPrivateIP(ip) {
        return ip.startsWith('192.168.') || 
               ip.startsWith('10.') || 
               ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./); 
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
        if (!this.enabled) return;
        
        try {
            const timecode = this.timeToSMPTE(currentTime);
            const packet = this.createArtNetPacket(timecode);
            
            this.sendToServer({
                type: 'artnet-timecode',
                packet: Array.from(packet),
                timecode: timecode,
                ip: this.ip,
                port: this.port
            });
            
            this.updateStatusDisplay(timecode.formatted);
            return timecode;
        } catch (error) {
            return null;
        }
    }

    sendToServer(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connectWebSocket();
        }
        
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    connectWebSocket() {
        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                if (this.pendingConfiguration) {
                    this.sendConfigurationToServer();
                    this.pendingConfiguration = false;
                }
            };
            
            this.ws.onmessage = (event) => {
                try {
                    this.handleServerMessage(JSON.parse(event.data));
                } catch (error) {
                    // Silent error handling
                }
            };
            
            this.ws.onclose = () => {
                setTimeout(() => this.connectWebSocket(), 2000);
            };
            
            this.ws.onerror = () => {
                // Silent error handling
            };
            
        } catch (error) {
            // Silent error handling
        }
    }

    handleServerMessage(message) {
        const { type, message: msg } = message;
        
        if (type === 'config-updated') {
            this.showStatus(msg, 'success');
        } else if (type === 'error') {
            this.showStatus(msg, 'error');
        }
        // Silent handling for status and unknown messages
    }

    initializeIPPresets() {
        const presetSelect = this.getElement('artnet-ip-preset');
        const ipInput = this.getElement('artnet-ip');
        
        if (!presetSelect || !ipInput) return;

        // Check if current IP matches a preset
        const currentIP = ipInput.value;
        const isPresetIP = Array.from(presetSelect.options).some(option => {
            if (option.value === currentIP) {
                presetSelect.value = currentIP;
                return true;
            }
            return false;
        });
        
        // Show/hide input field based on preset selection
        if (isPresetIP) {
            ipInput.style.display = 'none';
        } else {
            presetSelect.value = 'custom';
            ipInput.style.display = 'block';
        }
        
        // Handle preset changes
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