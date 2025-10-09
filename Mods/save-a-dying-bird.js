function initializeDyingBirdMod() {
  // Configuration:
  const MIN_DB = -10; // in dB
  const MAX_DB = 10; // in dB
  const INTERVAL = 1000; // in ms
  const FPS = 30;

  let isEnabled = false;
  let intervalId = null;
  let animationFrameId = null;
  let lastFrameTime = 0;
  const channelStates = new Map();

  // Utility functions
  const dbToVolume = (db) => Math.pow(10, db / 20);
  const getRandomDb = () => Math.random() * (MAX_DB - MIN_DB) + MIN_DB;
  const getChannelKey = (index, side) => `${index}-${side || "main"}`;
  const getSuffix = (side) => (side ? `-${side}` : "");
  const lerp = (start, end, t) => start + (end - start) * t;

  // Get current dB from gain node
  const getCurrentDb = (gainNode) => {
    if (!gainNode) return 0;
    const vol = gainNode.gain.value;
    return vol > 0 ? 20 * Math.log10(vol) : -60;
  };

  // Check if muted
  const isMuted = (index, side) => {
    const cb = document.querySelector(
      `#mute-checkbox-${index}${getSuffix(side)}`
    );
    return cb?.checked || false;
  };

  // Update UI
  const updateUI = (index, side, db) => {
    const suffix = getSuffix(side);
    const slider = document.querySelector(`#volume-slider-${index}${suffix}`);
    const display = document.querySelector(`#volume-db-${index}${suffix}`);
    if (slider && display) {
      slider.value = db.toFixed(1);
      display.textContent = `${db.toFixed(1)} dB`;
    }
  };

  // Toggle slider state for all channels
  const setSliderState = (disabled) => {
    window.audioSources?.forEach((_, index) => {
      [null, "left", "right"].forEach((side) => {
        const slider = document.querySelector(
          `#volume-slider-${index}${getSuffix(side)}`
        );
        if (slider) {
          slider.disabled = disabled || (side && isMuted(index, side));
        }
      });
    });
  };

  // Process a single channel (generic handler)
  const processChannel = (gainNode, index, side, now, isAnimating) => {
    if (!gainNode || isMuted(index, side)) return;

    const key = getChannelKey(index, side);
    const state = channelStates.get(key);

    if (isAnimating) {
      // Animation: interpolate current value (only if state exists)
      if (state) {
        const progress = Math.min((now - state.startTime) / state.duration, 1);
        const currentDb = lerp(state.startDb, state.targetDb, progress);
        gainNode.gain.value = dbToVolume(currentDb);
        updateUI(index, side, currentDb);
      }
    } else {
      // Randomize: set new target
      channelStates.set(key, {
        startDb: getCurrentDb(gainNode),
        targetDb: getRandomDb(),
        startTime: now,
        duration: INTERVAL,
      });
    }
  };

  // Animation loop for smooth transitions
  const animate = () => {
    if (!isEnabled) return;

    const now = Date.now();
    const frameInterval = 1000 / FPS;

    // Throttle to desired FPS
    if (now - lastFrameTime >= frameInterval) {
      lastFrameTime = now;

      const audioSources = window.audioSources;
      if (audioSources) {
        audioSources.forEach((src, i) => {
          if (src) {
            processChannel(src.gainNode, i, null, now, true);
            processChannel(src.leftGainNode, i, "left", now, true);
            processChannel(src.rightGainNode, i, "right", now, true);
          }
        });
      }
    }

    animationFrameId = requestAnimationFrame(animate);
  };

  // Set new random target values for all channels
  const randomizeVolumes = () => {
    if (!isEnabled) return;
    const now = Date.now();

    window.audioSources?.forEach((src, i) => {
      if (src) {
        processChannel(src.gainNode, i, null, now, false);
        processChannel(src.leftGainNode, i, "left", now, false);
        processChannel(src.rightGainNode, i, "right", now, false);
      }
    });
  };

  // Start the mod
  const start = () => {
    if (intervalId) return;
    isEnabled = true;
    setSliderState(true);
    randomizeVolumes();
    intervalId = setInterval(randomizeVolumes, INTERVAL);
    animate();
  };

  // Stop the mod
  const stop = () => {
    clearInterval(intervalId);
    cancelAnimationFrame(animationFrameId);
    intervalId = animationFrameId = null;
    isEnabled = false;
    channelStates.clear();
    setSliderState(false);
  };

  // Setup mute checkbox listeners to update slider state when dying bird is active
  const setupMuteListeners = () => {
    window.audioSources?.forEach((_, index) => {
      [null, "left", "right"].forEach((side) => {
        const muteCheckbox = document.querySelector(
          `#mute-checkbox-${index}${getSuffix(side)}`
        );
        if (muteCheckbox) {
          muteCheckbox.addEventListener("change", () => {
            if (isEnabled) {
              const slider = document.querySelector(
                `#volume-slider-${index}${getSuffix(side)}`
              );
              if (slider) {
                slider.disabled = true; // Keep disabled when dying bird is active
              }
            }
          });
        }
      });
    });
  };

  // Setup checkbox
  const setup = () => {
    const cb = document.getElementById("dying-bird-checkbox");
    if (!cb) return;
    cb.addEventListener("change", (e) => (e.target.checked ? start() : stop()));

    // Setup mute listeners
    setupMuteListeners();
  };

  // Initialize
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", setup)
    : setup();
}

// Auto-initialize the mod
initializeDyingBirdMod();
