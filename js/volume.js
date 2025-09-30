function setupVolumeControls(tracks, audioSources) {
    tracks.forEach((track, arrayIndex) => {
        // Use the data-index attribute instead of array index
        const index = parseInt(track.getAttribute('data-index'));
        
        // Check if this is a video track (index 16-23) with left/right controls
        const isVideoTrack = index >= 16 && index <= 23 && track.classList.contains('video-track');
        
        if (isVideoTrack) {
            // Handle video track with left and right controls
            ['left', 'right'].forEach(side => {
                const volumeSlider = track.querySelector(`#volume-slider-${index}-${side}`);
                const volumeDbDisplay = track.querySelector(`#volume-db-${index}-${side}`);
                const muteCheckbox = track.querySelector(`#mute-checkbox-${index}-${side}`);

                if (!volumeSlider || !volumeDbDisplay || !muteCheckbox) return;

                const updateVolume = () => {
                    const gainNodeKey = side === 'left' ? 'leftGainNode' : 'rightGainNode';
                    
                    if (muteCheckbox.checked) {
                        if (audioSources[index] && audioSources[index][gainNodeKey]) {
                            audioSources[index][gainNodeKey].gain.value = 0;
                        }
                        volumeDbDisplay.textContent = `-∞ dB`;
                        volumeSlider.disabled = true;
                    } else {
                        const db = parseFloat(volumeSlider.value);
                        const volume = Math.pow(10, db / 20);
                        if (audioSources[index] && audioSources[index][gainNodeKey]) {
                            audioSources[index][gainNodeKey].gain.value = volume;
                        }
                        volumeDbDisplay.textContent = `${db.toFixed(1)} dB`;
                        volumeSlider.disabled = false;
                    }
                };

                // Set initial volume from slider
                const initialDb = parseFloat(volumeSlider.value);
                const initialVolume = Math.pow(10, initialDb / 20);
                const gainNodeKey = side === 'left' ? 'leftGainNode' : 'rightGainNode';
                if (audioSources[index] && audioSources[index][gainNodeKey]) {
                    audioSources[index][gainNodeKey].gain.value = initialVolume;
                }
                volumeDbDisplay.textContent = `${initialDb.toFixed(1)} dB`;

                volumeSlider.addEventListener('input', (event) => {
                    updateVolume();
                });

                muteCheckbox.addEventListener('change', () => {
                    updateVolume();
                });
            });
        } else {
            // Handle regular tracks
            const volumeSlider = track.querySelector(`#volume-slider-${index}`);
            const volumeDbDisplay = track.querySelector(`#volume-db-${index}`);
            const muteCheckbox = track.querySelector(`#mute-checkbox-${index}`);

            if (!volumeSlider || !volumeDbDisplay || !muteCheckbox) return;

            const updateVolume = () => {
                if (muteCheckbox.checked) {
                    if (audioSources[index] && audioSources[index].gainNode) {
                        audioSources[index].gainNode.gain.value = 0;
                    }
                    volumeDbDisplay.textContent = `-∞ dB`;
                    volumeSlider.disabled = true;
                } else {
                    const db = parseFloat(volumeSlider.value);
                    const volume = Math.pow(10, db / 20);
                    if (audioSources[index] && audioSources[index].gainNode) {
                        audioSources[index].gainNode.gain.value = volume;
                    }
                    volumeDbDisplay.textContent = `${db.toFixed(1)} dB`;
                    volumeSlider.disabled = false;
                }
            };

            // Set initial volume from slider
            const initialDb = parseFloat(volumeSlider.value);
            const initialVolume = Math.pow(10, initialDb / 20);
            if (audioSources[index] && audioSources[index].gainNode) {
                audioSources[index].gainNode.gain.value = initialVolume;
            }
            volumeDbDisplay.textContent = `${initialDb.toFixed(1)} dB`;

            volumeSlider.addEventListener('input', (event) => {
                updateVolume();
            });

            muteCheckbox.addEventListener('change', () => {
                updateVolume();
            });
        }
    });
}
