class UDPTrigger {
  // Initialize UDP trigger with default settings and DOM element cache
  constructor(index = 0) {
    this.index = index;
    this.enabled = false;
    this.ip = "127.0.0.1";
    this.port = 9998;
    this.message = "START";
    this.triggerTime = 0; // Trigger time in seconds
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.lastTriggeredTime = -1; // Track last triggered time to avoid duplicates

    // Use index-specific element IDs
    const suffix = index > 0 ? `-${index}` : "";
    this.elements = {
      enabled: document.getElementById(`udp-trigger-enabled${suffix}`),
      ip: document.getElementById(`udp-trigger-ip${suffix}`),
      port: document.getElementById(`udp-trigger-port${suffix}`),
      message: document.getElementById(`udp-trigger-message${suffix}`),
      time: document.getElementById(`udp-trigger-time${suffix}`),
      ipPreset: document.getElementById(`udp-trigger-ip-preset${suffix}`),
      apply: document.getElementById(`udp-trigger-apply${suffix}`),
      status: document.getElementById(`udp-trigger-status${suffix}`),
    };

    this.setupUI();
    this.connectToServer();
  }

  // Set up UI elements and event listeners
  setupUI() {
    const { enabled, ip, port, message, time, ipPreset, apply } = this.elements;

    if (enabled) enabled.checked = this.enabled;
    if (ip) ip.value = this.ip;
    if (port) port.value = this.port;
    if (message) message.value = this.message;
    if (time) time.value = this.formatTime(this.triggerTime);
    if (ipPreset) ipPreset.value = "127.0.0.1";

    enabled?.addEventListener("change", () => {
      this.enabled = enabled.checked;
      this.updateStatus();
    });
    apply?.addEventListener("click", () => this.applySettings());

    this.updateStatus();
  }

  // Clean up WebSocket connection to prevent memory leaks
  closeWebSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;

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

  // Establish WebSocket connection with reconnection logic
  connectToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.closeWebSocket();

    this.ws = createWebSocketConnection(
      () => this.setConnectionState(true),
      (event) => {
        try {
          const data = JSON.parse(event.data);
          // Check if this message is for this specific trigger
          if (data.type === "udp-trigger-sent" && 
              (data.details?.index === this.index || (data.details?.index === undefined && this.index === 0))) {
            this.showSentStatus(data.details);
          }
        } catch (e) {}
      },
      () => {
        this.setConnectionState(false);

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
        }

        if (this.ws !== null) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectToServer();
          }, 3000);
        }
      }
    );
  }

  // Update connection state and status display
  setConnectionState(connected) {
    this.isConnected = connected;
    this.updateStatus();
  }

  // Show temporary status message when UDP message is sent
  showSentStatus(details) {
    if (!this.elements.status) return;

    const timeStr = this.formatTime(this.triggerTime || 0);
    this.elements.status.textContent = `(${details.ip}:${details.port} | ${timeStr} | ${details.message} - SENT)`;
    this.elements.status.className = "udp-trigger-status enabled";
    setTimeout(() => this.updateStatus(), 2000);
  }

  // Apply and validate settings from UI inputs
  applySettings() {
    const { enabled, ipPreset, ip, port, message, time } = this.elements;
    if (!enabled || !ip || !port || !message) return;

    this.enabled = enabled.checked;
    this.port = parseInt(port.value);
    this.message = message.value.trim();
    this.triggerTime = time ? this.parseTime(time.value) : 0;

    // Resolve IP based on preset selection
    this.ip =
      ipPreset?.value === "auto-broadcast"
        ? ip.value.trim() || calculateBroadcastIP()
        : ipPreset?.value && ipPreset.value !== "custom"
        ? ipPreset.value
        : ip.value.trim();

    ip.value = this.ip; // Update display
    if (time) time.value = this.formatTime(this.triggerTime);
    if (this.isValid()) this.sendConfigToServer();
  }

  // Validate current UDP trigger settings
  isValid() {
    return (
      !this.enabled ||
      (isValidIP(this.ip) &&
        this.port >= 1 &&
        this.port <= 65535 &&
        this.message.length > 0)
    );
  }

  // Send configuration to server via WebSocket
  sendConfigToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "udp-trigger-config",
          index: this.index,
          enabled: this.enabled,
          ip: this.ip,
          port: this.port,
          message: this.message,
        })
      );
    }
    this.updateStatus();
  }

  // Update status display with current settings and connection state
  updateStatus() {
    if (!this.elements.status) return;

    const statusClass = !this.isConnected
      ? "error"
      : this.enabled
      ? "enabled"
      : "disabled";
    const timeStr = this.formatTime(this.triggerTime || 0);
    this.elements.status.textContent = `(${this.ip}:${this.port} | ${timeStr} | ${this.message})`;
    this.elements.status.className = `udp-trigger-status ${statusClass}`;
  }

  // Send UDP trigger message for start/stop actions
  sendTrigger(action = "start") {
    if (!this.enabled || this.ws?.readyState !== WebSocket.OPEN) return;

    let message = this.message;
    if (action === "stop") {
      message = this.message.replace(/START/gi, "STOP");
      if (message === this.message) return;
    }

    this.ws.send(
      JSON.stringify({
        type: "udp-trigger-send",
        index: this.index,
        action,
        ip: this.ip,
        port: this.port,
        message,
      })
    );
  }

  // Check if trigger should fire at current time
  checkAndTrigger(currentTime, isPlaying) {
    if (!this.enabled || !isPlaying) return;

    const tolerance = 0.5; // 500ms tolerance
    if (Math.abs(currentTime - this.triggerTime) < tolerance && 
        this.lastTriggeredTime !== this.triggerTime) {
      this.lastTriggeredTime = this.triggerTime;
      this.sendTrigger("start");
    }
  }

  // Reset trigger state (for loop restart or seek)
  resetTrigger() {
    this.lastTriggeredTime = -1;
  }

  // Parse time string (HH:MM:SS) to seconds
  parseTime(timeStr) {
    const parts = timeStr.split(':').map(p => parseInt(p) || 0);
    if (parts.length !== 3) return 0;
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  // Format seconds to time string (HH:MM:SS)
  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Clean up all resources and remove event listeners
  destroy() {
    this.closeWebSocket();

    Object.values(this.elements).forEach((element) => {
      if (element && element.removeEventListener) {
        const newElement = element.cloneNode(true);
        element.parentNode?.replaceChild(newElement, element);
      }
    });

    this.elements = {};
  }
}

// UDP Trigger Manager for handling multiple triggers
class UDPTriggerManager {
  constructor(count = 8) {
    this.triggers = [];
    for (let i = 0; i < count; i++) {
      this.triggers.push(new UDPTrigger(i));
    }
  }

  // Check all triggers at current time
  checkAllTriggers(currentTime, isPlaying) {
    this.triggers.forEach(trigger => trigger.checkAndTrigger(currentTime, isPlaying));
  }

  // Reset all triggers (for loop restart or seek)
  resetAllTriggers() {
    this.triggers.forEach(trigger => trigger.resetTrigger());
  }

  // Get a specific trigger by index
  getTrigger(index) {
    return this.triggers[index];
  }

  // Destroy all triggers
  destroy() {
    this.triggers.forEach(trigger => trigger.destroy());
    this.triggers = [];
  }
}

// Make UDP Trigger Manager globally accessible
window.udpTriggerManager = null;

document.addEventListener("DOMContentLoaded", () => {
  if (window.udpTriggerManager) {
    window.udpTriggerManager.destroy();
  }

  window.udpTriggerManager = new UDPTriggerManager(8);
  
  // Keep backward compatibility
  window.udpTrigger = window.udpTriggerManager.getTrigger(0);
});

window.addEventListener("beforeunload", () => {
  if (window.udpTriggerManager) {
    window.udpTriggerManager.destroy();
    window.udpTriggerManager = null;
    window.udpTrigger = null;
  }
});

// Cleanup on page visibility change (when user switches tabs)
document.addEventListener("visibilitychange", () => {
  if (document.hidden && window.udpTriggerManager) {
    // Temporarily close WebSocket when tab is hidden to save resources
    window.udpTriggerManager.triggers.forEach(trigger => trigger.closeWebSocket());
  } else if (!document.hidden && window.udpTriggerManager) {
    // Reconnect when tab becomes visible again
    window.udpTriggerManager.triggers.forEach(trigger => trigger.connectToServer());
  }
});
