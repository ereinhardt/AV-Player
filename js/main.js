// Utility function for time formatting
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const tracks = document.querySelectorAll(".track");
  const loopCheckbox = document.getElementById("loop-checkbox");

  // Create separate AudioContext for each track to support individual device routing
  let audioContextContainer = {
    contexts: new Array(24).fill(null),
    masterGains: new Array(24).fill(null),
    masterVolume: 1.0,
  };
  let audioElements = new Array(24).fill(null); // Increased to 24 for 16 audio + 8 video tracks
  let audioSources = new Array(24).fill(null);

  // Make audioSources globally accessible for device management
  window.audioSources = audioSources;

  // Initial Load
  getAudioDevices();
  setupVideoTrackHandling();
  initializeArtNet(); // Initialize Art-Net timecode sending

  // Setup Listeners
  setupDeviceChangeListeners(audioElements, audioContextContainer);
  setupFileHandling(
    tracks,
    audioElements,
    audioSources,
    audioContextContainer,
    loopCheckbox
  );
  setupChannelSelection(tracks, audioSources, audioContextContainer);
  setupPlaybackControls(audioElements, audioContextContainer);
  setupVolumeControls(tracks, audioSources);
  setupMasterVolumeControl(audioContextContainer);
  setupMasterTimeline(audioElements);

  // Setup video loop synchronization
  loopCheckbox.addEventListener("change", () => {
    // Update video loop status when checkbox changes
    if (typeof updateVideoLoopStatus === "function") {
      updateVideoLoopStatus(loopCheckbox.checked);
    }
  });
});
