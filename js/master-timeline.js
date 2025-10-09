// Set up master timeline with progress bar and Art-Net timecode integration
function setupMasterTimeline(audioElements) {
  const progressBar = document.getElementById("master-timeline-progress");
  const timeDisplay = document.getElementById("master-time-display");

  if (!progressBar || !timeDisplay) {
    console.warn("Master timeline elements not found");
    return;
  }

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
