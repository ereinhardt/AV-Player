// UDP Receive Trigger - Listens for incoming UDP messages to trigger playback
class UDPReceiveTrigger {
  constructor() {
    this.enabled = false;
    this.port = 9998;
    this.message = "PLAY";
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;

    this.elements = {
      enabled: document.getElementById("udp-receive-enabled"),
      port: document.getElementById("udp-receive-port"),
      message: document.getElementById("udp-receive-message"),
      apply: document.getElementById("udp-receive-apply"),
      status: document.getElementById("udp-receive-status"),
    };

    this.setupUI();
    this.connectToServer();
  }

  setupUI() {
    const { enabled, port, message, apply } = this.elements;
    if (enabled) enabled.checked = this.enabled;
    if (port) port.value = this.port;
    if (message) message.value = this.message;

    enabled?.addEventListener("change", () => {
      this.enabled = enabled.checked;
      this.updateControlsState();
      this.sendConfigToServer();
      this.updateStatus();
    });

    apply?.addEventListener("click", () => this.applySettings());
    this.updateStatus();
    this.updateControlsState();
  }

  updateControlsState() {
    const controls = [
      document.getElementById("play-pause-button"),
      document.getElementById("reset-button"),
      document.getElementById("loop-checkbox"),
    ];
    const loopLabel = controls[2]?.nextElementSibling;

    controls.forEach((el) => {
      if (!el) return;
      el.disabled = this.enabled;
      el.style.opacity = this.enabled ? "0.5" : "1";
      el.style.cursor = this.enabled ? "not-allowed" : "pointer";
      if (el.type === "checkbox" && this.enabled) el.checked = false;
    });

    if (loopLabel) {
      loopLabel.style.opacity = this.enabled ? "0.5" : "1";
      loopLabel.style.cursor = this.enabled ? "not-allowed" : "pointer";
    }
  }

  connectToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.closeWebSocket();

    this.ws = createWebSocketConnection(
      () => {
        this.isConnected = true;
        this.updateStatus();
        if (this.enabled) this.sendConfigToServer();
      },
      (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "udp-receive-triggered" && this.enabled) {
            this.showTriggeredStatus();
            this.restartPlayback();
          }
        } catch {}
      },
      () => {
        this.isConnected = false;
        this.updateStatus();
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.ws !== null) {
          this.reconnectTimer = setTimeout(() => this.connectToServer(), 3000);
        }
      },
    );
  }

  closeWebSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.isConnected = false;
  }

  restartPlayback() {
    // Reset and restart server-side audio
    sendAudioCommand("audio-reset");
    sendAudioCommand("audio-play");

    // Restart all video windows
    Object.values(window.videoWindows || {}).forEach((vw) => {
      if (vw && !vw.closed)
        vw.postMessage({ type: "RESTART_VIDEO" }, window.location.origin);
    });

    // Reset triggers and MIDI
    window.midiBpm?.enabled && window.midiBpm.restart();
    window.udpTriggerManager?.resetAllTriggers();
    window.oscTriggerManager?.resetAllTriggers();

    // Update UI and start MIDI
    const btn = document.getElementById("play-pause-button");
    if (btn) {
      btn.textContent = "Pause";
      btn.classList.add("playing");
    }
    window.midiBpm?.enabled && window.midiBpm.start();
  }

  showTriggeredStatus() {
    if (!this.elements.status) return;
    this.elements.status.textContent = `(0.0.0.0:${this.port} | ${this.message} - RECEIVED)`;
    this.elements.status.className = "udp-receive-status enabled";
    setTimeout(() => this.updateStatus(), 2000);
  }

  applySettings() {
    const { enabled, port, message } = this.elements;
    if (!port || !message) return;
    this.enabled = enabled?.checked || false;
    this.port = parseInt(port.value) || 9998;
    this.message = message.value.trim() || "PLAY";
    this.updateControlsState();
    this.sendConfigToServer();
    this.updateStatus();
  }

  sendConfigToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "udp-receive-config",
          enabled: this.enabled,
          port: this.port,
          message: this.message,
        }),
      );
    }
  }

  updateStatus() {
    if (!this.elements.status) return;
    const statusClass = !this.isConnected
      ? "error"
      : this.enabled
        ? "enabled"
        : "";
    this.elements.status.textContent = `(0.0.0.0:${this.port} | ${this.message})`;
    this.elements.status.className = `udp-receive-status ${statusClass}`;
  }

  destroy() {
    this.closeWebSocket();
  }
}

window.udpReceiveTrigger = null;
document.addEventListener(
  "DOMContentLoaded",
  () => (window.udpReceiveTrigger = new UDPReceiveTrigger()),
);
window.addEventListener("beforeunload", () => {
  window.udpReceiveTrigger?.destroy();
  window.udpReceiveTrigger = null;
});
