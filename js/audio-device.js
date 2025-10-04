// --- Device Selection ---
async function getAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return;
    }

    try {
        // Request microphone permission to get device labels
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
                option.textContent = device.label || `Audio Output ${index + 1}`;
                select.appendChild(option);
            });
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
    const audioDeviceSelects = specificAudioDeviceSelect ? [specificAudioDeviceSelect] : track.querySelectorAll('.audio-device-select');
    
    for (const audioDeviceSelect of audioDeviceSelects) {
        let channelSelects = [];
        
        if (track.classList.contains('video-track')) {
            const leftChannelSelect = track.querySelector('#channel-select-' + track.dataset.index + '-left');
            const rightChannelSelect = track.querySelector('#channel-select-' + track.dataset.index + '-right');
            if (leftChannelSelect) channelSelects.push(leftChannelSelect);
            if (rightChannelSelect) channelSelects.push(rightChannelSelect);
        } else {
            const channelSelect = track.querySelector('.channel-select');
            if (channelSelect) channelSelects.push(channelSelect);
        }
        
        if (channelSelects.length === 0) continue;
        
        let tempContext;
        try {
            tempContext = new (window.AudioContext || window.webkitAudioContext)();
            await tempContext.setSinkId(audioDeviceSelect.value);
            let maxChannels = tempContext.destination.maxChannelCount;

            channelSelects.forEach(channelSelect => {
                const currentVal = parseInt(channelSelect.value);
                channelSelect.innerHTML = '';
                for (let i = 1; i <= maxChannels; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `Channel ${i}`;
                    channelSelect.appendChild(option);
                }
                
                if (currentVal && currentVal <= maxChannels) {
                    channelSelect.value = currentVal;
                } else {
                    channelSelect.value = 1;
                }
                
                const trackIndex = parseInt(track.getAttribute('data-index'));
                const hasAudioFile = window.audioSources && window.audioSources[trackIndex];
                
                if ((!currentVal || currentVal > maxChannels) && hasAudioFile) {
                    channelSelect.dispatchEvent(new Event('change'));
                }
            });
        } catch (e) {
            channelSelects.forEach(channelSelect => {
                const currentVal = parseInt(channelSelect.value);
                channelSelect.innerHTML = `
                    <option value="1">Channel 1</option>
                    <option value="2">Channel 2</option>
                `;
                channelSelect.value = 1;
                
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
    const audio = audioElements && audioElements[trackIndex];
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
        
        // Configure destination for multi-channel output
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


