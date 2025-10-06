// Helper function to validate file types
function validateFileType(file, isVideoTrack, index) {
  if (isVideoTrack && !file.type.startsWith("video/")) {
    alert(
      `Please select a video file (MP4). Track ${index} detected as video track but got ${file.type}`
    );
    return false;
  } else if (!isVideoTrack && !file.type.startsWith("audio/")) {
    alert(
      `Please select an audio file (MP3, WAV). Track ${index} detected as audio track but got ${file.type}`
    );
    return false;
  }
  return true;
}

// Helper function to set audio device with error handling
async function setAudioDevice(audio, deviceId) {
  if (!deviceId || !audio || typeof audio.setSinkId !== "function") return;
  
  try {
    await audio.setSinkId(deviceId);
  } catch (error) {
    console.warn("Could not set audio device:", error);
  }
}

// Helper function to setup AudioContext for a track
async function setupAudioContext(index, audioContextContainer, audioDeviceSelect) {
  if (audioContextContainer.contexts[index]) return;
  
  const context = new (window.AudioContext || window.webkitAudioContext)();
  audioContextContainer.contexts[index] = context;
  
  const destination = context.destination;
  const maxChannels = destination.maxChannelCount;

  console.log(`Audio hardware supports ${maxChannels} channels`);

  try {
    destination.channelCount = maxChannels;
    destination.channelCountMode = "explicit";
    destination.channelInterpretation = "discrete";
    console.log(`Destination configured for ${maxChannels} discrete channels`);
  } catch (error) {
    console.warn("Could not configure multi-channel destination:", error);
    destination.channelCount = 2;
    destination.channelCountMode = "explicit";
    destination.channelInterpretation = "speakers";
  }

  // Create master gain
  const masterGain = context.createGain();
  masterGain.channelCount = destination.channelCount;
  masterGain.channelCountMode = "explicit";
  masterGain.channelInterpretation = "discrete";
  masterGain.connect(destination);
  audioContextContainer.masterGains[index] = masterGain;

  // Apply audio device if selected
  if (audioDeviceSelect?.value) {
    try {
      if (typeof setTrackAudioDevice === "function") {
        await setTrackAudioDevice(index, audioDeviceSelect.value, audioElements, audioContextContainer);
      } else if (typeof context.setSinkId === "function") {
        await context.setSinkId(audioDeviceSelect.value);
      }
    } catch (error) {
      console.warn("Could not set audio device:", error);
    }
  }

  // Apply master volume
  if (audioContextContainer.masterVolume !== undefined) {
    masterGain.gain.value = audioContextContainer.masterVolume;
  }
}

// Helper function to setup timeline and time display
function setupTimelineHandlers(audio, timelineProgress, timeDisplay) {
  audio.addEventListener("loadedmetadata", () => {
    timeDisplay.textContent = `${formatTime(0)} / ${formatTime(audio.duration)}`;
    document.dispatchEvent(new Event("fileLoaded"));
  });

  audio.addEventListener("timeupdate", () => {
    const progress = (audio.currentTime / audio.duration) * 100;
    timelineProgress.value = progress;
    timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  });
}

function setupFileHandling(tracks, audioElements, audioSources, audioContextContainer, loopCheckbox) {
  tracks.forEach((track) => {
    const fileInput = track.querySelector(".file-input");
    const fileNameSpan = track.querySelector(".file-name");
    const timelineProgress = track.querySelector(".timeline-progress");
    const timeDisplay = track.querySelector(".time-display");
    const audioDeviceSelect = track.querySelector(".audio-device-select");
    const isVideoTrack = track.classList.contains("video-track");
    const index = parseInt(track.getAttribute("data-index"));

    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      // Validate file type
      if (!validateFileType(file, isVideoTrack, index)) return;

      // Setup AudioContext
      await setupAudioContext(index, audioContextContainer, audioDeviceSelect);

      // Clean up previous audio element
      if (audioElements[index]) {
        audioElements[index].src = "";
        audioElements[index] = null;
        audioSources[index] = null;
      }

      // Reset UI
      timelineProgress.value = 0;
      timeDisplay.textContent = "00:00:00 / 00:00:00";
      fileNameSpan.textContent = file.name;

      // Create audio/video element
      const audio = isVideoTrack ? document.createElement("video") : new Audio();
      audio.src = URL.createObjectURL(file);
      audio.muted = false;
      audio.loop = false;
      
      audioElements[index] = audio;

      // Handle video window setup
      if (isVideoTrack) {
        const videoWindowBtn = track.querySelector(".video-window-btn");
        if (videoWindowBtn) {
          videoWindowBtn.style.display = "inline-block";
          window[`_pendingVideoFile_${index}`] = file;
          window[`_pendingVideoAudio_${index}`] = audio;

          audio.addEventListener("loadedmetadata", () => {
            if (typeof loadVideoIntoWindow === "function") {
              loadVideoIntoWindow(file, audio, index);
            }
          });

          if (typeof loadVideoIntoWindow === "function") {
            setTimeout(() => loadVideoIntoWindow(file, audio, index), 100);
          }
        }
      }

      // Set audio device if selected
      await setAudioDevice(audio, audioDeviceSelect?.value);

      // Setup timeline handlers
      setupTimelineHandlers(audio, timelineProgress, timeDisplay);

      // Setup Web Audio API connections
      setupWebAudioConnections(audio, index, audioContextContainer, audioSources, track, isVideoTrack);

      // Trigger update for master timeline
      document.dispatchEvent(new Event("fileLoaded"));
    });
  });
}



// Helper function to setup Web Audio API connections
function setupWebAudioConnections(audio, index, audioContextContainer, audioSources, track, isVideoTrack) {
  const context = audioContextContainer.contexts[index];
  const source = context.createMediaElementSource(audio);
  const destination = context.destination;
  const mergerChannels = Math.max(destination.maxChannelCount, 18);
  const merger = context.createChannelMerger(mergerChannels);

  merger.channelCountMode = "explicit";
  merger.channelInterpretation = "discrete";

  if (isVideoTrack) {
    // Video track setup with stereo splitting
    const splitter = context.createChannelSplitter(2);
    const leftGainNode = context.createGain();
    const rightGainNode = context.createGain();

    source.connect(splitter);
    splitter.connect(leftGainNode, 0);
    splitter.connect(rightGainNode, 1);
    leftGainNode.connect(merger, 0, 0);
    rightGainNode.connect(merger, 0, 1);
    merger.connect(audioContextContainer.masterGains[index]);

    audioSources[index] = { audio, source, merger, splitter, leftGainNode, rightGainNode };

    // Set default channel selects
    const leftChannelSelect = track.querySelector(`#channel-select-${index}-left`);
    const rightChannelSelect = track.querySelector(`#channel-select-${index}-right`);
    if (leftChannelSelect) leftChannelSelect.value = 1;
    if (rightChannelSelect) rightChannelSelect.value = 2;
  } else {
    // Audio track setup with single gain
    const gainNode = context.createGain();
    
    source.connect(gainNode);
    gainNode.connect(merger, 0, 0);
    merger.connect(audioContextContainer.masterGains[index]);

    audioSources[index] = { audio, source, merger, gainNode };

    // Set default channel select
    const channelSelect = track.querySelector(".channel-select");
    if (channelSelect) channelSelect.value = 1;
  }
}
