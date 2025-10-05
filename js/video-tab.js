// Video Tab Management
class VideoManager {
  constructor() {
    this.windows = {};
    this.states = {};
    this.syncPaused = false;
  }

  isWindowValid(trackIndex) {
    return this.windows[trackIndex] && !this.windows[trackIndex].closed;
  }

  postMessage(trackIndex, message) {
    if (this.isWindowValid(trackIndex)) {
      this.windows[trackIndex].postMessage(message, window.location.origin);
      return true;
    }
    return false;
  }

  shouldSkipAction(trackIndex) {
    return window._isVideoSyncing || 
      (!window.isVideoReset && !window.isLoopRestarting && 
       this.states[trackIndex]?.hasEnded);
  }
}

const videoManager = new VideoManager();
window.videoStates = videoManager.states;

const createVideoWindow = (trackIndex) => {
  if (videoManager.isWindowValid(trackIndex)) {
    videoManager.windows[trackIndex].focus();
    return videoManager.windows[trackIndex];
  }

  const windowFeatures = "width=800,height=600,scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no";

  try {
    videoManager.windows[trackIndex] = window.open("./video.html", `VideoPlayer_${trackIndex}`, windowFeatures);

    if (!videoManager.windows[trackIndex]) {
      alert("Video window could not be opened. Please allow popups for this site.");
      return null;
    }

    // Setup message handler for video window ready
    const handleWindowReady = (event) => {
      if (event.origin !== window.location.origin || event.data.type !== "VIDEO_WINDOW_READY") return;
      
      const pendingFile = window[`_pendingVideoFile_${trackIndex}`];
      const pendingAudio = window[`_pendingVideoAudio_${trackIndex}`];
      
      if (pendingFile) {
        loadVideoIntoWindow(pendingFile, pendingAudio, trackIndex);
      }
    };

    window.addEventListener("message", handleWindowReady);
    videoManager.windows[trackIndex]._messageHandler = handleWindowReady;
  } catch (error) {
    console.error("Failed to create video window:", error);
    return null;
  }

  return videoManager.windows[trackIndex];
};

const loadVideoIntoWindow = (videoFile, videoAudio, trackIndex) => {
  if (!videoManager.isWindowValid(trackIndex)) {
    createVideoWindow(trackIndex);
  }

  const videoWindow = videoManager.windows[trackIndex];
  if (!videoWindow) return;

  const sendVideoData = () => {
    try {
      const videoURL = URL.createObjectURL(videoFile);

      videoManager.postMessage(trackIndex, {
        type: "LOAD_VIDEO",
        data: { url: videoURL, filename: videoFile.name }
      });

      // Send current loop status
      const loopCheckbox = document.getElementById("loop-checkbox");
      if (loopCheckbox) {
        videoManager.postMessage(trackIndex, {
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
    if (videoManager.isWindowValid(trackIndex)) {
      sendVideoData();
    }
  }, 500);
};

const syncVideoWithAudio = (audio, trackIndex) => {
  if (!videoManager.isWindowValid(trackIndex)) return;

  let lastSyncTime = 0;
  let lastAudioTime = 0;

  // Helper functions
  const hasEnded = () => !window.isVideoReset && !window.isLoopRestarting && 
    (videoManager.states[trackIndex]?.hasEnded || 
     (audio?.tagName === "VIDEO" && (audio.ended || audio.currentTime >= audio.duration - 0.1)));

  const sendMessage = (type, data = {}) => videoManager.postMessage(trackIndex, { type, data });

  // Sync handlers
  const syncPlayPause = () => {
    if (videoManager.shouldSkipAction(trackIndex)) return;

    if (audio.paused) {
      sendMessage("PAUSE");
    } else if (hasEnded()) {
      return; // Don't play if ended
    } else {
      const messageType = (window.isLoopRestarting || window.isVideoReset) && audio.currentTime < 0.1 
        ? "RESTART_VIDEO" : "PLAY";
      sendMessage(messageType);
    }
  };

  const syncTime = () => {
    if (videoManager.shouldSkipAction(trackIndex) || videoManager.syncPaused || hasEnded()) return;

    const currentTime = audio.currentTime;
    const timeDiff = Math.abs(currentTime - lastAudioTime);
    const timeSinceLastSync = Date.now() - lastSyncTime;

    // Skip sync during loop operations
    if (currentTime < 1.0 && lastAudioTime > 10.0) {
      lastAudioTime = currentTime;
      return;
    }

    // Sync on major jumps or drift
    if (timeDiff > 1.0 || (timeSinceLastSync > 5000 && timeDiff > 0.3)) {
      lastSyncTime = Date.now();
      sendMessage("SEEK", { time: currentTime });
    }

    lastAudioTime = currentTime;
  };

  const syncSeek = () => {
    if (videoManager.shouldSkipAction(trackIndex)) return;
    sendMessage("SEEK", { time: audio.currentTime });
    lastAudioTime = audio.currentTime;
    lastSyncTime = Date.now();
  };

  const syncPlaybackRate = () => {
    if (videoManager.shouldSkipAction(trackIndex)) return;
    sendMessage("SET_PLAYBACK_RATE", { rate: audio.playbackRate });
  };

  // Clean up existing listeners
  if (audio._videoSyncListeners) {
    audio._videoSyncListeners.forEach(({ event, listener }) => {
      audio.removeEventListener(event, listener);
    });
  }

  // Setup event listeners
  const eventListeners = [
    ["play", syncPlayPause],
    ["pause", syncPlayPause],
    ["timeupdate", syncTime],
    ["ratechange", syncPlaybackRate],
    ["seeked", syncSeek]
  ];

  eventListeners.forEach(([event, listener]) => {
    audio.addEventListener(event, listener);
  });

  audio._videoSyncListeners = eventListeners.map(([event, listener]) => ({ event, listener }));

  // Initial sync
  setTimeout(() => {
    if (!videoManager.shouldSkipAction(trackIndex)) {
      syncPlayPause();
      if (audio.currentTime > 1.0) syncSeek();
      syncPlaybackRate();

      // Sync initial loop status
      const loopCheckbox = document.getElementById("loop-checkbox");
      if (loopCheckbox) {
        sendMessage("SET_LOOP", { loop: loopCheckbox.checked });
      }
    }
  }, 500);

  // Global sync control functions
  window.pauseVideoSync = () => { videoManager.syncPaused = true; };
  window.resumeVideoSync = () => { videoManager.syncPaused = false; };
};

// Update video loop status for all windows
const updateVideoLoopStatus = (isLooping) => {
  Object.keys(videoManager.windows).forEach((trackIndex) => {
    videoManager.postMessage(trackIndex, {
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

      if (!videoManager.isWindowValid(trackDataIndex)) {
        createVideoWindow(trackDataIndex);
        if (pendingFile) {
          loadVideoIntoWindow(pendingFile, pendingAudio, trackDataIndex);
        }
      } else {
        videoManager.windows[trackDataIndex].focus();
        // Reload video if window exists but needs refresh
        if (pendingFile) {
          loadVideoIntoWindow(pendingFile, pendingAudio, trackDataIndex);
        }
      }
    });
  });
};

// Make videoManager globally accessible for backward compatibility
window.videoWindows = videoManager.windows;
