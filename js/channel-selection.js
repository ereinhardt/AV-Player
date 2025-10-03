function setupChannelSelection(tracks, audioSources, audioContextContainer) {
    tracks.forEach((track, arrayIndex) => {
        // Use the data-index attribute instead of array index
        const index = parseInt(track.getAttribute('data-index'));
        
        const isVideoTrack = track.classList.contains('video-track');
        
        if (isVideoTrack) {
            // Handle stereo channel selection for video tracks
            const leftChannelSelect = track.querySelector('#channel-select-' + index + '-left');
            const rightChannelSelect = track.querySelector('#channel-select-' + index + '-right');
            
            if (leftChannelSelect) {
                leftChannelSelect.addEventListener('change', (event) => {
                    handleVideoChannelChange(index, 'left', event.target.value, audioSources);
                });
            }
            
            if (rightChannelSelect) {
                rightChannelSelect.addEventListener('change', (event) => {
                    handleVideoChannelChange(index, 'right', event.target.value, audioSources);
                });
            }
        } else {
            // Handle single channel selection for audio tracks
            const channelSelect = track.querySelector('.channel-select');
            if (channelSelect) {
                channelSelect.addEventListener('change', (event) => {
                    const audioSource = audioSources[index];
                    if (!audioSource) {
                        alert("Please add an audio file to this track first.");
                        event.target.value = 1; // Reset selection
                        return;
                    }

                    const newChannel = parseInt(event.target.value, 10) - 1; // 0-indexed
                    const { gainNode, merger } = audioSource;
                    
                    if (gainNode && merger) {
                        // Completely disconnect and reconnect to ensure clean routing
                        gainNode.disconnect();
                        
                        const context = audioContextContainer.contexts[index];
                        
                        gainNode.connect(merger, 0, newChannel);
                    }
                });
            }
        }
    });
}

function handleVideoChannelChange(trackIndex, side, channelValue, audioSources) {
    const audioSource = audioSources[trackIndex];
    if (!audioSource) {
        alert("Please add a video file to this track first.");
        return;
    }

    const newChannel = parseInt(channelValue, 10) - 1; // 0-indexed
    const { splitter, leftGainNode, rightGainNode, merger } = audioSource;
    
    if (!splitter || !leftGainNode || !rightGainNode || !merger) {
        return;
    }

    if (side === 'left') {
        // Disconnect and reconnect left channel
        leftGainNode.disconnect();
        leftGainNode.connect(merger, 0, newChannel);
    } else if (side === 'right') {
        // Disconnect and reconnect right channel
        rightGainNode.disconnect();
        rightGainNode.connect(merger, 0, newChannel);
    }
}
