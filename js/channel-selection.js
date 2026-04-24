/* Channel Selection — UI 1-based, server 0-based — Naudiodon */

const handleChannelChange = (i, val, side, isVideo) => {
  const outputChannel = parseInt(val) - 1;
  const data = isVideo
    ? { trackIndex: i, sourceChannel: side === "left" ? 0 : 1, outputChannel }
    : { trackIndex: i, outputChannel, allSources: true };
  sendAudioCommand("audio-set-channel", data);
};

const setupChannelSelection = (tracks) => {
  tracks.forEach((track) => {
    const i = parseInt(track.dataset.index),
      isVideo = track.classList.contains("video-track");
    if (isVideo) {
      for (const side of ["left", "right"])
        track
          .querySelector(`#channel-select-${i}-${side}`)
          ?.addEventListener("change", (e) =>
            handleChannelChange(i, e.target.value, side, true),
          );
    } else {
      track
        .querySelector(".channel-select")
        ?.addEventListener("change", (e) =>
          handleChannelChange(i, e.target.value, null, false),
        );
    }
  });
};
