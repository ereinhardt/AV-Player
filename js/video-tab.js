// Video Tab Management
class VideoManager {
  constructor() {
    this.windows = {};
    this.states = {};
    this.syncPaused = false;
  }

  isValid(trackIndex) {
    return this.windows[trackIndex] && !this.windows[trackIndex].closed;
  }

  send(trackIndex, message) {
    if (this.isValid(trackIndex)) {
      this.windows[trackIndex].postMessage(message, window.location.origin);
    }
  }

  shouldSkip(trackIndex) {
    return window._isVideoSyncing || 
      (!window.isVideoReset && !window.isLoopRestarting && this.states[trackIndex]?.hasEnded);
  }
}

const videoManager = new VideoManager();
window.videoStates = videoManager.states;

const createVideoWindow = (trackIndex) => {
  if (videoManager.isValid(trackIndex)) {
    videoManager.windows[trackIndex].focus();
    return videoManager.windows[trackIndex];
  }

  const features = "width=800,height=600,scrollbars=no,resizable=yes";
  
  try {
    const videoWindow = window.open("./video.html", `VideoPlayer_${trackIndex}`, features);
    
    if (!videoWindow) {
      alert("Video window blocked. Please allow popups.");
      return null;
    }

    videoManager.windows[trackIndex] = videoWindow;

    // Handle window ready message
    const onReady = (event) => {
      if (event.origin === window.location.origin && event.data.type === "VIDEO_WINDOW_READY") {
        const file = window[`_pendingVideoFile_${trackIndex}`];
        const audio = window[`_pendingVideoAudio_${trackIndex}`];
        if (file) loadVideoIntoWindow(file, audio, trackIndex);
      }
    };

    window.addEventListener("message", onReady);
    return videoWindow;
  } catch (error) {
    console.error("Failed to create video window:", error);
    return null;
  }
};

const loadVideoIntoWindow = (videoFile, videoAudio, trackIndex) => {
  if (!videoManager.isValid(trackIndex)) {
    createVideoWindow(trackIndex);
  }

  const sendVideoData = () => {
    try {
      const videoURL = URL.createObjectURL(videoFile);
      
      videoManager.send(trackIndex, {
        type: "LOAD_VIDEO",
        data: { url: videoURL, filename: videoFile.name }
      });

      // Send loop status
      const loopCheckbox = document.getElementById("loop-checkbox");
      if (loopCheckbox) {
        videoManager.send(trackIndex, {
          type: "SET_LOOP",
          data: { loop: loopCheckbox.checked }
        });
      }

      // Setup sync
      if (videoAudio) {
        syncVideoWithAudio(videoAudio, trackIndex);
      }
    } catch (error) {
      console.error("Error loading video:", error);
      setTimeout(sendVideoData, 1000);
    }
  };

  setTimeout(() => {
    if (videoManager.isValid(trackIndex)) sendVideoData();
  }, 500);
};

const syncVideoWithAudio = (audio, trackIndex) => {
  if (!videoManager.isValid(trackIndex)) return;

  let lastSyncTime = 0;
  let lastAudioTime = 0;

  const hasEnded = () => !window.isVideoReset && !window.isLoopRestarting && 
    (videoManager.states[trackIndex]?.hasEnded || 
     (audio?.tagName === "VIDEO" && (audio.ended || audio.currentTime >= audio.duration - 0.1)));

  const send = (type, data = {}) => videoManager.send(trackIndex, { type, data });

  // Sync functions
  const syncPlayPause = () => {
    if (videoManager.shouldSkip(trackIndex)) return;

    if (audio.paused) {
      send("PAUSE");
    } else if (!hasEnded()) {
      const messageType = (window.isLoopRestarting || window.isVideoReset) && audio.currentTime < 0.1 
        ? "RESTART_VIDEO" : "PLAY";
      send(messageType);
    }
  };

  const syncTime = () => {
    if (videoManager.shouldSkip(trackIndex) || videoManager.syncPaused || hasEnded()) return;

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
      send("SEEK", { time: currentTime });
    }

    lastAudioTime = currentTime;
  };

  const syncSeek = () => {
    if (videoManager.shouldSkip(trackIndex)) return;
    send("SEEK", { time: audio.currentTime });
    lastAudioTime = audio.currentTime;
    lastSyncTime = Date.now();
  };

  const syncRate = () => {
    if (videoManager.shouldSkip(trackIndex)) return;
    send("SET_PLAYBACK_RATE", { rate: audio.playbackRate });
  };

  // Clean up and setup event listeners
  if (audio._videoSyncListeners) {
    audio._videoSyncListeners.forEach(({ event, listener }) => {
      audio.removeEventListener(event, listener);
    });
  }

  const listeners = [
    ["play", syncPlayPause],
    ["pause", syncPlayPause], 
    ["timeupdate", syncTime],
    ["ratechange", syncRate],
    ["seeked", syncSeek]
  ];

  listeners.forEach(([event, listener]) => audio.addEventListener(event, listener));
  audio._videoSyncListeners = listeners.map(([event, listener]) => ({ event, listener }));

  // Initial sync
  setTimeout(() => {
    if (!videoManager.shouldSkip(trackIndex)) {
      syncPlayPause();
      if (audio.currentTime > 1.0) syncSeek();
      syncRate();

      // Set initial loop status
      const loopCheckbox = document.getElementById("loop-checkbox");
      if (loopCheckbox) {
        send("SET_LOOP", { loop: loopCheckbox.checked });
      }
    }
  }, 500);

  // Global sync controls
  window.pauseVideoSync = () => { videoManager.syncPaused = true; };
  window.resumeVideoSync = () => { videoManager.syncPaused = false; };
};

// Update video loop status for all windows
const updateVideoLoopStatus = (isLooping) => {
  Object.keys(videoManager.windows).forEach((trackIndex) => {
    videoManager.send(trackIndex, {
      type: "SET_LOOP",
      data: { loop: isLooping }
    });
  });
};

// Setup video track button handlers
const setupVideoTrackHandling = () => {
  document.querySelectorAll(".video-track").forEach((track) => {
    const btn = track.querySelector(".video-window-btn");
    const trackIndex = parseInt(track.getAttribute("data-index"));

    if (!btn) return;

    btn.addEventListener("click", () => {
      const file = window[`_pendingVideoFile_${trackIndex}`];
      const audio = window[`_pendingVideoAudio_${trackIndex}`];

      if (!videoManager.isValid(trackIndex)) {
        createVideoWindow(trackIndex);
        if (file) loadVideoIntoWindow(file, audio, trackIndex);
      } else {
        videoManager.windows[trackIndex].focus();
        if (file) loadVideoIntoWindow(file, audio, trackIndex);
      }
    });
  });
};

// Global exports for backward compatibility
window.videoStates = videoManager.states;
window.videoWindows = videoManager.windows;
