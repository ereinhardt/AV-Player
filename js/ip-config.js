/**
 * IP Configuration Module
 * Handles Art-Net and UDP Trigger IP configuration UI
 */

// Function for Art-Net IP field updates
async function updateIPField() {
    const preset = document.getElementById('artnet-ip-preset');
    const ipField = document.getElementById('artnet-ip');
    
    if (preset.value === 'custom') {
        ipField.style.display = 'inline-block';
        ipField.focus();
    } else if (preset.value === 'auto-broadcast') {
        ipField.style.display = 'none';
        const broadcastIP = await getCurrentNetworkBroadcast();
        ipField.value = broadcastIP;
        
        // Update the option text to show the actual IP
        const autoBroadcastOption = preset.querySelector('option[value="auto-broadcast"]');
        if (autoBroadcastOption) {
            autoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
        }
    } else {
        ipField.style.display = 'none';
        ipField.value = preset.value;
    }
}

// Function to calculate broadcast IP for current network
async function getCurrentNetworkBroadcast() {
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
                        const broadcastIP = calculateBroadcastIP(localIP);
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
function calculateBroadcastIP(localIP) {
    const parts = localIP.split('.');
    if (parts.length === 4) {
        // Assume /24 subnet (255.255.255.0)
        return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
    }
    return '192.168.1.255'; // Fallback
}

// Function for UDP Trigger IP field updates
async function updateUDPIPField() {
    const preset = document.getElementById('udp-trigger-ip-preset');
    const ipField = document.getElementById('udp-trigger-ip');
    
    if (preset.value === 'custom') {
        ipField.style.display = 'inline-block';
        ipField.focus();
    } else if (preset.value === 'auto-broadcast') {
        ipField.style.display = 'none';
        const broadcastIP = await getCurrentNetworkBroadcast();
        ipField.value = broadcastIP;
        
        // Update the option text to show the actual IP
        const autoBroadcastOption = preset.querySelector('option[value="auto-broadcast"]');
        if (autoBroadcastOption) {
            autoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
        }
    } else {
        ipField.style.display = 'none';
        ipField.value = preset.value;
    }
}

// Initialize IP configuration when DOM is loaded
function initializeIPConfiguration() {
    // Initialize Art-Net broadcast IP display immediately
    getCurrentNetworkBroadcast().then(broadcastIP => {
        const artnetPreset = document.getElementById('artnet-ip-preset');
        const artnetAutoBroadcastOption = artnetPreset?.querySelector('option[value="auto-broadcast"]');
        if (artnetAutoBroadcastOption) {
            artnetAutoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
        }
        
        const udpPreset = document.getElementById('udp-trigger-ip-preset');
        const udpAutoBroadcastOption = udpPreset?.querySelector('option[value="auto-broadcast"]');
        if (udpAutoBroadcastOption) {
            udpAutoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
        }
    });
    
    updateIPField();
    updateUDPIPField();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeIPConfiguration);