class ArtNetTimecode {
  constructor() {
    this.enabled = false;
    this.ip = "127.0.0.1";
    this.port = 6454;
    this.fps = 25;
    this.ws = null;
    this.isConnected = false;
    this.pendingConfiguration = false;

    this.elements = {
      enabled: document.getElementById("artnet-enabled"),
      ip: document.getElementById("artnet-ip"),
      port: document.getElementById("artnet-port"),
      fps: document.getElementById("fps-select"),
      preset: document.getElementById("artnet-ip-preset"),
      applyBtn: document.getElementById("apply-settings-btn"),
      status: document.getElementById("artnet-status-display"),
    };

    this.setupUI();
    this.connectWebSocket();
  }

  setupUI() {
    const { enabled, ip, port, preset, applyBtn } = this.elements;

    if (enabled) {
      enabled.checked = this.enabled;
      enabled.addEventListener("change", () => this.applySettings());
    }
    if (ip) ip.value = this.ip;
    if (port) port.value = this.port;
    applyBtn?.addEventListener("click", () => this.applySettings());

    if (preset && ip) {
      const isPresetIP = Array.from(preset.options).some(
        (o) => o.value === ip.value,
      );
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

    getUserIP()
      .then((userIP) => {
        if (userIP && ip) {
          ip.title = `Your IP: ${userIP} (Broadcast: ${calculateBroadcastIP(
            userIP,
          )})`;
        }
        this.sendConfigToServer();
      })
      .catch(() => this.sendConfigToServer());

    this.updateStatus();
  }

  applySettings() {
    const { fps, preset, ip, port, enabled } = this.elements;
    const newIP =
      preset?.value &&
      preset.value !== "custom" &&
      preset.value !== "auto-broadcast"
        ? preset.value
        : ip?.value?.trim() || this.ip;
    const newFps = parseFloat(fps?.value || this.fps);
    const newPort = parseInt(port?.value || this.port);

    if (
      !newIP ||
      !isValidIP(newIP) ||
      isNaN(newPort) ||
      newPort < 1 ||
      newPort > 65535 ||
      isNaN(newFps) ||
      newFps <= 0
    )
      return;

    this.fps = newFps;
    this.ip = newIP.trim();
    this.port = newPort;
    this.enabled = enabled?.checked || false;
    this.sendConfigToServer();
  }

  sendConfigToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "configure-artnet",
          ip: this.ip,
          port: this.port,
          enabled: this.enabled,
          fps: this.fps,
        }),
      );
      this.updateStatus();
    } else {
      this.pendingConfiguration = true;
    }
  }

  updateStatus(timecode = "00:00:00:00") {
    if (!this.elements.status) return;
    this.elements.status.textContent = `(${this.ip}:${this.port} | ${this.fps}fps | ${timecode})`;
    this.elements.status.className = `artnet-status ${
      !this.isConnected ? "error" : this.enabled ? "connected" : "disabled"
    }`;
  }

  timeToSMPTE(t) {
    const pad = (n) => n.toString().padStart(2, "0");
    const hours = Math.floor(t / 3600),
      minutes = Math.floor((t % 3600) / 60),
      seconds = Math.floor(t % 60),
      frames = Math.floor((t % 1) * this.fps);
    return {
      hours,
      minutes,
      seconds,
      frames,
      formatted: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`,
    };
  }

  createPacket(tc) {
    return new Uint8Array([
      0x41,
      0x72,
      0x74,
      0x2d,
      0x4e,
      0x65,
      0x74,
      0x00,
      0x97,
      0x00,
      0x00,
      0x0e,
      0x00,
      0x00,
      tc.frames,
      tc.seconds,
      tc.minutes,
      tc.hours,
    ]);
  }

  sendTimecode(currentTime) {
    if (!this.enabled || !this.isConnected) return;
    const tc = this.timeToSMPTE(currentTime);
    this.ws?.send(
      JSON.stringify({
        type: "artnet-timecode",
        packet: Array.from(this.createPacket(tc)),
        timecode: tc,
        ip: this.ip,
        port: this.port,
      }),
    );
    this.updateStatus(tc.formatted);
  }

  connectWebSocket() {
    this.closeWebSocket();
    this.ws = createWebSocketConnection(
      () => {
        this.isConnected = true;
        this.updateStatus();
        if (this.pendingConfiguration) {
          this.sendConfigToServer();
          this.pendingConfiguration = false;
        }
      },
      () => {},
      () => {
        this.isConnected = false;
        this.updateStatus();
        if (this.ws !== null) setTimeout(() => this.connectWebSocket(), 2000);
      },
    );
  }

  closeWebSocket() {
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      )
        this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  destroy() {
    this.closeWebSocket();
  }
}

window.artNetTimecode = null;

function initializeArtNet() {
  window.artNetTimecode?.destroy();
  window.artNetTimecode = new ArtNetTimecode();
}

window.addEventListener("beforeunload", () => {
  window.artNetTimecode?.destroy();
  window.artNetTimecode = null;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) window.artNetTimecode?.closeWebSocket();
  else window.artNetTimecode?.connectWebSocket();
});
