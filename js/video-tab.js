// --- Video Tab Management ---
let videoWindows = {}; // Object to store multiple video windows by track index
let currentVideoAudios = {}; // Object to store current video audio elements by track index

function createVideoWindow(trackIndex) {
    if (videoWindows[trackIndex] && !videoWindows[trackIndex].closed) {
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
        
        // Store the message handler for cleanup
        videoWindows[trackIndex]._messageHandler = messageHandler;
        
    } catch (error) {
        return null;
    }
    
    return videoWindows[trackIndex];
}

function loadVideoIntoWindow(videoFile, videoAudio, trackIndex) {
    if (!videoWindows[trackIndex] || videoWindows[trackIndex].closed) {
        createVideoWindow(trackIndex);
    }

    currentVideoAudios[trackIndex] = videoAudio;
    const videoWindow = videoWindows[trackIndex];

    // Wait for the video window to load completely
    const sendVideoData = () => {
        if (videoWindow && !videoWindow.closed) {
            try {
                const videoURL = URL.createObjectURL(videoFile);
                
                videoWindow.postMessage({
                    type: 'LOAD_VIDEO',
                    data: {
                        url: videoURL,
                        filename: videoFile.name
                    }
                }, window.location.origin);
                
                // Send current loop status
                const loopCheckbox = document.getElementById('loop-checkbox');
                if (loopCheckbox) {
                    videoWindow.postMessage({
                        type: 'SET_LOOP',
                        data: { loop: loopCheckbox.checked }
                    }, window.location.origin);
                }
                
                // Set up synchronization
                if (videoAudio) {
                    syncVideoWithAudio(videoAudio, trackIndex);
                }
            } catch (error) {
                // Retry after a short delay
                setTimeout(() => {
                    if (videoWindow && !videoWindow.closed) {
                        sendVideoData();
                    }
                }, 1000);
            }
        } else {
            // Video window unavailable
        }
    };

    // Use multiple strategies to ensure the window is ready
    let attempts = 0;
    const maxAttempts = 20;
    
    const waitForWindow = () => {
        attempts++;
        
        if (attempts > maxAttempts) {
            return;
        }
        
        if (videoWindow && !videoWindow.closed) {
            try {
                // Test if we can access the window's document
                if (videoWindow.document && videoWindow.document.getElementById('video-player')) {
                    sendVideoData();
                    return;
                } else {
                    // Video window document not ready yet
                }
            } catch (e) {
                // Window not ready yet, continue waiting
            }
        } else {
            // Video window is null or closed
        }
        
        // Try again after a short delay
        setTimeout(waitForWindow, 250);
    };
    
    // Start checking
    setTimeout(waitForWindow, 100);
}

function syncVideoWithAudio(audio, trackIndex) {
    const videoWindow = videoWindows[trackIndex];
    if (!videoWindow || videoWindow.closed) return;
    
    // Sync play/pause
    const syncPlayPause = () => {
        const videoWindow = videoWindows[trackIndex];
        if (!videoWindow || videoWindow.closed || window._isVideoSyncing) return;
        
        if (audio.paused) {
            videoWindow.postMessage({ type: 'PAUSE' }, window.location.origin);
        } else {
            videoWindow.postMessage({ type: 'PLAY' }, window.location.origin);
        }
    };

    // Sync time position - only on significant jumps, not during normal playback
    let lastSyncTime = 0;
    let lastAudioTime = 0;
    let syncPaused = false;
    
    // Functions to pause/resume video sync during loop restarts
    window.pauseVideoSync = () => {
        syncPaused = true;
    };

    window.resumeVideoSync = () => {
        syncPaused = false;
    };
    
    const syncTime = () => {
        const videoWindow = videoWindows[trackIndex];
        if (!videoWindow || videoWindow.closed || window._isVideoSyncing || syncPaused) return;
        
        const now = Date.now();
        const currentAudioTime = audio.currentTime;
        
        // Only sync if there's a significant time jump (more than 1 second)
        // or if enough time has passed since last sync (5 seconds) and drift is significant
        const timeDiff = Math.abs(currentAudioTime - lastAudioTime);
        const timeSinceLastSync = now - lastSyncTime;
        
        // Don't sync during loop operations (when time jumps back to 0)
        if (currentAudioTime < 1.0 && lastAudioTime > 10.0) {
            lastAudioTime = currentAudioTime;
            return;
        }
        
        // Be more tolerant during playback - only sync on major jumps or significant drift
        if (timeDiff > 1.0 || (timeSinceLastSync > 5000 && timeDiff > 0.3)) {
            lastSyncTime = now;
            lastAudioTime = currentAudioTime;
            
            videoWindow.postMessage({
                type: 'SEEK',
                data: { time: currentAudioTime }
            }, window.location.origin);
        } else {
            lastAudioTime = currentAudioTime;
        }
    };

    // Handle seeking events (user jumps in timeline)
    const syncSeek = () => {
        const videoWindow = videoWindows[trackIndex];
        if (!videoWindow || videoWindow.closed || window._isVideoSyncing) return;
        
        videoWindow.postMessage({
            type: 'SEEK',
            data: { time: audio.currentTime }
        }, window.location.origin);
        
        lastAudioTime = audio.currentTime;
        lastSyncTime = Date.now();
    };

    // Sync playback rate
    const syncPlaybackRate = () => {
        const videoWindow = videoWindows[trackIndex];
        if (!videoWindow || videoWindow.closed || window._isVideoSyncing) return;
        
        videoWindow.postMessage({
            type: 'SET_PLAYBACK_RATE',
            data: { rate: audio.playbackRate }
        }, window.location.origin);
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
        { event: 'timeupdate', listener: syncTime }, // For periodic sync checks
        { event: 'ratechange', listener: syncPlaybackRate },
        { event: 'seeked', listener: syncSeek } // For manual seeks
    ];

    listeners.forEach(({ event, listener }) => {
        audio.addEventListener(event, listener);
    });

    // Store listeners for cleanup
    audio._videoSyncListeners = listeners;

    // Initial sync - be gentle
    setTimeout(() => {
        const videoWindow = videoWindows[trackIndex];
        if (!window._isVideoSyncing) {
            syncPlayPause();
            // Only do initial seek if there's a significant time difference
            if (audio.currentTime > 1.0) {
                syncSeek(); // Use syncSeek for initial positioning only if needed
            }
            syncPlaybackRate();
            
            // Sync initial loop status
            const loopCheckbox = document.getElementById('loop-checkbox');
            if (loopCheckbox && videoWindow && !videoWindow.closed) {
                videoWindow.postMessage({
                    type: 'SET_LOOP',
                    data: { loop: loopCheckbox.checked }
                }, window.location.origin);
            }
        }
    }, 500); // Give more time for everything to settle
}

// Function to update video loop status when loop checkbox changes
function updateVideoLoopStatus(isLooping) {
    Object.keys(videoWindows).forEach(trackIndex => {
        const videoWindow = videoWindows[trackIndex];
        if (videoWindow && !videoWindow.closed) {
            videoWindow.postMessage({
                type: 'SET_LOOP',
                data: { loop: isLooping }
            }, window.location.origin);
        }
    });
}

function setupVideoTrackHandling() {
    const videoTracks = document.querySelectorAll('.video-track');
    
    videoTracks.forEach((videoTrack, trackIndex) => {
        const videoWindowBtn = videoTrack.querySelector('.video-window-btn');
        const trackDataIndex = parseInt(videoTrack.getAttribute('data-index'));
        
        if (!videoWindowBtn) return;
        
        videoWindowBtn.addEventListener('click', () => {
            if (!videoWindows[trackDataIndex] || videoWindows[trackDataIndex].closed) {
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
