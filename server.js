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

    // UDP Trigger configs (8 independent triggers)
    this.udpTriggers = Array.from({ length: 8 }, (_, i) => ({
      enabled: false,
      ip: "192.168.178.255",
      port: 9998,
      message: "START",
    }));

    // OSC Trigger configs (8 independent triggers)
    this.oscTriggers = Array.from({ length: 8 }, (_, i) => ({
      enabled: false,
      ip: "127.0.0.1",
      port: 7000,
      oscAddress: "/trigger/start",
      dataType: "float",
      value: 1.0,
    }));

    // Static files
    this.app.use(express.static(__dirname));
    this.app.get("/", (req, res) =>
      res.sendFile(path.join(__dirname, "index.html"))
    );

    // UDP sockets
    this.udpSocket = dgram.createSocket("udp4");
    
    // Create 8 UDP trigger sockets
    this.udpTriggerSockets = Array.from({ length: 8 }, () => {
      const socket = dgram.createSocket("udp4");
      socket.bind(() => socket.setBroadcast(true));
      return socket;
    });
    
    // Create 8 OSC trigger sockets
    this.oscTriggerSockets = Array.from({ length: 8 }, () => {
      const socket = dgram.createSocket("udp4");
      socket.bind(() => socket.setBroadcast(true));
      return socket;
    });

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
      "osc-trigger-config": this.configureOSC,
      "osc-trigger-send": this.sendOSC,
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
    const { index = 0, enabled, ip, port, message } = data;
    
    // Ensure index is valid
    if (index < 0 || index >= this.udpTriggers.length) {
      this.send(ws, "udp-trigger-error", `Invalid trigger index: ${index}`);
      return;
    }

    const trigger = this.udpTriggers[index];

    if (typeof enabled === "boolean") trigger.enabled = enabled;
    if (ip?.trim()) trigger.ip = ip.trim();
    if (port && port >= 1 && port <= 65535) trigger.port = port;
    if (message?.trim()) trigger.message = message.trim();

    this.send(ws, "udp-trigger-config-updated", `UDP Trigger ${index + 1} config updated`, {
      config: {
        index,
        enabled: trigger.enabled,
        ip: trigger.ip,
        port: trigger.port,
        message: trigger.message,
      },
    });
  }

  // Send UDP trigger message to configured target
  sendUDP(data, ws) {
    const { index = 0 } = data;
    
    // Ensure index is valid
    if (index < 0 || index >= this.udpTriggers.length) {
      this.send(ws, "udp-trigger-error", `Invalid trigger index: ${index}`);
      return;
    }

    const trigger = this.udpTriggers[index];
    const socket = this.udpTriggerSockets[index];

    if (!trigger.enabled) {
      this.send(ws, "udp-trigger-error", `UDP Trigger ${index + 1} is disabled`);
      return;
    }

    const message =
      data.action === "stop"
        ? "STOP"
        : data.message || trigger.message || "START";
    const buffer = Buffer.from(message, "ascii");

    socket.send(buffer, trigger.port, trigger.ip, (error) => {
      const messageType = error ? "udp-trigger-error" : "udp-trigger-sent";
      const messageText = error
        ? `UDP Trigger ${index + 1} send failed: ${error.message}`
        : `Message "${message}" sent from Trigger ${index + 1}`;
      const extraData = error
        ? {}
        : {
            details: {
              index,
              message,
              ip: trigger.ip,
              port: trigger.port,
              action: data.action,
            },
          };

      this.send(ws, messageType, messageText, extraData);
    });
  }

  // Configure OSC trigger settings (IP, port, address, data type, value, enabled state)
  configureOSC(data, ws) {
    const { index = 0, enabled, ip, port, oscAddress, dataType, value } = data;

    // Ensure index is valid
    if (index < 0 || index >= this.oscTriggers.length) {
      this.send(ws, "osc-trigger-error", `Invalid trigger index: ${index}`);
      return;
    }

    const trigger = this.oscTriggers[index];

    if (typeof enabled === "boolean") trigger.enabled = enabled;
    if (ip?.trim()) trigger.ip = ip.trim();
    if (port && port >= 1 && port <= 65535) trigger.port = port;
    if (oscAddress?.trim() && oscAddress.startsWith("/"))
      trigger.oscAddress = oscAddress.trim();
    if (dataType && ["float", "integer", "string"].includes(dataType))
      trigger.dataType = dataType;
    if (value !== undefined) trigger.value = value;

    this.send(ws, "osc-trigger-config-updated", `OSC Trigger ${index + 1} config updated`, {
      config: {
        index,
        enabled: trigger.enabled,
        ip: trigger.ip,
        port: trigger.port,
        oscAddress: trigger.oscAddress,
        dataType: trigger.dataType,
        value: trigger.value,
      },
    });
  }

  // Encode OSC message according to OSC 1.0 specification
  encodeOSCMessage(address, dataType, value) {
    const buffers = [];

    // Encode OSC address with null terminator and padding
    const addressBuffer = Buffer.from(address + "\0");
    const addressPadding = 4 - (addressBuffer.length % 4);
    const paddedAddress = Buffer.concat([
      addressBuffer,
      Buffer.alloc(addressPadding === 4 ? 0 : addressPadding),
    ]);
    buffers.push(paddedAddress);

    // Encode type tag string
    let typeTag = ",";
    if (dataType === "float") typeTag += "f";
    else if (dataType === "integer") typeTag += "i";
    else if (dataType === "string") typeTag += "s";

    const typeTagBuffer = Buffer.from(typeTag + "\0");
    const typeTagPadding = 4 - (typeTagBuffer.length % 4);
    const paddedTypeTag = Buffer.concat([
      typeTagBuffer,
      Buffer.alloc(typeTagPadding === 4 ? 0 : typeTagPadding),
    ]);
    buffers.push(paddedTypeTag);

    // Encode argument based on type
    if (dataType === "float") {
      const floatBuffer = Buffer.alloc(4);
      floatBuffer.writeFloatBE(parseFloat(value), 0);
      buffers.push(floatBuffer);
    } else if (dataType === "integer") {
      const intBuffer = Buffer.alloc(4);
      intBuffer.writeInt32BE(parseInt(value), 0);
      buffers.push(intBuffer);
    } else if (dataType === "string") {
      const stringValue = String(value);
      const stringBuffer = Buffer.from(stringValue + "\0");
      const stringPadding = 4 - (stringBuffer.length % 4);
      const paddedString = Buffer.concat([
        stringBuffer,
        Buffer.alloc(stringPadding === 4 ? 0 : stringPadding),
      ]);
      buffers.push(paddedString);
    }

    return Buffer.concat(buffers);
  }

  // Send OSC trigger message to configured target
  sendOSC(data, ws) {
    const { index = 0 } = data;

    // Ensure index is valid
    if (index < 0 || index >= this.oscTriggers.length) {
      this.send(ws, "osc-trigger-error", `Invalid trigger index: ${index}`);
      return;
    }

    const trigger = this.oscTriggers[index];
    const socket = this.oscTriggerSockets[index];

    if (!trigger.enabled) {
      this.send(ws, "osc-trigger-error", `OSC Trigger ${index + 1} is disabled`);
      return;
    }

    const oscBuffer = this.encodeOSCMessage(
      trigger.oscAddress,
      trigger.dataType,
      trigger.value
    );

    socket.send(oscBuffer, trigger.port, trigger.ip, (error) => {
      const messageType = error ? "osc-trigger-error" : "osc-trigger-sent";
      const messageText = error
        ? `OSC Trigger ${index + 1} send failed: ${error.message}`
        : `OSC message sent from Trigger ${index + 1}`;
      const extraData = error
        ? {}
        : {
            details: {
              index,
              oscAddress: trigger.oscAddress,
              value: trigger.value,
              dataType: trigger.dataType,
              ip: trigger.ip,
              port: trigger.port,
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
    this.udpTriggerSockets.forEach(socket => socket.close());
    this.oscTriggerSockets.forEach(socket => socket.close());
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
