function setupVolumeControls(tracks, audioSources) {
  const dbToVolume = (db) => Math.pow(10, db / 20);

  const getGainNode = (audioSource, side = null) => {
    if (!audioSource) return null;
    return side ? audioSource[`${side}GainNode`] : audioSource.gainNode;
  };

  const createVolumeControl = (index, track, side = null) => {
    const suffix = side ? `-${side}` : '';
    const elements = {
      slider: track.querySelector(`#volume-slider-${index}${suffix}`),
      display: track.querySelector(`#volume-db-${index}${suffix}`),
      mute: track.querySelector(`#mute-checkbox-${index}${suffix}`)
    };

    if (!elements.slider || !elements.display || !elements.mute) return;

    const updateVolume = () => {
      const gainNode = getGainNode(audioSources[index], side);
      
      if (elements.mute.checked) {
        if (gainNode) gainNode.gain.value = 0;
        elements.display.textContent = '-∞ dB';
        elements.slider.disabled = true;
      } else {
        const db = parseFloat(elements.slider.value);
        if (gainNode) gainNode.gain.value = dbToVolume(db);
        elements.display.textContent = `${db.toFixed(1)} dB`;
        elements.slider.disabled = false;
      }
    };

    // Initialize volume
    const initialDb = parseFloat(elements.slider.value);
    const gainNode = getGainNode(audioSources[index], side);
    if (gainNode) gainNode.gain.value = dbToVolume(initialDb);
    elements.display.textContent = `${initialDb.toFixed(1)} dB`;

    elements.slider.addEventListener('input', updateVolume);
    elements.mute.addEventListener('change', updateVolume);
  };

  tracks.forEach((track) => {
    const index = parseInt(track.getAttribute('data-index'));
    const isVideoTrack = index >= 16 && index <= 23 && track.classList.contains('video-track');

    if (isVideoTrack) {
      ['left', 'right'].forEach(side => createVolumeControl(index, track, side));
    } else {
      createVolumeControl(index, track);
    }
  });
}
