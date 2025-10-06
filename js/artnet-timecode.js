class ArtNetTimecode {
  constructor() {
    this.enabled = false;
    this.ip = "127.0.0.1";
    this.port = 6454;
    this.fps = 25;
    this.ws = null;
    this.isConnected = false;
    this.pendingConfiguration = false;
    
    this.initializeSettings();
    this.connectWebSocket();
  }

  initializeSettings() {
    this.setupUIElements();
    this.setupIPDetection();
    this.initializeIPPresets();
    this.updateStatusDisplay();
  }

  setupUIElements() {
    const enabledEl = document.getElementById("artnet-enabled");
    const ipEl = document.getElementById("artnet-ip");
    const portEl = document.getElementById("artnet-port");
    const applyBtn = document.getElementById("apply-settings-btn");

    if (enabledEl) {
      enabledEl.checked = this.enabled;
      enabledEl.addEventListener("change", (e) => {
        this.enabled = e.target.checked;
        this.updateStatusDisplay();
      });
    }
    
    if (ipEl) ipEl.value = this.ip;
    if (portEl) portEl.value = this.port;
    if (applyBtn) {
      applyBtn.addEventListener("click", () => this.applySettings());
    }
  }

  setupIPDetection() {
    this.getUserIP()
      .then((ip) => {
        if (ip) {
          const ipElement = document.getElementById("artnet-ip");
          if (ipElement) {
            const ipParts = ip.split(".");
            const broadcastIP = [...ipParts.slice(0, 3), "255"].join(".");
            ipElement.title = `Your computer IP: ${ip} (Broadcast: ${broadcastIP})`;

            // Add IP info display
            if (!document.getElementById("ip-info")) {
              const infoElement = document.createElement("span");
              infoElement.id = "ip-info";
              infoElement.className = "ip-info";
              infoElement.textContent = `(My IP: ${ip})`;
              ipElement.parentNode.appendChild(infoElement);
            }
          }
        }
        this.sendConfigurationToServer();
      })
      .catch(() => this.sendConfigurationToServer());
  }

  applySettings() {
    const fpsEl = document.getElementById("fps-select");
    const presetEl = document.getElementById("artnet-ip-preset");
    const ipEl = document.getElementById("artnet-ip");
    const portEl = document.getElementById("artnet-port");
    const enabledEl = document.getElementById("artnet-enabled");

    // Get IP from preset or manual input
    let ip;
    if (presetEl?.value && presetEl.value !== "custom" && presetEl.value !== "auto-broadcast") {
      ip = presetEl.value;
    } else {
      ip = ipEl?.value?.trim() || this.ip;
    }

    const fps = parseFloat(fpsEl?.value || this.fps);
    const port = parseInt(portEl?.value || this.port);
    const enabled = enabledEl?.checked || false;

    // Validate settings with IP validator
    if (!ip || ip.length === 0 || !this.isValidIP(ip) || 
        isNaN(port) || port < 1 || port > 65535 || 
        isNaN(fps) || fps <= 0) {
      return;
    }

    this.fps = fps;
    this.ip = ip.trim();
    this.port = port;
    this.enabled = enabled;
    
    this.sendConfigurationToServer();
  }

  isValidIP(ip) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && 
           ip.split(".").every(part => parseInt(part) <= 255);
  }

  sendConfigurationToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendToServer({
        type: "configure-artnet",
        ip: this.ip,
        port: this.port,
        enabled: this.enabled,
        fps: this.fps,
      });
      this.updateStatusDisplay();
    } else {
      this.pendingConfiguration = true;
    }
  }

  updateStatusDisplay(currentTimecode = "00:00:00:00") {
    const status = document.getElementById("artnet-status-display");
    if (!status) return;
    
    const statusClass = !this.isConnected ? "error" : 
                       this.enabled ? "connected" : "disabled";

    status.textContent = `(${this.ip}:${this.port} / ${this.fps}fps / ${currentTimecode})`;
    status.className = `artnet-status ${statusClass}`;
  }

  showStatus(message, type = "success") {
    const settingsStatus = document.getElementById("settings-status");
    if (!settingsStatus) return;

    settingsStatus.textContent = message;
    settingsStatus.className = `settings-status ${type}`;
    setTimeout(() => {
      settingsStatus.style.opacity = "0";
      setTimeout(() => settingsStatus.textContent = "", 300);
    }, 3000);
  }

  async getUserIP() {
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

  timeToSMPTE(currentTime) {
    const hours = Math.floor(currentTime / 3600);
    const minutes = Math.floor((currentTime % 3600) / 60);
    const seconds = Math.floor(currentTime % 60);
    const frames = Math.floor((currentTime % 1) * this.fps);

    const pad = (num) => num.toString().padStart(2, "0");
    
    return {
      hours, minutes, seconds, frames,
      formatted: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`
    };
  }

  createArtNetPacket(timecode) {
    return new Uint8Array([
      // Art-Net header
      0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
      // OpCode (TimeCode)
      0x97, 0x00,
      // Protocol version
      0x00, 0x0e,
      // Reserved
      0x00, 0x00,
      // Timecode data
      timecode.frames, timecode.seconds, timecode.minutes, timecode.hours
    ]);
  }

  sendTimecode(currentTime) {
    if (!this.enabled || !this.isConnected) return;

    const timecode = this.timeToSMPTE(currentTime);
    const packet = this.createArtNetPacket(timecode);

    this.sendToServer({
      type: "artnet-timecode",
      packet: Array.from(packet),
      timecode: timecode,
      ip: this.ip,
      port: this.port,
    });

    this.updateStatusDisplay(timecode.formatted);
    return timecode;
  }

  sendToServer(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connectWebSocket();
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  connectWebSocket() {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

    this.ws.onopen = () => this.handleWebSocketOpen();
    this.ws.onmessage = (event) => this.handleWebSocketMessage(event);
    this.ws.onclose = this.ws.onerror = () => this.handleWebSocketClose();
  }

  handleWebSocketOpen() {
    this.isConnected = true;
    this.updateStatusDisplay();
    if (this.pendingConfiguration) {
      this.sendConfigurationToServer();
      this.pendingConfiguration = false;
    }
  }

  handleWebSocketMessage(event) {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "artnet-sent") {
        this.updateStatusDisplay(message.message);
      }
    } catch (error) {
      console.warn("Failed to parse WebSocket message:", error);
    }
  }

  handleWebSocketClose() {
    this.isConnected = false;
    this.updateStatusDisplay();
    setTimeout(() => this.connectWebSocket(), 2000);
  }

  initializeIPPresets() {
    const preset = document.getElementById("artnet-ip-preset");
    const ip = document.getElementById("artnet-ip");
    
    if (!preset || !ip) return;

    const isPresetIP = Array.from(preset.options).some(option => option.value === ip.value);
    preset.value = isPresetIP ? ip.value : "custom";
    
    ip.style.display = preset.value === "custom" ? "inline-block" : "none";

    preset.addEventListener("change", () => {
      if (preset.value !== "custom") {
        ip.value = preset.value;
        ip.style.display = "none";
      } else {
        ip.value = "";
        ip.style.display = "inline-block";
        ip.focus();
      }
    });
  }
}

window.artNetTimecode = null;

function initializeArtNet() {
  window.artNetTimecode = new ArtNetTimecode();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ArtNetTimecode, initializeArtNet };
}
