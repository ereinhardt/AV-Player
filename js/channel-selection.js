// Helper function to validate and connect audio channels with fallback
function connectToChannel(gainNode, merger, newChannel, fallbackElement) {
  if (!gainNode || !merger) return false;
  
  gainNode.disconnect();
  
  // Try to connect to the specified channel, fallback to channel 1 on error
  const targetChannel = (newChannel >= 0 && newChannel < merger.numberOfInputs) ? newChannel : 0;
  
  try {
    gainNode.connect(merger, 0, targetChannel);
    return targetChannel === newChannel;
  } catch (error) {
    console.warn(`Channel connection failed, falling back to channel 1:`, error);
    gainNode.connect(merger, 0, 0);
    if (fallbackElement) fallbackElement.value = 1;
    return false;
  }
}

// Unified channel change handler
function handleChannelChange(trackIndex, channelValue, audioSources, side, isVideo, element) {
  // Validate audio source exists
  const audioSource = audioSources[trackIndex];
  if (!audioSource) {
    alert(`Please add ${isVideo ? 'a video' : 'an audio'} file to this track first.`);
    element.value = 1;
    return;
  }

  const newChannel = parseInt(channelValue, 10) - 1;
  const { gainNode, leftGainNode, rightGainNode, merger } = audioSource;
  
  // Select appropriate gain node
  const targetGainNode = isVideo ? (side === "left" ? leftGainNode : rightGainNode) : gainNode;
  
  connectToChannel(targetGainNode, merger, newChannel, element);
}

function setupChannelSelection(tracks, audioSources, audioContextContainer) {
  tracks.forEach((track) => {
    const { index, isVideoTrack } = getTrackMetadata(track);

    if (isVideoTrack) {
      // Setup stereo channel selectors for video tracks
      ["left", "right"].forEach(side => {
        const channelSelect = track.querySelector(`#channel-select-${index}-${side}`);
        if (channelSelect) {
          channelSelect.addEventListener("change", (event) => 
            handleChannelChange(index, event.target.value, audioSources, side, true, event.target)
          );
        }
      });
    } else {
      // Setup single channel selector for audio tracks
      const channelSelect = track.querySelector(".channel-select");
      if (channelSelect) {
        channelSelect.addEventListener("change", (event) => 
          handleChannelChange(index, event.target.value, audioSources, null, false, event.target)
        );
      }
    }
  });
}
