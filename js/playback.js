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

        // Wait for all audio elements to have their metadata loaded
        const checkAudioDurations = () => {
            let allMetadataLoaded = true;
            maxDuration = 0;
            currentLongestAudio = null;

            audioElements.forEach((audio, index) => {
                if (audio) {
                    // Check if audio metadata is loaded (duration is valid)
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

            // If not all metadata is loaded, wait and try again
            if (!allMetadataLoaded) {
                setTimeout(checkAudioDurations, 100);
                return;
            }

            // Only proceed if we found a valid longest audio and it's different from current
            if (currentLongestAudio !== longestAudio) {
                console.log('Loop setup: New longest audio found, duration:', maxDuration);
                
                // Clean up previous event listener
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
                    
                    // Clean up and add individual track ended listeners
                    audioElements.forEach((audio, index) => {
                        if (audio && audio !== longestAudio) {
                            // Store the existing ended handler to remove it
                            if (audio._customEndedHandler) {
                                audio.removeEventListener('ended', audio._customEndedHandler);
                            }
                            
                            // Create new ended handler
                            audio._customEndedHandler = () => {
                                if (loopCheckbox.checked && isPlaying) {
                                    // Don't restart yet, just pause and wait for longest track
                                    audio.pause();
                                    audio.currentTime = 0;
                                }
                            };
                            
                            // Add the new listener
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
        console.log('Play button clicked');
        
        // Check if any AudioContext exists
        const hasAnyContext = audioContextContainer.contexts && 
                             audioContextContainer.contexts.some(context => context !== null);
        
        console.log('Has any context:', hasAnyContext);
        console.log('AudioContexts:', audioContextContainer.contexts);
        console.log('Audio elements:', audioElements);
        
        if (!hasAnyContext) {
            alert("Please add at least one audio file.");
            return;
        }

        // Resume any suspended AudioContexts
        if (audioContextContainer.contexts) {
            audioContextContainer.contexts.forEach((context, index) => {
                if (context) {
                    console.log(`Context ${index} state:`, context.state);
                    if (context.state === 'suspended') {
                        console.log(`Resuming context ${index}`);
                        context.resume().then(() => {
                            console.log(`Context ${index} resumed successfully`);
                        }).catch(error => {
                            console.error(`Failed to resume context ${index}:`, error);
                        });
                    }
                }
            });
        }

        isPlaying = !isPlaying;
        if (isPlaying) {
            console.log('Starting playback');
            playPauseButton.textContent = 'Pause';
            playPauseButton.classList.add('playing');
            
            // Send UDP trigger on start
            if (window.udpTrigger) {
                window.udpTrigger.triggerStart();
            }
            
            audioElements.forEach((audio, index) => {
                if (audio) {
                    console.log(`Playing audio ${index}, src:`, audio.src);
                    audio.play().catch(error => {
                        console.error(`Failed to play audio ${index}:`, error);
                    });
                }
            });
        } else {
            console.log('Pausing playback');
            playPauseButton.textContent = 'Play';
            playPauseButton.classList.remove('playing');
            
            // Send UDP trigger on stop
            if (window.udpTrigger) {
                window.udpTrigger.triggerStop();
            }
            
            audioElements.forEach((audio, index) => {
                if (audio) {
                    console.log(`Pausing audio ${index}`);
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
