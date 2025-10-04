// --- Video Tab Management ---
let videoWindows = {}; // Object to store multiple video windows by track index

// Global video states to share with playback.js
window.videoStates = window.videoStates || {};

// Helper functions
function isWindowValid(trackIndex) {
    return videoWindows[trackIndex] && !videoWindows[trackIndex].closed;
}

function postToVideoWindow(trackIndex, message) {
    if (isWindowValid(trackIndex)) {
        videoWindows[trackIndex].postMessage(message, window.location.origin);
        return true;
    }
    return false;
}

function shouldSkipVideoAction(trackIndex) {
    if (window._isVideoSyncing) return true;
    
    // Check if video has ended (unless reset or loop restart)
    if (!window.isVideoReset && !window.isLoopRestarting) {
        const videoState = window.videoStates?.[trackIndex];
        return videoState?.hasEnded;
    }
    return false;
}

function createVideoWindow(trackIndex) {
    if (isWindowValid(trackIndex)) {
        videoWindows[trackIndex].focus();
        return videoWindows[trackIndex];
    }

    const windowFeatures = 'width=800,height=600,scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no';
    
    try {
        videoWindows[trackIndex] = window.open('./video.html', `VideoPlayer_${trackIndex}`, windowFeatures);
        
        if (!videoWindows[trackIndex]) {
            alert('Video window could not be opened. Please allow popups for this site.');
            return null;
        }
        
        // Listen for messages from the video window
        const messageHandler = (event) => {
            if (event.origin !== window.location.origin) return;
            
            if (event.data.type === 'VIDEO_WINDOW_READY') {
                // If we have pending video data, load it now
                if (window[`_pendingVideoFile_${trackIndex}`]) {
                    loadVideoIntoWindow(
                        window[`_pendingVideoFile_${trackIndex}`], 
                        window[`_pendingVideoAudio_${trackIndex}`],
                        trackIndex
                    );
                }
            }
        };
        
        window.addEventListener('message', messageHandler);
        videoWindows[trackIndex]._messageHandler = messageHandler;
        
    } catch (error) {
        return null;
    }
    
    return videoWindows[trackIndex];
}

function loadVideoIntoWindow(videoFile, videoAudio, trackIndex) {
    if (!isWindowValid(trackIndex)) {
        createVideoWindow(trackIndex);
    }

    const videoWindow = videoWindows[trackIndex];
    if (!videoWindow) return;

    const sendVideoData = () => {
        try {
            const videoURL = URL.createObjectURL(videoFile);
            
            postToVideoWindow(trackIndex, {
                type: 'LOAD_VIDEO',
                data: {
                    url: videoURL,
                    filename: videoFile.name
                }
            });
            
            // Send current loop status
            const loopCheckbox = document.getElementById('loop-checkbox');
            if (loopCheckbox) {
                postToVideoWindow(trackIndex, {
                    type: 'SET_LOOP',
                    data: { loop: loopCheckbox.checked }
                });
            }
            
            // Set up synchronization
            if (videoAudio) {
                syncVideoWithAudio(videoAudio, trackIndex);
            }
        } catch (error) {
            // Retry after a short delay
            setTimeout(() => {
                if (isWindowValid(trackIndex)) {
                    sendVideoData();
                }
            }, 1000);
        }
    };

    // Simple window ready check
    const checkWindowReady = () => {
        if (isWindowValid(trackIndex)) {
            try {
                if (videoWindow.document?.getElementById('video-player')) {
                    sendVideoData();
                    return;
                }
            } catch (e) {
                // Window not ready yet
            }
        }
        setTimeout(checkWindowReady, 250);
    };
    
    setTimeout(checkWindowReady, 100);
}

function syncVideoWithAudio(audio, trackIndex) {
    if (!isWindowValid(trackIndex)) return;
    
    // Sync play/pause
    const syncPlayPause = () => {
        if (shouldSkipVideoAction(trackIndex)) return;
        
        if (audio.paused) {
            postToVideoWindow(trackIndex, { type: 'PAUSE' });
        } else {
            // During loop restart or after reset, always send PLAY but ensure video is reset first
            if (window.isLoopRestarting || window.isVideoReset) {
                console.log(`Sending PLAY to video ${trackIndex} (loop restart or reset) - audio time:`, audio.currentTime);
                
                if (audio.currentTime < 0.1) {
                    console.log(`Audio is at beginning, sending RESTART_VIDEO to ensure video resets`);
                    postToVideoWindow(trackIndex, { type: 'RESTART_VIDEO' });
                } else {
                    postToVideoWindow(trackIndex, { type: 'PLAY' });
                }
                return;
            }
            
            // Check if the audio element itself has ended
            if (audio?.tagName === 'VIDEO' && (audio.ended || audio.currentTime >= audio.duration - 0.1)) {
                console.log(`Not sending PLAY to video ${trackIndex} - audio element has ended`);
                return;
            }
            
            // Check if this video is known to have ended
            const videoState = window.videoStates?.[trackIndex];
            if (videoState?.hasEnded) {
                console.log(`Not sending PLAY to video ${trackIndex} - it has ended`);
                return;
            }
            
            // Query video status first, then send play if appropriate
            postToVideoWindow(trackIndex, { type: 'GET_VIDEO_STATUS' });
            
            setTimeout(() => {
                // Re-check status after delay
                const videoState = window.videoStates?.[trackIndex];
                if (videoState?.hasEnded || 
                    (audio?.tagName === 'VIDEO' && (audio.ended || audio.currentTime >= audio.duration - 0.1))) {
                    console.log(`Not sending PLAY to video ${trackIndex} - still ended after delay`);
                    return;
                }
                
                console.log(`Sending PLAY to video ${trackIndex}`);
                postToVideoWindow(trackIndex, { type: 'PLAY' });
            }, 50);
        }
    };

    // Sync time position - only on significant jumps
    let lastSyncTime = 0;
    let lastAudioTime = 0;
    let syncPaused = false;
    
    // Functions to pause/resume video sync during loop restarts
    window.pauseVideoSync = () => { syncPaused = true; };
    window.resumeVideoSync = () => { syncPaused = false; };
    
    const syncTime = () => {
        if (shouldSkipVideoAction(trackIndex) || syncPaused) return;
        
        // Don't sync time for ended videos (unless reset or loop restart)
        if (!window.isVideoReset && !window.isLoopRestarting) {
            if (window.videoStates?.[trackIndex]?.hasEnded || 
                (audio?.tagName === 'VIDEO' && (audio.ended || audio.currentTime >= audio.duration - 0.1))) {
                return;
            }
        }
        
        const now = Date.now();
        const currentAudioTime = audio.currentTime;
        const timeDiff = Math.abs(currentAudioTime - lastAudioTime);
        const timeSinceLastSync = now - lastSyncTime;
        
        // Don't sync during loop operations (when time jumps back to 0)
        if (currentAudioTime < 1.0 && lastAudioTime > 10.0) {
            lastAudioTime = currentAudioTime;
            return;
        }
        
        // Only sync on major jumps or significant drift
        if (timeDiff > 1.0 || (timeSinceLastSync > 5000 && timeDiff > 0.3)) {
            lastSyncTime = now;
            postToVideoWindow(trackIndex, {
                type: 'SEEK',
                data: { time: currentAudioTime }
            });
        }
        
        lastAudioTime = currentAudioTime;
    };

    // Handle seeking events
    const syncSeek = () => {
        if (shouldSkipVideoAction(trackIndex)) return;
        
        postToVideoWindow(trackIndex, {
            type: 'SEEK',
            data: { time: audio.currentTime }
        });
        
        lastAudioTime = audio.currentTime;
        lastSyncTime = Date.now();
    };

    // Sync playback rate
    const syncPlaybackRate = () => {
        if (shouldSkipVideoAction(trackIndex)) return;
        
        postToVideoWindow(trackIndex, {
            type: 'SET_PLAYBACK_RATE',
            data: { rate: audio.playbackRate }
        });
    };

    // Remove existing listeners if any
    if (audio._videoSyncListeners) {
        audio._videoSyncListeners.forEach(({ event, listener }) => {
            audio.removeEventListener(event, listener);
        });
    }

    // Add event listeners for synchronization
    const listeners = [
        { event: 'play', listener: syncPlayPause },
        { event: 'pause', listener: syncPlayPause },
        { event: 'timeupdate', listener: syncTime },
        { event: 'ratechange', listener: syncPlaybackRate },
        { event: 'seeked', listener: syncSeek }
    ];

    listeners.forEach(({ event, listener }) => {
        audio.addEventListener(event, listener);
    });

    // Store listeners for cleanup
    audio._videoSyncListeners = listeners;

    // Initial sync
    setTimeout(() => {
        if (!shouldSkipVideoAction(trackIndex)) {
            syncPlayPause();
            if (audio.currentTime > 1.0) {
                syncSeek();
            }
            syncPlaybackRate();
            
            // Sync initial loop status
            const loopCheckbox = document.getElementById('loop-checkbox');
            if (loopCheckbox) {
                postToVideoWindow(trackIndex, {
                    type: 'SET_LOOP',
                    data: { loop: loopCheckbox.checked }
                });
            }
        }
    }, 500);
}

// Function to update video loop status when loop checkbox changes
function updateVideoLoopStatus(isLooping) {
    Object.keys(videoWindows).forEach(trackIndex => {
        postToVideoWindow(trackIndex, {
            type: 'SET_LOOP',
            data: { loop: isLooping }
        });
    });
}

function setupVideoTrackHandling() {
    const videoTracks = document.querySelectorAll('.video-track');
    
    videoTracks.forEach((videoTrack) => {
        const videoWindowBtn = videoTrack.querySelector('.video-window-btn');
        const trackDataIndex = parseInt(videoTrack.getAttribute('data-index'));
        
        if (!videoWindowBtn) return;
        
        videoWindowBtn.addEventListener('click', () => {
            if (!isWindowValid(trackDataIndex)) {
                createVideoWindow(trackDataIndex);
                
                // Try to load video if we have pending data for this track
                if (window[`_pendingVideoFile_${trackDataIndex}`]) {
                    setTimeout(() => {
                        loadVideoIntoWindow(
                            window[`_pendingVideoFile_${trackDataIndex}`], 
                            window[`_pendingVideoAudio_${trackDataIndex}`],
                            trackDataIndex
                        );
                    }, 1500);
                }
            } else {
                videoWindows[trackDataIndex].focus();
                
                // Try to reload video if window exists but no video is loaded
                if (window[`_pendingVideoFile_${trackDataIndex}`]) {
                    loadVideoIntoWindow(
                        window[`_pendingVideoFile_${trackDataIndex}`], 
                        window[`_pendingVideoAudio_${trackDataIndex}`],
                        trackDataIndex
                    );
                }
            }
        });
    });
}

// Make videoWindows globally accessible
window.videoWindows = videoWindows;
