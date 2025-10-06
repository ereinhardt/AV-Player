class UDPTrigger {
  constructor() {
    this.enabled = false;
    this.ip = "127.0.0.1";
    this.port = 9998;
    this.message = "START";
    this.ws = null;
    this.isConnected = false;
    
    // Cache DOM elements once
    this.elements = {
      enabled: document.getElementById("udp-trigger-enabled"),
      ip: document.getElementById("udp-trigger-ip"),
      port: document.getElementById("udp-trigger-port"),
      message: document.getElementById("udp-trigger-message"),
      ipPreset: document.getElementById("udp-trigger-ip-preset"),
      apply: document.getElementById("udp-trigger-apply"),
      status: document.getElementById("udp-trigger-status")
    };
    
    this.setupUI();
    this.connectToServer();
  }

  setupUI() {
    const { enabled, ip, port, message, ipPreset, apply } = this.elements;

    // Set initial values and event handlers in one pass
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

    this.ws.onopen = () => this.setConnectionState(true);
    this.ws.onclose = this.ws.onerror = () => {
      this.setConnectionState(false);
      setTimeout(() => this.connectToServer(), 3000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "udp-trigger-sent") {
          this.showSentStatus(data.details);
        }
      } catch (e) {
        // Ignore malformed messages
      }
    };
  }

  setConnectionState(connected) {
    this.isConnected = connected;
    this.updateStatus();
  }

  showSentStatus(details) {
    if (!this.elements.status) return;
    
    this.elements.status.textContent = `(${details.ip}:${details.port} / ${details.message} - SENT)`;
    this.elements.status.className = "udp-trigger-status enabled";
    setTimeout(() => this.updateStatus(), 2000);
  }

  applySettings() {
    const { enabled, ipPreset, ip, port, message } = this.elements;
    if (!enabled || !ip || !port || !message) return;

    this.enabled = enabled.checked;

    // Resolve IP based on preset selection
    this.ip = ipPreset?.value === "auto-broadcast" ? (ip.value.trim() || this.getBroadcastIP()) :
              ipPreset?.value && ipPreset.value !== "custom" ? ipPreset.value :
              ip.value.trim();

    this.port = parseInt(port.value);
    this.message = message.value.trim();
    ip.value = this.ip; // Update display

    if (this.isValid()) this.sendConfigToServer();
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
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && 
           ip.split(".").every(part => parseInt(part) <= 255);
  }

  updateStatus() {
    if (!this.elements.status) return;
    
    const statusClass = !this.isConnected ? "error" : this.enabled ? "enabled" : "disabled";
    this.elements.status.textContent = `(${this.ip}:${this.port} / ${this.message})`;
    this.elements.status.className = `udp-trigger-status ${statusClass}`;
  }

  sendTrigger(action = "start") {
    if (!this.enabled || this.ws?.readyState !== WebSocket.OPEN) return;

    let message = this.message;
    if (action === "stop") {
      message = this.message.replace(/START/gi, "STOP");
      if (message === this.message) return;
    }

    this.ws.send(JSON.stringify({
      type: "udp-trigger-send",
      action,
      ip: this.ip,
      port: this.port,
      message
    }));
  }
}

// Make UDP Trigger globally accessible
window.udpTrigger = null;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.udpTrigger = new UDPTrigger();
});
