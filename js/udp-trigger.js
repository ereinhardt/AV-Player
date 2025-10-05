class UDPTrigger {
  constructor() {
    this.enabled = false;
    this.ip = "127.0.0.1"; // Default to localhost
    this.port = 9998;
    this.message = "START";
    this.ws = null;
    this.hasError = false;
    this.setupUI();
    this.connectToServer();
  }

  async setupUI() {
    // Get UI elements
    this.enabledCheckbox = document.getElementById("udp-trigger-enabled");
    this.ipPresetSelect = document.getElementById("udp-trigger-ip-preset");
    this.ipInput = document.getElementById("udp-trigger-ip");
    this.portInput = document.getElementById("udp-trigger-port");
    this.messageInput = document.getElementById("udp-trigger-message");
    this.applyButton = document.getElementById("udp-trigger-apply");
    this.statusDisplay = document.getElementById("udp-trigger-status");

    // Set initial values
    if (this.enabledCheckbox) this.enabledCheckbox.checked = this.enabled;
    if (this.ipInput) this.ipInput.value = this.ip;
    if (this.portInput) this.portInput.value = this.port;
    if (this.messageInput) this.messageInput.value = this.message;

    // Set initial preset selection to localhost
    if (this.ipPresetSelect) {
      this.ipPresetSelect.value = "127.0.0.1";
    }

    // Add event listeners
    if (this.applyButton) {
      this.applyButton.addEventListener("click", () => this.applySettings());
    }

    // Add event listener for enable checkbox to update status immediately
    if (this.enabledCheckbox) {
      this.enabledCheckbox.addEventListener("change", () => {
        this.enabled = this.enabledCheckbox.checked;
        this.hasError = false; // Clear error state when toggling
        this.updateStatus(
          `(${this.ip}:${this.port} / ${this.message})`,
          this.enabled ? "enabled" : "disabled"
        );
      });
    }

    // Set initial status
    this.updateStatus(
      `(${this.ip}:${this.port} / ${this.message})`,
      this.enabled ? "enabled" : "disabled"
    );
  }

  // Simplified method to get broadcast IP
  getBroadcastIP(localIP = "192.168.1.1") {
    const parts = localIP.split(".");
    if (parts.length === 4) {
      // Assume /24 subnet
      return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
    }
    return "192.168.1.255"; // Default fallback
  }

  connectToServer() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.hasError = false;
      this.updateStatus(
        `(${this.ip}:${this.port} / ${this.message})`,
        this.enabled ? "enabled" : "disabled"
      );
    };

    this.ws.onclose = () => {
      this.hasError = true;
      this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, "error");
      setTimeout(() => this.connectToServer(), 3000);
    };

    this.ws.onerror = () => {
      this.hasError = true;
      this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, "error");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "udp-trigger-config-updated") {
          this.hasError = false;
          this.updateStatus(
            `(${this.ip}:${this.port} / ${this.message})`,
            this.enabled ? "enabled" : "disabled"
          );
        } else if (data.type === "udp-trigger-sent") {
          this.hasError = false;
          // Temporarily show SENT status
          this.statusDisplay.textContent = `(${data.details.ip}:${data.details.port} / ${data.details.message} - SENT)`;
          this.statusDisplay.className = `udp-trigger-status enabled`;
          // Reset to ready status after 2 seconds
          setTimeout(() => {
            this.updateStatus(
              `(${this.ip}:${this.port} / ${this.message})`,
              "enabled"
            );
          }, 2000);
        } else if (data.type === "udp-trigger-error") {
          this.hasError = true;
          this.updateStatus(
            `(${this.ip}:${this.port} / ${this.message})`,
            "error"
          );
        }
      } catch (e) {
        // Ignore malformed messages
      }
    };
  }

  async applySettings() {
    if (
      !this.enabledCheckbox ||
      !this.ipInput ||
      !this.portInput ||
      !this.messageInput
    ) {
      return;
    }

    this.enabled = this.enabledCheckbox.checked;

    // Get IP from appropriate source
    if (this.ipPresetSelect && this.ipPresetSelect.value === "auto-broadcast") {
      // Use the IP that was already detected and stored in the input field by ip-config.js
      this.ip = this.ipInput.value.trim() || this.getBroadcastIP();
    } else if (this.ipPresetSelect && this.ipPresetSelect.value !== "custom") {
      // Use the preset value directly (including broadcast IPs like 192.168.178.255)
      this.ip = this.ipPresetSelect.value;
    } else {
      this.ip = this.ipInput.value.trim();
    }

    this.port = parseInt(this.portInput.value);
    this.message = this.messageInput.value.trim();

    // Update the input field to show the resolved IP
    if (this.ipInput) {
      this.ipInput.value = this.ip;
    }

    // Validate and apply settings
    if (this.validateSettings()) {
      this.hasError = false;
      this.sendConfigToServer();
    }
  }

  validateSettings() {
    if (!this.enabled) return true;

    if (!this.ip || !this.isValidIP(this.ip)) {
      this.hasError = true;
      this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, "error");
      return false;
    }
    if (!this.port || this.port < 1 || this.port > 65535) {
      this.hasError = true;
      this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, "error");
      return false;
    }
    if (!this.message) {
      this.hasError = true;
      this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, "error");
      return false;
    }
    return true;
  }

  sendConfigToServer() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const config = {
        type: "udp-trigger-config",
        enabled: this.enabled,
        ip: this.ip,
        port: this.port,
        message: this.message,
      };
      this.ws.send(JSON.stringify(config));
      this.updateStatus(
        `(${this.ip}:${this.port} / ${this.message})`,
        this.enabled ? "enabled" : "disabled"
      );
    } else {
      this.hasError = true;
      this.updateStatus(`(${this.ip}:${this.port} / ${this.message})`, "error");
    }
  }

  isValidIP(ip) {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;

    const parts = ip.split(".");
    return parts.every((part) => {
      const num = parseInt(part);
      return num >= 0 && num <= 255;
    });
  }

  updateStatus(message, status) {
    if (this.statusDisplay) {
      // Always show the standard format
      const standardMessage = `(${this.ip}:${this.port} / ${this.message})`;
      this.statusDisplay.textContent = standardMessage;

      // Use error styling if hasError is true, otherwise use the provided status
      const finalStatus = this.hasError ? "error" : status;
      this.statusDisplay.className = `udp-trigger-status ${finalStatus}`;
    }
  }

  // Unified method for sending triggers
  sendTrigger(action = "start") {
    if (!this.enabled || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    let message = this.message;
    if (action === "stop") {
      message = this.message.replace(/START/gi, "STOP");
      // Only send if message actually changed
      if (message === this.message) return;
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

  // Method to be called when playback starts
  triggerStart() {
    this.sendTrigger("start");
  }

  // Method to be called when playback stops
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
