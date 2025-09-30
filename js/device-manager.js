// Device Manager - Helper functions for audio device management

function recreateAudioConnection(trackIndex, audioElements, audioSources, audioContextContainer) {
    console.log(`Recreating audio connection for track ${trackIndex}`);
    
    const audio = audioElements[trackIndex];
    if (!audio || !audioContextContainer.contexts[trackIndex]) {
        console.error(`Cannot recreate connection: missing audio or context for track ${trackIndex}`);
        return false;
    }
    
    try {
        // Disconnect old audio source if it exists
        if (audioSources[trackIndex]) {
            const oldSource = audioSources[trackIndex];
            if (oldSource.source) {
                oldSource.source.disconnect();
            }
            if (oldSource.gainNode) {
                oldSource.gainNode.disconnect();
            }
            if (oldSource.merger) {
                oldSource.merger.disconnect();
            }
        }
        
        // Recreate the MediaElementSource and connections
        const context = audioContextContainer.contexts[trackIndex];
        const maxChannels = context.destination.maxChannelCount;
        const effectiveChannels = Math.min(maxChannels, 20);
        
        // Create new Web Audio nodes
        const source = context.createMediaElementSource(audio);
        const merger = context.createChannelMerger(effectiveChannels);
        const gainNode = context.createGain();
        
        // Configure merger
        merger.channelCountMode = 'explicit';
        merger.channelInterpretation = 'discrete';
        
        // Connect the audio graph
        source.connect(gainNode);
        gainNode.connect(merger, 0, 0); // Default to channel 1
        merger.connect(audioContextContainer.masterGains[trackIndex]);
        
        // Update audioSources array
        audioSources[trackIndex] = { audio, source, merger, gainNode };
        
        console.log(`✅ Successfully recreated audio connection for track ${trackIndex}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Failed to recreate audio connection for track ${trackIndex}:`, error);
        return false;
    }
}

function addDeviceRecreateButton(track, trackIndex, audioElements, audioSources, audioContextContainer) {
    // Check if button already exists
    if (track.querySelector('.recreate-device-btn')) {
        return;
    }
    
    const button = document.createElement('button');
    button.className = 'recreate-device-btn';
    button.textContent = '🔄 Reconnect Device';
    button.title = 'Recreate audio connection with selected device';
    button.style.marginLeft = '10px';
    button.style.fontSize = '12px';
    button.style.padding = '2px 6px';
    
    button.addEventListener('click', () => {
        const success = recreateAudioConnection(trackIndex, audioElements, audioSources, audioContextContainer);
        if (success) {
            alert(`Audio connection recreated for track ${trackIndex + 1}`);
        } else {
            alert(`Failed to recreate audio connection for track ${trackIndex + 1}`);
        }
    });
    
    // Add button next to device selector
    const deviceSelect = track.querySelector('.audio-device-select');
    if (deviceSelect && deviceSelect.parentNode) {
        deviceSelect.parentNode.insertBefore(button, deviceSelect.nextSibling);
    }
}

// Export functions for use in other modules
window.recreateAudioConnection = recreateAudioConnection;
window.addDeviceRecreateButton = addDeviceRecreateButton;