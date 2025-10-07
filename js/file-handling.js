function validateFileType(file, isVideoTrack, index) {
  const expectedType = isVideoTrack ? "video/" : "audio/";
  const fileType = isVideoTrack ? "video file (MP4)" : "audio file (MP3, WAV)";
  
  if (!file.type.startsWith(expectedType)) {
    alert(`Please select a ${fileType}. Track ${index} detected as ${isVideoTrack ? 'video' : 'audio'} track but got ${file.type}`);
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
      if (typeof setTrackAudioDevice === "function") {
        await setTrackAudioDevice(index, audioDeviceSelect.value, audioElements, audioContextContainer);
      } else {
        await setAudioDeviceUnified(null, context, audioDeviceSelect.value);
      }
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
    const { index, isVideoTrack } = getTrackMetadata(track);

    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file || !validateFileType(file, isVideoTrack, index)) return;

      await setupAudioContext(index, audioContextContainer, audioDeviceSelect, audioElements);

      if (audioElements[index]) {
        audioElements[index].src = "";
        audioElements[index] = null;
        audioSources[index] = null;
      }

      timelineProgress.value = 0;
      timeDisplay.textContent = "00:00:00 / 00:00:00";
      fileNameSpan.textContent = file.name;

      const audio = isVideoTrack ? document.createElement("video") : new Audio();
      audio.src = URL.createObjectURL(file);
      audio.muted = false;
      audio.loop = false;
      audioElements[index] = audio;

      if (isVideoTrack) {
        const videoWindowBtn = track.querySelector(".video-window-btn");
        if (videoWindowBtn) {
          videoWindowBtn.style.display = "inline-block";
          window[`_pendingVideoFile_${index}`] = file;
          window[`_pendingVideoAudio_${index}`] = audio;

          const loadVideo = () => {
            if (typeof loadVideoIntoWindow === "function") {
              loadVideoIntoWindow(file, audio, index);
            }
          };

          audio.addEventListener("loadedmetadata", loadVideo);
          setTimeout(loadVideo, 100);
        }
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

  merger.channelCountMode = "explicit";
  merger.channelInterpretation = "discrete";

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

    const leftChannelSelect = track.querySelector(`#channel-select-${index}-left`);
    const rightChannelSelect = track.querySelector(`#channel-select-${index}-right`);
    if (leftChannelSelect) leftChannelSelect.value = 1;
    if (rightChannelSelect) rightChannelSelect.value = 2;
  } else {
    const gainNode = context.createGain();
    
    source.connect(gainNode);
    gainNode.connect(merger, 0, 0);
    merger.connect(audioContextContainer.masterGains[index]);

    audioSources[index] = { audio, source, merger, gainNode };

    const channelSelect = track.querySelector(".channel-select");
    if (channelSelect) channelSelect.value = 1;
  }
}
