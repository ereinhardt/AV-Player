function setupPlaybackControls(audioElements, audioContextContainer) {
    const playPauseButton = document.getElementById('play-pause-button');
    const resetButton = document.getElementById('reset-button');
    const loopCheckbox = document.getElementById('loop-checkbox');
    let isPlaying = false;
    let longestAudio = null;
    let longestAudioEventListener = null;
    let isLoopRestarting = false; // Flag to indicate automatic loop restart
    
    // Track video states to prevent restarting ended videos
    let videoStates = {}; // trackIndex -> { hasEnded: boolean, wasPausedManually: boolean }
    
    // Track audio elements that have finished and are waiting for next loop
    let audioWaitingStates = {}; // trackIndex -> { isWaitingForLoop: boolean }
    
    // Helper functions
    function updateVideoState(videoWindow, state) {
        Object.keys(window.videoWindows || {}).forEach(trackIndex => {
            if (window.videoWindows[trackIndex] === videoWindow) {
                videoStates[trackIndex] = state;
            }
        });
    }
    
    function findTrackIndex(videoWindow) {
        return Object.keys(window.videoWindows || {}).find(trackIndex => 
            window.videoWindows[trackIndex] === videoWindow
        );
    }
    
    function resetAllStates() {
        console.log('Resetting all states (video and audio waiting states)');
        videoStates = {};
        audioWaitingStates = {};
        if (window.videoStates) window.videoStates = {};
    }
    
    function sendVideoMessage(type) {
        const message = { type };
        Object.values(window.videoWindows || {}).forEach(videoWindow => {
            if (videoWindow && !videoWindow.closed) {
                videoWindow.postMessage(message, window.location.origin);
            }
        });
        if (window.videoWindow && !window.videoWindow.closed) {
            window.videoWindow.postMessage(message, window.location.origin);
        }
    }
    
    function isVideoAtEnd(audio) {
        return audio.tagName === 'VIDEO' && (audio.ended || 
               (audio.currentTime >= audio.duration - 0.1 && audio.duration > 0));
    }
    
    function triggerUDP(action) {
        if (window.udpTrigger) {
            window.udpTrigger[action === 'start' ? 'triggerStart' : 'triggerStop']();
        }
    }
    
    // Listen for video status updates
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        
        const { type, data } = event.data;
        
        if (type === 'VIDEO_ENDED' && data) {
            updateVideoState(event.source, { hasEnded: true, wasPausedManually: false });
        } else if (type === 'VIDEO_STATUS_RESPONSE' && data) {
            const trackIndex = findTrackIndex(event.source);
            updateVideoState(event.source, { 
                hasEnded: data.hasEnded || data.ended, 
                wasPausedManually: videoStates[trackIndex]?.wasPausedManually || false 
            });
        }
    });

    function findLongestAudioAndSetupLoop() {
        const checkAudioDurations = () => {
            let maxDuration = 0;
            let currentLongestAudio = null;
            let allMetadataLoaded = true;

            audioElements.forEach((audio, index) => {
                if (audio) {
                    if (isNaN(audio.duration) || audio.duration === 0) {
                        allMetadataLoaded = false;
                        return;
                    }
                    
                    if (audio.duration > maxDuration) {
                        maxDuration = audio.duration;
                        currentLongestAudio = audio;
                    }
                }
            });

            if (!allMetadataLoaded) {
                setTimeout(checkAudioDurations, 100);
                return;
            }

            if (currentLongestAudio !== longestAudio) {
                console.log('Loop setup: New longest audio found, duration:', maxDuration);
                
                // Clean up previous event listener
                if (longestAudio && longestAudioEventListener) {
                    longestAudio.removeEventListener('ended', longestAudioEventListener);
                }

                longestAudio = currentLongestAudio;

                if (longestAudio) {
                    longestAudio.removeEventListener('ended', longestAudioEventListener);
                }

                longestAudio = currentLongestAudio;

                if (longestAudio) {
                    longestAudioEventListener = () => {
                        if (loopCheckbox.checked && isPlaying) {
                            // Update play button to show restart
                            if (playPauseButton) {
                                playPauseButton.textContent = 'Pause (Looping...)';
                                setTimeout(() => {
                                    playPauseButton.textContent = 'Pause';
                                }, 1000);
                            }
                            
                            triggerUDP('start');
                            if (window.pauseVideoSync) window.pauseVideoSync();
                            
                            isLoopRestarting = true;
                            window.isLoopRestarting = true;
                            
                            // Clear all waiting states - all tracks will restart
                            console.log('Loop restart: clearing all audioWaitingStates');
                            audioWaitingStates = {};
                            
                            restartAllElements();
                        }
                    };
                    longestAudio.addEventListener('ended', longestAudioEventListener);
                    
                    function restartAllElements() {
                        setTimeout(() => {
                            // Reset all elements
                            audioElements.forEach((audio, index) => {
                                if (audio) {
                                    audio.pause();
                                    audio.currentTime = 0;
                                    if (isVideoAtEnd(audio)) {
                                        const currentSrc = audio.src;
                                        audio.src = '';
                                        audio.load();
                                        audio.src = currentSrc;
                                        audio.load();
                                        audio.currentTime = 0;
                                    }
                                }
                            });
                            
                            setTimeout(() => {
                                resetAllStates();
                                sendVideoMessage('RESTART_VIDEO');
                                
                                setTimeout(() => {
                                    audioElements.forEach((audio, index) => {
                                        if (audio) {
                                            audio.play().catch(error => {
                                                console.warn(`Failed to restart audio ${index}:`, error);
                                            });
                                        }
                                    });
                                    
                                    setTimeout(() => {
                                        isLoopRestarting = false;
                                        window.isLoopRestarting = false;
                                    }, 200);
                                }, 150);
                            }, 100);
                        }, 50);
                        
                        setTimeout(() => {
                            if (window.resumeVideoSync) window.resumeVideoSync();
                        }, 1500);
                    }
                    
                                        // Setup individual track handlers
                    audioElements.forEach((audio, index) => {
                        if (audio && audio !== longestAudio) {
                            // Clean up existing handler
                            if (audio._customEndedHandler) {
                                audio.removeEventListener('ended', audio._customEndedHandler);
                            }
                            
                            // Create new ended handler
                            audio._customEndedHandler = () => {
                                if (loopCheckbox.checked && isPlaying && !isLoopRestarting) {
                                    console.log(`Audio ${index} ended. Marking as waiting for loop. Duration: ${audio.duration}`);
                                    audio.pause();
                                    audioWaitingStates[index] = { isWaitingForLoop: true };
                                    
                                    // Keep audio at end position - don't reset currentTime
                                    // This ensures it stays "ended" until the next loop restart
                                }
                            };
                            
                            audio.addEventListener('ended', audio._customEndedHandler);
                        }
                    });
                }
            }
        };

        // Start checking for audio durations
        checkAudioDurations();
    }

    document.addEventListener('fileLoaded', findLongestAudioAndSetupLoop);

    playPauseButton.addEventListener('click', () => {
        const hasAnyContext = audioContextContainer.contexts && 
                             audioContextContainer.contexts.some(context => context !== null);
        
        if (!hasAnyContext) {
            alert("Please add at least one audio file.");
            return;
        }

        // Resume any suspended AudioContexts
        if (audioContextContainer.contexts) {
            audioContextContainer.contexts.forEach((context, index) => {
                if (context && context.state === 'suspended') {
                    context.resume().catch(error => {
                        console.error(`Failed to resume context ${index}:`, error);
                    });
                }
            });
        }

        isPlaying = !isPlaying;
        if (isPlaying) {
            console.log('Starting playback');
            console.log('Current audioWaitingStates:', audioWaitingStates);
            playPauseButton.textContent = 'Pause';
            playPauseButton.classList.add('playing');
            
            audioElements.forEach((audio, index) => {
                if (audio) {
                    const isAtEnd = audio.ended || (audio.currentTime >= audio.duration - 0.1 && audio.duration > 0);
                    const isWaitingForLoop = audioWaitingStates[index]?.isWaitingForLoop;
                    
                    console.log(`Audio ${index} state - Paused: ${audio.paused}, CurrentTime: ${audio.currentTime}, Duration: ${audio.duration}, IsAtEnd: ${isAtEnd}, IsWaiting: ${isWaitingForLoop ? 'YES' : 'NO'}`);
                    
                    // If audio is at end and looping is enabled, mark it as waiting
                    if (isAtEnd && loopCheckbox.checked && !isLoopRestarting && !window.isVideoReset) {
                        audioWaitingStates[index] = { isWaitingForLoop: true };
                        console.log(`Marking audio ${index} as waiting for loop (was at end)`);
                    }
                    
                    // Check if should not play (ended video or waiting audio)
                    const isEndedVideo = !isLoopRestarting && !window.isVideoReset && isVideoAtEnd(audio);
                    const isWaitingAudio = !isLoopRestarting && !window.isVideoReset && audioWaitingStates[index]?.isWaitingForLoop;
                    
                    if (isEndedVideo || isWaitingAudio) {
                        if (isWaitingAudio) {
                            console.log(`Not playing audio element ${index} - it is waiting for loop restart.`);
                            audio.pause(); // Ensure it stays paused
                            // Keep the audio at its end position, don't reset currentTime
                        } else {
                            console.log(`Not playing video element ${index} - it has ended.`);
                        }
                        return;
                    }
                    
                    // Only play if not waiting for loop
                    console.log(`Playing audio ${index}, src:`, audio.src);
                    audio.play().catch(error => {
                        console.error(`Failed to play audio ${index}:`, error);
                    });
                }
            });
            
            // Clear reset flag after first play attempt
            if (window.isVideoReset) {
                setTimeout(() => {
                    window.isVideoReset = false;
                    console.log('Reset flag cleared');
                }, 1000);
            }
        } else {
            console.log('Pausing playback');
            console.log('Preserving audioWaitingStates:', audioWaitingStates);
            playPauseButton.textContent = 'Play';
            playPauseButton.classList.remove('playing');
            
            // Mark all videos as manually paused (not ended)
            Object.keys(videoStates).forEach(trackIndex => {
                if (!videoStates[trackIndex].hasEnded) {
                    videoStates[trackIndex].wasPausedManually = true;
                }
            });
            
            audioElements.forEach((audio, index) => {
                if (audio) {
                    console.log(`Pausing audio ${index}. Is video: ${audio.tagName === 'VIDEO'}, Ended: ${audio.ended}, Current time: ${audio.currentTime}, Duration: ${audio.duration}, IsWaiting: ${audioWaitingStates[index]?.isWaitingForLoop ? 'YES' : 'NO'}`);
                    audio.pause();
                    
                    // Preserve waiting state - don't reset currentTime for waiting tracks
                    if (audioWaitingStates[index]?.isWaitingForLoop) {
                        console.log(`Preserving waiting state for audio ${index}`);
                        // Keep audio at end position, don't modify currentTime
                    }
                }
            });
        }
    });

    resetButton.addEventListener('click', () => {
        isPlaying = false;
        isLoopRestarting = false;
        window.isLoopRestarting = false;
        playPauseButton.textContent = 'Play';
        playPauseButton.classList.remove('playing');

        resetAllStates();
        window.isVideoReset = true;
        
        sendVideoMessage('RESET_VIDEO');
        
        audioElements.forEach((audio) => {
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        });
    });

    loopCheckbox.addEventListener('change', () => {
        const isLooping = loopCheckbox.checked;
        audioElements.forEach(audio => {
            if (audio) {
                // Disable native loop if our custom sync loop is active
                audio.loop = isLooping ? false : audio.loop;
            }
        });
        
        // Update video loop status
        if (typeof updateVideoLoopStatus === 'function') {
            updateVideoLoopStatus(isLooping);
        }
        
        findLongestAudioAndSetupLoop(); // Re-evaluate loop setup
    });
}
