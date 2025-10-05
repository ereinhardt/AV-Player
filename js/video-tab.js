// Video Tab Management
const videoWindows = {};
window.videoStates = window.videoStates || {};

// Utility functions
const isWindowValid = (trackIndex) => 
  videoWindows[trackIndex] && !videoWindows[trackIndex].closed;

const postToVideoWindow = (trackIndex, message) => {
  if (isWindowValid(trackIndex)) {
    videoWindows[trackIndex].postMessage(message, window.location.origin);
    return true;
  }
  return false;
};

const shouldSkipVideoAction = (trackIndex) => {
  return window._isVideoSyncing || 
    (!window.isVideoReset && !window.isLoopRestarting && 
     window.videoStates?.[trackIndex]?.hasEnded);
};

const createVideoWindow = (trackIndex) => {
  if (isWindowValid(trackIndex)) {
    videoWindows[trackIndex].focus();
    return videoWindows[trackIndex];
  }

  const windowFeatures = "width=800,height=600,scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no";

  try {
    videoWindows[trackIndex] = window.open("./video.html", `VideoPlayer_${trackIndex}`, windowFeatures);

    if (!videoWindows[trackIndex]) {
      alert("Video window could not be opened. Please allow popups for this site.");
      return null;
    }

    // Listen for video window ready message
    const messageHandler = (event) => {
      if (event.origin !== window.location.origin || event.data.type !== "VIDEO_WINDOW_READY") return;
      
      const pendingFile = window[`_pendingVideoFile_${trackIndex}`];
      const pendingAudio = window[`_pendingVideoAudio_${trackIndex}`];
      
      if (pendingFile) {
        loadVideoIntoWindow(pendingFile, pendingAudio, trackIndex);
      }
    };

    window.addEventListener("message", messageHandler);
    videoWindows[trackIndex]._messageHandler = messageHandler;
  } catch (error) {
    console.error("Failed to create video window:", error);
    return null;
  }

  return videoWindows[trackIndex];
};

const loadVideoIntoWindow = (videoFile, videoAudio, trackIndex) => {
  if (!isWindowValid(trackIndex)) {
    createVideoWindow(trackIndex);
  }

  const videoWindow = videoWindows[trackIndex];
  if (!videoWindow) return;

  const sendVideoData = () => {
    try {
      const videoURL = URL.createObjectURL(videoFile);

      postToVideoWindow(trackIndex, {
        type: "LOAD_VIDEO",
        data: { url: videoURL, filename: videoFile.name }
      });

      // Send current loop status
      const loopCheckbox = document.getElementById("loop-checkbox");
      if (loopCheckbox) {
        postToVideoWindow(trackIndex, {
          type: "SET_LOOP",
          data: { loop: loopCheckbox.checked }
        });
      }

      // Set up synchronization
      if (videoAudio) {
        syncVideoWithAudio(videoAudio, trackIndex);
      }
    } catch (error) {
      console.error("Error sending video data:", error);
      setTimeout(sendVideoData, 1000);
    }
  };

  // Wait for window to be ready, then send data
  setTimeout(() => {
    if (isWindowValid(trackIndex)) {
      sendVideoData();
    }
  }, 500);
};

const syncVideoWithAudio = (audio, trackIndex) => {
  if (!isWindowValid(trackIndex)) return;

  // Sync state management
  let lastSyncTime = 0;
  let lastAudioTime = 0;
  let syncPaused = false;

  // Global sync control functions
  window.pauseVideoSync = () => { syncPaused = true; };
  window.resumeVideoSync = () => { syncPaused = false; };

  // Helper to check if audio/video has ended
  const hasEnded = () => {
    return !window.isVideoReset && !window.isLoopRestarting && 
           (window.videoStates?.[trackIndex]?.hasEnded ||
            (audio?.tagName === "VIDEO" && (audio.ended || audio.currentTime >= audio.duration - 0.1)));
  };

  // Sync play/pause state
  const syncPlayPause = () => {
    if (shouldSkipVideoAction(trackIndex)) return;

    const message = { type: audio.paused ? "PAUSE" : "PLAY" };
    
    if (!audio.paused) {
      if (window.isLoopRestarting || window.isVideoReset) {
        message.type = audio.currentTime < 0.1 ? "RESTART_VIDEO" : "PLAY";
      } else if (hasEnded()) {
        return; // Don't play if ended
      }
    }

    postToVideoWindow(trackIndex, message);
  };

  // Sync time position
  const syncTime = () => {
    if (shouldSkipVideoAction(trackIndex) || syncPaused || hasEnded()) return;

    const currentAudioTime = audio.currentTime;
    const timeDiff = Math.abs(currentAudioTime - lastAudioTime);
    const timeSinceLastSync = Date.now() - lastSyncTime;

    // Skip sync during loop operations (time jumps back to 0)
    if (currentAudioTime < 1.0 && lastAudioTime > 10.0) {
      lastAudioTime = currentAudioTime;
      return;
    }

    // Sync on major jumps or significant drift
    if (timeDiff > 1.0 || (timeSinceLastSync > 5000 && timeDiff > 0.3)) {
      lastSyncTime = Date.now();
      postToVideoWindow(trackIndex, {
        type: "SEEK",
        data: { time: currentAudioTime }
      });
    }

    lastAudioTime = currentAudioTime;
  };

  // Sync seeking
  const syncSeek = () => {
    if (shouldSkipVideoAction(trackIndex)) return;

    postToVideoWindow(trackIndex, {
      type: "SEEK",
      data: { time: audio.currentTime }
    });

    lastAudioTime = audio.currentTime;
    lastSyncTime = Date.now();
  };

  // Sync playback rate
  const syncPlaybackRate = () => {
    if (shouldSkipVideoAction(trackIndex)) return;

    postToVideoWindow(trackIndex, {
      type: "SET_PLAYBACK_RATE",
      data: { rate: audio.playbackRate }
    });
  };

  // Clean up existing listeners
  if (audio._videoSyncListeners) {
    audio._videoSyncListeners.forEach(({ event, listener }) => {
      audio.removeEventListener(event, listener);
    });
  }

  // Add event listeners
  const listeners = [
    { event: "play", listener: syncPlayPause },
    { event: "pause", listener: syncPlayPause },
    { event: "timeupdate", listener: syncTime },
    { event: "ratechange", listener: syncPlaybackRate },
    { event: "seeked", listener: syncSeek }
  ];

  listeners.forEach(({ event, listener }) => {
    audio.addEventListener(event, listener);
  });

  audio._videoSyncListeners = listeners;

  // Initial sync
  setTimeout(() => {
    if (!shouldSkipVideoAction(trackIndex)) {
      syncPlayPause();
      if (audio.currentTime > 1.0) syncSeek();
      syncPlaybackRate();

      // Sync initial loop status
      const loopCheckbox = document.getElementById("loop-checkbox");
      if (loopCheckbox) {
        postToVideoWindow(trackIndex, {
          type: "SET_LOOP",
          data: { loop: loopCheckbox.checked }
        });
      }
    }
  }, 500);
};

// Update video loop status for all windows
const updateVideoLoopStatus = (isLooping) => {
  Object.keys(videoWindows).forEach((trackIndex) => {
    postToVideoWindow(trackIndex, {
      type: "SET_LOOP",
      data: { loop: isLooping }
    });
  });
};

// Setup video track button handlers
const setupVideoTrackHandling = () => {
  const videoTracks = document.querySelectorAll(".video-track");

  videoTracks.forEach((videoTrack) => {
    const videoWindowBtn = videoTrack.querySelector(".video-window-btn");
    const trackDataIndex = parseInt(videoTrack.getAttribute("data-index"));

    if (!videoWindowBtn) return;

    videoWindowBtn.addEventListener("click", () => {
      const pendingFile = window[`_pendingVideoFile_${trackDataIndex}`];
      const pendingAudio = window[`_pendingVideoAudio_${trackDataIndex}`];

      if (!isWindowValid(trackDataIndex)) {
        createVideoWindow(trackDataIndex);
        if (pendingFile) {
          loadVideoIntoWindow(pendingFile, pendingAudio, trackDataIndex);
        }
      } else {
        videoWindows[trackDataIndex].focus();
        // Reload video if window exists but needs refresh
        if (pendingFile) {
          loadVideoIntoWindow(pendingFile, pendingAudio, trackDataIndex);
        }
      }
    });
  });
};

// Make videoWindows globally accessible
window.videoWindows = videoWindows;
