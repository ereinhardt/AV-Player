function setupVolumeControls(tracks, audioSources) {
  const dbToVolume = (db) => Math.pow(10, db / 20);

  const createVolumeControl = (index, track, side = null) => {
    const suffix = side ? `-${side}` : '';
    const slider = track.querySelector(`#volume-slider-${index}${suffix}`);
    const display = track.querySelector(`#volume-db-${index}${suffix}`);
    const mute = track.querySelector(`#mute-checkbox-${index}${suffix}`);

    if (!slider || !display || !mute) return;

    const updateVolume = () => {
      const audioSource = audioSources[index];
      const gainNode = audioSource && (side ? audioSource[`${side}GainNode`] : audioSource.gainNode);
      
      if (mute.checked) {
        if (gainNode) gainNode.gain.value = 0;
        display.textContent = '-∞ dB';
        slider.disabled = true;
      } else {
        const db = parseFloat(slider.value);
        if (gainNode) gainNode.gain.value = dbToVolume(db);
        display.textContent = `${db.toFixed(1)} dB`;
        slider.disabled = false;
      }
    };

    // Initialize
    updateVolume();

    slider.addEventListener('input', updateVolume);
    mute.addEventListener('change', updateVolume);
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
