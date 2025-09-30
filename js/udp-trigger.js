class UDPTrigger {
    constructor() {
        this.enabled = false;
        this.ip = null; // Will be set dynamically
        this.port = 9998;
        this.message = 'START';
        this.ws = null;
        this.setupUI();
        this.connectToServer();
    }

    async setupUI() {
        // Get UI elements
        this.enabledCheckbox = document.getElementById('udp-trigger-enabled');
        this.ipPresetSelect = document.getElementById('udp-trigger-ip-preset');
        this.ipInput = document.getElementById('udp-trigger-ip');
        this.portInput = document.getElementById('udp-trigger-port');
        this.messageInput = document.getElementById('udp-trigger-message');
        this.applyButton = document.getElementById('udp-trigger-apply');
        this.statusDisplay = document.getElementById('udp-trigger-status');

        // Initialize with dynamic broadcast IP
        await this.updateIPFromPreset();

        // Set initial values
        if (this.enabledCheckbox) this.enabledCheckbox.checked = this.enabled;
        if (this.ipInput) this.ipInput.value = this.ip;
        if (this.portInput) this.portInput.value = this.port;
        if (this.messageInput) this.messageInput.value = this.message;
        
        // Set initial preset selection
        if (this.ipPresetSelect) {
            if (this.ip === '127.0.0.1') {
                this.ipPresetSelect.value = '127.0.0.1';
            } else {
                // Default to auto-broadcast
                this.ipPresetSelect.value = 'auto-broadcast';
            }
        }

        // Add event listeners
        if (this.applyButton) {
            this.applyButton.addEventListener('click', () => this.applySettings());
        }
        
        // Add event listener for enable checkbox to update status immediately
        if (this.enabledCheckbox) {
            this.enabledCheckbox.addEventListener('change', () => {
                this.enabled = this.enabledCheckbox.checked;
                this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, this.enabled ? 'enabled' : 'disabled');
            });
        }
        
        // Set initial status
        this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, this.enabled ? 'enabled' : 'disabled');
    }

    // Helper method to get current network broadcast IP
    async getCurrentNetworkBroadcast() {
        try {
            // Try to get local IP through WebRTC
            const pc = new RTCPeerConnection({
                iceServers: []
            });
            
            pc.createDataChannel('');
            await pc.createOffer().then(offer => pc.setLocalDescription(offer));
            
            return new Promise((resolve) => {
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        const candidate = event.candidate.candidate;
                        const ipMatch = candidate.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/);
                        if (ipMatch && !ipMatch[0].startsWith('127.') && !ipMatch[0].startsWith('169.254.')) {
                            const localIP = ipMatch[0];
                            const broadcastIP = this.calculateBroadcastIP(localIP);
                            pc.close();
                            resolve(broadcastIP);
                            return;
                        }
                    }
                };
                
                // Fallback after timeout
                setTimeout(() => {
                    pc.close();
                    resolve('192.168.1.255'); // Common default
                }, 2000);
            });
        } catch (error) {
            console.warn('Could not determine network, using default broadcast IP');
            return '192.168.1.255';
        }
    }
    
    // Calculate broadcast IP based on local IP (assumes /24 subnet)
    calculateBroadcastIP(localIP) {
        const parts = localIP.split('.');
        if (parts.length === 4) {
            // Assume /24 subnet (255.255.255.0)
            return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
        }
        return '192.168.1.255'; // Fallback
    }

    // Update IP based on current preset selection
    async updateIPFromPreset() {
        if (this.ipPresetSelect) {
            if (this.ipPresetSelect.value === 'auto-broadcast') {
                this.ip = await this.getCurrentNetworkBroadcast();
            } else if (this.ipPresetSelect.value !== 'custom') {
                this.ip = this.ipPresetSelect.value;
            }
        }
        if (!this.ip) {
            this.ip = await this.getCurrentNetworkBroadcast();
        }
    }

    connectToServer() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, this.enabled ? 'enabled' : 'disabled');
            };
            
            this.ws.onclose = () => {
                this.updateStatus('(Server Offline)', 'error');
                // Reconnect after 3 seconds
                setTimeout(() => this.connectToServer(), 3000);
            };
            
            this.ws.onerror = (error) => {
                this.updateStatus('(Server Connection Error)', 'error');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'udp-trigger-config-updated') {
                        this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, this.enabled ? 'enabled' : 'disabled');
                    } else if (data.type === 'udp-trigger-sent') {
                        this.updateStatus(`(${data.details.ip}:${data.details.port} / ${data.details.message} - SENT)`, 'enabled');
                        // Reset to ready status after 2 seconds
                        setTimeout(() => {
                            this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, 'enabled');
                        }, 2000);
                    } else if (data.type === 'udp-trigger-error') {
                        this.updateStatus(`(Error: ${data.message})`, 'error');
                    }
                } catch (e) {
                    // Ignore malformed messages
                }
            };
        } catch (error) {
            this.updateStatus('(Connection Failed)', 'error');
        }
    }

    async applySettings() {
        if (!this.enabledCheckbox || !this.ipInput || !this.portInput || !this.messageInput) {
            return;
        }

        this.enabled = this.enabledCheckbox.checked;
        
        // Get IP from appropriate source
        if (this.ipPresetSelect && this.ipPresetSelect.value === 'auto-broadcast') {
            this.ip = await this.getCurrentNetworkBroadcast();
        } else if (this.ipPresetSelect && this.ipPresetSelect.value !== 'custom') {
            this.ip = this.ipPresetSelect.value;
        } else {
            this.ip = this.ipInput.value.trim();
        }
        
        this.port = parseInt(this.portInput.value);
        this.message = this.messageInput.value.trim();

        // Update the input field to show the resolved IP
        if (this.ipInput) {
            this.ipInput.value = this.ip;
        }

        // Validate inputs
        if (this.enabled) {
            if (!this.ip || !this.isValidIP(this.ip)) {
                this.updateStatus('(Invalid IP Address)', 'error');
                return;
            }
            if (!this.port || this.port < 1 || this.port > 65535) {
                this.updateStatus('(Invalid Port)', 'error');
                return;
            }
            if (!this.message) {
                this.updateStatus('(Message Required)', 'error');
                return;
            }
        }

        // Send configuration to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const config = {
                type: 'udp-trigger-config',
                enabled: this.enabled,
                ip: this.ip,
                port: this.port,
                message: this.message
            };
            this.ws.send(JSON.stringify(config));
            this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, this.enabled ? 'enabled' : 'disabled');
        } else {
            this.updateStatus('(Server Not Available)', 'error');
        }
    }

    isValidIP(ip) {
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(ip)) return false;
        
        const parts = ip.split('.');
        return parts.every(part => {
            const num = parseInt(part);
            return num >= 0 && num <= 255;
        });
    }

    updateStatus(message, status) {
        if (this.statusDisplay) {
            this.statusDisplay.textContent = message;
            this.statusDisplay.className = `udp-trigger-status ${status}`;
        }
    }

    // Method to be called when playback starts
    triggerStart() {
        if (!this.enabled) {
            return;
        }
        
        if (!this.ws) {
            return;
        }
        
        if (this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const trigger = {
            type: 'udp-trigger-send',
            action: 'start',
            ip: this.ip,
            port: this.port,
            message: this.message
        };

        this.ws.send(JSON.stringify(trigger));
    }

    // Method to be called when playback stops
    triggerStop() {
        if (!this.enabled || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        // Optionally send a STOP message
        const stopMessage = this.message.replace(/START/gi, 'STOP');
        if (stopMessage !== this.message) {
            const trigger = {
                type: 'udp-trigger-send',
                ip: this.ip,
                port: this.port,
                message: stopMessage
            };

            this.ws.send(JSON.stringify(trigger));
        }
    }
}

// Make UDP Trigger globally accessible
window.udpTrigger = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.udpTrigger = new UDPTrigger();
});