function setupVolumeControls(tracks, audioSources) {
    // Helper function to convert dB to linear volume
    const dbToVolume = (db) => Math.pow(10, db / 20);
    
    // Helper function to get gain node based on side (for video tracks)
    const getGainNode = (audioSource, side = null) => {
        if (!audioSource) return null;
        
        if (side === 'left') return audioSource.leftGainNode;
        if (side === 'right') return audioSource.rightGainNode;
        return audioSource.gainNode;
    };
    
    // Helper function to setup volume control for a specific slider/checkbox pair
    const setupVolumeControl = (index, volumeSlider, volumeDbDisplay, muteCheckbox, side = null) => {
        if (!volumeSlider || !volumeDbDisplay || !muteCheckbox) return;
        
        const updateVolume = () => {
            const gainNode = getGainNode(audioSources[index], side);
            
            if (muteCheckbox.checked) {
                if (gainNode) gainNode.gain.value = 0;
                volumeDbDisplay.textContent = `-∞ dB`;
                volumeSlider.disabled = true;
            } else {
                const db = parseFloat(volumeSlider.value);
                const volume = dbToVolume(db);
                if (gainNode) gainNode.gain.value = volume;
                volumeDbDisplay.textContent = `${db.toFixed(1)} dB`;
                volumeSlider.disabled = false;
            }
        };
        
        // Set initial volume from slider
        const initialDb = parseFloat(volumeSlider.value);
        const initialVolume = dbToVolume(initialDb);
        const gainNode = getGainNode(audioSources[index], side);
        if (gainNode) gainNode.gain.value = initialVolume;
        volumeDbDisplay.textContent = `${initialDb.toFixed(1)} dB`;
        
        // Add event listeners
        volumeSlider.addEventListener('input', updateVolume);
        muteCheckbox.addEventListener('change', updateVolume);
    };
    
    tracks.forEach((track) => {
        const index = parseInt(track.getAttribute('data-index'));
        const isVideoTrack = index >= 16 && index <= 23 && track.classList.contains('video-track');
        
        if (isVideoTrack) {
            // Handle video track with left and right controls
            ['left', 'right'].forEach(side => {
                const volumeSlider = track.querySelector(`#volume-slider-${index}-${side}`);
                const volumeDbDisplay = track.querySelector(`#volume-db-${index}-${side}`);
                const muteCheckbox = track.querySelector(`#mute-checkbox-${index}-${side}`);
                
                setupVolumeControl(index, volumeSlider, volumeDbDisplay, muteCheckbox, side);
            });
        } else {
            // Handle regular tracks
            const volumeSlider = track.querySelector(`#volume-slider-${index}`);
            const volumeDbDisplay = track.querySelector(`#volume-db-${index}`);
            const muteCheckbox = track.querySelector(`#mute-checkbox-${index}`);
            
            setupVolumeControl(index, volumeSlider, volumeDbDisplay, muteCheckbox);
        }
    });
}
