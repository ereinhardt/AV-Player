class OSCTrigger {
  constructor() {
    this.enabled = false;
    this.ip = "127.0.0.1";
    this.port = 7000;
    this.oscAddress = "/trigger/start";
    this.dataType = "float";
    this.value = 1.0;
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;

    this.elements = {
      enabled: document.getElementById("osc-trigger-enabled"),
      ip: document.getElementById("osc-trigger-ip"),
      port: document.getElementById("osc-trigger-port"),
      oscAddress: document.getElementById("osc-trigger-address"),
      dataType: document.getElementById("osc-trigger-datatype"),
      value: document.getElementById("osc-trigger-value"),
      ipPreset: document.getElementById("osc-trigger-ip-preset"),
      apply: document.getElementById("osc-trigger-apply"),
      status: document.getElementById("osc-trigger-status"),
    };

    this.setupUI();
    this.connectToServer();
  }

  setupUI() {
    const { enabled, ip, port, oscAddress, dataType, value, ipPreset, apply } = this.elements;

    if (enabled) enabled.checked = this.enabled;
    if (ip) ip.value = this.ip;
    if (port) port.value = this.port;
    if (oscAddress) oscAddress.value = this.oscAddress;
    if (dataType) dataType.value = this.dataType;
    if (value) value.value = this.value;
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
      if (!value.value) value.value = "START";
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
          if (data.type === "osc-trigger-sent") this.showSentStatus(data.details);
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
    
    this.elements.status.textContent = `(${details.ip}:${details.port} / ${details.oscAddress} ${typeTag} ${valueDisplay} - SENT)`;
    this.elements.status.className = "osc-trigger-status enabled";
    setTimeout(() => this.updateStatus(), 2000);
  }

  applySettings() {
    const { enabled, ipPreset, ip, port, oscAddress, dataType, value } = this.elements;
    if (!enabled || !ip || !port || !oscAddress || !dataType || !value) return;

    this.enabled = enabled.checked;
    this.port = parseInt(port.value);
    this.oscAddress = oscAddress.value.trim();
    this.dataType = dataType.value;

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

    this.elements.status.textContent = `(${this.ip}:${this.port} / ${this.oscAddress || "(empty)"} ${typeTag} ${valueDisplay})`;
    this.elements.status.className = `osc-trigger-status ${statusClass}`;
  }

  sendTrigger(action = "start") {
    if (!this.enabled || this.ws?.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      type: "osc-trigger-send",
      action,
      ip: this.ip,
      port: this.port,
      oscAddress: this.oscAddress,
      dataType: this.dataType,
      value: this.value,
    }));
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

window.oscTrigger = null;

document.addEventListener("DOMContentLoaded", () => {
  window.oscTrigger?.destroy();
  window.oscTrigger = new OSCTrigger();
});

window.addEventListener("beforeunload", () => {
  window.oscTrigger?.destroy();
  window.oscTrigger = null;
});

document.addEventListener("visibilitychange", () => {
  if (!window.oscTrigger) return;
  document.hidden ? window.oscTrigger.closeWebSocket() : window.oscTrigger.connectToServer();
});
