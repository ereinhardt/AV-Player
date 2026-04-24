/* Playback Controls — server-side play/pause/reset */

const setupPlaybackControls = () => {
  const playBtn = document.getElementById("play-pause-button");
  const resetBtn = document.getElementById("reset-button");
  let playing = false;

  const videoCmd = (type, data) => {
    const vm = window.videoManager;
    if (vm)
      for (let i = 24; i <= 31; i++)
        vm.isValid(i) && vm.send(i, { type, data });
  };

  const setPlaying = (state) => {
    playing = state;
    playBtn.textContent = state ? "Pause" : "Play";
    playBtn.classList.toggle("playing", state);
  };

  playBtn.addEventListener("click", () => {
    if (!window.trackMetadata || !Object.keys(window.trackMetadata).length)
      return alert("Please add at least one file.");
    setPlaying(!playing);
    if (playing) {
      sendAudioCommand("audio-play");
      videoCmd("SEEK", { time: window._lastAudioPosition?.position || 0 });
      videoCmd("PLAY");
      window.midiBpm?.enabled && window.midiBpm.start();
    } else {
      sendAudioCommand("audio-pause");
      videoCmd("PAUSE");
      window.midiBpm?.enabled && window.midiBpm.stop();
    }
  });

  resetBtn.addEventListener("click", () => {
    setPlaying(false);
    sendAudioCommand("audio-reset");
    window.midiBpm?.enabled && window.midiBpm.stop();
    videoCmd("RESET_VIDEO");
  });

  window.addEventListener("audio-transport-update", (e) => {
    if (e.detail?.action === "ended") setPlaying(false);
  });
};
