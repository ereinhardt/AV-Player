function setupMasterTimeline(audioElements) {
  const progressBar = document.getElementById("master-timeline-progress");
  const timeDisplay = document.getElementById("master-time-display");
  
  // Early return if DOM elements are missing
  if (!progressBar || !timeDisplay) {
    console.warn("Master timeline elements not found");
    return;
  }

  function updateMasterTimeline() {
    // Find the audio with the longest duration
    const longestAudio = audioElements.reduce((longest, audio) => {
      return audio?.duration > (longest?.duration || 0) ? audio : longest;
    }, null);

    if (longestAudio?.duration) {
      const { currentTime, duration } = longestAudio;
      
      // Update display and progress
      timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
      progressBar.value = (currentTime / duration) * 100;

      // Send Art-Net timecode if enabled and playing
      if (currentTime > 0 && window.artNetTimecode?.sendTimecode) {
        const timecode = window.artNetTimecode.sendTimecode(currentTime, duration);
        if (timecode) {
          console.debug(`Art-Net: ${timecode.formatted} → ${window.artNetTimecode.ip}:${window.artNetTimecode.port}`);
        }
      }
    } else {
      // Reset to default state
      timeDisplay.textContent = "00:00:00 / 00:00:00";
      progressBar.value = 0;
    }
  }

  // Update every 250ms and on file load events
  setInterval(updateMasterTimeline, 250);
  document.addEventListener("fileLoaded", updateMasterTimeline);
}
