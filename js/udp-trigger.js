class UDPTrigger {
  constructor() {
    this.enabled = false;
    this.ip = "127.0.0.1";
    this.port = 9998;
    this.message = "START";
    this.ws = null;
    this.isConnected = false;
    
    this.setupUI();
    this.connectToServer();
  }

  // Helper to get DOM elements on demand
  getElement(id) {
    return document.getElementById(id);
  }

  setupUI() {
    const enabled = this.getElement("udp-trigger-enabled");
    const ip = this.getElement("udp-trigger-ip");
    const port = this.getElement("udp-trigger-port");
    const message = this.getElement("udp-trigger-message");
    const ipPreset = this.getElement("udp-trigger-ip-preset");
    const apply = this.getElement("udp-trigger-apply");

    // Set initial values
    if (enabled) {
      enabled.checked = this.enabled;
      enabled.addEventListener("change", () => {
        this.enabled = enabled.checked;
        this.updateStatus();
      });
    }
    if (ip) ip.value = this.ip;
    if (port) port.value = this.port;
    if (message) message.value = this.message;
    if (ipPreset) ipPreset.value = "127.0.0.1";
    if (apply) apply.addEventListener("click", () => this.applySettings());

    this.updateStatus();
  }

  getBroadcastIP(localIP = "192.168.1.1") {
    const parts = localIP.split(".");
    return parts.length === 4 ? `${parts.slice(0, 3).join(".")}.255` : "192.168.1.255";
  }

  connectToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.updateStatus();
    };

    this.ws.onclose = this.ws.onerror = () => {
      this.isConnected = false;
      this.updateStatus();
      setTimeout(() => this.connectToServer(), 3000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "udp-trigger-sent") {
          this.showSentStatus(data.details);
        } else {
          this.updateStatus();
        }
      } catch (e) {
        // Ignore malformed messages
      }
    };
  }

  showSentStatus(details) {
    const status = this.getElement("udp-trigger-status");
    if (!status) return;
    
    status.textContent = `(${details.ip}:${details.port} / ${details.message} - SENT)`;
    status.className = "udp-trigger-status enabled";
    setTimeout(() => this.updateStatus(), 2000);
  }

  applySettings() {
    const enabled = this.getElement("udp-trigger-enabled");
    const ipPreset = this.getElement("udp-trigger-ip-preset");
    const ip = this.getElement("udp-trigger-ip");
    const port = this.getElement("udp-trigger-port");
    const message = this.getElement("udp-trigger-message");

    if (!enabled || !ip || !port || !message) return;

    this.enabled = enabled.checked;

    // Get IP from appropriate source
    if (ipPreset?.value === "auto-broadcast") {
      this.ip = ip.value.trim() || this.getBroadcastIP();
    } else if (ipPreset?.value && ipPreset.value !== "custom") {
      this.ip = ipPreset.value;
    } else {
      this.ip = ip.value.trim();
    }

    this.port = parseInt(port.value);
    this.message = message.value.trim();

    // Update the input field to show the resolved IP
    ip.value = this.ip;

    if (this.isValid()) {
      this.sendConfigToServer();
    }
  }

  isValid() {
    if (!this.enabled) return true;
    return this.isValidIP(this.ip) && 
           this.port >= 1 && this.port <= 65535 && 
           this.message.length > 0;
  }

  sendConfigToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "udp-trigger-config",
        enabled: this.enabled,
        ip: this.ip,
        port: this.port,
        message: this.message
      }));
    }
    this.updateStatus();
  }

  isValidIP(ip) {
    const parts = ip.split(".");
    return parts.length === 4 && parts.every(part => {
      const num = parseInt(part);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  }

  updateStatus() {
    const status = this.getElement("udp-trigger-status");
    if (!status) return;
    
    const statusClass = !this.isConnected ? "error" : 
                       this.enabled ? "enabled" : "disabled";

    status.textContent = `(${this.ip}:${this.port} / ${this.message})`;
    status.className = `udp-trigger-status ${statusClass}`;
  }

  sendTrigger(action = "start") {
    if (!this.enabled || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    let message = this.message;
    if (action === "stop") {
      message = this.message.replace(/START/gi, "STOP");
      if (message === this.message) return; // Only send if message actually changed
    }

    this.ws.send(JSON.stringify({
      type: "udp-trigger-send",
      action: action,
      ip: this.ip,
      port: this.port,
      message: message
    }));
  }
}

// Make UDP Trigger globally accessible
window.udpTrigger = null;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.udpTrigger = new UDPTrigger();
});
