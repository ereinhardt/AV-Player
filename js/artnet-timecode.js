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

  getElement(id) {
    return document.getElementById(id);
  }

  isValidIP(ip) {
    return ip && ip.length > 0;
  }

  isValidPort(port) {
    return !isNaN(port) && port >= 1 && port <= 65535;
  }

  isValidFPS(fps) {
    return !isNaN(fps) && fps > 0;
  }

  initializeSettings() {
    // Set checkbox to match default state
    const enabledCheckbox = this.getElement("artnet-enabled");
    if (enabledCheckbox) enabledCheckbox.checked = this.enabled;

    // Set initial values
    this.getElement("artnet-ip").value = this.ip;
    const portInput = this.getElement("artnet-port");
    if (portInput) portInput.value = this.port;

    // Setup IP detection and presets
    this.setupIPDetection();
    this.initializeIPPresets();

    // Add event listeners
    this.getElement("apply-settings-btn").addEventListener("click", () =>
      this.applySettings()
    );
    this.getElement("artnet-enabled").addEventListener("change", (e) => {
      this.enabled = e.target.checked;
      this.updateStatusDisplay();
    });

    this.updateStatusDisplay();
  }

  setupIPDetection() {
    this.getUserIP()
      .then((ip) => {
        if (ip) {
          const ipParts = ip.split(".");
          const broadcastIP = [...ipParts.slice(0, 3), "255"].join(".");

          this.getElement(
            "artnet-ip"
          ).title = `Your computer IP: ${ip} (Broadcast: ${broadcastIP})`;

          if (!this.getElement("ip-info")) {
            const ipInput = this.getElement("artnet-ip");
            const infoElement = document.createElement("span");
            infoElement.id = "ip-info";
            infoElement.className = "ip-info";
            infoElement.textContent = `(My IP in the current network: ${ip})`;
            ipInput.parentNode.appendChild(infoElement);
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
    try {
      const newFps = parseFloat(this.getElement("fps-select").value);
      const newIp = this.getIPFromForm();
      const newPort = parseInt(this.getElement("artnet-port").value);
      const newEnabled = this.getElement("artnet-enabled").checked;

      if (!this.isValidIP(newIp)) return;
      if (!this.isValidPort(newPort)) return;
      if (!this.isValidFPS(newFps)) return;

      this.fps = newFps;
      this.ip = newIp;
      this.port = newPort;
      this.enabled = newEnabled;

      this.sendConfigurationToServer();
    } catch (error) {}
  }

  getIPFromForm() {
    const presetSelect = this.getElement("artnet-ip-preset");
    const ipInput = this.getElement("artnet-ip");

    if (
      presetSelect &&
      presetSelect.value !== "custom" &&
      presetSelect.value !== "auto-broadcast"
    ) {
      return presetSelect.value;
    }
    return ipInput.value.trim();
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
    const statusDisplay = document.getElementById("artnet-status-display");
    if (statusDisplay) {
      let status = "";
      if (this.enabled && this.isConnected) {
        status = "connected";
      } else if (!this.isConnected) {
        // Show error (red) whenever server is disconnected, regardless of enabled state
        status = "error";
      } else if (this.enabled && !this.isConnected) {
        status = "error";
      }

      const fpsText = `${this.fps}fps`;
      statusDisplay.textContent = `(${this.ip}:${this.port} / ${fpsText} / ${currentTimecode})`;
      statusDisplay.className = `artnet-status ${status}`;
    }
  }

  showStatus(message, type = "success") {
    const statusSpan = this.getElement("settings-status");
    if (!statusSpan) return;

    statusSpan.textContent = message;
    statusSpan.className = `settings-status ${type}`;

    setTimeout(() => {
      statusSpan.style.opacity = "0";
      setTimeout(() => (statusSpan.textContent = ""), 300);
    }, 3000);
  }

  async getUserIP() {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun.stunprotocol.org:3478" },
        ],
      });

      pc.createDataChannel("");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      return new Promise((resolve) => {
        const foundIPs = new Set();
        let localIP = null;

        pc.onicecandidate = (ice) => {
          if (!ice?.candidate?.candidate) return;

          const ipMatches =
            ice.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/g);
          if (!ipMatches) return;

          ipMatches.forEach((ip) => {
            if (this.isValidLocalIP(ip)) {
              foundIPs.add(ip);
              if (this.isPrivateIP(ip)) localIP = ip;
            }
          });

          if (localIP) {
            pc.close();
            resolve(localIP);
          }
        };

        setTimeout(() => {
          pc.close();
          resolve(
            localIP || (foundIPs.size > 0 ? Array.from(foundIPs)[0] : null)
          );
        }, 5000);
      });
    } catch (error) {
      return null;
    }
  }

  isValidLocalIP(ip) {
    return (
      !ip.startsWith("127.") &&
      !ip.startsWith("169.254.") &&
      !ip.startsWith("0.")
    );
  }

  isPrivateIP(ip) {
    return (
      ip.startsWith("192.168.") ||
      ip.startsWith("10.") ||
      ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
    );
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

    try {
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
    } catch (error) {
      return null;
    }
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
    try {
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
        } catch (error) {}
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
    } catch (error) {}
  }

  handleServerMessage(message) {
    const { type } = message;

    if (type === "artnet-sent") {
      this.updateStatusDisplay(message.timecode);
    }
  }

  initializeIPPresets() {
    const presetSelect = this.getElement("artnet-ip-preset");
    const ipInput = this.getElement("artnet-ip");

    if (!presetSelect || !ipInput) return;

    const currentIP = ipInput.value;
    const isPresetIP = Array.from(presetSelect.options).some((option) => {
      if (option.value === currentIP) {
        presetSelect.value = currentIP;
        return true;
      }
      return false;
    });

    if (isPresetIP) {
      ipInput.style.display = "none";
    } else {
      presetSelect.value = "custom";
      ipInput.style.display = "block";
    }

    presetSelect.addEventListener("change", () => {
      const selectedValue = presetSelect.value;
      if (selectedValue !== "custom") {
        ipInput.value = selectedValue;
        ipInput.style.display = "none";
      } else {
        ipInput.style.display = "block";
        ipInput.value = "";
        ipInput.focus();
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
