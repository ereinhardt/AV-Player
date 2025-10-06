// Helper function to validate and connect audio channels with fallback
function connectToChannel(gainNode, merger, newChannel, fallbackElement) {
  if (!gainNode || !merger) return false;
  
  gainNode.disconnect();
  
  if (newChannel >= 0 && newChannel < merger.numberOfInputs) {
    try {
      gainNode.connect(merger, 0, newChannel);
      return true;
    } catch (error) {
      console.warn(`Channel connection failed, falling back to channel 1:`, error);
    }
  }
  
  // Fallback to channel 1 (index 0)
  gainNode.connect(merger, 0, 0);
  if (fallbackElement) fallbackElement.value = 1;
  return false;
}

// Helper function to validate audio source exists
function validateAudioSource(audioSources, index, trackType) {
  const audioSource = audioSources[index];
  if (!audioSource) {
    alert(`Please add ${trackType === 'video' ? 'a video' : 'an audio'} file to this track first.`);
    return null;
  }
  return audioSource;
}

// Unified channel change handler
function handleChannelChange(trackIndex, channelValue, audioSources, options = {}) {
  const { side, isVideo, fallbackElement } = options;
  const trackType = isVideo ? 'video' : 'audio';
  
  const audioSource = validateAudioSource(audioSources, trackIndex, trackType);
  if (!audioSource) {
    if (fallbackElement) fallbackElement.value = 1;
    return;
  }

  const newChannel = parseInt(channelValue, 10) - 1;

  if (isVideo) {
    const { leftGainNode, rightGainNode, merger } = audioSource;
    const gainNode = side === "left" ? leftGainNode : rightGainNode;
    
    if (gainNode && merger) {
      connectToChannel(gainNode, merger, newChannel, fallbackElement);
    }
  } else {
    const { gainNode, merger } = audioSource;
    connectToChannel(gainNode, merger, newChannel, fallbackElement);
  }
}

function setupChannelSelection(tracks, audioSources, audioContextContainer) {
  tracks.forEach((track, arrayIndex) => {
    const index = parseInt(track.getAttribute("data-index"));
    const isVideoTrack = track.classList.contains("video-track");

    if (isVideoTrack) {
      // Setup stereo channel selectors for video tracks
      ["left", "right"].forEach(side => {
        const channelSelect = track.querySelector(`#channel-select-${index}-${side}`);
        if (channelSelect) {
          channelSelect.addEventListener("change", (event) => {
            handleChannelChange(index, event.target.value, audioSources, {
              side,
              isVideo: true,
              fallbackElement: event.target
            });
          });
        }
      });
    } else {
      // Setup single channel selector for audio tracks
      const channelSelect = track.querySelector(".channel-select");
      if (channelSelect) {
        channelSelect.addEventListener("change", (event) => {
          handleChannelChange(index, event.target.value, audioSources, {
            isVideo: false,
            fallbackElement: event.target
          });
        });
      }
    }
  });
}
