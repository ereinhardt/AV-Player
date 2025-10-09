// Set up volume controls for all audio and video tracks
function setupVolumeControls(tracks, audioSources) {
  // Convert decibel value to linear volume (0-1)
  const dbToVolume = (db) => Math.pow(10, db / 20);

  // Create volume control elements and event handlers for a track
  const createVolumeControl = (index, track, side = null) => {
    const suffix = side ? `-${side}` : "";
    const elements = {
      slider: track.querySelector(`#volume-slider-${index}${suffix}`),
      display: track.querySelector(`#volume-db-${index}${suffix}`),
      mute: track.querySelector(`#mute-checkbox-${index}${suffix}`),
    };

    if (!elements.slider || !elements.display || !elements.mute) return;

    // Update volume gain node and UI display based on slider and mute state
    const updateVolume = () => {
      const audioSource = audioSources[index];
      const gainNode =
        audioSource &&
        (side ? audioSource[`${side}GainNode`] : audioSource.gainNode);
      const isMuted = elements.mute.checked;
      const db = parseFloat(elements.slider.value);

      if (gainNode) gainNode.gain.value = isMuted ? 0 : dbToVolume(db);
      elements.display.textContent = isMuted ? "-∞ dB" : `${db.toFixed(1)} dB`;
      elements.slider.disabled = isMuted;
    };

    ["input", "change"].forEach((event) => {
      elements[event === "input" ? "slider" : "mute"].addEventListener(
        event,
        updateVolume
      );
    });
    updateVolume();
  };

  tracks.forEach((track) => {
    const index = parseInt(track.getAttribute("data-index"));
    const isVideoTrack =
      index >= 16 && index <= 23 && track.classList.contains("video-track");

    if (isVideoTrack) {
      ["left", "right"].forEach((side) =>
        createVolumeControl(index, track, side)
      );
    } else {
      createVolumeControl(index, track);
    }
  });
}
