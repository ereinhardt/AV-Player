function recreateAudioConnection(trackIndex, audioElements, audioSources, audioContextContainer) {
    const audio = audioElements[trackIndex];
    if (!audio || !audioContextContainer.contexts[trackIndex]) {
        return false;
    }
    
    try {
        // Disconnect old audio source if it exists
        if (audioSources[trackIndex]) {
            const oldSource = audioSources[trackIndex];
            if (oldSource.source) oldSource.source.disconnect();
            if (oldSource.gainNode) oldSource.gainNode.disconnect();
            if (oldSource.merger) oldSource.merger.disconnect();
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
        gainNode.connect(merger, 0, 0);
        merger.connect(audioContextContainer.masterGains[trackIndex]);
        
        // Update audioSources array
        audioSources[trackIndex] = { audio, source, merger, gainNode };
        
        return true;
        
    } catch (error) {
        return false;
    }
}

function addDeviceRecreateButton(track, trackIndex, audioElements, audioSources, audioContextContainer) {
    if (track.querySelector('.recreate-device-btn')) {
        return;
    }
    
    const button = document.createElement('button');
    button.className = 'recreate-device-btn';
    button.textContent = 'Reconnect Device';
    button.title = 'Recreate audio connection with selected device';
    
    button.addEventListener('click', () => {
        const success = recreateAudioConnection(trackIndex, audioElements, audioSources, audioContextContainer);
        alert(success ? `Audio connection recreated for track ${trackIndex + 1}` : `Failed to recreate audio connection for track ${trackIndex + 1}`);
    });
    
    const deviceSelect = track.querySelector('.audio-device-select');
    if (deviceSelect && deviceSelect.parentNode) {
        deviceSelect.parentNode.insertBefore(button, deviceSelect.nextSibling);
    }
}


