#!/usr/bin/env node

const dgram = require('dgram');
const client = dgram.createSocket('udp4');

// Enable broadcast for sending to all devices in network
client.bind(() => {
  client.setBroadcast(true);
});

// CONFIGURATION
const CONFIG = {
  TARGET_IP: process.argv[2] || '255.255.255.255',
  TARGET_PORT: parseInt(process.argv[3]) || 3044,
  MIN_VALUE: -1.0,
  MAX_VALUE: 1.0,
  
  // Random timing behavior
  MIN_INTERVAL: 100,
  MAX_INTERVAL: 8000,
  PAUSE_PROBABILITY: 0.30,
  BURST_PROBABILITY: 0.40,
  MIN_BURST_COUNT: 3,
  MAX_BURST_COUNT: 30
};

let burstCounter = 0;

// Generate random float and interval
const randomFloat = () => Math.random() * (CONFIG.MAX_VALUE - CONFIG.MIN_VALUE) + CONFIG.MIN_VALUE;

const getNextInterval = () => {
  if (burstCounter > 0) {
    burstCounter--;
    return CONFIG.MIN_INTERVAL;
  }
  
  if (Math.random() < CONFIG.BURST_PROBABILITY) {
    burstCounter = Math.floor(Math.random() * (CONFIG.MAX_BURST_COUNT - CONFIG.MIN_BURST_COUNT + 1)) + CONFIG.MIN_BURST_COUNT - 1;
    return CONFIG.MIN_INTERVAL;
  }
  
  return Math.random() * (CONFIG.MAX_INTERVAL - CONFIG.MIN_INTERVAL) + CONFIG.MIN_INTERVAL;
};

// Send UDP message (randomly 32-bit or 64-bit)
const sendFloat = () => {
  const value = randomFloat();
  const use64bit = Math.random() < 0.5;  // 50% chance for 64-bit
  
  const message = use64bit 
    ? Buffer.allocUnsafe(8) 
    : Buffer.allocUnsafe(4);
  
  if (use64bit) {
    message.writeDoubleLE(value, 0);  // 64-bit double
    console.log(`[64-bit] ${message.readDoubleLE(0)}`);
  } else {
    message.writeFloatLE(value, 0);   // 32-bit float
    console.log(`[32-bit] ${message.readFloatLE(0)}`);
  }
  
  client.send(message, 0, message.length, CONFIG.TARGET_PORT, CONFIG.TARGET_IP, (err) => {
    if (!err) {
      setTimeout(sendFloat, getNextInterval());
    }
  });
};

// Start sending after bind completes
setTimeout(sendFloat, 100);

// Cleanup on exit
process.on('SIGINT', () => {
  client.close();
  process.exit(0);
});

client.on('error', () => {
  client.close();
  process.exit(1);
});
