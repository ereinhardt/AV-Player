function setupMasterVolumeControl(audioContextContainer) {
    const masterVolumeSlider = document.getElementById('master-volume-slider');
    const masterVolumeDbDisplay = document.getElementById('master-volume-db');
    const masterMuteCheckbox = document.getElementById('master-mute-checkbox');

    const updateMasterVolume = () => {
        const db = parseFloat(masterVolumeSlider.value);
        const volume = masterMuteCheckbox.checked ? 0 : Math.pow(10, db / 20);
        
        // Store the master volume value
        audioContextContainer.masterVolume = volume;
        
        // Update all existing master gain nodes
        if (audioContextContainer.masterGains) {
            audioContextContainer.masterGains.forEach((masterGain, index) => {
                if (masterGain) {
                    masterGain.gain.value = volume;
                }
            });
        }

        // Update UI
        if (masterMuteCheckbox.checked) {
            masterVolumeDbDisplay.textContent = `-∞ dB`;
            masterVolumeSlider.disabled = true;
        } else {
            masterVolumeDbDisplay.textContent = `${db.toFixed(1)} dB`;
            masterVolumeSlider.disabled = false;
        }
    };

    masterVolumeSlider.addEventListener('input', (event) => {
        updateMasterVolume();
    });

    masterMuteCheckbox.addEventListener('change', () => {
        updateMasterVolume();
    });

    // Set initial volume display and master volume value
    const initialDb = parseFloat(masterVolumeSlider.value);
    masterVolumeDbDisplay.textContent = `${initialDb.toFixed(1)} dB`;
    audioContextContainer.masterVolume = Math.pow(10, initialDb / 20);
    
    // Initial update to set everything correctly
    updateMasterVolume();
}
