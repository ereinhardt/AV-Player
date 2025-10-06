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

  // Helper to get DOM elements on demand
  getElement(id) {
    return document.getElementById(id);
  }

  initializeSettings() {
    // Set initial values
    const enabled = this.getElement("artnet-enabled");
    const ip = this.getElement("artnet-ip");
    const port = this.getElement("artnet-port");
    const applyBtn = this.getElement("apply-settings-btn");

    if (enabled) {
      enabled.checked = this.enabled;
      enabled.addEventListener("change", (e) => {
        this.enabled = e.target.checked;
        this.updateStatusDisplay();
      });
    }
    
    if (ip) ip.value = this.ip;
    if (port) port.value = this.port;

    if (applyBtn) {
      applyBtn.addEventListener("click", () => this.applySettings());
    }

    this.setupIPDetection();
    this.initializeIPPresets();
    this.updateStatusDisplay();
  }

  setupIPDetection() {
    this.getUserIP()
      .then((ip) => {
        if (ip) {
          const ipElement = this.getElement("artnet-ip");
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
        this.sendConfigurationWhenReady();
      })
      .catch(() => this.sendConfigurationWhenReady());
  }

  sendConfigurationWhenReady() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendConfigurationToServer();
    } else {
      this.pendingConfiguration = true;
    }
  }

  applySettings() {
    const fps = this.getElement("fps-select");
    const ip = this.getElement("artnet-ip");
    const port = this.getElement("artnet-port");
    const enabled = this.getElement("artnet-enabled");

    const newFps = parseFloat(fps?.value || this.fps);
    const newIp = this.getIPFromForm();
    const newPort = parseInt(port?.value || this.port);
    const newEnabled = enabled?.checked || false;

    if (!this.isValidSettings(newIp, newPort, newFps)) return;

    this.fps = newFps;
    this.ip = newIp.trim();
    this.port = newPort;
    this.enabled = newEnabled;

    this.sendConfigurationToServer();
  }

  isValidSettings(ip, port, fps) {
    return ip && ip.trim().length > 0 && 
           !isNaN(port) && port >= 1 && port <= 65535 &&
           !isNaN(fps) && fps > 0;
  }

  getIPFromForm() {
    const preset = this.getElement("artnet-ip-preset");
    const ip = this.getElement("artnet-ip");
    
    if (preset?.value && preset.value !== "custom" && preset.value !== "auto-broadcast") {
      return preset.value;
    }
    return ip?.value?.trim() || this.ip;
  }

  sendConfigurationToServerWhenReady() {
    this.sendConfigurationWhenReady();
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
    const status = this.getElement("artnet-status-display");
    if (!status) return;
    
    const statusClass = !this.isConnected ? "error" : 
                       this.enabled ? "connected" : "disabled";

    status.textContent = `(${this.ip}:${this.port} / ${this.fps}fps / ${currentTimecode})`;
    status.className = `artnet-status ${statusClass}`;
  }

  showStatus(message, type = "success") {
    const settingsStatus = this.getElement("settings-status");
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
          if (ipMatch && this.isValidLocalIP(ipMatch[1])) {
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
        }, 3000);
      });
    } catch {
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
    this.ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

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
        const message = JSON.parse(event.data);
        if (message.type === "artnet-sent") {
          // Server sends timecode as 'message' field, not 'timecode'
          this.updateStatusDisplay(message.message);
        }
      } catch (error) {
        console.warn("Failed to parse WebSocket message:", error);
      }
    };

    this.ws.onclose = this.ws.onerror = () => {
      this.isConnected = false;
      this.updateStatusDisplay();
      setTimeout(() => this.connectWebSocket(), 2000);
    };
  }

  initializeIPPresets() {
    const preset = this.getElement("artnet-ip-preset");
    const ip = this.getElement("artnet-ip");
    
    if (!preset || !ip) return;

    const currentIP = ip.value;
    const isPresetIP = Array.from(preset.options).some(option => option.value === currentIP);

    preset.value = isPresetIP ? currentIP : "custom";
    ip.style.display = isPresetIP ? "none" : "block";

    preset.addEventListener("change", () => {
      if (preset.value !== "custom") {
        ip.value = preset.value;
        ip.style.display = "none";
      } else {
        ip.style.display = "block";
        ip.value = "";
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
