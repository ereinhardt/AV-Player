// Set up master timeline with progress bar and Art-Net timecode integration
function setupMasterTimeline(audioElements) {
  const progressBar = document.getElementById("master-timeline-progress");
  const timeDisplay = document.getElementById("master-time-display");

  if (!progressBar || !timeDisplay) {
    console.warn("Master timeline elements not found");
    return;
  }

  // Track last triggered times to avoid duplicate triggers
  let lastUdpTriggerTime = -1;
  let lastOscTriggerTime = -1;
  let lastCurrentTime = 0;

  // Update timeline display and send Art-Net timecode based on longest audio track
  const updateMasterTimeline = () => {
    const longestAudio = audioElements.reduce(
      (longest, audio) =>
        audio?.duration > (longest?.duration || 0) ? audio : longest,
      null
    );

    if (longestAudio?.duration) {
      const { currentTime, duration } = longestAudio;

      timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(
        duration
      )}`;
      progressBar.value = (currentTime / duration) * 100;

      // Reset triggers if we've jumped backward in time (loop restart or manual seek)
      if (currentTime < lastCurrentTime - 1) {
        lastUdpTriggerTime = -1;
        lastOscTriggerTime = -1;
      }
      lastCurrentTime = currentTime;

      // Only send triggers if audio is actually playing
      const isPlaying = !longestAudio.paused && !longestAudio.ended;

      // Check and send UDP trigger at specified time
      if (isPlaying && window.udpTrigger?.enabled && window.udpTrigger.triggerTime !== undefined) {
        const triggerTime = window.udpTrigger.triggerTime;
        const tolerance = 0.5; // 500ms tolerance
        if (Math.abs(currentTime - triggerTime) < tolerance && lastUdpTriggerTime !== triggerTime) {
          lastUdpTriggerTime = triggerTime;
          window.udpTrigger.sendTrigger("start");
        }
      }

      // Check and send OSC trigger at specified time
      if (isPlaying && window.oscTrigger?.enabled && window.oscTrigger.triggerTime !== undefined) {
        const triggerTime = window.oscTrigger.triggerTime;
        const tolerance = 0.5; // 500ms tolerance
        if (Math.abs(currentTime - triggerTime) < tolerance && lastOscTriggerTime !== triggerTime) {
          lastOscTriggerTime = triggerTime;
          window.oscTrigger.sendTrigger("start");
        }
      }

      if (currentTime > 0 && window.artNetTimecode?.sendTimecode) {
        const timecode = window.artNetTimecode.sendTimecode(
          currentTime,
          duration
        );
        if (timecode) {
          console.debug(
            `Art-Net: ${timecode.formatted} → ${window.artNetTimecode.ip}:${window.artNetTimecode.port}`
          );
        }
      }
    } else {
      timeDisplay.textContent = "00:00:00 / 00:00:00";
      progressBar.value = 0;
    }
  };

  setInterval(updateMasterTimeline, 250);
  document.addEventListener("fileLoaded", updateMasterTimeline);
}
