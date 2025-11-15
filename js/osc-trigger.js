class OSCTrigger {
  constructor(index = 0) {
    this.index = index;
    this.enabled = false;
    this.ip = "127.0.0.1";
    this.port = 7000;
    this.oscAddress = "/trigger/start";
    this.dataType = "float";
    this.value = 1.0;
    this.triggerTime = 0; // Trigger time in seconds
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.lastTriggeredTime = -1; // Track last triggered time to avoid duplicates

    // Use index-specific element IDs
    const suffix = index > 0 ? `-${index}` : "";
    this.elements = {
      enabled: document.getElementById(`osc-trigger-enabled${suffix}`),
      ip: document.getElementById(`osc-trigger-ip${suffix}`),
      port: document.getElementById(`osc-trigger-port${suffix}`),
      oscAddress: document.getElementById(`osc-trigger-address${suffix}`),
      dataType: document.getElementById(`osc-trigger-datatype${suffix}`),
      value: document.getElementById(`osc-trigger-value${suffix}`),
      time: document.getElementById(`osc-trigger-time${suffix}`),
      ipPreset: document.getElementById(`osc-trigger-ip-preset${suffix}`),
      apply: document.getElementById(`osc-trigger-apply${suffix}`),
      status: document.getElementById(`osc-trigger-status${suffix}`),
    };

    this.setupUI();
    this.connectToServer();
  }

  setupUI() {
    const { enabled, ip, port, oscAddress, dataType, value, time, ipPreset, apply } = this.elements;

    if (enabled) enabled.checked = this.enabled;
    if (ip) ip.value = this.ip;
    if (port) port.value = this.port;
    if (oscAddress) oscAddress.value = this.oscAddress;
    if (dataType) dataType.value = this.dataType;
    if (value) value.value = this.value;
    if (time) time.value = this.formatTime(this.triggerTime);
    if (ipPreset) ipPreset.value = "127.0.0.1";

    enabled?.addEventListener("change", () => {
      this.enabled = enabled.checked;
      this.updateStatus();
    });
    dataType?.addEventListener("change", () => this.updateValueInputType());
    apply?.addEventListener("click", () => this.applySettings());

    this.updateValueInputType();
    this.updateStatus();
  }

  updateValueInputType() {
    const { dataType, value } = this.elements;
    if (!dataType || !value) return;

    const isNumeric = dataType.value === "float" || dataType.value === "integer";
    const wasNumeric = value.type === "number";
    
    value.type = isNumeric ? "number" : "text";
    
    if (isNumeric) {
      value.min = "0";
      value.max = "1";
      value.step = dataType.value === "float" ? "0.01" : "1";
      value.placeholder = dataType.value === "float" ? "0.0 - 1.0" : "0 or 1";
      if (!value.value || isNaN(parseFloat(value.value))) {
        value.value = dataType.value === "float" ? "1.0" : "1";
      }
    } else {
      ["min", "max", "step"].forEach(attr => value.removeAttribute(attr));
      value.placeholder = "Enter text";
      // Set to "START" if empty or switching from numeric type
      if (!value.value || wasNumeric) {
        value.value = "START";
      }
    }
  }

  closeWebSocket() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    if (this.ws) {
      ["onopen", "onmessage", "onclose", "onerror"].forEach(e => this.ws[e] = null);
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.isConnected = false;
  }

  connectToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.closeWebSocket();

    this.ws = createWebSocketConnection(
      () => this.setConnectionState(true),
      (event) => {
        try {
          const data = JSON.parse(event.data);
          // Check if this message is for this specific trigger
          if (data.type === "osc-trigger-sent" && 
              (data.details?.index === this.index || (data.details?.index === undefined && this.index === 0))) {
            this.showSentStatus(data.details);
          }
        } catch (e) {}
      },
      () => {
        this.setConnectionState(false);
        clearTimeout(this.reconnectTimer);
        if (this.ws !== null) {
          this.reconnectTimer = setTimeout(() => this.connectToServer(), 3000);
        }
      }
    );
  }

  setConnectionState(connected) {
    this.isConnected = connected;
    this.updateStatus();
  }

  showSentStatus(details) {
    if (!this.elements.status) return;
    
    const typeTag = { float: ",f", integer: ",i", string: ",s" }[details.dataType] || "";
    const valueDisplay = details.dataType === "float" && typeof details.value === "number"
      ? details.value.toFixed(2)
      : details.value;
    const timeStr = this.formatTime(this.triggerTime || 0);
    
    this.elements.status.textContent = `(${details.ip}:${details.port} | ${timeStr} | ${details.oscAddress} ${typeTag} ${valueDisplay} - SENT)`;
    this.elements.status.className = "osc-trigger-status enabled";
    setTimeout(() => this.updateStatus(), 2000);
  }

  applySettings() {
    const { enabled, ipPreset, ip, port, oscAddress, dataType, value, time } = this.elements;
    if (!enabled || !ip || !port || !oscAddress || !dataType || !value) return;

    this.enabled = enabled.checked;
    this.port = parseInt(port.value);
    this.oscAddress = oscAddress.value.trim();
    this.dataType = dataType.value;
    this.triggerTime = time ? this.parseTime(time.value) : 0;

    // Parse value based on data type
    if (this.dataType === "float") {
      const val = parseFloat(value.value);
      this.value = isNaN(val) ? 1.0 : Math.max(0, Math.min(1, val));
      value.value = this.value.toFixed(2);
    } else if (this.dataType === "integer") {
      const val = parseInt(value.value);
      this.value = isNaN(val) ? 1 : Math.max(0, Math.min(1, val));
      value.value = this.value;
    } else {
      this.value = value.value.trim();
    }

    // Resolve IP
    this.ip = ipPreset?.value === "auto-broadcast"
      ? ip.value.trim() || calculateBroadcastIP()
      : ipPreset?.value && ipPreset.value !== "custom"
      ? ipPreset.value
      : ip.value.trim();

    ip.value = this.ip;
    if (time) time.value = this.formatTime(this.triggerTime);
    if (this.isValid()) this.sendConfigToServer();
  }

  isValid() {
    return !this.enabled || (
      isValidIP(this.ip) &&
      this.port >= 1 && this.port <= 65535 &&
      this.oscAddress.length > 0 &&
      this.oscAddress.startsWith("/")
    );
  }

  sendConfigToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "osc-trigger-config",
        index: this.index,
        enabled: this.enabled,
        ip: this.ip,
        port: this.port,
        oscAddress: this.oscAddress,
        dataType: this.dataType,
        value: this.value,
      }));
    }
    this.updateStatus();
  }

  updateStatus() {
    if (!this.elements.status) return;

    const hasValidAddress = this.oscAddress?.length > 0 && this.oscAddress.startsWith("/");
    const statusClass = !this.isConnected || (!this.isValid() && this.enabled) || (this.enabled && !hasValidAddress)
      ? "error"
      : this.enabled ? "enabled" : "disabled";

    const typeTag = { float: ",f", integer: ",i", string: ",s" }[this.dataType] || "";
    const valueDisplay = this.dataType === "float" && typeof this.value === "number"
      ? this.value.toFixed(2)
      : this.value;
    const timeStr = this.formatTime(this.triggerTime || 0);

    this.elements.status.textContent = `(${this.ip}:${this.port} / ${timeStr} / ${this.oscAddress || "(empty)"} ${typeTag} ${valueDisplay})`;
    this.elements.status.className = `osc-trigger-status ${statusClass}`;
  }

  sendTrigger(action = "start") {
    if (!this.enabled || this.ws?.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      type: "osc-trigger-send",
      index: this.index,
      action,
      ip: this.ip,
      port: this.port,
      oscAddress: this.oscAddress,
      dataType: this.dataType,
      value: this.value,
    }));
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

  destroy() {
    this.closeWebSocket();
    Object.values(this.elements).forEach(el => {
      if (el?.removeEventListener) {
        el.parentNode?.replaceChild(el.cloneNode(true), el);
      }
    });
    this.elements = {};
  }
}

// OSC Trigger Manager for handling multiple triggers
class OSCTriggerManager {
  constructor(count = 8) {
    this.triggers = [];
    for (let i = 0; i < count; i++) {
      this.triggers.push(new OSCTrigger(i));
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

window.oscTriggerManager = null;

document.addEventListener("DOMContentLoaded", () => {
  window.oscTriggerManager?.destroy();
  window.oscTriggerManager = new OSCTriggerManager(8);
  
  // Keep backward compatibility
  window.oscTrigger = window.oscTriggerManager.getTrigger(0);
});

window.addEventListener("beforeunload", () => {
  if (window.oscTriggerManager) {
    window.oscTriggerManager.destroy();
    window.oscTriggerManager = null;
    window.oscTrigger = null;
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && window.oscTriggerManager) {
    window.oscTriggerManager.triggers.forEach(trigger => trigger.closeWebSocket());
  } else if (!document.hidden && window.oscTriggerManager) {
    window.oscTriggerManager.triggers.forEach(trigger => trigger.connectToServer());
  }
});
