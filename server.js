#!/usr/bin/env node
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const dgram = require("dgram");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const AudioEngine = require("./js/audio-engine");

class IntegratedArtNetServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });

    this.sessions = new Map();
    this.sessionCounter = 0;
    this.artNetIP = "127.0.0.1";
    this.artNetPort = 6454;

    this.udpTriggers = Array.from({ length: 8 }, () => ({
      enabled: false,
      ip: "192.168.178.255",
      port: 9998,
      message: "START",
    }));
    this.oscTriggers = Array.from({ length: 8 }, () => ({
      enabled: false,
      ip: "127.0.0.1",
      port: 7000,
      oscAddress: "/trigger/start",
      dataType: "float",
      value: 1.0,
    }));
    this.udpReceive = {
      enabled: false,
      port: 9998,
      message: "PLAY",
      socket: null,
    };

    // Clean av-data on start
    const uploadsDir = path.join(__dirname, "av-data");
    if (fs.existsSync(uploadsDir))
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    fs.mkdirSync(uploadsDir, { recursive: true });

    this.maxUploadSizeBytes = 16 * 1024 * 1024 * 1024;

    // Multer upload
    this.upload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) =>
          cb(
            null,
            `track-${req.params.sessionId}-${req.params.trackIndex}-${Date.now()}${path.extname(file.originalname)}`,
          ),
      }),
      limits: { fileSize: this.maxUploadSizeBytes },
    });

    const handleUpload = (req, res, next) => {
      this.upload.single("file")(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          const gb = this.maxUploadSizeBytes / (1024 ** 3);
          return res.status(413).json({
            error: `File too large. Maximum upload size is ${gb} GB.`,
          });
        }
        console.error("Upload middleware error:", err.message);
        return res.status(400).json({ error: err.message || "Upload failed" });
      });
    };

    this.app.use(express.static(__dirname));
    this.app.get("/", (req, res) =>
      res.sendFile(path.join(__dirname, "index.html")),
    );

    // Upload endpoint (session-aware)
    this.app.post(
      "/upload/:sessionId/:trackIndex",
      handleUpload,
      async (req, res) => {
        const trackIndex = parseInt(req.params.trackIndex);
        if (isNaN(trackIndex) || trackIndex < 0 || trackIndex > 31)
          return res.status(400).json({ error: "Invalid track index" });
        if (!req.file)
          return res.status(400).json({ error: "No file uploaded" });
        const session = this.sessions.get(req.params.sessionId);
        if (!session)
          return res.status(404).json({ error: "Session not found" });
        try {
          const info = await session.engine.loadTrack(
            trackIndex,
            req.file.path,
            trackIndex >= 24,
          );
          res.json({
            success: true,
            trackIndex,
            duration: info.duration,
            channels: info.channels,
            totalFrames: info.totalFrames,
          });
        } catch (e) {
          console.error("Upload/decode error:", e.message);
          res.status(500).json({ error: e.message });
        }
      },
    );

    const makeSocket = () => {
      const s = dgram.createSocket("udp4");
      s.bind(() => s.setBroadcast(true));
      return s;
    };
    this.udpSocket = dgram.createSocket("udp4");
    this.udpTriggerSockets = Array.from({ length: 8 }, makeSocket);
    this.oscTriggerSockets = Array.from({ length: 8 }, makeSocket);

    this.setupWebSocket();

    // Position broadcast (20 Hz per session)
    this.positionInterval = setInterval(() => {
      for (const [, s] of this.sessions) {
        if (s.ws.readyState === WebSocket.OPEN)
          this.send(s.ws, "audio-position", "", s.engine.getPlaybackState());
      }
    }, 50);
  }

  setupWebSocket() {
    this.wss.on("connection", (ws) => {
      const sessionId = String(++this.sessionCounter);
      this.sessions.set(sessionId, { engine: new AudioEngine(), ws });
      this.send(ws, "session-id", "Session assigned", { sessionId });

      ws.on("message", (msg) => {
        try {
          this.handleMessage(ws, JSON.parse(msg), sessionId);
        } catch {
          this.send(ws, "error", "Invalid message format");
        }
      });

      const cleanup = () => {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.engine.shutdown();
          this.sessions.delete(sessionId);
        }
      };
      ws.on("close", cleanup);
      ws.on("error", cleanup);
    });
  }

  send(ws, type, message, data = {}) {
    ws.send(JSON.stringify({ type, message, ...data }));
  }

  broadcast(type, data = {}) {
    const msg = JSON.stringify({ type, ...data });
    for (const [, s] of this.sessions)
      if (s.ws.readyState === WebSocket.OPEN) s.ws.send(msg);
  }

  getSessionEngine(sessionId) {
    return this.sessions.get(sessionId)?.engine;
  }

  handleMessage(ws, data, sessionId) {
    const handlers = {
      "artnet-timecode": this.sendArtNet,
      "configure-artnet": this.configureArtNet,
      "udp-trigger-config": this.configureUDP,
      "udp-trigger-send": this.sendUDP,
      "udp-receive-config": this.configureUDPReceive,
      "osc-trigger-config": this.configureOSC,
      "osc-trigger-send": this.sendOSC,
      // ── Audio Engine handlers ──
      "audio-get-devices": this.handleAudioGetDevices,
      "audio-set-device": this.handleAudioSetDevice,
      "audio-set-channel": this.handleAudioSetChannel,
      "audio-set-volume": this.handleAudioSetVolume,
      "audio-set-mute": this.handleAudioSetMute,
      "audio-set-channel-volume": this.handleAudioSetChannelVolume,
      "audio-set-channel-mute": this.handleAudioSetChannelMute,
      "audio-set-master-volume": this.handleAudioSetMasterVolume,
      "audio-set-master-mute": this.handleAudioSetMasterMute,
      "audio-play": this.handleAudioPlay,
      "audio-pause": this.handleAudioPause,
      "audio-reset": this.handleAudioReset,
      "audio-set-loop": this.handleAudioSetLoop,
      "audio-remove-track": this.handleAudioRemoveTrack,
    };
    handlers[data.type]?.call(this, data, ws, sessionId);
  }

  sendArtNet(data, ws) {
    this.udpSocket.send(
      Buffer.from(data.packet),
      this.artNetPort,
      this.artNetIP,
      (err) => {
        if (err && !this.artNetIP.endsWith(".255"))
          this.send(ws, "error", `Art-Net send failed: ${err.message}`);
      },
    );
  }

  configureArtNet(data) {
    if (data.ip?.trim()) this.artNetIP = data.ip.trim();
    if (data.port >= 1 && data.port <= 65535) this.artNetPort = data.port;
  }

  configureUDP(data, ws) {
    const { index = 0, enabled, ip, port, message } = data;
    if (index < 0 || index >= 8)
      return this.send(
        ws,
        "udp-trigger-error",
        `Invalid trigger index: ${index}`,
      );
    const t = this.udpTriggers[index];
    if (typeof enabled === "boolean") t.enabled = enabled;
    if (ip?.trim()) t.ip = ip.trim();
    if (port >= 1 && port <= 65535) t.port = port;
    if (message?.trim()) t.message = message.trim();
  }

  configureUDPReceive(data, ws) {
    const { enabled, port, message } = data;
    if (typeof enabled === "boolean") this.udpReceive.enabled = enabled;
    if (message?.trim()) this.udpReceive.message = message.trim();
    const portChanged =
      port >= 1 && port <= 65535 && port !== this.udpReceive.port;
    if (portChanged) this.udpReceive.port = port;

    // Close socket if disabled or port changed
    if (!this.udpReceive.enabled || portChanged) {
      if (this.udpReceive.socket)
        try {
          this.udpReceive.socket.close();
        } catch {}
      this.udpReceive.socket = null;
    }
    // Create socket if enabled and not already listening
    if (this.udpReceive.enabled && !this.udpReceive.socket)
      this.setupUDPReceiveSocket();
  }

  setupUDPReceiveSocket() {
    if (this.udpReceive.socket) return;
    this.udpReceive.socket = dgram.createSocket({
      type: "udp4",
      reuseAddr: true,
    });
    this.udpReceive.socket.on("message", (msg, rinfo) => {
      const received = msg.toString().trim();
      if (this.udpReceive.enabled && received === this.udpReceive.message) {
        this.broadcast("udp-receive-triggered", {
          message: received,
          from: `${rinfo.address}:${rinfo.port}`,
        });
      }
    });
    this.udpReceive.socket.on("error", (err) =>
      console.error("UDP Receive socket error:", err.message),
    );
    this.udpReceive.socket.bind(this.udpReceive.port);
  }

  sendUDP(data, ws) {
    const { index = 0 } = data;
    if (index < 0 || index >= 8)
      return this.send(
        ws,
        "udp-trigger-error",
        `Invalid trigger index: ${index}`,
      );
    const t = this.udpTriggers[index];
    if (!t.enabled)
      return this.send(
        ws,
        "udp-trigger-error",
        `UDP Trigger ${index + 1} is disabled`,
      );
    const msg =
      data.action === "stop" ? "STOP" : data.message || t.message || "START";
    this.udpTriggerSockets[index].send(
      Buffer.from(msg, "ascii"),
      t.port,
      t.ip,
      (err) => {
        err
          ? this.send(
              ws,
              "udp-trigger-error",
              `UDP Trigger ${index + 1} send failed: ${err.message}`,
            )
          : this.send(
              ws,
              "udp-trigger-sent",
              `Message "${msg}" sent from Trigger ${index + 1}`,
              {
                details: {
                  index,
                  message: msg,
                  ip: t.ip,
                  port: t.port,
                  action: data.action,
                },
              },
            );
      },
    );
  }

  configureOSC(data, ws) {
    const { index = 0, enabled, ip, port, oscAddress, dataType, value } = data;
    if (index < 0 || index >= 8)
      return this.send(
        ws,
        "osc-trigger-error",
        `Invalid trigger index: ${index}`,
      );
    const t = this.oscTriggers[index];
    if (typeof enabled === "boolean") t.enabled = enabled;
    if (ip?.trim()) t.ip = ip.trim();
    if (port >= 1 && port <= 65535) t.port = port;
    if (oscAddress?.trim()?.startsWith("/")) t.oscAddress = oscAddress.trim();
    if (["float", "integer", "string"].includes(dataType))
      t.dataType = dataType;
    if (value !== undefined) t.value = value;
  }

  encodeOSCMessage(address, dataType, value) {
    const pad = (buf) =>
      Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
    const buffers = [pad(Buffer.from(address + "\0"))];
    const typeTag =
      "," + (dataType === "float" ? "f" : dataType === "integer" ? "i" : "s");
    buffers.push(pad(Buffer.from(typeTag + "\0")));
    if (dataType === "float") {
      const b = Buffer.alloc(4);
      b.writeFloatBE(parseFloat(value), 0);
      buffers.push(b);
    } else if (dataType === "integer") {
      const b = Buffer.alloc(4);
      b.writeInt32BE(parseInt(value), 0);
      buffers.push(b);
    } else buffers.push(pad(Buffer.from(String(value) + "\0")));
    return Buffer.concat(buffers);
  }

  sendOSC(data, ws) {
    const { index = 0 } = data;
    if (index < 0 || index >= 8)
      return this.send(
        ws,
        "osc-trigger-error",
        `Invalid trigger index: ${index}`,
      );
    const t = this.oscTriggers[index];
    if (!t.enabled)
      return this.send(
        ws,
        "osc-trigger-error",
        `OSC Trigger ${index + 1} is disabled`,
      );
    this.oscTriggerSockets[index].send(
      this.encodeOSCMessage(t.oscAddress, t.dataType, t.value),
      t.port,
      t.ip,
      (err) => {
        err
          ? this.send(
              ws,
              "osc-trigger-error",
              `OSC Trigger ${index + 1} send failed: ${err.message}`,
            )
          : this.send(
              ws,
              "osc-trigger-sent",
              `OSC sent from Trigger ${index + 1}`,
              {
                details: {
                  index,
                  oscAddress: t.oscAddress,
                  value: t.value,
                  dataType: t.dataType,
                  ip: t.ip,
                  port: t.port,
                  action: data.action,
                },
              },
            );
      },
    );
  }

  start(port = 3001) {
    this.server.listen(port, () =>
      console.log(`Web Interface: http://localhost:${port}`),
    );
  }

  stop() {
    if (this.positionInterval) clearInterval(this.positionInterval);
    for (const [, s] of this.sessions) s.engine.shutdown();
    this.sessions.clear();
    this.wss.close();
    this.udpSocket.close();
    this.udpTriggerSockets.forEach((s) => s.close());
    this.oscTriggerSockets.forEach((s) => s.close());
    if (this.udpReceive.socket)
      try {
        this.udpReceive.socket.close();
      } catch {}
    this.server.close();
  }

  /* ─── Audio Handlers ─── */

  handleAudioGetDevices(data, ws, sessionId) {
    const engine = this.getSessionEngine(sessionId);
    if (!engine) return;
    const devices = engine.getOutputDevices();
    const def = devices.find((d) => d.defaultOutput);
    this.send(ws, "audio-devices", "Device list", {
      devices,
      defaultDeviceId: def?.id ?? -1,
      defaultChannels: def?.maxOutputChannels ?? 2,
    });
  }

  handleAudioSetDevice(data, ws, sessionId) {
    const engine = this.getSessionEngine(sessionId);
    if (!engine) return;
    const { trackIndex, deviceId } = data;
    if (trackIndex == null || deviceId == null)
      return this.send(ws, "audio-error", "Missing trackIndex or deviceId");
    const r = engine.setTrackDevice(trackIndex, deviceId);
    this.send(ws, "audio-device-changed", "Device changed", {
      trackIndex,
      deviceId,
      channels: r.channels,
      success: r.success,
      error: r.error,
    });
  }

  handleAudioSetChannel(data, ws, sessionId) {
    const engine = this.getSessionEngine(sessionId);
    if (!engine) return;
    const { trackIndex, sourceChannel, outputChannel, allSources } = data;
    if (trackIndex == null || outputChannel == null)
      return this.send(ws, "audio-error", "Missing channel parameters");
    if (allSources) engine.setAllChannelsToOutput(trackIndex, outputChannel);
    else {
      if (sourceChannel == null)
        return this.send(ws, "audio-error", "Missing sourceChannel");
      engine.setChannelMapping(trackIndex, sourceChannel, outputChannel);
    }
  }

  handleAudioSetVolume(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (e && data.trackIndex != null && data.volume != null)
      e.setTrackVolume(data.trackIndex, data.volume);
  }
  handleAudioSetMute(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (e && data.trackIndex != null && data.muted != null)
      e.setTrackMute(data.trackIndex, data.muted);
  }
  handleAudioSetChannelVolume(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (e) e.setChannelVolume(data.trackIndex, data.sourceChannel, data.volume);
  }
  handleAudioSetChannelMute(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (e) e.setChannelMute(data.trackIndex, data.sourceChannel, data.muted);
  }
  handleAudioSetMasterVolume(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (e && data.volume != null) e.setMasterVolume(data.volume);
  }
  handleAudioSetMasterMute(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (e && data.muted != null) e.setMasterMute(data.muted);
  }

  handleAudioPlay(data, ws, sessionId) {
    const engine = this.getSessionEngine(sessionId);
    if (!engine) return;
    engine.play()
      ? this.send(ws, "audio-transport", "Playing", { action: "play" })
      : this.send(
          ws,
          "audio-error",
          "Cannot play: no tracks loaded or output error",
        );
  }

  handleAudioPause(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (e) {
      e.pause();
      this.send(ws, "audio-transport", "Paused", { action: "pause" });
    }
  }
  handleAudioReset(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (e) {
      e.reset();
      this.send(ws, "audio-transport", "Reset", { action: "reset" });
    }
  }

  handleAudioSetLoop(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (e && data.loop != null) e.setLooping(data.loop);
  }

  handleAudioRemoveTrack(data, ws, sid) {
    const e = this.getSessionEngine(sid);
    if (!e || data.trackIndex == null) return;
    e.removeTrack(data.trackIndex);
  }
}

if (require.main === module) {
  const server = new IntegratedArtNetServer();
  server.start();
  const shutdown = () => {
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
