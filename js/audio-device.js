// Audio Device Configuration Constants
const AUDIO_CONFIG = {
  FALLBACK_CHANNEL_COUNT: 2,
  DEFAULT_CHANNEL: 1,
  DEFAULT_OPTIONS: `
    <option value="default">Default Audio Device</option>
    <option value="">Built-in Speakers</option>
  `
};

// Audio Device Management
async function getAudioDevices() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) throw new Error('API not supported');
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputDevices = devices.filter(device => device.kind === "audiooutput");
    populateDeviceSelectors(audioOutputDevices);
  } catch {
    populateWithFallbackDevices();
  }
}

function populateDeviceSelectors(audioOutputDevices) {
  document.querySelectorAll(".audio-device-select").forEach(select => {
    select.innerHTML = audioOutputDevices
      .map((device, index) => 
        `<option value="${device.deviceId}">${device.label || `Audio Output ${index + 1}`}</option>`
      ).join('');
    select.dispatchEvent(new Event("change"));
  });
}

function populateWithFallbackDevices() {
  document.querySelectorAll(".audio-device-select")
    .forEach(select => select.innerHTML = AUDIO_CONFIG.DEFAULT_OPTIONS);
}

async function updateChannelSelectorsForDevice(track, specificAudioDeviceSelect = null) {
  const audioDeviceSelects = specificAudioDeviceSelect 
    ? [specificAudioDeviceSelect] 
    : track.querySelectorAll(".audio-device-select");

  for (const audioDeviceSelect of audioDeviceSelects) {
    const channelSelects = getChannelSelectors(track);
    if (channelSelects.length === 0) continue;

    const maxChannels = await getMaxChannelsForDevice(audioDeviceSelect.value);
    updateChannelOptions(channelSelects, maxChannels);
    
    // Trigger change event if needed
    const trackIndex = parseInt(track.getAttribute("data-index"));
    const hasAudioFile = window.audioSources && window.audioSources[trackIndex];
    
    channelSelects.forEach(channelSelect => {
      const currentVal = parseInt(channelSelect.value);
      if ((!currentVal || currentVal > maxChannels) && hasAudioFile) {
        channelSelect.dispatchEvent(new Event("change"));
      }
    });
  }
}

function getChannelSelectors(track) {
  if (track.classList.contains("video-track")) {
    return [
      track.querySelector(`#channel-select-${track.dataset.index}-left`),
      track.querySelector(`#channel-select-${track.dataset.index}-right`)
    ].filter(Boolean);
  } else {
    const channelSelect = track.querySelector(".channel-select");
    return channelSelect ? [channelSelect] : [];
  }
}

async function getMaxChannelsForDevice(deviceId) {
  let context;
  try {
    context = new (window.AudioContext || window.webkitAudioContext)();
    if (deviceId && typeof context.setSinkId === 'function') {
      await context.setSinkId(deviceId);
    }
    return context.destination.maxChannelCount;
  } catch {
    return AUDIO_CONFIG.FALLBACK_CHANNEL_COUNT;
  } finally {
    context?.close();
  }
}

function updateChannelOptions(channelSelects, maxChannels) {
  channelSelects.forEach(channelSelect => {
    const currentVal = parseInt(channelSelect.value);
    channelSelect.innerHTML = Array.from({length: maxChannels}, (_, i) => 
      `<option value="${i + 1}">Channel ${i + 1}</option>`
    ).join('');
    
    channelSelect.value = (currentVal && currentVal <= maxChannels) 
      ? currentVal 
      : AUDIO_CONFIG.DEFAULT_CHANNEL;
  });
}

function setupDeviceChangeListeners(audioElements, audioContextContainer) {
  const tracks = document.querySelectorAll(".track");
  tracks.forEach(track => {
    const index = parseInt(track.getAttribute("data-index"));
    const audioDeviceSelects = track.querySelectorAll(".audio-device-select");
    
    audioDeviceSelects.forEach(audioDeviceSelect => {
      audioDeviceSelect.addEventListener("change", async () => {
        await updateChannelSelectorsForDevice(track, audioDeviceSelect);
        await setTrackAudioDevice(index, audioDeviceSelect.value, audioElements, audioContextContainer);
      });
    });
  });
}

// Simplified device setting
async function setTrackAudioDevice(trackIndex, deviceId, audioElements, audioContextContainer) {
  const audioElement = audioElements[trackIndex];
  const context = audioContextContainer?.contexts?.[trackIndex];
  
  // Try setting device on audio element and context
  const results = await Promise.allSettled([
    trySetDeviceId(audioElement, deviceId),
    trySetDeviceId(context, deviceId)
  ]);
  
  const audioDeviceSet = results[0].status === 'fulfilled' && results[0].value;
  const contextDeviceSet = results[1].status === 'fulfilled' && results[1].value;
  
  // If both failed, recreate context
  if (!audioDeviceSet && !contextDeviceSet) {
    await recreateAudioContextWithDevice(trackIndex, deviceId, audioElements, audioContextContainer);
  }
  
  return { audioDeviceSet, contextDeviceSet };
}

async function trySetDeviceId(target, deviceId) {
  if (!target || typeof target.setSinkId !== "function") return false;
  
  try {
    await target.setSinkId(deviceId);
    return true;
  } catch {
    return false;
  }
}

// AudioContext recreation
async function recreateAudioContextWithDevice(trackIndex, deviceId, audioElements, audioContextContainer) {
  try {
    // Close existing context
    await audioContextContainer.contexts[trackIndex]?.close();

    // Create new context with device
    const newContext = await createAudioContextWithDevice(deviceId);
    const masterGain = createMasterGain(newContext, audioContextContainer.masterVolume);

    // Update containers
    audioContextContainer.contexts[trackIndex] = newContext;
    audioContextContainer.masterGains[trackIndex] = masterGain;

    return true;
  } catch {
    return false;
  }
}

async function createAudioContextWithDevice(deviceId) {
  const context = new (window.AudioContext || window.webkitAudioContext)();
  
  if (typeof context.setSinkId === "function") {
    await context.setSinkId(deviceId);
  }
  
  return context;
}

function createMasterGain(context, masterVolume) {
  const destination = context.destination;
  const maxChannels = destination.maxChannelCount;
  
  // Configure destination
  try {
    destination.channelCount = maxChannels;
    destination.channelCountMode = "explicit";
    destination.channelInterpretation = "discrete";
  } catch (error) {
    destination.channelCount = FALLBACK_CHANNEL_COUNT; // Fallback to stereo
  }

  // Create and configure master gain
  const masterGain = context.createGain();
  masterGain.channelCount = destination.channelCount;
  masterGain.channelCountMode = "explicit";
  masterGain.channelInterpretation = "discrete";
  masterGain.connect(destination);
  
  if (masterVolume !== undefined) {
    masterGain.gain.value = masterVolume;
  }
  
  return masterGain;
}
