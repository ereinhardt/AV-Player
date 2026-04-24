/* Master Timeline — driven by server position updates */

function setupMasterTimeline() {
  const bar = document.getElementById("master-timeline-progress");
  const disp = document.getElementById("master-time-display");
  if (!bar || !disp) return;

  let lastTime = 0,
    lastPlaying = false;

  window.handleAudioPositionUpdate = ({
    position,
    duration,
    isPlaying,
    trackDurations,
  }) => {
    disp.textContent = `${formatTime(position)} | ${formatTime(duration)}`;
    bar.value = duration > 0 ? (position / duration) * 100 : 0;

    if (trackDurations) {
      for (const [idx, dur] of Object.entries(trackDurations)) {
        const t = document.querySelector(
          `.audio-track[data-index="${idx}"], .video-track[data-index="${idx}"]`,
        );
        if (!t) continue;
        const p = Math.min(position, dur);
        const prog = t.querySelector(".timeline-progress");
        const td = t.querySelector(".time-display");
        if (prog) prog.value = dur > 0 ? (p / dur) * 100 : 0;
        if (td) td.textContent = `${formatTime(p)} | ${formatTime(dur)}`;
      }
    }

    // Loop detection (position jumps backwards while playing)
    if (position < lastTime - 1) {
      window.udpTriggerManager?.resetAllTriggers();
      window.oscTriggerManager?.resetAllTriggers();
      window.midiBpm?.resetFirstBeat();
      if (isPlaying) {
        const vm = window.videoManager;
        if (vm)
          for (let i = 24; i <= 31; i++)
            vm.isValid(i) && vm.send(i, { type: "RESTART_VIDEO" });
      }
    }
    lastTime = position;

    if (position > 0) window.artNetTimecode?.sendTimecode(position, duration);
    window.udpTriggerManager?.checkAllTriggers(position, isPlaying);
    window.oscTriggerManager?.checkAllTriggers(position, isPlaying);
    window.midiBpm?.checkStartTime(position);

    if (!isPlaying && lastPlaying)
      window.dispatchEvent(
        new CustomEvent("audio-transport-update", {
          detail: { action: "ended" },
        }),
      );
    lastPlaying = isPlaying;
  };
}
