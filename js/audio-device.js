// Audio Device Configuration
const AUDIO_CONFIG = {
  FALLBACK_CHANNEL_COUNT: 2,
  DEFAULT_CHANNEL: 1,
  FALLBACK_OPTIONS: `<option value="default">Default Audio Device</option><option value="">Built-in Speakers</option>`
};

// Utility Functions - Shared across multiple files
function getTrackMetadata(track) {
  return {
    index: parseInt(track.getAttribute("data-index")),
    isVideoTrack: track.classList.contains("video-track")
  };
}

function configureAudioDestination(context) {
  const destination = context.destination;
  const maxChannels = destination.maxChannelCount;

  console.log(`Audio hardware supports ${maxChannels} channels`);

  try {
    destination.channelCount = maxChannels;
    destination.channelCountMode = "explicit";
    destination.channelInterpretation = "discrete";
    console.log(`Destination configured for ${maxChannels} discrete channels`);
    return maxChannels;
  } catch (error) {
    console.warn("Could not configure multi-channel destination:", error);
    destination.channelCount = AUDIO_CONFIG.FALLBACK_CHANNEL_COUNT;
    destination.channelCountMode = "explicit";
    destination.channelInterpretation = "speakers";
    return AUDIO_CONFIG.FALLBACK_CHANNEL_COUNT;
  }
}

function createConfiguredMasterGain(context, masterVolume) {
  const channelCount = configureAudioDestination(context);
  const masterGain = context.createGain();
  
  masterGain.channelCount = channelCount;
  masterGain.channelCountMode = "explicit";
  masterGain.channelInterpretation = "discrete";
  masterGain.connect(context.destination);
  
  if (masterVolume !== undefined) {
    masterGain.gain.value = masterVolume;
  }
  
  return masterGain;
}

async function setAudioDeviceUnified(audioElement, context, deviceId) {
  if (!deviceId) return { audioDeviceSet: false, contextDeviceSet: false };
  
  const results = await Promise.allSettled([
    audioElement?.setSinkId?.(deviceId),
    context?.setSinkId?.(deviceId)
  ]);
  
  const [audioResult, contextResult] = results;
  return {
    audioDeviceSet: audioResult.status === 'fulfilled',
    contextDeviceSet: contextResult.status === 'fulfilled'
  };
}

async function getAudioDevices() {
  const selectors = document.querySelectorAll(".audio-device-select");
  
  try {
    if (!navigator.mediaDevices?.enumerateDevices) throw new Error('API not supported');
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const options = devices
      .filter(device => device.kind === "audiooutput")
      .map((device, index) => 
        `<option value="${device.deviceId}">${device.label || `Audio Output ${index + 1}`}</option>`
      ).join('');
    
    selectors.forEach(select => {
      select.innerHTML = options;
      select.dispatchEvent(new Event("change"));
    });
  } catch {
    selectors.forEach(select => select.innerHTML = AUDIO_CONFIG.FALLBACK_OPTIONS);
  }
}

async function updateChannelSelectorsForDevice(track, specificAudioDeviceSelect = null) {
  const audioDeviceSelects = specificAudioDeviceSelect ? [specificAudioDeviceSelect] : track.querySelectorAll(".audio-device-select");
  const channelSelects = getChannelSelectors(track);
  
  if (channelSelects.length === 0) return;

  for (const audioDeviceSelect of audioDeviceSelects) {
    const maxChannels = await getMaxChannelsForDevice(audioDeviceSelect.value);
    updateChannelOptions(channelSelects, maxChannels);
    
    const { index: trackIndex } = getTrackMetadata(track);
    if (window.audioSources?.[trackIndex]) {
      channelSelects.forEach(channelSelect => {
        const currentVal = parseInt(channelSelect.value);
        if (!currentVal || currentVal > maxChannels) {
          channelSelect.dispatchEvent(new Event("change"));
        }
      });
    }
  }
}

function getChannelSelectors(track) {
  const { index, isVideoTrack } = getTrackMetadata(track);
  
  if (isVideoTrack) {
    return [track.querySelector(`#channel-select-${index}-left`), track.querySelector(`#channel-select-${index}-right`)].filter(Boolean);
  } else {
    const selector = track.querySelector(".channel-select");
    return selector ? [selector] : [];
  }
}

async function getMaxChannelsForDevice(deviceId) {
  let context;
  try {
    context = new (window.AudioContext || window.webkitAudioContext)();
    if (deviceId && context.setSinkId) await context.setSinkId(deviceId);
    return context.destination.maxChannelCount;
  } catch {
    return AUDIO_CONFIG.FALLBACK_CHANNEL_COUNT;
  } finally {
    context?.close();
  }
}

function updateChannelOptions(channelSelects, maxChannels) {
  const options = Array.from({length: maxChannels}, (_, i) => 
    `<option value="${i + 1}">Channel ${i + 1}</option>`
  ).join('');
  
  channelSelects.forEach(channelSelect => {
    const currentVal = parseInt(channelSelect.value);
    channelSelect.innerHTML = options;
    channelSelect.value = (currentVal && currentVal <= maxChannels) ? currentVal : AUDIO_CONFIG.DEFAULT_CHANNEL;
  });
}

function setupDeviceChangeListeners(audioElements, audioContextContainer) {
  document.querySelectorAll(".track").forEach(track => {
    const { index } = getTrackMetadata(track);
    
    track.querySelectorAll(".audio-device-select").forEach(audioDeviceSelect => {
      audioDeviceSelect.addEventListener("change", async () => {
        await updateChannelSelectorsForDevice(track, audioDeviceSelect);
        await setTrackAudioDevice(index, audioDeviceSelect.value, audioElements, audioContextContainer);
      });
    });
  });
}

async function setTrackAudioDevice(trackIndex, deviceId, audioElements, audioContextContainer) {
  const audioElement = audioElements[trackIndex];
  const context = audioContextContainer?.contexts?.[trackIndex];
  const result = await setAudioDeviceUnified(audioElement, context, deviceId);
  
  if (!result.audioDeviceSet && !result.contextDeviceSet) {
    await recreateAudioContextWithDevice(trackIndex, deviceId, audioElements, audioContextContainer);
  }
  
  return result;
}

async function recreateAudioContextWithDevice(trackIndex, deviceId, audioElements, audioContextContainer) {
  try {
    await audioContextContainer.contexts[trackIndex]?.close();

    const newContext = new (window.AudioContext || window.webkitAudioContext)();
    if (newContext.setSinkId) await newContext.setSinkId(deviceId);
    
    audioContextContainer.contexts[trackIndex] = newContext;
    audioContextContainer.masterGains[trackIndex] = createConfiguredMasterGain(newContext, audioContextContainer.masterVolume);
    return true;
  } catch {
    return false;
  }
}
