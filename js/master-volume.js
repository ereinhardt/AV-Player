function setupMasterVolumeControl(audioContextContainer) {
  const elements = {
    slider: document.getElementById('master-volume-slider'),
    display: document.getElementById('master-volume-db'),
    mute: document.getElementById('master-mute-checkbox')
  };

  if (!elements.slider || !elements.display || !elements.mute) {
    console.warn('Master volume controls not found');
    return;
  }

  const dbToVolume = (db) => Math.pow(10, db / 20);

  const updateMasterVolume = () => {
    const isMuted = elements.mute.checked;
    const db = parseFloat(elements.slider.value);
    const volume = isMuted ? 0 : dbToVolume(db);

    audioContextContainer.masterVolume = volume;
    audioContextContainer.masterGains?.forEach(gain => {
      if (gain) gain.gain.value = volume;
    });

    elements.display.textContent = isMuted ? '-∞ dB' : `${db.toFixed(1)} dB`;
    elements.slider.disabled = isMuted;
  };

  elements.slider.addEventListener('input', updateMasterVolume);
  elements.mute.addEventListener('change', updateMasterVolume);

  // Initialize
  audioContextContainer.masterVolume = dbToVolume(parseFloat(elements.slider.value));
  updateMasterVolume();
}
