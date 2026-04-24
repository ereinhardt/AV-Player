class UDPTrigger {
  constructor(index = 0) {
    Object.assign(this, {
      index,
      enabled: false,
      ip: "127.0.0.1",
      port: 9998,
      message: "START",
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
      "message",
      "time",
      "ip-preset:ipPreset",
      "apply",
      "status",
    ].reduce((o, k) => {
      const [id, name] = k.split(":");
      o[name || id] = document.getElementById(`udp-trigger-${id}${s}`);
      return o;
    }, {});
    this.setupUI();
    this.connectToServer();
  }

  setupUI() {
    const { enabled, ip, port, message, time, ipPreset, apply } = this.el;
    if (enabled) enabled.checked = this.enabled;
    if (ip) ip.value = this.ip;
    if (port) port.value = this.port;
    if (message) message.value = this.message;
    if (time) time.value = this.fmtTime(this.triggerTime);
    if (ipPreset) ipPreset.value = "127.0.0.1";
    enabled?.addEventListener("change", () => this.applySettings());
    apply?.addEventListener("click", () => this.applySettings());
    this.updateStatus();
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
            d.type === "udp-trigger-sent" &&
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
    )} | ${d.message} - SENT)`;
    this.el.status.className = "udp-trigger-status enabled";
    setTimeout(() => this.updateStatus(), 2000);
  }

  applySettings() {
    const { enabled, ipPreset, ip, port, message, time } = this.el;
    if (!enabled || !ip || !port || !message) return;
    this.enabled = enabled.checked;
    this.port = parseInt(port.value);
    this.message = message.value.trim();
    this.triggerTime = time ? this.parseTime(time.value) : 0;
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
        this.message.length > 0)
    );
  }

  sendConfig() {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(
        JSON.stringify({
          type: "udp-trigger-config",
          index: this.index,
          enabled: this.enabled,
          ip: this.ip,
          port: this.port,
          message: this.message,
        }),
      );
    this.updateStatus();
  }

  updateStatus() {
    if (!this.el.status) return;
    const cls = !this.isConnected
      ? "error"
      : this.enabled
        ? "enabled"
        : "disabled";
    this.el.status.textContent = `(${this.ip}:${this.port} | ${this.fmtTime(
      this.triggerTime,
    )} | ${this.message})`;
    this.el.status.className = `udp-trigger-status ${cls}`;
  }

  sendTrigger() {
    if (!this.enabled || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "udp-trigger-send",
        index: this.index,
        action: "start",
        ip: this.ip,
        port: this.port,
        message: this.message,
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

class UDPTriggerManager {
  constructor(count = 8) {
    this.triggers = Array.from({ length: count }, (_, i) => new UDPTrigger(i));
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

window.udpTriggerManager = null;
document.addEventListener("DOMContentLoaded", () => {
  window.udpTriggerManager?.destroy();
  window.udpTriggerManager = new UDPTriggerManager(8);
});
window.addEventListener("beforeunload", () => {
  window.udpTriggerManager?.destroy();
  window.udpTriggerManager = null;
});
document.addEventListener("visibilitychange", () => {
  window.udpTriggerManager?.triggers.forEach((tr) =>
    document.hidden ? tr.closeWebSocket() : tr.connectToServer(),
  );
});
