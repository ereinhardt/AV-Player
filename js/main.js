const formatTime = (s) =>
  !isFinite(s) || s < 0
    ? "00:00:00"
    : [s / 3600, (s % 3600) / 60, s % 60]
        .map((n) => String(Math.floor(n)).padStart(2, "0"))
        .join(":");

const formatDb = (db) => {
  if (!isFinite(db)) return "-\u221E dB";
  const sign = db < 0 ? "-" : "";
  const [i, f] = Math.abs(db).toFixed(1).split(".");
  return `${sign}${i.padStart(2, "0")}.${f} dB`;
};

const isValidIP = (ip) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
  ip.split(".").every((p) => parseInt(p) <= 255);

const calculateBroadcastIP = (ip) => {
  const p = ip?.split(".");
  return p?.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.255` : "192.168.1.255";
};

const getUserIP = async () => {
  try {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pc.createDataChannel("");
    await pc.setLocalDescription(await pc.createOffer());
    return new Promise((resolve) => {
      let done = false;
      pc.onicecandidate = (e) => {
        if (done || !e?.candidate?.candidate) return;
        const m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (m && !m[1].startsWith("127.") && !m[1].startsWith("169.254.")) {
          done = true;
          pc.close();
          resolve(m[1]);
        }
      };
      setTimeout(() => {
        if (!done) {
          done = true;
          pc.close();
          resolve(null);
        }
      }, 2000);
    });
  } catch {
    return null;
  }
};

const getCurrentNetworkBroadcast = async () =>
  calculateBroadcastIP(await getUserIP().catch(() => null));

const createWebSocketConnection = (onOpen, onMessage, onClose) => {
  const ws = new WebSocket(
    `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`,
  );
  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onclose = ws.onerror = onClose;
  return ws;
};

/* Audio WebSocket — shared connection for all audio commands */

const setupAudioWebSocket = () => {
  const connect = () => {
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`,
    );
    window.audioWs = ws;
    ws.onopen = () => {
      sendAudioCommand("audio-get-devices");
    };
    ws.onmessage = (e) => {
      try {
        handleAudioMessage(JSON.parse(e.data));
      } catch {}
    };
    ws.onclose = ws.onerror = () => {
      console.warn("Audio WS disconnected, reconnecting in 2s...");
      setTimeout(connect, 2000);
    };
  };
  connect();
};

const handleAudioMessage = (msg) => {
  switch (msg.type) {
    case "session-id":
      window.sessionId = msg.sessionId;
      break;
    case "audio-devices":
      populateDeviceSelectors(msg.devices, msg.defaultDeviceId);
      updateAllChannelSelectors(msg.defaultChannels);
      break;
    case "audio-device-changed": {
      if (!msg.success) {
        console.error("Device change failed:", msg.error);
        break;
      }
      const track = document.querySelector(
        `.audio-track[data-index="${msg.trackIndex}"], .video-track[data-index="${msg.trackIndex}"]`,
      );
      if (!track) break;
      track
        .querySelectorAll(".audio-device-select")
        .forEach((s) => (s.value = String(msg.deviceId)));
      const chSelects = getChannelSelectors(track);
      if (chSelects.length) updateChannelOptions(chSelects, msg.channels || 2);
      break;
    }
    case "audio-position":
      window._lastAudioPosition = msg;
      if (typeof window.handleAudioPositionUpdate === "function")
        window.handleAudioPositionUpdate(msg);
      break;
    case "audio-transport":
      window.dispatchEvent(
        new CustomEvent("audio-transport-update", { detail: msg }),
      );
      break;
    case "audio-error":
      console.error("Audio engine error:", msg.message);
      break;
  }
};

/* DOMContentLoaded — Initialize everything */

document.addEventListener("DOMContentLoaded", async () => {
  const tracks = document.querySelectorAll(".audio-track, .video-track");
  const loop = document.getElementById("loop-checkbox");
  const audioElements = Array(32).fill(null);
  window.trackMetadata = {};
  window.audioElements = audioElements;

  setupAudioWebSocket();
  setupVideoTrackHandling();
  initializeArtNet();
  setupDeviceChangeListeners();
  setupFileHandling(tracks, audioElements);
  setupChannelSelection(tracks);
  setupPlaybackControls();
  setupVolumeControls(tracks);
  setupMasterVolumeControl();
  setupMasterTimeline();
  setupRemoveButtons(audioElements);

  loop.addEventListener("change", () => {
    sendAudioCommand("audio-set-loop", { loop: loop.checked });
    typeof updateVideoLoopStatus === "function" &&
      updateVideoLoopStatus(loop.checked);
  });
});
