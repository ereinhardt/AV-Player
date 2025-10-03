function setupPlaybackControls(audioElements, audioContextContainer) {
    const playPauseButton = document.getElementById('play-pause-button');
    const resetButton = document.getElementById('reset-button');
    const loopCheckbox = document.getElementById('loop-checkbox');
    let isPlaying = false;
    let longestAudio = null;
    let longestAudioEventListener = null;

    function findLongestAudioAndSetupLoop() {
        let maxDuration = 0;
        let currentLongestAudio = null;

        audioElements.forEach((audio, index) => {
            if (audio && audio.duration > maxDuration) {
                maxDuration = audio.duration;
                currentLongestAudio = audio;
            }
        });

        if (currentLongestAudio !== longestAudio) {
            if (longestAudio && longestAudioEventListener) {
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
                        
                        // Send UDP trigger on loop restart
                        if (window.udpTrigger) {
                            window.udpTrigger.triggerStart();
                        }
                        
                        // Pause video sync during restart
                        if (window.pauseVideoSync) {
                            window.pauseVideoSync();
                        }
                        
                        // Wait for longest track to finish, then restart all together
                        audioElements.forEach((audio, index) => {
                            if (audio) {
                                audio.currentTime = 0;
                            }
                        });
                        
                        // Start all tracks together after reset
                        setTimeout(() => {
                            audioElements.forEach((audio, index) => {
                                if (audio) {
                                    audio.play().catch(error => {
                                        console.warn(`Failed to restart audio ${index}:`, error);
                                    });
                                }
                            });
                        }, 50); // Small delay to ensure all tracks are reset
                        
                        // Also restart video in popup if it exists
                        if (window.videoWindow && !window.videoWindow.closed) {
                            window.videoWindow.postMessage({
                                type: 'RESTART_VIDEO'
                            }, window.location.origin);
                        }
                        
                        // Resume video sync after restart
                        setTimeout(() => {
                            if (window.resumeVideoSync) {
                                window.resumeVideoSync();
                            }
                        }, 1000);
                    }
                };
                longestAudio.addEventListener('ended', longestAudioEventListener);
                
                // Add individual track ended listeners to prevent early restart
                audioElements.forEach((audio, index) => {
                    if (audio && audio !== longestAudio) {
                        // Remove any existing ended listeners
                        audio.onended = null;
                        
                        // Add listener that only pauses the track when it ends early
                        audio.addEventListener('ended', () => {
                            if (loopCheckbox.checked && isPlaying) {
                                // Don't restart yet, just pause and wait for longest track
                                audio.pause();
                                audio.currentTime = 0;
                            }
                        });
                    }
                });
            }
        }
    }

    document.addEventListener('fileLoaded', findLongestAudioAndSetupLoop);

    playPauseButton.addEventListener('click', () => {
        // Check if any AudioContext exists
        const hasAnyContext = audioContextContainer.contexts && 
                             audioContextContainer.contexts.some(context => context !== null);
        
        if (!hasAnyContext) {
            alert("Please add at least one audio file.");
            return;
        }

        // Resume any suspended AudioContexts
        if (audioContextContainer.contexts) {
            audioContextContainer.contexts.forEach((context, index) => {
                if (context) {
                    if (context.state === 'suspended') {
                        context.resume().then(() => {
                            // Context resumed successfully
                        }).catch(error => {
                            console.error(`Failed to resume context ${index}:`, error);
                        });
                    }
                }
            });
        }

        isPlaying = !isPlaying;
        if (isPlaying) {
            playPauseButton.textContent = 'Pause';
            playPauseButton.classList.add('playing');
            
            // Send UDP trigger on start
            if (window.udpTrigger) {
                window.udpTrigger.triggerStart();
            }
            
            audioElements.forEach((audio, index) => {
                if (audio) {
                    audio.play().catch(error => {
                        console.error(`Failed to play audio ${index}:`, error);
                    });
                }
            });
        } else {
            playPauseButton.textContent = 'Play';
            playPauseButton.classList.remove('playing');
            
            // Send UDP trigger on stop
            if (window.udpTrigger) {
                window.udpTrigger.triggerStop();
            }
            
            audioElements.forEach((audio, index) => {
                if (audio) {
                    audio.pause();
                }
            });
        }
    });

    resetButton.addEventListener('click', () => {
        isPlaying = false;
        playPauseButton.textContent = 'Play';
        playPauseButton.classList.remove('playing');

        // Send UDP trigger on reset/stop
        if (window.udpTrigger) {
            window.udpTrigger.triggerStop();
        }

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
