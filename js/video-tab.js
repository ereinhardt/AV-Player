class VideoManager {
  // Initialize video window manager with state tracking
  constructor() {
    this.windows = {};
    this.states = {};
    this.syncPaused = false;
    this.videoBlobUrls = {};
    this.windowEventListeners = {};
  }

  // Check if video window is valid and clean up if closed
  isValid(trackIndex) {
    const window = this.windows[trackIndex];
    const isValid = window && !window.closed;

    if (window && window.closed) {
      this.cleanupWindow(trackIndex);
    }

    return isValid;
  }

  // Send message to specific video window
  send(trackIndex, message) {
    if (this.isValid(trackIndex)) {
      this.windows[trackIndex].postMessage(message, window.location.origin);
    }
  }

  // Check if video sync should be skipped for track
  shouldSkip(trackIndex) {
    return (
      window._isVideoSyncing ||
      (!window.isVideoReset &&
        !window.isLoopRestarting &&
        this.states[trackIndex]?.hasEnded)
    );
  }

  // Create or focus video window for track
  createWindow(trackIndex) {
    if (this.isValid(trackIndex)) {
      this.windows[trackIndex].focus();
      return this.windows[trackIndex];
    }

    this.cleanupWindow(trackIndex);

    const videoWindow = window.open(
      "./video.html",
      `VideoPlayer_${trackIndex}`,
      "width=800,height=600,scrollbars=no,resizable=yes"
    );

    if (!videoWindow) {
      alert("Video window blocked. Please allow popups.");
      return null;
    }

    this.windows[trackIndex] = videoWindow;
    this.setupWindowCloseListener(trackIndex, videoWindow);
    return videoWindow;
  }

  // Set up listener to detect when window is closed by user
  setupWindowCloseListener(trackIndex, videoWindow) {
    const checkClosed = () => {
      if (videoWindow.closed) {
        this.cleanupWindow(trackIndex);
      } else {
        setTimeout(checkClosed, 1000);
      }
    };
    setTimeout(checkClosed, 1000);
  }

  // Clean up window and all associated resources
  cleanupWindow(trackIndex) {
    if (this.videoBlobUrls[trackIndex]) {
      URL.revokeObjectURL(this.videoBlobUrls[trackIndex]);
      delete this.videoBlobUrls[trackIndex];
    }

    if (this.windowEventListeners[trackIndex]) {
      this.windowEventListeners[trackIndex].forEach(
        ({ target, event, listener }) => {
          if (target && target.removeEventListener) {
            target.removeEventListener(event, listener);
          }
        }
      );
      delete this.windowEventListeners[trackIndex];
    }

    if (this.windows[trackIndex] && !this.windows[trackIndex].closed) {
      this.windows[trackIndex].close();
    }

    delete this.windows[trackIndex];
    delete this.states[trackIndex];
  }

  // Clean up all video windows
  cleanup() {
    Object.keys(this.windows).forEach((trackIndex) => {
      this.cleanupWindow(trackIndex);
    });
  }

  // Send message to all video windows
  sendToAll(message) {
    Object.keys(this.windows).forEach((trackIndex) =>
      this.send(trackIndex, message)
    );
  }
}

const videoManager = new VideoManager();

// Create safe getters for global access that handle cleanup
Object.defineProperty(window, "videoStates", {
  get() {
    return videoManager.states;
  },
  configurable: true,
});

Object.defineProperty(window, "videoWindows", {
  get() {
    return videoManager.windows;
  },
  configurable: true,
});

window.videoManager = videoManager;

// Load video file into popup window and sync with audio
const loadVideoIntoWindow = (videoFile, videoAudio, trackIndex) => {
  const sendVideoData = () => {
    try {
      if (videoManager.videoBlobUrls[trackIndex]) {
        URL.revokeObjectURL(videoManager.videoBlobUrls[trackIndex]);
      }

      const videoURL = URL.createObjectURL(videoFile);
      videoManager.videoBlobUrls[trackIndex] = videoURL;

      const loopCheckbox = document.getElementById("loop-checkbox");

      videoManager.send(trackIndex, {
        type: "LOAD_VIDEO",
        data: { url: videoURL, filename: videoFile.name },
      });

      if (loopCheckbox) {
        videoManager.send(trackIndex, {
          type: "SET_LOOP",
          data: { loop: loopCheckbox.checked },
        });
      }

      if (videoAudio) syncVideoWithAudio(videoAudio, trackIndex);
    } catch (error) {
      console.error("Error loading video:", error);
      setTimeout(sendVideoData, 1000);
    }
  };

  if (!videoManager.isValid(trackIndex)) {
    const newWindow = videoManager.createWindow(trackIndex);
    if (!newWindow) return;

    const onReady = (event) => {
      if (
        event.origin === window.location.origin &&
        event.data.type === "VIDEO_WINDOW_READY"
      ) {
        sendVideoData();
      }
    };

    newWindow.addEventListener("message", onReady);

    if (!videoManager.windowEventListeners[trackIndex]) {
      videoManager.windowEventListeners[trackIndex] = [];
    }
    videoManager.windowEventListeners[trackIndex].push({
      target: newWindow,
      event: "message",
      listener: onReady,
    });
  }

  setTimeout(() => {
    if (videoManager.isValid(trackIndex)) sendVideoData();
  }, 500);
};

// Synchronize video playback with audio element
const syncVideoWithAudio = (audio, trackIndex) => {
  if (!videoManager.isValid(trackIndex)) return;

  let lastSyncTime = 0;
  let lastAudioTime = 0;

  const shouldSync = () =>
    !videoManager.shouldSkip(trackIndex) && !videoManager.syncPaused;
  const hasEnded = () =>
    !window.isVideoReset &&
    !window.isLoopRestarting &&
    (videoManager.states[trackIndex]?.hasEnded ||
      (audio?.tagName === "VIDEO" &&
        (audio.ended || audio.currentTime >= audio.duration - 0.1)));

  const send = (type, data = {}) =>
    videoManager.send(trackIndex, { type, data });

  const syncPlayback = () => {
    if (!shouldSync()) return;

    if (audio.paused) {
      send("PAUSE");
    } else if (!hasEnded()) {
      const messageType =
        (window.isLoopRestarting || window.isVideoReset) &&
        audio.currentTime < 0.1
          ? "RESTART_VIDEO"
          : "PLAY";
      send(messageType);
    }
  };

  const syncTime = () => {
    if (!shouldSync() || hasEnded()) return;

    const currentTime = audio.currentTime;
    const timeDiff = Math.abs(currentTime - lastAudioTime);
    const timeSinceLastSync = Date.now() - lastSyncTime;

    if (currentTime < 1.0 && lastAudioTime > 10.0) {
      lastAudioTime = currentTime;
    } else if (timeDiff > 1.0 || (timeSinceLastSync > 5000 && timeDiff > 0.3)) {
      lastSyncTime = Date.now();
      send("SEEK", { time: currentTime });
    }
    lastAudioTime = currentTime;
  };

  const syncSeek = () => {
    if (!shouldSync()) return;
    send("SEEK", { time: audio.currentTime });
    lastAudioTime = audio.currentTime;
    lastSyncTime = Date.now();
  };

  const listeners = [
    ["play", syncPlayback],
    ["pause", syncPlayback],
    ["timeupdate", syncTime],
    [
      "ratechange",
      () =>
        shouldSync() && send("SET_PLAYBACK_RATE", { rate: audio.playbackRate }),
    ],
    ["seeked", syncSeek],
  ];

  if (audio._videoSyncListeners) {
    audio._videoSyncListeners.forEach(({ event, listener }) =>
      audio.removeEventListener(event, listener)
    );
    audio._videoSyncListeners = null;
  }

  listeners.forEach(([event, listener]) =>
    audio.addEventListener(event, listener)
  );
  audio._videoSyncListeners = listeners.map(([event, listener]) => ({
    event,
    listener,
  }));

  if (!videoManager.windowEventListeners[trackIndex]) {
    videoManager.windowEventListeners[trackIndex] = [];
  }

  listeners.forEach(([event, listener]) => {
    videoManager.windowEventListeners[trackIndex].push({
      target: audio,
      event: event,
      listener: listener,
    });
  });

  setTimeout(() => {
    if (shouldSync()) {
      syncPlayback();
      if (audio.currentTime > 1.0) syncSeek();
      send("SET_PLAYBACK_RATE", { rate: audio.playbackRate });

      const loopCheckbox = document.getElementById("loop-checkbox");
      if (loopCheckbox) send("SET_LOOP", { loop: loopCheckbox.checked });
    }
  }, 500);

  window.pauseVideoSync = () => {
    videoManager.syncPaused = true;
  };
  window.resumeVideoSync = () => {
    videoManager.syncPaused = false;
  };
};

// Update video loop status for all windows
const updateVideoLoopStatus = (isLooping) => {
  videoManager.sendToAll({
    type: "SET_LOOP",
    data: { loop: isLooping },
  });
};

// Set up video track button handlers for opening video windows
const setupVideoTrackHandling = () => {
  document.querySelectorAll(".video-track").forEach((track) => {
    const btn = track.querySelector(".video-window-btn");
    const trackIndex = parseInt(track.getAttribute("data-index"));

    if (!btn) return;

    btn.addEventListener("click", () => {
      const file = window[`_pendingVideoFile_${trackIndex}`];
      const audio = window[`_pendingVideoAudio_${trackIndex}`];

      if (!videoManager.isValid(trackIndex)) {
        videoManager.createWindow(trackIndex);
      } else {
        videoManager.windows[trackIndex].focus();
      }

      if (file) loadVideoIntoWindow(file, audio, trackIndex);
    });
  });
};

// Close all video windows
window.closeAllVideoWindows = () => {
  videoManager.cleanup();
};

// Clean up specific video window
window.cleanupVideoWindow = (trackIndex) => {
  videoManager.cleanupWindow(trackIndex);
};

window.addEventListener("beforeunload", () => {
  videoManager.cleanup();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    Object.keys(videoManager.windows).forEach((trackIndex) => {
      if (videoManager.isValid(trackIndex)) {
        videoManager.windows[trackIndex].blur();
      }
    });
  }
});

setInterval(() => {
  Object.keys(videoManager.windows).forEach((trackIndex) => {
    if (
      videoManager.windows[trackIndex] &&
      videoManager.windows[trackIndex].closed
    ) {
      videoManager.cleanupWindow(trackIndex);
    }
  });
}, 5000);
