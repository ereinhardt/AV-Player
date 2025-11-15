// Set up master timeline with progress bar and Art-Net timecode integration
function setupMasterTimeline(audioElements) {
  const progressBar = document.getElementById("master-timeline-progress");
  const timeDisplay = document.getElementById("master-time-display");

  if (!progressBar || !timeDisplay) {
    console.warn("Master timeline elements not found");
    return;
  }

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

      timeDisplay.textContent = `${formatTime(currentTime)} | ${formatTime(
        duration
      )}`;
      progressBar.value = (currentTime / duration) * 100;

      // Reset triggers if we've jumped backward in time (loop restart or manual seek)
      if (currentTime < lastCurrentTime - 1) {
        // Reset all UDP triggers
        if (window.udpTriggerManager) {
          window.udpTriggerManager.resetAllTriggers();
        }
        // Reset all OSC triggers
        if (window.oscTriggerManager) {
          window.oscTriggerManager.resetAllTriggers();
        }
        // Reset MIDI Clock first beat flag
        if (window.midiBpm) {
          window.midiBpm.resetFirstBeat();
        }
      }
      lastCurrentTime = currentTime;

      // Only send triggers if audio is actually playing
      const isPlaying = !longestAudio.paused && !longestAudio.ended;

      // Check and send all UDP triggers at their specified times
      if (window.udpTriggerManager) {
        window.udpTriggerManager.checkAllTriggers(currentTime, isPlaying);
      }

      // Check and send all OSC triggers at their specified times
      if (window.oscTriggerManager) {
        window.oscTriggerManager.checkAllTriggers(currentTime, isPlaying);
      }

      // Check MIDI Clock start time for first beat
      if (window.midiBpm) {
        window.midiBpm.checkStartTime(currentTime);
      }

      if (currentTime > 0 && window.artNetTimecode?.sendTimecode) {
        window.artNetTimecode.sendTimecode(currentTime, duration);
      }
    } else {
      timeDisplay.textContent = "00:00:00 | 00:00:00";
      progressBar.value = 0;
    }
  };

  setInterval(updateMasterTimeline, 50);
  document.addEventListener("fileLoaded", updateMasterTimeline);
}
