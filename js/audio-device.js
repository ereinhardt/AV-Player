// --- Device Selection ---
async function getAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return;
    }

    try {
        // Request microphone permission to get device labels
        let stream = null;
        let hasPermission = false;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            hasPermission = true;
        } catch (permissionError) {
            // Silently handle permission denial
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
        
        // Stop the microphone stream if we got one
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        const trackDeviceSelectors = document.querySelectorAll('.audio-device-select');
        trackDeviceSelectors.forEach(select => {
            select.innerHTML = '';
            audioOutputDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                
                // Improve device naming
                let deviceName = device.label;
                if (!deviceName || deviceName.trim() === '') {
                    // Fallback names based on device ID patterns and index
                    if (device.deviceId === 'default') {
                        deviceName = 'System Default';
                    } else if (device.deviceId.includes('built') || device.deviceId.includes('internal')) {
                        deviceName = 'Built-in Audio';
                    } else if (device.deviceId.includes('usb')) {
                        deviceName = `USB Audio Device ${index + 1}`;
                    } else if (device.deviceId.includes('bluetooth') || device.deviceId.includes('bt')) {
                        deviceName = `Bluetooth Device ${index + 1}`;
                    } else if (device.deviceId.includes('hdmi')) {
                        deviceName = `HDMI Audio ${index + 1}`;
                    } else {
                        deviceName = `Audio Output ${index + 1}`;
                    }
                }
                
                option.textContent = deviceName;
                select.appendChild(option);
            });
            // Trigger change to populate channel selects for the default device
            select.dispatchEvent(new Event('change'));
        });
    } catch (error) {
        // Fallback: Add generic device options
        const trackDeviceSelectors = document.querySelectorAll('.audio-device-select');
        trackDeviceSelectors.forEach(select => {
            select.innerHTML = `
                <option value="default">Default Audio Device</option>
                <option value="">Built-in Speakers</option>
            `;
        });
    }
}

async function updateChannelSelectorsForDevice(track, specificAudioDeviceSelect = null) {
    // If specificAudioDeviceSelect is provided, only update its corresponding channel select
    // Otherwise, update all channel selects in the track
    const audioDeviceSelects = specificAudioDeviceSelect ? [specificAudioDeviceSelect] : track.querySelectorAll('.audio-device-select');
    
    for (const audioDeviceSelect of audioDeviceSelects) {
        // Find the corresponding channel selects for this audio device select
        let channelSelects = [];
        
        // Check if this is a video track with separate left/right channel selects
        if (track.classList.contains('video-track')) {
            // For video tracks, find both left and right channel selects
            const leftChannelSelect = track.querySelector('#channel-select-' + track.dataset.index + '-left');
            const rightChannelSelect = track.querySelector('#channel-select-' + track.dataset.index + '-right');
            if (leftChannelSelect) channelSelects.push(leftChannelSelect);
            if (rightChannelSelect) channelSelects.push(rightChannelSelect);
        } else {
            // For regular audio tracks, find the single channel select
            const channelSelect = track.querySelector('.channel-select');
            if (channelSelect) channelSelects.push(channelSelect);
        }
        
        if (channelSelects.length === 0) continue;
        
        let tempContext;
        try {
            // Use a temporary audio context to get the maxChannelCount for the selected device.
            tempContext = new (window.AudioContext || window.webkitAudioContext)();
            await tempContext.setSinkId(audioDeviceSelect.value);
            const maxChannels = tempContext.destination.maxChannelCount;

            // Update all channel selects found for this device
            channelSelects.forEach(channelSelect => {
                const currentVal = parseInt(channelSelect.value);
                channelSelect.innerHTML = ''; // Clear existing options
                for (let i = 1; i <= maxChannels; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `Channel ${i}`;
                    channelSelect.appendChild(option);
                }
                // Try to restore previous value if it's valid, otherwise default to channel 1
                if (currentVal && currentVal <= maxChannels) {
                    channelSelect.value = currentVal;
                } else {
                    channelSelect.value = 1; // Always default to channel 1 if current channel is invalid
                }
                
                // Only trigger change event if we're dealing with a device change AND there's an audio file loaded
                // This prevents false alerts when the page first loads
                const trackIndex = parseInt(track.getAttribute('data-index'));
                const hasAudioFile = window.audioSources && window.audioSources[trackIndex];
                
                if ((!currentVal || currentVal > maxChannels) && hasAudioFile) {
                    channelSelect.dispatchEvent(new Event('change'));
                }
            });
        } catch (e) {
            // Fallback for each channel select
            channelSelects.forEach(channelSelect => {
                const currentVal = parseInt(channelSelect.value);
                channelSelect.innerHTML = `
                    <option value="1">Channel 1</option>
                    <option value="2">Channel 2</option>
                `;
                // Default to channel 1 if current channel was invalid
                channelSelect.value = 1;
                
                // Only trigger change event if there's an audio file loaded
                const trackIndex = parseInt(track.getAttribute('data-index'));
                const hasAudioFile = window.audioSources && window.audioSources[trackIndex];
                
                if ((!currentVal || currentVal > 2) && hasAudioFile) {
                    channelSelect.dispatchEvent(new Event('change'));
                }
            });
        } finally {
            if (tempContext) {
                tempContext.close();
            }
        }
    }
}

function setupDeviceChangeListeners(audioElements, audioContextContainer) {
    const tracks = document.querySelectorAll('.track');
    tracks.forEach((track, arrayIndex) => {
        // Use the data-index attribute instead of array index
        const index = parseInt(track.getAttribute('data-index'));
        
        const audioDeviceSelects = track.querySelectorAll('.audio-device-select');
        audioDeviceSelects.forEach(audioDeviceSelect => {
            audioDeviceSelect.addEventListener('change', async () => {
                const deviceId = audioDeviceSelect.value;
                
                // Update channel selectors based on the new device's capabilities for this specific audio device select
                await updateChannelSelectorsForDevice(track, audioDeviceSelect);

                // Apply the device setting to this track
                await setTrackAudioDevice(index, deviceId, audioElements, audioContextContainer);
            });
        });
    });
}

// New function to handle setting audio device for a specific track
async function setTrackAudioDevice(trackIndex, deviceId, audioElements, audioContextContainer) {
    let audioDeviceSet = false;
    let contextDeviceSet = false;
    
    // First, try to set the device on the audio element (this is crucial for MediaElementSource)
    const audio = audioElements[trackIndex];
    if (audio && typeof audio.setSinkId === 'function') {
        try {
            await audio.setSinkId(deviceId);
            audioDeviceSet = true;
        } catch (error) {
            // This is expected when MediaElementSource is already connected
            // AudioContext routing will handle the device switching instead
        }
    }

    // Then, also set the device on the AudioContext
    if (audioContextContainer && audioContextContainer.contexts && audioContextContainer.contexts[trackIndex]) {
        try {
            // Check if setSinkId is supported on AudioContext (Chrome 110+, Firefox support varies)
            if (typeof audioContextContainer.contexts[trackIndex].setSinkId === 'function') {
                await audioContextContainer.contexts[trackIndex].setSinkId(deviceId);
                contextDeviceSet = true;
            }
        } catch (error) {
            // If AudioContext device setting fails, we might need to recreate the AudioContext
            // with the correct device from the start
            if (!audioDeviceSet) {
                await recreateAudioContextWithDevice(trackIndex, deviceId, audioElements, audioContextContainer);
            }
        }
    }
    
    return { audioDeviceSet, contextDeviceSet };
}

// Function to recreate AudioContext with specific device
async function recreateAudioContextWithDevice(trackIndex, deviceId, audioElements, audioContextContainer) {
    try {
        // Close existing context if it exists
        if (audioContextContainer.contexts[trackIndex]) {
            await audioContextContainer.contexts[trackIndex].close();
        }
        
        // Create new AudioContext
        const newContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Try to set the device immediately after creation
        if (typeof newContext.setSinkId === 'function') {
            await newContext.setSinkId(deviceId);
        }
        
        // Configure destination
        const destination = newContext.destination;
        const maxChannels = destination.maxChannelCount;
        
        try {
            destination.channelCount = maxChannels;
            destination.channelCountMode = 'explicit';
            destination.channelInterpretation = 'discrete';
        } catch (error) {
            // Fallback to stereo
            destination.channelCount = 2;
        }
        
        // Create new master gain
        const masterGain = newContext.createGain();
        masterGain.channelCount = destination.channelCount;
        masterGain.channelCountMode = 'explicit';
        masterGain.channelInterpretation = 'discrete';
        masterGain.connect(destination);
        
        // Apply master volume if it exists
        if (audioContextContainer.masterVolume !== undefined) {
            masterGain.gain.value = audioContextContainer.masterVolume;
        }
        
        // Store the new context and gain
        audioContextContainer.contexts[trackIndex] = newContext;
        audioContextContainer.masterGains[trackIndex] = masterGain;
        
        // If there's an audio element, reconnect it to the new context
        const audio = audioElements[trackIndex];
        if (audio && !audio.paused) {
            // We need to trigger a reconnection of the audio source
            // This will be handled when the audio is played next time
            
            // Try to recreate the Web Audio connection immediately if possible
            if (typeof window.recreateAudioConnection === 'function') {
                setTimeout(() => {
                    window.recreateAudioConnection(trackIndex, audioElements, window.audioSources, audioContextContainer);
                }, 100);
            }
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

// Force audio device update for a track (useful for troubleshooting)
async function forceAudioDeviceUpdate(trackIndex, audioElements, audioContextContainer) {
    const tracks = document.querySelectorAll('.track');
    const track = tracks[trackIndex];
    if (!track) return false;
    
    const audioDeviceSelect = track.querySelector('.audio-device-select');
    if (!audioDeviceSelect || !audioDeviceSelect.value) return false;
    
    // First try to set device on audio element
    const audio = audioElements[trackIndex];
    if (audio && typeof audio.setSinkId === 'function') {
        try {
            await audio.setSinkId(audioDeviceSelect.value);
        } catch (error) {
            // Silently handle error
        }
    }
    
    // Then recreate AudioContext with proper device
    await recreateAudioContextWithDevice(trackIndex, audioDeviceSelect.value, audioElements, audioContextContainer);
    
    // Finally recreate Web Audio connections
    if (typeof window.recreateAudioConnection === 'function') {
        setTimeout(() => {
            window.recreateAudioConnection(trackIndex, audioElements, window.audioSources, audioContextContainer);
        }, 200);
    }
    
    return true;
}

// Export functions for global use
window.setTrackAudioDevice = setTrackAudioDevice;
window.recreateAudioContextWithDevice = recreateAudioContextWithDevice;
window.forceAudioDeviceUpdate = forceAudioDeviceUpdate;
