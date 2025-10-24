#!/usr/bin/env node

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const dgram = require("dgram");
const path = require("path");

class IntegratedArtNetServer {
  constructor() {
    // Server setup
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.clients = new Set();

    // Configuration
    this.config = {
      artNet: { ip: "127.0.0.1", port: 6454 },
      udpTrigger: { enabled: false, ip: "192.168.178.255", port: 9998, message: "START" },
    };

    // UDP sockets
    this.udpSocket = dgram.createSocket("udp4");
    this.udpTriggerSocket = dgram.createSocket("udp4");
    this.udpTriggerSocket.bind(() => this.udpTriggerSocket.setBroadcast(true));

    // UDP Float listeners
    this.udpFloatListeners = new Map();
    this.udpFloatSubscribers = new Map();

    // Static files
    this.app.use(express.static(__dirname));
    this.app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

    this.setupWebSocket();
  }

  setupWebSocket() {
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      const { ip, port } = this.config.artNet;
      this.send(ws, "status", `Connected. Target: ${ip}:${port}`);

      ws.on("message", (msg) => {
        try {
          this.handleMessage(ws, JSON.parse(msg));
        } catch {
          this.send(ws, "error", "Invalid message format");
        }
      });

      const cleanup = () => {
        this.unsubscribeUdpFloat({}, ws);
        this.clients.delete(ws);
      };

      ws.on("close", cleanup);
      ws.on("error", cleanup);
    });
  }

  send(ws, type, message, data = {}) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, message, ...data }));
    }
  }

  handleMessage(ws, data) {
    const handlers = {
      "artnet-timecode": this.sendArtNet,
      "configure-artnet": this.configureArtNet,
      "udp-trigger-config": this.configureUDP,
      "udp-trigger-send": this.sendUDP,
      "udp-float-subscribe": this.subscribeUdpFloat,
      "udp-float-unsubscribe": this.unsubscribeUdpFloat,
    };
    handlers[data.type]?.call(this, data, ws);
  }

  sendArtNet(data, ws) {
    const { ip, port } = this.config.artNet;
    const buffer = Buffer.from(data.packet);

    this.udpSocket.send(buffer, port, ip, (error) => {
      if (error && !ip.endsWith(".255")) {
        this.send(ws, "error", `Art-Net send failed: ${error.message}`);
      } else {
        this.send(ws, "artnet-sent", data.timecode.formatted, { target: `${ip}:${port}` });
      }
    });
  }

  configureArtNet(data, ws) {
    if (data.ip?.trim()) this.config.artNet.ip = data.ip.trim();
    if (data.port >= 1 && data.port <= 65535) this.config.artNet.port = data.port;

    const { ip, port } = this.config.artNet;
    this.send(ws, "config-updated", `Art-Net: ${ip}:${port}`, { config: { ip, port } });
  }

  configureUDP(data, ws) {
    const cfg = this.config.udpTrigger;
    if (typeof data.enabled === "boolean") cfg.enabled = data.enabled;
    if (data.ip?.trim()) cfg.ip = data.ip.trim();
    if (data.port >= 1 && data.port <= 65535) cfg.port = data.port;
    if (data.message?.trim()) cfg.message = data.message.trim();

    this.send(ws, "udp-trigger-config-updated", "UDP config updated", { config: cfg });
  }

  sendUDP(data, ws) {
    const cfg = this.config.udpTrigger;
    if (!cfg.enabled) {
      this.send(ws, "udp-trigger-error", "UDP Trigger is disabled");
      return;
    }

    const message = data.action === "stop" ? "STOP" : (data.customMessage || cfg.message);
    const buffer = Buffer.from(message, "ascii");

    this.udpTriggerSocket.send(buffer, cfg.port, cfg.ip, (error) => {
      if (error) {
        this.send(ws, "udp-trigger-error", `UDP send failed: ${error.message}`);
      } else {
        this.send(ws, "udp-trigger-sent", `Message "${message}" sent`, {
          details: { message, ip: cfg.ip, port: cfg.port, action: data.action },
        });
      }
    });
  }

  subscribeUdpFloat(data, ws) {
    const { ip, port } = data;
    const bindIp = ip || "0.0.0.0";
    
    if (!port || port < 1 || port > 65535) {
      return this.send(ws, "error", "Invalid UDP port");
    }

    this.udpFloatSubscribers.set(ws, { ip, port });

    if (!this.udpFloatListeners.has(port)) {
      const listener = dgram.createSocket("udp4");

      listener.on("message", (msg, rinfo) => {
        // Auto-detect format: 32-bit float, 64-bit double, JSON, or string
        let value;
        if (msg.length === 4) {
          value = msg.readFloatLE(0);      // 32-bit float
        } else if (msg.length === 8) {
          value = msg.readDoubleLE(0);     // 64-bit double
        } else {
          const msgString = msg.toString().trim();
          
          // Try to parse as JSON first
          try {
            const jsonData = JSON.parse(msgString);
            // Look for common encoder/position fields
            value = jsonData.encoder_position || jsonData.position || jsonData.value;
            if (value === undefined) {
              console.warn("JSON received but no encoder_position/position/value field found:", jsonData);
            }
          } catch (e) {
            // Not JSON, try parsing as plain number
            value = parseFloat(msgString);
          }
        }
        
        if (value !== undefined && !isNaN(value)) {
          this.clients.forEach((client) => {
            const sub = this.udpFloatSubscribers.get(client);
            if (sub?.port === port) {
              this.send(client, "udp-float-value", `UDP Float: ${value}`, {
                value,
                source: `${rinfo.address}:${rinfo.port}`,
              });
            }
          });
        }
      });

      listener.on("error", (err) => {
        console.error(`UDP Float Listener error on port ${port}:`, err.message);
      });

      listener.bind(port, bindIp, () => {
        console.log(`UDP Float Listener started on ${bindIp}:${port}`);
      });

      this.udpFloatListeners.set(port, listener);
    }

    this.send(ws, "udp-float-subscribed", `Listening for UDP floats on port ${port}`, {
      ip: bindIp,
      port,
    });
  }

  unsubscribeUdpFloat(data, ws) {
    const sub = this.udpFloatSubscribers.get(ws);
    if (!sub) return;

    this.udpFloatSubscribers.delete(ws);

    const stillInUse = Array.from(this.udpFloatSubscribers.values())
      .some(info => info.port === sub.port);

    if (!stillInUse) {
      const listener = this.udpFloatListeners.get(sub.port);
      if (listener) {
        listener.close();
        this.udpFloatListeners.delete(sub.port);
        console.log(`UDP Float Listener closed on port ${sub.port}`);
      }
    }

    this.send(ws, "udp-float-unsubscribed", "Unsubscribed from UDP floats");
  }

  start(port = 3001) {
    this.server.listen(port, () => {
      console.log(`Web Interface: http://localhost:${port}`);
    });
  }

  stop() {
    this.wss.close();
    this.udpSocket.close();
    this.udpTriggerSocket.close();
    this.udpFloatListeners.forEach(listener => listener.close());
    this.udpFloatListeners.clear();
    this.udpFloatSubscribers.clear();
    this.server.close();
  }
}

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

if (require.main === module) {
  const server = new IntegratedArtNetServer();
  server.start();
}

module.exports = IntegratedArtNetServer;
