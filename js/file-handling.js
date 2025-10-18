function cleanupAudioElement(audioElement) {
  if (audioElement?._blobUrl) {
    URL.revokeObjectURL(audioElement._blobUrl);
    audioElement._blobUrl = null;
  }
}

function disconnectAudioNodes(audioSource) {
  if (!audioSource) return;
  try {
    ["source", "merger", "gainNode", "splitter", "leftGainNode", "rightGainNode"]
      .forEach(node => audioSource[node]?.disconnect());
  } catch (error) {
    console.warn("Error disconnecting audio nodes:", error);
  }
}

function cleanupAllAudioElements(audioElements) {
  audioElements.forEach(el => el && cleanupAudioElement(el));
}

function cleanupAllAudioSources(audioSources) {
  audioSources.forEach(src => src && disconnectAudioNodes(src));
}

function validateFileType(file, isVideoTrack, index) {
  const expectedType = isVideoTrack ? "video/" : "audio/";
  const fileType = isVideoTrack ? "video file (MP4)" : "audio file (MP3, WAV)";

  if (!file.type.startsWith(expectedType)) {
    alert(`Please select a ${fileType}. Track ${index} detected as ${isVideoTrack ? "video" : "audio"} track but got ${file.type}`);
    return false;
  }
  return true;
}

async function setupAudioContext(index, audioContextContainer, audioDeviceSelect, audioElements) {
  if (audioContextContainer.contexts[index]) return;

  const context = new (window.AudioContext || window.webkitAudioContext)();
  audioContextContainer.contexts[index] = context;
  audioContextContainer.masterGains[index] = createConfiguredMasterGain(context, audioContextContainer.masterVolume);

  if (audioDeviceSelect?.value) {
    try {
      const setupFn = typeof setTrackAudioDevice === "function" ? setTrackAudioDevice : setAudioDeviceUnified;
      await (setupFn === setTrackAudioDevice 
        ? setupFn(index, audioDeviceSelect.value, audioElements, audioContextContainer)
        : setupFn(null, context, audioDeviceSelect.value));
    } catch (error) {
      console.warn("Could not set audio device:", error);
    }
  }
}

function setupTimelineHandlers(audio, timelineProgress, timeDisplay) {
  audio.addEventListener("loadedmetadata", () => {
    timeDisplay.textContent = `${formatTime(0)} / ${formatTime(audio.duration)}`;
    document.dispatchEvent(new Event("fileLoaded"));
  });

  // Use interval for smoother progress bar updates (50ms = 20fps)
  const updateInterval = setInterval(() => {
    if (audio.duration && isFinite(audio.duration)) {
      timelineProgress.value = (audio.currentTime / audio.duration) * 100;
      timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    } else {
      timelineProgress.value = 0;
      timeDisplay.textContent = `00:00:00 / 00:00:00`;
    }
  }, 50);

  // Store interval ID for cleanup
  audio._timelineUpdateInterval = updateInterval;
}

function setupFileHandling(tracks, audioElements, audioSources, audioContextContainer, loopCheckbox) {
  tracks.forEach((track) => {
    const fileInput = track.querySelector(".file-input");
    const fileNameSpan = track.querySelector(".file-name");
    const timelineProgress = track.querySelector(".timeline-progress");
    const timeDisplay = track.querySelector(".time-display");
    const audioDeviceSelect = track.querySelector(".audio-device-select");
    const { index, isVideoTrack } = getTrackMetadata(track);

    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file || !validateFileType(file, isVideoTrack, index)) return;

      await setupAudioContext(index, audioContextContainer, audioDeviceSelect, audioElements);

      // Cleanup existing audio
      if (audioElements[index]) {
        if (audioElements[index].src?.startsWith("blob:")) {
          URL.revokeObjectURL(audioElements[index].src);
        }
        audioElements[index].src = "";
        audioElements[index] = null;
      }

      if (audioSources[index]) {
        disconnectAudioNodes(audioSources[index]);
        audioSources[index] = null;
      }

      // Reset UI
      timelineProgress.value = 0;
      timeDisplay.textContent = "00:00:00 / 00:00:00";
      fileNameSpan.textContent = file.name;

      // Create audio element
      const audio = isVideoTrack ? document.createElement("video") : new Audio();
      const blobUrl = URL.createObjectURL(file);
      Object.assign(audio, { src: blobUrl, _blobUrl: blobUrl, muted: false, loop: false });
      audioElements[index] = audio;

      // Video-specific setup
      if (isVideoTrack && track.querySelector(".video-window-btn")) {
        window[`_pendingVideoFile_${index}`] = file;
        window[`_pendingVideoAudio_${index}`] = audio;

        const loadVideo = () => {
          if (typeof loadVideoIntoWindow === "function") loadVideoIntoWindow(file, audio, index);
        };

        audio.addEventListener("loadedmetadata", loadVideo);
        setTimeout(loadVideo, 100);
      }

      if (audioDeviceSelect?.value) {
        await setAudioDeviceUnified(audio, audioContextContainer.contexts[index], audioDeviceSelect.value);
      }

      setupTimelineHandlers(audio, timelineProgress, timeDisplay);
      setupWebAudioConnections(audio, index, audioContextContainer, audioSources, track, isVideoTrack);
      document.dispatchEvent(new Event("fileLoaded"));
    });
  });
}

function setupWebAudioConnections(audio, index, audioContextContainer, audioSources, track, isVideoTrack) {
  const context = audioContextContainer.contexts[index];
  const source = context.createMediaElementSource(audio);
  const merger = context.createChannelMerger(Math.max(context.destination.maxChannelCount, 18));

  Object.assign(merger, { channelCountMode: "explicit", channelInterpretation: "discrete" });

  if (isVideoTrack) {
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

    track.querySelector(`#channel-select-${index}-left`)?.setAttribute("value", 1);
    track.querySelector(`#channel-select-${index}-right`)?.setAttribute("value", 2);
  } else {
    const gainNode = context.createGain();
    source.connect(gainNode);
    gainNode.connect(merger, 0, 0);
    merger.connect(audioContextContainer.masterGains[index]);

    audioSources[index] = { audio, source, merger, gainNode };
    track.querySelector(".channel-select")?.setAttribute("value", 1);
  }
}

window.addEventListener("beforeunload", () => {
  if (window.audioElements) cleanupAllAudioElements(window.audioElements);
  if (window.audioSources) cleanupAllAudioSources(window.audioSources);
});

function removeFileFromTrack(index, audioElements, audioSources, audioContextContainer) {
  const track = document.querySelector(`.track[data-index="${index}"]`);
  if (!track) return;

  const isVideoTrack = track.classList.contains("video-track");

  // Stop and cleanup audio
  if (audioElements[index]) {
    audioElements[index].pause();
    audioElements[index].currentTime = 0;
    if (audioElements[index].src?.startsWith("blob:")) {
      URL.revokeObjectURL(audioElements[index].src);
    }
    // Clear timeline update interval
    if (audioElements[index]._timelineUpdateInterval) {
      clearInterval(audioElements[index]._timelineUpdateInterval);
      audioElements[index]._timelineUpdateInterval = null;
    }
    audioElements[index].src = "";
    audioElements[index] = null;
  }

  // Cleanup audio nodes
  if (audioSources[index]) {
    disconnectAudioNodes(audioSources[index]);
    audioSources[index] = null;
  }

  // Close video window
  if (isVideoTrack && window.videoWindows?.[index] && !window.videoWindows[index].closed) {
    window.videoWindows[index].close();
    delete window.videoWindows[index];
  }

  // Reset UI
  const fileInput = track.querySelector(".file-input");
  const fileNameSpan = track.querySelector(".file-name");
  const timelineProgress = track.querySelector(".timeline-progress");
  const timeDisplay = track.querySelector(".time-display");

  if (fileInput) fileInput.value = "";
  if (fileNameSpan) fileNameSpan.textContent = "No file selected";
  if (timelineProgress) timelineProgress.value = 0;
  if (timeDisplay) timeDisplay.textContent = "00:00:00 / 00:00:00";

  // Cleanup video references
  delete window[`_pendingVideoFile_${index}`];
  delete window[`_pendingVideoAudio_${index}`];

  document.dispatchEvent(new Event("fileLoaded"));
}

function setupRemoveButtons(audioElements, audioSources, audioContextContainer) {
  document.querySelectorAll(".remove-btn").forEach(button => {
    button.addEventListener("click", () => {
      const index = parseInt(button.getAttribute("data-track-index"));
      if (!isNaN(index)) removeFileFromTrack(index, audioElements, audioSources, audioContextContainer);
    });
  });
}

// Make cleanup functions globally available
window.cleanupAudioElement = cleanupAudioElement;
window.cleanupAllAudioElements = cleanupAllAudioElements;
window.disconnectAudioNodes = disconnectAudioNodes;
window.cleanupAllAudioSources = cleanupAllAudioSources;
window.removeFileFromTrack = removeFileFromTrack;
window.setupRemoveButtons = setupRemoveButtons;
