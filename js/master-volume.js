// Set up master volume control with dB scale and mute functionality
function setupMasterVolumeControl(audioContextContainer) {
  const elements = {
    slider: document.getElementById("master-volume-slider"),
    display: document.getElementById("master-volume-db"),
    mute: document.getElementById("master-mute-checkbox"),
  };

  if (!elements.slider || !elements.display || !elements.mute) {
    console.warn("Master volume controls not found");
    return;
  }

  // Update master volume and apply to all audio tracks with dB conversion
  const updateMasterVolume = () => {
    const isMuted = elements.mute.checked;
    const db = parseFloat(elements.slider.value);
    const volume = isMuted ? 0 : Math.pow(10, db / 20);

    audioContextContainer.masterVolume = volume;
    audioContextContainer.masterGains?.forEach((gain) => {
      if (gain) gain.gain.value = volume;
    });

    elements.display.textContent = isMuted ? "-∞ dB" : `${db.toFixed(1)} dB`;
    elements.slider.disabled = isMuted;
  };

  ["input", "change"].forEach((event) => {
    elements[event === "input" ? "slider" : "mute"].addEventListener(
      event,
      updateMasterVolume
    );
  });

  updateMasterVolume();
}
