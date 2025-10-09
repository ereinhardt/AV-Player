#!/usr/bin/env node

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const dgram = require("dgram");
const path = require("path");

class IntegratedArtNetServer {
  // Initialize Express server, WebSocket, and UDP sockets
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.clients = new Set();

    // ArtNet config
    this.artNetIP = "127.0.0.1";
    this.artNetPort = 6454;

    // UDP Trigger config
    this.udpEnabled = false;
    this.udpIP = "192.168.178.255";
    this.udpPort = 9998;
    this.udpMessage = "START";

    // Static files
    this.app.use(express.static(__dirname));
    this.app.get("/", (req, res) =>
      res.sendFile(path.join(__dirname, "index.html"))
    );

    // UDP sockets
    this.udpSocket = dgram.createSocket("udp4");
    this.udpTriggerSocket = dgram.createSocket("udp4");
    this.udpTriggerSocket.bind(() => this.udpTriggerSocket.setBroadcast(true));

    this.setupWebSocket();
  }

  // Set up WebSocket connection handling and message routing
  setupWebSocket() {
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      this.send(
        ws,
        "status",
        `Connected. Target: ${this.artNetIP}:${this.artNetPort}`
      );

      ws.on("message", (message) => {
        try {
          this.handleMessage(ws, JSON.parse(message));
        } catch {
          this.send(ws, "error", "Invalid message format");
        }
      });

      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
    });
  }

  // Send JSON message to WebSocket client
  send(ws, type, message, data = {}) {
    ws.send(JSON.stringify({ type, message, ...data }));
  }

  // Route incoming WebSocket messages to appropriate handlers
  handleMessage(ws, data) {
    const handlers = {
      "artnet-timecode": this.sendArtNet,
      "configure-artnet": this.configureArtNet,
      "udp-trigger-config": this.configureUDP,
      "udp-trigger-send": this.sendUDP,
    };

    const handler = handlers[data.type];
    if (handler) {
      handler.call(this, data, ws);
    }
  }

  // Send Art-Net timecode packet via UDP
  sendArtNet(data, ws) {
    const buffer = Buffer.from(data.packet);

    this.udpSocket.send(buffer, this.artNetPort, this.artNetIP, (error) => {
      if (error && !this.artNetIP.endsWith(".255")) {
        this.send(ws, "error", `Art-Net send failed: ${error.message}`);
      } else {
        this.send(ws, "artnet-sent", data.timecode.formatted, {
          target: `${this.artNetIP}:${this.artNetPort}`,
        });
      }
    });
  }

  // Configure Art-Net IP address and port settings
  configureArtNet(data, ws) {
    const { ip, port } = data;
    if (ip?.trim()) this.artNetIP = ip.trim();
    if (port && port >= 1 && port <= 65535) this.artNetPort = port;

    this.send(
      ws,
      "config-updated",
      `Art-Net: ${this.artNetIP}:${this.artNetPort}`,
      {
        config: { ip: this.artNetIP, port: this.artNetPort },
      }
    );
  }

  // Configure UDP trigger settings (IP, port, message, enabled state)
  configureUDP(data, ws) {
    const { enabled, ip, port, message } = data;

    if (typeof enabled === "boolean") this.udpEnabled = enabled;
    if (ip?.trim()) this.udpIP = ip.trim();
    if (port && port >= 1 && port <= 65535) this.udpPort = port;
    if (message?.trim()) this.udpMessage = message.trim();

    this.send(ws, "udp-trigger-config-updated", "UDP config updated", {
      config: {
        enabled: this.udpEnabled,
        ip: this.udpIP,
        port: this.udpPort,
        message: this.udpMessage,
      },
    });
  }

  // Send UDP trigger message to configured target
  sendUDP(data, ws) {
    if (!this.udpEnabled) {
      this.send(ws, "udp-trigger-error", "UDP Trigger is disabled");
      return;
    }

    const message =
      data.action === "stop"
        ? "STOP"
        : data.customMessage || this.udpMessage || "START";
    const buffer = Buffer.from(message, "ascii");

    this.udpTriggerSocket.send(buffer, this.udpPort, this.udpIP, (error) => {
      const messageType = error ? "udp-trigger-error" : "udp-trigger-sent";
      const messageText = error
        ? `UDP send failed: ${error.message}`
        : `Message "${message}" sent`;
      const extraData = error
        ? {}
        : {
            details: {
              message,
              ip: this.udpIP,
              port: this.udpPort,
              action: data.action,
            },
          };

      this.send(ws, messageType, messageText, extraData);
    });
  }

  // Start the HTTP server on specified port
  start(port = 3001) {
    this.server.listen(port, () => {
      console.log(`Web Interface: http://localhost:${port}`);
    });
  }

  // Close all sockets and stop the server
  stop() {
    this.wss.close();
    this.udpSocket.close();
    this.udpTriggerSocket.close();
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
