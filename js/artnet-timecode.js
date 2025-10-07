class ArtNetTimecode {
  constructor() {
    this.enabled = false;
    this.ip = "127.0.0.1";
    this.port = 6454;
    this.fps = 25;
    this.ws = null;
    this.isConnected = false;
    this.pendingConfiguration = false;
    
    // Cache DOM elements
    this.elements = {
      enabled: document.getElementById("artnet-enabled"),
      ip: document.getElementById("artnet-ip"),
      port: document.getElementById("artnet-port"),
      fps: document.getElementById("fps-select"),
      preset: document.getElementById("artnet-ip-preset"),
      applyBtn: document.getElementById("apply-settings-btn"),
      status: document.getElementById("artnet-status-display"),
      settingsStatus: document.getElementById("settings-status")
    };
    
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
    const { enabled, ip, port, applyBtn } = this.elements;

    if (enabled) {
      enabled.checked = this.enabled;
      enabled.addEventListener("change", (e) => {
        this.enabled = e.target.checked;
        this.updateStatusDisplay();
      });
    }
    
    if (ip) ip.value = this.ip;
    if (port) port.value = this.port;
    if (applyBtn) applyBtn.addEventListener("click", () => this.applySettings());
  }

  setupIPDetection() {
    getUserIP()
      .then((ip) => {
        if (ip && this.elements.ip) {
          const broadcastIP = calculateBroadcastIP(ip);
          this.elements.ip.title = `Your computer IP: ${ip} (Broadcast: ${broadcastIP})`;

          // Add IP info display
          if (!document.getElementById("ip-info")) {
            const infoElement = document.createElement("span");
            infoElement.id = "ip-info";
            infoElement.className = "ip-info";
            infoElement.textContent = `(My IP: ${ip})`;
            this.elements.ip.parentNode.appendChild(infoElement);
          }
        }
        this.sendConfigurationToServer();
      })
      .catch(() => this.sendConfigurationToServer());
  }

  applySettings() {
    const { fps, preset, ip, port, enabled } = this.elements;

    // Get IP from preset or manual input
    const newIP = (preset?.value && preset.value !== "custom" && preset.value !== "auto-broadcast") 
      ? preset.value 
      : ip?.value?.trim() || this.ip;

    const newFps = parseFloat(fps?.value || this.fps);
    const newPort = parseInt(port?.value || this.port);
    const newEnabled = enabled?.checked || false;

    // Validate settings
    if (!newIP || !isValidIP(newIP) || 
        isNaN(newPort) || newPort < 1 || newPort > 65535 || 
        isNaN(newFps) || newFps <= 0) {
      return;
    }

    this.fps = newFps;
    this.ip = newIP.trim();
    this.port = newPort;
    this.enabled = newEnabled;
    
    this.sendConfigurationToServer();
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
    if (!this.elements.status) return;
    
    const statusClass = !this.isConnected ? "error" : 
                       this.enabled ? "connected" : "disabled";

    this.elements.status.textContent = `(${this.ip}:${this.port} / ${this.fps}fps / ${currentTimecode})`;
    this.elements.status.className = `artnet-status ${statusClass}`;
  }

  showStatus(message, type = "success") {
    if (!this.elements.settingsStatus) return;

    this.elements.settingsStatus.textContent = message;
    this.elements.settingsStatus.className = `settings-status ${type}`;
    setTimeout(() => {
      this.elements.settingsStatus.style.opacity = "0";
      setTimeout(() => this.elements.settingsStatus.textContent = "", 300);
    }, 3000);
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
      // OpCode (TimeCode) + Protocol version + Reserved
      0x97, 0x00, 0x00, 0x0e, 0x00, 0x00,
      // Timecode data
      timecode.frames, timecode.seconds, timecode.minutes, timecode.hours
    ]);
  }

  sendTimecode(currentTime) {
    if (!this.enabled || !this.isConnected) return;

    const timecode = this.timeToSMPTE(currentTime);
    
    this.sendToServer({
      type: "artnet-timecode",
      packet: Array.from(this.createArtNetPacket(timecode)),
      timecode,
      ip: this.ip,
      port: this.port,
    });

    this.updateStatusDisplay(timecode.formatted);
    return timecode;
  }

  sendToServer(data) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.connectWebSocket();
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  connectWebSocket() {
    this.ws = createWebSocketConnection(
      () => {
        this.isConnected = true;
        this.updateStatusDisplay();
        if (this.pendingConfiguration) {
          this.sendConfigurationToServer();
          this.pendingConfiguration = false;
        }
      },
      (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "artnet-sent") {
            this.updateStatusDisplay(message.message);
          }
        } catch (error) {
          console.warn("Failed to parse WebSocket message:", error);
        }
      },
      () => {
        this.isConnected = false;
        this.updateStatusDisplay();
        setTimeout(() => this.connectWebSocket(), 2000);
      }
    );
  }

  initializeIPPresets() {
    const { preset, ip } = this.elements;
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
