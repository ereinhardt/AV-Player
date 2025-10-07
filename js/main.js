// Shared Function: Converts seconds to HH:MM:SS format
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// Shared Function: Validates IPv4 address format and range
function isValidIP(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && 
         ip.split(".").every(part => parseInt(part) <= 255);
}

// Shared Function: alculates broadcast IP from local IP (sets last octet to 255)
function calculateBroadcastIP(localIP) {
  const parts = localIP.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.255` : "192.168.1.255";
}

// Shared Function: Gets user's local IP using WebRTC STUN server
async function getUserIP() {
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.createDataChannel("");
    await pc.setLocalDescription(await pc.createOffer());

    return new Promise((resolve) => {
      let resolved = false;
      
      pc.onicecandidate = (ice) => {
        if (resolved || !ice?.candidate?.candidate) return;
        const ipMatch = ice.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch && !ipMatch[1].startsWith("127.") && !ipMatch[1].startsWith("169.254.")) {
          resolved = true;
          pc.close();
          resolve(ipMatch[1]);
        }
      };

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          pc.close();
          resolve(null);
        }
      }, 2000);
    });
  } catch {
    return null;
  }
}

// Shared Function: Gets current network's broadcast address
async function getCurrentNetworkBroadcast() {
  try {
    const localIP = await getUserIP();
    return localIP ? calculateBroadcastIP(localIP) : "192.168.1.255";
  } catch {
    return "192.168.1.255";
  }
}

// Shared Function: Creates WebSocket connection with event handlers
function createWebSocketConnection(onOpen, onMessage, onClose) {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);
  
  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onclose = ws.onerror = onClose;
  
  return ws;
}

// Shared Function: Validates that required DOM elements exist
function validateDOMElements(elements) {
  const missing = [];
  Object.entries(elements).forEach(([key, selector]) => {
    const element = typeof selector === 'string' ? document.getElementById(selector) : selector;
    if (!element) missing.push(key);
  });
  
  if (missing.length > 0) {
    console.warn(`Missing DOM elements: ${missing.join(', ')}`);
    return false;
  }
  return true;
}

// Initialize AV Player when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const tracks = document.querySelectorAll(".track");
  const loopCheckbox = document.getElementById("loop-checkbox");

  let audioContextContainer = {
    contexts: new Array(24).fill(null),
    masterGains: new Array(24).fill(null),
    masterVolume: 1.0,
  };
  let audioElements = new Array(24).fill(null);
  let audioSources = new Array(24).fill(null);

  window.audioSources = audioSources;

  getAudioDevices();
  setupVideoTrackHandling();
  initializeArtNet();

  setupDeviceChangeListeners(audioElements, audioContextContainer);
  setupFileHandling(tracks, audioElements, audioSources, audioContextContainer, loopCheckbox);
  setupChannelSelection(tracks, audioSources, audioContextContainer);
  setupPlaybackControls(audioElements, audioContextContainer);
  setupVolumeControls(tracks, audioSources);
  setupMasterVolumeControl(audioContextContainer);
  setupMasterTimeline(audioElements);

  loopCheckbox.addEventListener("change", () => {
    if (typeof updateVideoLoopStatus === "function") {
      updateVideoLoopStatus(loopCheckbox.checked);
    }
  });
});
