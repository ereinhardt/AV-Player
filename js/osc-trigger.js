class OSCTrigger {
  constructor(index = 0) {
    Object.assign(this, {
      index,
      enabled: false,
      ip: "127.0.0.1",
      port: 7000,
      oscAddress: "/trigger/start",
      dataType: "float",
      value: 1.0,
      triggerTime: 0,
      ws: null,
      isConnected: false,
      reconnectTimer: null,
      lastTriggeredTime: -1,
    });
    const s = index > 0 ? `-${index}` : "";
    this.el = [
      "enabled",
      "ip",
      "port",
      "address:oscAddress",
      "datatype:dataType",
      "value",
      "time",
      "ip-preset:ipPreset",
      "apply",
      "status",
    ].reduce((o, k) => {
      const [id, name] = k.split(":");
      o[name || id] = document.getElementById(`osc-trigger-${id}${s}`);
      return o;
    }, {});
    this.setupUI();
    this.connectToServer();
  }

  setupUI() {
    const {
      enabled,
      ip,
      port,
      oscAddress,
      dataType,
      value,
      time,
      ipPreset,
      apply,
    } = this.el;
    if (enabled) enabled.checked = this.enabled;
    if (ip) ip.value = this.ip;
    if (port) port.value = this.port;
    if (oscAddress) oscAddress.value = this.oscAddress;
    if (dataType) dataType.value = this.dataType;
    if (value) value.value = this.value;
    if (time) time.value = this.fmtTime(this.triggerTime);
    if (ipPreset) ipPreset.value = "127.0.0.1";
    enabled?.addEventListener("change", () => this.applySettings());
    dataType?.addEventListener("change", () => this.updateValueInput());
    apply?.addEventListener("click", () => this.applySettings());
    this.updateValueInput();
    this.updateStatus();
  }

  updateValueInput() {
    const { dataType: dt, value: v } = this.el;
    if (!dt || !v) return;
    const isNum = dt.value !== "string",
      wasNum = v.type === "number";
    v.type = isNum ? "number" : "text";
    if (isNum) {
      Object.assign(v, {
        min: "0",
        max: "1",
        step: dt.value === "float" ? "0.01" : "1",
        placeholder: dt.value === "float" ? "0.0 - 1.0" : "0 or 1",
      });
      if (!v.value || isNaN(parseFloat(v.value)))
        v.value = dt.value === "float" ? "1.0" : "1";
    } else {
      ["min", "max", "step"].forEach((a) => v.removeAttribute(a));
      v.placeholder = "Enter text";
      if (!v.value || wasNum) v.value = "START";
    }
  }

  closeWebSocket() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      this.ws.onclose = null;
      if (this.ws.readyState <= 1) this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  connectToServer() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.closeWebSocket();
    this.ws = createWebSocketConnection(
      () => {
        this.isConnected = true;
        this.updateStatus();
        if (this.isValid()) this.sendConfig();
      },
      (e) => {
        try {
          const d = JSON.parse(e.data);
          if (
            d.type === "osc-trigger-sent" &&
            (d.details?.index === this.index ||
              (d.details?.index === undefined && this.index === 0))
          )
            this.showSent(d.details);
        } catch {}
      },
      () => {
        this.isConnected = false;
        this.updateStatus();
        clearTimeout(this.reconnectTimer);
        if (this.ws !== null)
          this.reconnectTimer = setTimeout(() => this.connectToServer(), 3000);
      },
    );
  }

  typeTag(t) {
    return { float: ",f", integer: ",i", string: ",s" }[t] || "";
  }
  fmtVal(t, v) {
    return t === "float" && typeof v === "number" ? v.toFixed(2) : v;
  }
  fmtTime(s) {
    return [s / 3600, (s % 3600) / 60, s % 60]
      .map((n) => String(Math.floor(n)).padStart(2, "0"))
      .join(":");
  }
  parseTime(t) {
    const p = t.split(":").map((n) => parseInt(n) || 0);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : 0;
  }

  showSent(d) {
    if (!this.el.status) return;
    this.el.status.textContent = `(${d.ip}:${d.port} | ${this.fmtTime(
      this.triggerTime,
    )} | ${d.oscAddress} ${this.typeTag(d.dataType)} ${this.fmtVal(
      d.dataType,
      d.value,
    )} - SENT)`;
    this.el.status.className = "osc-trigger-status enabled";
    setTimeout(() => this.updateStatus(), 2000);
  }

  applySettings() {
    const { enabled, ipPreset, ip, port, oscAddress, dataType, value, time } =
      this.el;
    if (!enabled || !ip || !port || !oscAddress || !dataType || !value) return;
    this.enabled = enabled.checked;
    this.port = parseInt(port.value);
    this.oscAddress = oscAddress.value.trim();
    this.dataType = dataType.value;
    this.triggerTime = time ? this.parseTime(time.value) : 0;
    if (this.dataType === "string") this.value = value.value.trim();
    else {
      const v = parseFloat(value.value);
      this.value = isNaN(v)
        ? 1
        : Math.max(
            0,
            Math.min(1, this.dataType === "integer" ? Math.round(v) : v),
          );
      value.value =
        this.dataType === "float" ? this.value.toFixed(2) : this.value;
    }
    this.ip =
      ipPreset?.value === "auto-broadcast"
        ? ip.value.trim() || calculateBroadcastIP()
        : ipPreset?.value && ipPreset.value !== "custom"
          ? ipPreset.value
          : ip.value.trim();
    ip.value = this.ip;
    if (time) time.value = this.fmtTime(this.triggerTime);
    if (this.isValid()) this.sendConfig();
  }

  isValid() {
    return (
      !this.enabled ||
      (isValidIP(this.ip) &&
        this.port >= 1 &&
        this.port <= 65535 &&
        this.oscAddress?.startsWith("/"))
    );
  }

  sendConfig() {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(
        JSON.stringify({
          type: "osc-trigger-config",
          index: this.index,
          enabled: this.enabled,
          ip: this.ip,
          port: this.port,
          oscAddress: this.oscAddress,
          dataType: this.dataType,
          value: this.value,
        }),
      );
    this.updateStatus();
  }

  updateStatus() {
    if (!this.el.status) return;
    const valid = this.oscAddress?.startsWith("/"),
      cls =
        !this.isConnected || (this.enabled && (!this.isValid() || !valid))
          ? "error"
          : this.enabled
            ? "enabled"
            : "disabled";
    this.el.status.textContent = `(${this.ip}:${this.port} | ${this.fmtTime(
      this.triggerTime,
    )} | ${this.oscAddress || "(empty)"} ${this.typeTag(
      this.dataType,
    )} ${this.fmtVal(this.dataType, this.value)})`;
    this.el.status.className = `osc-trigger-status ${cls}`;
  }

  sendTrigger() {
    if (this.enabled && this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(
        JSON.stringify({
          type: "osc-trigger-send",
          index: this.index,
          action: "start",
          ip: this.ip,
          port: this.port,
          oscAddress: this.oscAddress,
          dataType: this.dataType,
          value: this.value,
        }),
      );
  }

  checkAndTrigger(t, playing) {
    if (
      this.enabled &&
      playing &&
      Math.abs(t - this.triggerTime) < 0.5 &&
      this.lastTriggeredTime !== this.triggerTime
    ) {
      this.lastTriggeredTime = this.triggerTime;
      this.sendTrigger();
    }
  }

  resetTrigger() {
    this.lastTriggeredTime = -1;
  }

  destroy() {
    this.closeWebSocket();
    Object.values(this.el).forEach((e) =>
      e?.parentNode?.replaceChild(e.cloneNode(true), e),
    );
    this.el = {};
  }
}

class OSCTriggerManager {
  constructor(count = 8) {
    this.triggers = Array.from({ length: count }, (_, i) => new OSCTrigger(i));
  }
  checkAllTriggers(t, playing) {
    this.triggers.forEach((tr) => tr.checkAndTrigger(t, playing));
  }
  resetAllTriggers() {
    this.triggers.forEach((tr) => tr.resetTrigger());
  }
  destroy() {
    this.triggers.forEach((tr) => tr.destroy());
    this.triggers = [];
  }
}

window.oscTriggerManager = null;
document.addEventListener("DOMContentLoaded", () => {
  window.oscTriggerManager?.destroy();
  window.oscTriggerManager = new OSCTriggerManager(8);
});
window.addEventListener("beforeunload", () => {
  window.oscTriggerManager?.destroy();
  window.oscTriggerManager = null;
});
document.addEventListener("visibilitychange", () => {
  window.oscTriggerManager?.triggers.forEach((tr) =>
    document.hidden ? tr.closeWebSocket() : tr.connectToServer(),
  );
});
