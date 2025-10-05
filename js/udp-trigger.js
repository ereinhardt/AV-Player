class UDPTrigger {
  constructor() {
    this.enabled = false;
    this.ip = "127.0.0.1";
    this.port = 9998;
    this.message = "START";
    this.ws = null;
    this.isConnected = false;
    
    // Cache DOM elements
    this.elements = {
      enabled: document.getElementById("udp-trigger-enabled"),
      ipPreset: document.getElementById("udp-trigger-ip-preset"),
      ip: document.getElementById("udp-trigger-ip"),
      port: document.getElementById("udp-trigger-port"),
      message: document.getElementById("udp-trigger-message"),
      apply: document.getElementById("udp-trigger-apply"),
      status: document.getElementById("udp-trigger-status")
    };
    
    this.setupUI();
    this.connectToServer();
  }

  setupUI() {
    // Set initial values
    if (this.elements.enabled) this.elements.enabled.checked = this.enabled;
    if (this.elements.ip) this.elements.ip.value = this.ip;
    if (this.elements.port) this.elements.port.value = this.port;
    if (this.elements.message) this.elements.message.value = this.message;
    if (this.elements.ipPreset) this.elements.ipPreset.value = "127.0.0.1";

    // Add event listeners
    if (this.elements.apply) {
      this.elements.apply.addEventListener("click", () => this.applySettings());
    }
    if (this.elements.enabled) {
      this.elements.enabled.addEventListener("change", () => {
        this.enabled = this.elements.enabled.checked;
        this.updateStatus();
      });
    }

    this.updateStatus();
  }

  getBroadcastIP(localIP = "192.168.1.1") {
    const parts = localIP.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.255` : "192.168.1.255";
  }

  connectToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.updateStatus();
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.updateStatus();
      setTimeout(() => this.connectToServer(), 3000);
    };

    this.ws.onerror = () => {
      this.isConnected = false;
      this.updateStatus();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleServerMessage(data);
      } catch (e) {
        // Ignore malformed messages
      }
    };
  }

  handleServerMessage(data) {
    switch (data.type) {
      case "udp-trigger-config-updated":
        this.updateStatus();
        break;
      case "udp-trigger-sent":
        this.showSentStatus(data.details);
        break;
      case "udp-trigger-error":
        this.updateStatus();
        break;
    }
  }

  showSentStatus(details) {
    if (!this.elements.status) return;
    
    this.elements.status.textContent = `(${details.ip}:${details.port} / ${details.message} - SENT)`;
    this.elements.status.className = "udp-trigger-status enabled";
    
    setTimeout(() => this.updateStatus(), 2000);
  }

  applySettings() {
    if (!this.elements.enabled || !this.elements.ip || !this.elements.port || !this.elements.message) {
      return;
    }

    this.enabled = this.elements.enabled.checked;

    // Get IP from appropriate source
    if (this.elements.ipPreset?.value === "auto-broadcast") {
      this.ip = this.elements.ip.value.trim() || this.getBroadcastIP();
    } else if (this.elements.ipPreset?.value && this.elements.ipPreset.value !== "custom") {
      this.ip = this.elements.ipPreset.value;
    } else {
      this.ip = this.elements.ip.value.trim();
    }

    this.port = parseInt(this.elements.port.value);
    this.message = this.elements.message.value.trim();

    // Update the input field to show the resolved IP
    this.elements.ip.value = this.ip;

    // Validate and apply settings
    if (this.validateSettings()) {
      this.sendConfigToServer();
    }
  }

  validateSettings() {
    if (!this.enabled) return true;

    if (!this.ip || !this.isValidIP(this.ip)) {
      this.updateStatus();
      return false;
    }
    if (!this.port || this.port < 1 || this.port > 65535) {
      this.updateStatus();
      return false;
    }
    if (!this.message) {
      this.updateStatus();
      return false;
    }
    return true;
  }

  sendConfigToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const config = {
        type: "udp-trigger-config",
        enabled: this.enabled,
        ip: this.ip,
        port: this.port,
        message: this.message,
      };
      this.ws.send(JSON.stringify(config));
      this.updateStatus();
    } else {
      this.updateStatus();
    }
  }

  isValidIP(ip) {
    const parts = ip.split(".");
    return parts.length === 4 && parts.every(part => {
      const num = parseInt(part);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  }

  updateStatus() {
    if (!this.elements.status) return;
    
    let status = "";
    if (!this.isConnected) {
      status = "error";
    } else if (this.enabled) {
      status = "enabled";
    } else {
      status = "disabled";
    }

    this.elements.status.textContent = `(${this.ip}:${this.port} / ${this.message})`;
    this.elements.status.className = `udp-trigger-status ${status}`;
  }

  sendTrigger(action = "start") {
    if (!this.enabled || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    let message = this.message;
    if (action === "stop") {
      message = this.message.replace(/START/gi, "STOP");
      if (message === this.message) return; // Only send if message actually changed
    }

    const trigger = {
      type: "udp-trigger-send",
      action: action,
      ip: this.ip,
      port: this.port,
      message: message,
    };

    this.ws.send(JSON.stringify(trigger));
  }

  triggerStart() {
    this.sendTrigger("start");
  }

  triggerStop() {
    this.sendTrigger("stop");
  }
}

// Make UDP Trigger globally accessible
window.udpTrigger = null;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.udpTrigger = new UDPTrigger();
});
