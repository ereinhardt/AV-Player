function setupMasterVolumeControl(audioContextContainer) {
  const masterVolumeSlider = document.getElementById("master-volume-slider");
  const masterVolumeDbDisplay = document.getElementById("master-volume-db");
  const masterMuteCheckbox = document.getElementById("master-mute-checkbox");

  // Early return if required elements are missing
  if (!masterVolumeSlider || !masterVolumeDbDisplay || !masterMuteCheckbox) {
    console.warn("Master volume controls not found");
    return;
  }

  // Helper function to convert dB to linear volume
  const dbToVolume = (db) => Math.pow(10, db / 20);

  const updateMasterVolume = () => {
    const db = parseFloat(masterVolumeSlider.value);
    const volume = masterMuteCheckbox.checked ? 0 : dbToVolume(db);

    // Store the master volume value
    audioContextContainer.masterVolume = volume;

    // Update all existing master gain nodes
    audioContextContainer.masterGains?.forEach((masterGain) => {
      if (masterGain) {
        masterGain.gain.value = volume;
      }
    });

    // Update UI
    masterVolumeDbDisplay.textContent = masterMuteCheckbox.checked
      ? `-∞ dB`
      : `${db.toFixed(1)} dB`;
    masterVolumeSlider.disabled = masterMuteCheckbox.checked;
  };

  // Add event listeners
  masterVolumeSlider.addEventListener("input", updateMasterVolume);
  masterMuteCheckbox.addEventListener("change", updateMasterVolume);

  // Initial setup
  const initialDb = parseFloat(masterVolumeSlider.value);
  audioContextContainer.masterVolume = dbToVolume(initialDb);
  updateMasterVolume(); // This will set the initial display correctly
}
