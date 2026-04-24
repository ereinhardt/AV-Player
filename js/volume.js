/* Volume Controls — per-track + per-channel (video L/R) */

const setupVolumeControls = (tracks) => {
  const dbToVol = (db) => Math.pow(10, db / 20);

  const bind = (i, track, side = null) => {
    const s = side ? `-${side}` : "";
    const slider = track.querySelector(`#volume-slider-${i}${s}`);
    const display = track.querySelector(`#volume-db-${i}${s}`);
    const mute = track.querySelector(`#mute-checkbox-${i}${s}`);
    if (!slider || !display || !mute) return;

    const isVideoCh = side && track.classList.contains("video-track");

    const update = () => {
      const muted = mute.checked,
        db = parseFloat(slider.value),
        vol = dbToVol(db);
      display.textContent = muted ? "-∞ dB" : formatDb(db);
      slider.disabled = muted;
      if (isVideoCh) {
        const sc = side === "left" ? 0 : 1;
        sendAudioCommand("audio-set-channel-volume", {
          trackIndex: i,
          sourceChannel: sc,
          volume: vol,
        });
        sendAudioCommand("audio-set-channel-mute", {
          trackIndex: i,
          sourceChannel: sc,
          muted,
        });
      } else {
        sendAudioCommand("audio-set-volume", { trackIndex: i, volume: vol });
        sendAudioCommand("audio-set-mute", { trackIndex: i, muted });
      }
    };

    slider.addEventListener("input", update);
    mute.addEventListener("change", update);
    update();
  };

  tracks.forEach((track) => {
    const i = parseInt(track.dataset.index);
    track.classList.contains("video-track")
      ? ["left", "right"].forEach((s) => bind(i, track, s))
      : bind(i, track);
  });
};
