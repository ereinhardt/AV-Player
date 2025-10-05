function setupFileHandling(
  tracks,
  audioElements,
  audioSources,
  audioContextContainer,
  loopCheckbox
) {
  tracks.forEach((track, arrayIndex) => {
    const fileInput = track.querySelector(".file-input");
    const fileNameSpan = track.querySelector(".file-name");
    const timelineProgress = track.querySelector(".timeline-progress");
    const timeDisplay = track.querySelector(".time-display");
    const audioDeviceSelect = track.querySelector(".audio-device-select");
    const isVideoTrack = track.classList.contains("video-track");

    // Use the data-index attribute instead of array index
    const index = parseInt(track.getAttribute("data-index"));

    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      // Validate file type
      if (isVideoTrack && !file.type.startsWith("video/")) {
        alert(
          `Please select a video file (MP4). Track ${index} detected as video track but got ${file.type}`
        );
        return;
      } else if (!isVideoTrack && !file.type.startsWith("audio/")) {
        alert(
          `Please select an audio file (MP3, WAV). Track ${index} detected as audio track but got ${file.type}`
        );
        return;
      }

      // Create a separate AudioContext for this track if it doesn't exist
      if (!audioContextContainer.contexts[index]) {
        audioContextContainer.contexts[index] = new (window.AudioContext ||
          window.webkitAudioContext)();

        // Configure destination for multi-channel output
        const destination = audioContextContainer.contexts[index].destination;
        const maxChannels = destination.maxChannelCount;

        console.log(`Audio hardware supports ${maxChannels} channels`);

        try {
          // Use maximum available channels for multi-channel devices
          destination.channelCount = maxChannels;
          destination.channelCountMode = "explicit";
          destination.channelInterpretation = "discrete";
          console.log(
            `Destination configured for ${maxChannels} discrete channels`
          );
        } catch (error) {
          console.warn("Could not configure multi-channel destination:", error);
          // Fallback to stereo
          destination.channelCount = 2;
          destination.channelCountMode = "explicit";
          destination.channelInterpretation = "speakers";
        }

        // Create master gain with matching channel configuration
        audioContextContainer.masterGains[index] =
          audioContextContainer.contexts[index].createGain();
        audioContextContainer.masterGains[index].channelCount =
          destination.channelCount;
        audioContextContainer.masterGains[index].channelCountMode = "explicit";
        audioContextContainer.masterGains[index].channelInterpretation =
          "discrete";
        audioContextContainer.masterGains[index].connect(destination);

        // Apply the currently selected audio device to this track's AudioContext
        if (audioDeviceSelect && audioDeviceSelect.value) {
          // Use the new setTrackAudioDevice function for better device management
          try {
            await setTrackAudioDevice(
              index,
              audioDeviceSelect.value,
              audioElements,
              audioContextContainer
            );
          } catch (error) {
            // Fallback to simple setSinkId if available
            try {
              if (
                typeof audioContextContainer.contexts[index].setSinkId ===
                "function"
              ) {
                await audioContextContainer.contexts[index].setSinkId(
                  audioDeviceSelect.value
                );
              }
            } catch (fallbackError) {
              // Silently handle fallback failure
            }
          }
        }

        // Apply master volume if it exists
        if (audioContextContainer.masterVolume !== undefined) {
          audioContextContainer.masterGains[index].gain.value =
            audioContextContainer.masterVolume;
        }
      }

      // Clean up previous audio element for this track if it exists
      if (audioElements[index]) {
        audioElements[index].src = "";
        audioElements[index] = null;
        audioSources[index] = null;
      }

      // Reset timeline UI
      timelineProgress.value = 0;
      timeDisplay.textContent = "00:00:00 / 00:00:00";
      fileNameSpan.textContent = file.name;

      let audio;
      if (isVideoTrack) {
        // For video tracks, create a video element but extract only audio
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        video.muted = false; // Keep audio enabled for Web Audio API
        video.loop = false; // Disable individual video loop - use central loop control

        // Use the video element as the audio source
        audio = video;
        audioElements[index] = audio;

        // Show video window button and load video into window
        const videoWindowBtn = track.querySelector(".video-window-btn");
        if (videoWindowBtn) {
          videoWindowBtn.style.display = "inline-block";

          // Store the video file and audio for later use
          window[`_pendingVideoFile_${index}`] = file;
          window[`_pendingVideoAudio_${index}`] = audio;

          // Load video into the popup window when metadata is ready
          video.addEventListener("loadedmetadata", () => {
            if (typeof loadVideoIntoWindow === "function") {
              loadVideoIntoWindow(file, audio, index);
            }
          });

          // Also try to load immediately if video window is already open
          if (typeof loadVideoIntoWindow === "function") {
            setTimeout(() => {
              loadVideoIntoWindow(file, audio, index);
            }, 100);
          }
        }
      } else {
        // Regular audio track
        audio = new Audio(URL.createObjectURL(file));
        audio.loop = false; // Disable individual audio loop - use central loop control
        audioElements[index] = audio;
      }

      // IMPORTANT: Set the audio device BEFORE creating any Web Audio API connections
      const selectedDeviceId = audioDeviceSelect.value;
      if (selectedDeviceId) {
        // Try setSinkId for both audio and video elements (modern browsers support this)
        if (typeof audio.setSinkId === "function") {
          try {
            await audio.setSinkId(selectedDeviceId);
          } catch (error) {
            // Audio will use the default output device
          }
        }
      }

      // --- Timeline and Time Display Logic ---
      audio.addEventListener("loadedmetadata", () => {
        timeDisplay.textContent = `${formatTime(0)} / ${formatTime(
          audio.duration
        )}`;
        // Trigger loop setup update when metadata is loaded
        document.dispatchEvent(new Event("fileLoaded"));
      });

      audio.addEventListener("timeupdate", () => {
        const progress = (audio.currentTime / audio.duration) * 100;
        timelineProgress.value = progress;
        timeDisplay.textContent = `${formatTime(
          audio.currentTime
        )} / ${formatTime(audio.duration)}`;
      });
      // --- End of Timeline Logic ---

      const source =
        audioContextContainer.contexts[index].createMediaElementSource(audio);
      const destination = audioContextContainer.contexts[index].destination;

      // Create merger with enough channels for multi-channel interfaces
      const mergerChannels = Math.max(destination.maxChannelCount, 18);
      const merger =
        audioContextContainer.contexts[index].createChannelMerger(
          mergerChannels
        );

      // Configure merger for discrete channel interpretation
      merger.channelCountMode = "explicit";
      merger.channelInterpretation = "discrete";

      if (isVideoTrack) {
        // For video tracks, create stereo channel splitting setup
        const splitter =
          audioContextContainer.contexts[index].createChannelSplitter(2);
        const leftGainNode = audioContextContainer.contexts[index].createGain();
        const rightGainNode =
          audioContextContainer.contexts[index].createGain();

        // Connect source to splitter
        source.connect(splitter);

        // Connect splitter outputs to individual gain nodes
        splitter.connect(leftGainNode, 0); // Left channel (0) to left gain
        splitter.connect(rightGainNode, 1); // Right channel (1) to right gain

        // Connect gain nodes to merger (using selected channels)
        leftGainNode.connect(merger, 0, 0); // Left to output channel 1 (default)
        rightGainNode.connect(merger, 0, 1); // Right to output channel 2 (default)

        merger.connect(audioContextContainer.masterGains[index]);

        audioSources[index] = {
          audio,
          source,
          merger,
          splitter,
          leftGainNode,
          rightGainNode,
        };

        // Set the channel selects for this video track to defaults
        const leftChannelSelect = track.querySelector(
          "#channel-select-" + index + "-left"
        );
        const rightChannelSelect = track.querySelector(
          "#channel-select-" + index + "-right"
        );
        if (leftChannelSelect) leftChannelSelect.value = 1; // Channel 1
        if (rightChannelSelect) rightChannelSelect.value = 2; // Channel 2
      } else {
        // Regular audio track setup
        const gainNode = audioContextContainer.contexts[index].createGain();

        source.connect(gainNode);
        // Connect to default channel 1 initially (consistent with video tracks)
        const initialChannel = 0; // Channel 1 (0-indexed)
        gainNode.connect(merger, 0, initialChannel);
        merger.connect(audioContextContainer.masterGains[index]);

        audioSources[index] = { audio, source, merger, gainNode };

        // Set the channel select for this track to the default (1-based display)
        const channelSelect = track.querySelector(".channel-select");
        if (channelSelect) channelSelect.value = 1; // Display as Channel 1
      }

      // Dispatch event to update master timeline
      document.dispatchEvent(new Event("fileLoaded"));
    });
  });
}
