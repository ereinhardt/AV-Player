async function updateIPFieldForPreset(presetId, ipFieldId) {
    const preset = document.getElementById(presetId);
    const ipField = document.getElementById(ipFieldId);
    
    if (preset.value === 'custom') {
        ipField.style.display = 'inline-block';
        ipField.focus();
    } else if (preset.value === 'auto-broadcast') {
        ipField.style.display = 'none';
        const broadcastIP = await getCurrentNetworkBroadcast();
        ipField.value = broadcastIP;
        
        const autoBroadcastOption = preset.querySelector('option[value="auto-broadcast"]');
        if (autoBroadcastOption) {
            autoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
        }
    } else {
        ipField.style.display = 'none';
        ipField.value = preset.value;
    }
}

const updateIPField = () => updateIPFieldForPreset('artnet-ip-preset', 'artnet-ip');
const updateUDPIPField = () => updateIPFieldForPreset('udp-trigger-ip-preset', 'udp-trigger-ip');

// Function to calculate broadcast IP for current network
async function getCurrentNetworkBroadcast() {
    try {
        const pc = new RTCPeerConnection({ iceServers: [] });
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
            
            setTimeout(() => {
                pc.close();
                resolve('192.168.1.255');
            }, 2000);
        });
    } catch (error) {
        return '192.168.1.255';
    }
}

function calculateBroadcastIP(localIP) {
    const parts = localIP.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.255` : '192.168.1.255';
}



async function initializeIPConfiguration() {
    const broadcastIP = await getCurrentNetworkBroadcast();
    
    ['artnet-ip-preset', 'udp-trigger-ip-preset'].forEach(presetId => {
        const preset = document.getElementById(presetId);
        const autoBroadcastOption = preset?.querySelector('option[value="auto-broadcast"]');
        if (autoBroadcastOption) {
            autoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
        }
    });
    
    updateIPField();
    updateUDPIPField();
}

document.addEventListener('DOMContentLoaded', initializeIPConfiguration);