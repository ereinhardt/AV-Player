  // Can read UDP messages with binary float values (32-bit and 64-bit) -> see server.js


function initializeDyingBirdMod() {

  // CONFIGURATION
  const MIN_DB = -10;
  const MAX_DB = 10;
  const INTERVAL = 1000;
  const FPS = 30;
  const UDP_IP = "0.0.0.0";  // Which Server IP to listen on (0.0.0.0 = all, or specific Server IP like "192.168.178.47")
  const UDP_PORT = 3044; 

  // STATE
  let isEnabled = false;
  let animationFrameId = null;
  let lastFrameTime = 0;
  let udpSocket = null;
  let lastUdpValue = null;
  const channelStates = new Map();

  // UTILITIES
  const dbToVolume = (db) => Math.pow(10, db / 20);
  const getRandomDb = () => Math.random() * (MAX_DB - MIN_DB) + MIN_DB;
  const lerp = (start, end, t) => start + (end - start) * t;

  const getCurrentDb = (gainNode) => gainNode?.gain.value > 0 
    ? 20 * Math.log10(gainNode.gain.value) : -60;

  const getElement = (index, side, type) => 
    document.querySelector(`#${type}-${index}${side ? `-${side}` : ""}`);

  const isMuted = (index, side) => getElement(index, side, "mute-checkbox")?.checked || false;

  const updateUI = (index, side, db) => {
    const slider = getElement(index, side, "volume-slider");
    const display = getElement(index, side, "volume-db");
    if (slider) slider.value = db.toFixed(1);
    if (display) display.textContent = `${db.toFixed(1)} dB`;
  };

  const setSliderState = (disabled) => {
    window.audioSources?.forEach((_, index) => {
      [null, "left", "right"].forEach((side) => {
        const slider = getElement(index, side, "volume-slider");
        if (slider) slider.disabled = disabled || (side && isMuted(index, side));
      });
    });
  };

  // CHANNEL PROCESSING
  const processChannel = (gainNode, index, side, now, isAnimating) => {
    if (!gainNode || isMuted(index, side)) return;

    const key = `${index}-${side || "main"}`;
    const state = channelStates.get(key);

    if (isAnimating && state) {
      const progress = Math.min((now - state.startTime) / INTERVAL, 1);
      const currentDb = lerp(state.startDb, state.targetDb, progress);
      gainNode.gain.value = dbToVolume(currentDb);
      updateUI(index, side, currentDb);
    } else if (!isAnimating) {
      channelStates.set(key, {
        startDb: getCurrentDb(gainNode),
        targetDb: getRandomDb(),
        startTime: now,
      });
    }
  };

  const processAllChannels = (src, index, now, isAnimating) => {
    if (!src) return;
    processChannel(src.gainNode, index, null, now, isAnimating);
    processChannel(src.leftGainNode, index, "left", now, isAnimating);
    processChannel(src.rightGainNode, index, "right", now, isAnimating);
  };

  const animate = () => {
    if (!isEnabled) return;
    const now = Date.now();
    
    if (now - lastFrameTime >= 1000 / FPS) {
      lastFrameTime = now;
      window.audioSources?.forEach((src, i) => processAllChannels(src, i, now, true));
    }
    
    animationFrameId = requestAnimationFrame(animate);
  };

  const randomizeVolumes = () => {
    if (isEnabled) {
      const now = Date.now();
      window.audioSources?.forEach((src, i) => processAllChannels(src, i, now, false));
    }
  };

  // UDP LISTENER
  const setupUdpListener = () => {
    const connectUdp = () => {
      udpSocket = new WebSocket("ws://localhost:3001");

      udpSocket.onopen = () => {
        console.log("[Dying Bird] UDP connected");
        udpSocket.send(JSON.stringify({
          type: "udp-float-subscribe",
          ip: UDP_IP,
          port: UDP_PORT,
        }));
      };

      udpSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "udp-float-value") {
            const newValue = parseFloat(data.value);
            if (lastUdpValue !== newValue && !isNaN(newValue)) {
              console.log(newValue);
              lastUdpValue = newValue;
              if (isEnabled) randomizeVolumes();
            }
          }
        } catch (err) {
          console.error("[Dying Bird] UDP parse error:", err);
        }
      };

      udpSocket.onclose = () => {
        console.log("[Dying Bird] Reconnecting in 5s...");
        udpSocket = null;
        setTimeout(connectUdp, 5000);
      };
    };

    connectUdp();
  };

  const cleanupUdpListener = () => {
    if (udpSocket) udpSocket.close();
    udpSocket = null;
    lastUdpValue = null;
  };

  // START / STOP
  const start = () => {
    if (isEnabled) return;
    isEnabled = true;
    setSliderState(true);
    console.log("[Dying Bird] Started (UDP trigger mode)");
    setupUdpListener();
    randomizeVolumes();
    animate();
  };

  const stop = () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    isEnabled = false;
    channelStates.clear();
    setSliderState(false);
    cleanupUdpListener();
    console.log("[Dying Bird] Stopped");
  };

  // INITIALIZATION
  const init = () => {
    const checkbox = document.getElementById("dying-bird-checkbox");
    if (checkbox) {
      checkbox.addEventListener("change", (e) => e.target.checked ? start() : stop());
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

// Auto-initialize the mod
initializeDyingBirdMod();
