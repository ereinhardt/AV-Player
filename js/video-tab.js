/* Video Window Manager — popup windows for video tracks */

class VideoManager {
  constructor() {
    Object.assign(this, {
      windows: {},
      blobUrls: {},
      listeners: {},
    });
  }

  isValid(i) {
    if (this.windows[i]?.closed) this.cleanupWindow(i);
    return this.windows[i] && !this.windows[i].closed;
  }

  send(i, msg) {
    if (this.isValid(i)) this.windows[i].postMessage(msg, location.origin);
  }
  sendToAll(msg) {
    Object.keys(this.windows).forEach((i) => this.send(i, msg));
  }

  // Re-sync every open video window to the current audio position.
  // Called e.g. when one window is resized so the others don't drift.
  resyncAll() {
    const pos = window._lastAudioPosition?.position;
    if (typeof pos !== "number") return;
    const playing = document
      .getElementById("play-pause-button")
      ?.classList.contains("playing");
    this.sendToAll({ type: "SEEK", data: { time: pos } });
    if (playing) this.sendToAll({ type: "PLAY" });
  }

  createWindow(i) {
    if (this.isValid(i)) {
      this.windows[i].focus();
      return this.windows[i];
    }
    this.cleanupWindow(i);
    const w = window.open(
      "./video.html",
      `VideoPlayer_${i}`,
      "width=800,height=600,scrollbars=no,resizable=yes",
    );
    if (!w) {
      alert("Video window blocked. Please allow popups.");
      return null;
    }
    this.windows[i] = w;
    return w;
  }

  cleanupWindow(i) {
    if (this.blobUrls[i]) {
      URL.revokeObjectURL(this.blobUrls[i]);
      delete this.blobUrls[i];
    }
    this.listeners[i]?.forEach(({ target: t, event: e, listener: l }) =>
      t?.removeEventListener?.(e, l),
    );
    delete this.listeners[i];
    if (this.windows[i] && !this.windows[i].closed) this.windows[i].close();
    delete this.windows[i];
  }

  cleanup() {
    Object.keys(this.windows).forEach((i) => this.cleanupWindow(i));
  }
}

const videoManager = new VideoManager();
Object.defineProperty(window, "videoWindows", {
  get: () => videoManager.windows,
  configurable: true,
});
window.videoManager = videoManager;

const loadVideoIntoWindow = (file, i) => {
  const send = () => {
    try {
      if (videoManager.blobUrls[i])
        URL.revokeObjectURL(videoManager.blobUrls[i]);
      const url = URL.createObjectURL(file);
      videoManager.blobUrls[i] = url;
      const num =
        document
          .querySelector(`.video-track[data-index="${i}"] label`)
          ?.textContent?.match(/Video Track (\d+)/)?.[1] || i - 23;
      videoManager.send(i, {
        type: "LOAD_VIDEO",
        data: { url, filename: file.name },
      });
      videoManager.send(i, {
        type: "SET_TITLE",
        data: { title: `Video Track ${num}` },
      });
      const loop = document.getElementById("loop-checkbox");
      if (loop)
        videoManager.send(i, {
          type: "SET_LOOP",
          data: { loop: loop.checked },
        });
      // Ensure a newly loaded video never auto-plays — it must wait
      // for the next loop/reset so all tracks restart together.
      videoManager.send(i, { type: "SEEK", data: { time: 0 } });
      videoManager.send(i, { type: "PAUSE" });
    } catch {
      setTimeout(send, 1000);
    }
  };

  if (!videoManager.isValid(i)) {
    const w = videoManager.createWindow(i);
    if (!w) return;
    const onReady = (e) => {
      if (e.origin === location.origin && e.data.type === "VIDEO_WINDOW_READY")
        send();
    };
    w.addEventListener("message", onReady);
    (videoManager.listeners[i] ??= []).push({
      target: w,
      event: "message",
      listener: onReady,
    });
  }
  setTimeout(() => videoManager.isValid(i) && send(), 500);
};

const updateVideoLoopStatus = (loop) =>
  videoManager.sendToAll({ type: "SET_LOOP", data: { loop } });

const setupVideoTrackHandling = () => {
  document.querySelectorAll(".video-track").forEach((track) => {
    const btn = track.querySelector(".video-window-btn"),
      i = parseInt(track.dataset.index);
    btn?.addEventListener("click", () => {
      videoManager.createWindow(i);
      const file = window[`_pendingVideoFile_${i}`];
      if (file) loadVideoIntoWindow(file, i);
    });
  });
};

window.addEventListener("beforeunload", () => videoManager.cleanup());
setInterval(
  () =>
    Object.keys(videoManager.windows).forEach(
      (i) => videoManager.windows[i]?.closed && videoManager.cleanupWindow(i),
    ),
  5000,
);
