function setupChannelSelection(tracks, audioSources, audioContextContainer) {
  tracks.forEach((track, arrayIndex) => {
    const index = parseInt(track.getAttribute("data-index"));
    const isVideoTrack = track.classList.contains("video-track");

    if (isVideoTrack) {
      // Handle stereo channel selection for video tracks
      const leftChannelSelect = track.querySelector(
        "#channel-select-" + index + "-left"
      );
      const rightChannelSelect = track.querySelector(
        "#channel-select-" + index + "-right"
      );

      if (leftChannelSelect) {
        leftChannelSelect.addEventListener("change", (event) => {
          handleVideoChannelChange(
            index,
            "left",
            event.target.value,
            audioSources
          );
        });
      }

      if (rightChannelSelect) {
        rightChannelSelect.addEventListener("change", (event) => {
          handleVideoChannelChange(
            index,
            "right",
            event.target.value,
            audioSources
          );
        });
      }
    } else {
      // Handle single channel selection for audio tracks
      const channelSelect = track.querySelector(".channel-select");
      if (channelSelect) {
        channelSelect.addEventListener("change", (event) => {
          const audioSource = audioSources[index];
          if (!audioSource) {
            alert("Please add an audio file to this track first.");
            event.target.value = 1;
            return;
          }

          const newChannel = parseInt(event.target.value, 10) - 1;
          const { gainNode, merger } = audioSource;

          if (gainNode && merger) {
            gainNode.disconnect();

            // Validate channel and connect
            if (newChannel >= 0 && newChannel < merger.numberOfInputs) {
              try {
                gainNode.connect(merger, 0, newChannel);
              } catch (error) {
                // Fallback to channel 1
                gainNode.connect(merger, 0, 0);
                event.target.value = 1;
              }
            } else {
              // Fallback to channel 1
              gainNode.connect(merger, 0, 0);
              event.target.value = 1;
            }
          }
        });
      }
    }
  });
}

function handleVideoChannelChange(
  trackIndex,
  side,
  channelValue,
  audioSources
) {
  const audioSource = audioSources[trackIndex];
  if (!audioSource) {
    alert("Please add a video file to this track first.");
    return;
  }

  const newChannel = parseInt(channelValue, 10) - 1;
  const { splitter, leftGainNode, rightGainNode, merger } = audioSource;

  if (!splitter || !leftGainNode || !rightGainNode || !merger) {
    return;
  }

  if (newChannel >= 0 && newChannel < merger.numberOfInputs) {
    try {
      if (side === "left") {
        leftGainNode.disconnect();
        leftGainNode.connect(merger, 0, newChannel);
      } else if (side === "right") {
        rightGainNode.disconnect();
        rightGainNode.connect(merger, 0, newChannel);
      }
    } catch (error) {
      console.error(
        `Failed to route video track ${trackIndex} ${side} channel:`,
        error
      );
    }
  }
}
