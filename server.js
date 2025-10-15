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

    // OSC Trigger config
    this.oscEnabled = false;
    this.oscIP = "127.0.0.1";
    this.oscPort = 7000;
    this.oscAddress = "/trigger/start";
    this.oscDataType = "float";
    this.oscValue = 1.0;

    // Static files
    this.app.use(express.static(__dirname));
    this.app.get("/", (req, res) =>
      res.sendFile(path.join(__dirname, "index.html"))
    );

    // UDP sockets
    this.udpSocket = dgram.createSocket("udp4");
    this.udpTriggerSocket = dgram.createSocket("udp4");
    this.udpTriggerSocket.bind(() => this.udpTriggerSocket.setBroadcast(true));
    this.oscTriggerSocket = dgram.createSocket("udp4");
    this.oscTriggerSocket.bind(() => this.oscTriggerSocket.setBroadcast(true));

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

  // Configure OSC trigger settings (IP, port, address, data type, value, enabled state)
  configureOSC(data, ws) {
    const { enabled, ip, port, oscAddress, dataType, value } = data;

    if (typeof enabled === "boolean") this.oscEnabled = enabled;
    if (ip?.trim()) this.oscIP = ip.trim();
    if (port && port >= 1 && port <= 65535) this.oscPort = port;
    if (oscAddress?.trim() && oscAddress.startsWith("/"))
      this.oscAddress = oscAddress.trim();
    if (dataType && ["float", "integer", "string"].includes(dataType))
      this.oscDataType = dataType;
    if (value !== undefined) this.oscValue = value;

    this.send(ws, "osc-trigger-config-updated", "OSC config updated", {
      config: {
        enabled: this.oscEnabled,
        ip: this.oscIP,
        port: this.oscPort,
        oscAddress: this.oscAddress,
        dataType: this.oscDataType,
        value: this.oscValue,
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
    if (!this.oscEnabled) {
      this.send(ws, "osc-trigger-error", "OSC Trigger is disabled");
      return;
    }

    const oscBuffer = this.encodeOSCMessage(
      this.oscAddress,
      this.oscDataType,
      this.oscValue
    );

    this.oscTriggerSocket.send(oscBuffer, this.oscPort, this.oscIP, (error) => {
      const messageType = error ? "osc-trigger-error" : "osc-trigger-sent";
      const messageText = error
        ? `OSC send failed: ${error.message}`
        : `OSC message sent`;
      const extraData = error
        ? {}
        : {
            details: {
              oscAddress: this.oscAddress,
              value: this.oscValue,
              dataType: this.oscDataType,
              ip: this.oscIP,
              port: this.oscPort,
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
    this.oscTriggerSocket.close();
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
