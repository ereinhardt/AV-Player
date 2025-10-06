#!/usr/bin/env node

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const dgram = require("dgram");
const path = require("path");

class IntegratedArtNetServer {
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

    this.setupServer();
  }

  setupServer() {
    // Static files
    this.app.use(express.static(__dirname));
    this.app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

    // UDP sockets
    this.udpSocket = dgram.createSocket("udp4");
    this.udpTriggerSocket = dgram.createSocket("udp4");
    this.udpTriggerSocket.bind(() => this.udpTriggerSocket.setBroadcast(true));

    this.setupWebSocket();
  }

  setupWebSocket() {
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      this.send(ws, "status", `Connected. Target: ${this.artNetIP}:${this.artNetPort}`);

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

  send(ws, type, message, data = {}) {
    ws.send(JSON.stringify({ type, message, ...data }));
  }

  updateArtNetConfiguration(data, ws) {
    const { ip, port } = data;

    if (ip?.trim()) this.artNetSendIP = ip.trim();
    if (port && port >= 1 && port <= 65535) this.artNetSendPort = port;

    ws.send(
      JSON.stringify({
        type: "config-updated",
        message: `Art-Net target updated to ${this.artNetSendIP}:${this.artNetSendPort}`,
        config: { ip: this.artNetSendIP, port: this.artNetSendPort },
      })
    );
  }

  handleMessage(ws, data) {
    switch (data.type) {
      case "artnet-timecode":
        this.sendArtNet(data, ws);
        break;
      case "configure-artnet":
        this.configureArtNet(data, ws);
        break;
      case "udp-trigger-config":
        this.configureUDP(data, ws);
        break;
      case "udp-trigger-send":
        this.sendUDP(data, ws);
        break;
    }
  }

  sendArtNet(data, ws) {
    const { packet, timecode } = data;
    const buffer = Buffer.from(packet);

    this.udpSocket.send(buffer, this.artNetPort, this.artNetIP, (error) => {
      if (error && !this.artNetIP.endsWith(".255")) {
        this.send(ws, "error", `Art-Net send failed: ${error.message}`);
      } else {
        this.send(ws, "artnet-sent", timecode.formatted, {
          target: `${this.artNetIP}:${this.artNetPort}`
        });
      }
    });
  }

  configureArtNet(data, ws) {
    const { ip, port } = data;
    if (ip?.trim()) this.artNetIP = ip.trim();
    if (port && port >= 1 && port <= 65535) this.artNetPort = port;

    this.send(ws, "config-updated", `Art-Net: ${this.artNetIP}:${this.artNetPort}`, {
      config: { ip: this.artNetIP, port: this.artNetPort }
    });
  }

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
        message: this.udpMessage
      }
    });
  }

  sendUDP(data, ws) {
    if (!this.udpEnabled) {
      this.send(ws, "udp-trigger-error", "UDP Trigger is disabled");
      return;
    }

    const { action } = data;
    let message = action === "stop" ? "STOP" : 
                 (data.customMessage || this.udpMessage);
    
    message = message.replace(/[^\x20-\x7E]/g, "") || "START";
    const buffer = Buffer.from(message, "ascii");

    this.udpTriggerSocket.send(buffer, this.udpPort, this.udpIP, (error) => {
      if (error) {
        this.send(ws, "udp-trigger-error", `UDP send failed: ${error.message}`);
      } else {
        this.send(ws, "udp-trigger-sent", `Message "${message}" sent`, {
          details: { message, ip: this.udpIP, port: this.udpPort, action }
        });
      }
    });
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
