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
    // Set initial values
    if (this.elements.enabled) this.elements.enabled.checked = this.enabled;
    if (this.elements.ip) this.elements.ip.value = this.ip;
    if (this.elements.port) this.elements.port.value = this.port;

    // Setup IP detection and presets
    this.setupIPDetection();
    this.initializeIPPresets();

    // Add event listeners
    if (this.elements.applyBtn) {
      this.elements.applyBtn.addEventListener("click", () => this.applySettings());
    }
    if (this.elements.enabled) {
      this.elements.enabled.addEventListener("change", (e) => {
        this.enabled = e.target.checked;
        this.updateStatusDisplay();
      });
    }

    this.updateStatusDisplay();
  }

  setupIPDetection() {
    this.getUserIP()
      .then((ip) => {
        if (ip && this.elements.ip) {
          const ipParts = ip.split(".");
          const broadcastIP = [...ipParts.slice(0, 3), "255"].join(".");
          
          this.elements.ip.title = `Your computer IP: ${ip} (Broadcast: ${broadcastIP})`;

          // Add IP info if not exists
          if (!document.getElementById("ip-info")) {
            const infoElement = document.createElement("span");
            infoElement.id = "ip-info";
            infoElement.className = "ip-info";
            infoElement.textContent = `(My IP in the current network: ${ip})`;
            this.elements.ip.parentNode.appendChild(infoElement);
          }
        }
        this.pendingConfiguration = true;
        this.sendConfigurationToServerWhenReady();
      })
      .catch(() => {
        this.pendingConfiguration = true;
        this.sendConfigurationToServerWhenReady();
      });
  }

  applySettings() {
    const newFps = parseFloat(this.elements.fps?.value || this.fps);
    const newIp = this.getIPFromForm();
    const newPort = parseInt(this.elements.port?.value || this.port);
    const newEnabled = this.elements.enabled?.checked || false;

    // Simple validation
    if (!newIp || newIp.trim().length === 0) return;
    if (isNaN(newPort) || newPort < 1 || newPort > 65535) return;
    if (isNaN(newFps) || newFps <= 0) return;

    this.fps = newFps;
    this.ip = newIp.trim();
    this.port = newPort;
    this.enabled = newEnabled;

    this.sendConfigurationToServer();
  }

  getIPFromForm() {
    if (this.elements.preset?.value && 
        this.elements.preset.value !== "custom" && 
        this.elements.preset.value !== "auto-broadcast") {
      return this.elements.preset.value;
    }
    return this.elements.ip?.value?.trim() || this.ip;
  }

  sendConfigurationToServerWhenReady() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendConfigurationToServer();
      this.pendingConfiguration = false;
    } else {
      this.pendingConfiguration = true;
    }
  }

  sendConfigurationToServer() {
    this.sendToServer({
      type: "configure-artnet",
      ip: this.ip,
      port: this.port,
      enabled: this.enabled,
      fps: this.fps,
    });
    this.updateStatusDisplay();
  }

  updateStatusDisplay(currentTimecode = "00:00:00:00") {
    if (!this.elements.status) return;
    
    let status = "";
    if (!this.isConnected) {
      status = "error";
    } else if (this.enabled) {
      status = "connected";
    } else {
      status = "disabled";
    }

    const fpsText = `${this.fps}fps`;
    this.elements.status.textContent = `(${this.ip}:${this.port} / ${fpsText} / ${currentTimecode})`;
    this.elements.status.className = `artnet-status ${status}`;
  }

  showStatus(message, type = "success") {
    if (!this.elements.settingsStatus) return;

    this.elements.settingsStatus.textContent = message;
    this.elements.settingsStatus.className = `settings-status ${type}`;

    setTimeout(() => {
      this.elements.settingsStatus.style.opacity = "0";
      setTimeout(() => (this.elements.settingsStatus.textContent = ""), 300);
    }, 3000);
  }

  async getUserIP() {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      pc.createDataChannel("");
      await pc.setLocalDescription(await pc.createOffer());

      return new Promise((resolve) => {
        let resolved = false;
        
        pc.onicecandidate = (ice) => {
          if (resolved || !ice?.candidate?.candidate) return;

          const ipMatch = ice.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch) {
            const ip = ipMatch[1];
            if (this.isValidLocalIP(ip)) {
              resolved = true;
              pc.close();
              resolve(ip);
            }
          }
        };

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            pc.close();
            resolve(null);
          }
        }, 3000);
      });
    } catch (error) {
      return null;
    }
  }

  isValidLocalIP(ip) {
    return !ip.startsWith("127.") && !ip.startsWith("169.254.") && !ip.startsWith("0.");
  }

  timeToSMPTE(currentTime) {
    const hours = Math.floor(currentTime / 3600);
    const minutes = Math.floor((currentTime % 3600) / 60);
    const seconds = Math.floor(currentTime % 60);
    const frames = Math.floor((currentTime % 1) * this.fps);

    return {
      hours: hours,
      minutes: minutes,
      seconds: seconds,
      frames: frames,
      formatted: `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${frames
        .toString()
        .padStart(2, "0")}`,
    };
  }

  createArtNetPacket(timecode) {
    const packet = new Uint8Array(18);

    packet[0] = 0x41;
    packet[1] = 0x72;
    packet[2] = 0x74;
    packet[3] = 0x2d;
    packet[4] = 0x4e;
    packet[5] = 0x65;
    packet[6] = 0x74;
    packet[7] = 0x00;

    packet[8] = 0x97;
    packet[9] = 0x00;

    packet[10] = 0x00;
    packet[11] = 0x0e;

    packet[12] = 0x00;
    packet[13] = 0x00;

    packet[14] = timecode.frames;
    packet[15] = timecode.seconds;
    packet[16] = timecode.minutes;
    packet[17] = timecode.hours;

    return packet;
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
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.updateStatusDisplay();
      if (this.pendingConfiguration) {
        this.sendConfigurationToServer();
        this.pendingConfiguration = false;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        this.handleServerMessage(JSON.parse(event.data));
      } catch (error) {
        console.warn("Failed to parse WebSocket message:", error);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.updateStatusDisplay();
      setTimeout(() => this.connectWebSocket(), 2000);
    };

    this.ws.onerror = () => {
      this.isConnected = false;
      this.updateStatusDisplay();
    };
  }

  handleServerMessage(message) {
    const { type } = message;

    if (type === "artnet-sent") {
      this.updateStatusDisplay(message.timecode);
    }
  }

  initializeIPPresets() {
    if (!this.elements.preset || !this.elements.ip) return;

    const currentIP = this.elements.ip.value;
    const isPresetIP = Array.from(this.elements.preset.options)
      .some(option => option.value === currentIP);

    if (isPresetIP) {
      this.elements.preset.value = currentIP;
      this.elements.ip.style.display = "none";
    } else {
      this.elements.preset.value = "custom";
      this.elements.ip.style.display = "block";
    }

    this.elements.preset.addEventListener("change", () => {
      const selectedValue = this.elements.preset.value;
      if (selectedValue !== "custom") {
        this.elements.ip.value = selectedValue;
        this.elements.ip.style.display = "none";
      } else {
        this.elements.ip.style.display = "block";
        this.elements.ip.value = "";
        this.elements.ip.focus();
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
