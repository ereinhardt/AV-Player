function setupPlaybackControls(audioElements, audioContextContainer) {
  const playPauseButton = document.getElementById("play-pause-button");
  const resetButton = document.getElementById("reset-button");
  const loopCheckbox = document.getElementById("loop-checkbox");
  let isPlaying = false;
  let longestAudio = null;
  let isLoopRestarting = false;
  let audioWaitingStates = {}; // Track which audios are waiting for loop

  function resetAllStates() {
    audioWaitingStates = {};
    if (window.videoStates) window.videoStates = {};
  }

  function sendVideoMessage(type) {
    const message = { type };
    Object.values(window.videoWindows || {}).forEach((videoWindow) => {
      if (videoWindow && !videoWindow.closed) {
        videoWindow.postMessage(message, window.location.origin);
      }
    });
    if (window.videoWindow && !window.videoWindow.closed) {
      window.videoWindow.postMessage(message, window.location.origin);
    }
  }

  function isVideoAtEnd(audio) {
    return (
      audio.tagName === "VIDEO" &&
      (audio.ended ||
        (audio.currentTime >= audio.duration - 0.1 && audio.duration > 0))
    );
  }

  function triggerUDP(action) {
    if (window.udpTrigger) {
      window.udpTrigger[action === "start" ? "triggerStart" : "triggerStop"]();
    }
  }

  // Listen for video status updates
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    // Video ended messages are handled by individual track sync
  });

  function findLongestAudioAndSetupLoop() {
    // Find longest audio
    let maxDuration = 0;
    let currentLongestAudio = null;

    audioElements.forEach((audio) => {
      if (audio && audio.duration > maxDuration) {
        maxDuration = audio.duration;
        currentLongestAudio = audio;
      }
    });

    // Setup loop handler only for longest audio
    if (currentLongestAudio && currentLongestAudio !== longestAudio) {
      // Clean up previous listener
      if (longestAudio && longestAudio._loopHandler) {
        longestAudio.removeEventListener("ended", longestAudio._loopHandler);
      }

      longestAudio = currentLongestAudio;
      longestAudio._loopHandler = () => {
        if (loopCheckbox.checked && isPlaying && !isLoopRestarting) {
          restartAllElements();
        }
      };
      longestAudio.addEventListener("ended", longestAudio._loopHandler);
    }

    // Setup individual audio handlers for waiting states
    audioElements.forEach((audio, index) => {
      if (audio && audio !== longestAudio) {
        // Clean up existing handler
        if (audio._waitingHandler) {
          audio.removeEventListener("ended", audio._waitingHandler);
        }

        // Create new waiting handler
        audio._waitingHandler = () => {
          if (loopCheckbox.checked && isPlaying && !isLoopRestarting) {
            audio.pause();
            audioWaitingStates[index] = true;
            console.log(`Audio ${index} finished, waiting for loop restart`);
          }
        };
        audio.addEventListener("ended", audio._waitingHandler);
      }
    });
  }

  function restartAllElements() {
    isLoopRestarting = true;
    window.isLoopRestarting = true;
    triggerUDP("start");
    if (window.pauseVideoSync) window.pauseVideoSync();

    // Reset all elements
    audioElements.forEach((audio) => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        if (isVideoAtEnd(audio)) {
          const src = audio.src;
          audio.src = "";
          audio.load();
          audio.src = src;
          audio.load();
        }
      }
    });

    resetAllStates();
    sendVideoMessage("RESTART_VIDEO");

    // Synchronized restart
    setTimeout(() => {
      const playPromises = audioElements
        .filter(audio => audio)
        .map(audio => audio.play().catch(e => console.warn('Play failed:', e)));
      
      Promise.allSettled(playPromises).then(() => {
        isLoopRestarting = false;
        window.isLoopRestarting = false;
        if (window.resumeVideoSync) window.resumeVideoSync();
      });
    }, 100);
  }

  document.addEventListener("fileLoaded", findLongestAudioAndSetupLoop);

  playPauseButton.addEventListener("click", () => {
    const hasAnyContext =
      audioContextContainer.contexts &&
      audioContextContainer.contexts.some((context) => context !== null);

    if (!hasAnyContext) {
      alert("Please add at least one audio file.");
      return;
    }

    // Resume any suspended AudioContexts
    if (audioContextContainer.contexts) {
      audioContextContainer.contexts.forEach((context, index) => {
        if (context && context.state === "suspended") {
          context.resume().catch((error) => {
            console.error(`Failed to resume context ${index}:`, error);
          });
        }
      });
    }

    isPlaying = !isPlaying;
    if (isPlaying) {
      playPauseButton.textContent = "Pause";
      playPauseButton.classList.add("playing");

      // Start audio elements, but respect waiting states
      audioElements.forEach((audio, index) => {
        if (audio) {
          // Don't play if audio is waiting for loop or at end
          const isWaitingForLoop = audioWaitingStates[index];
          const isAtEnd = isVideoAtEnd(audio);
          
          if (!isWaitingForLoop && !isAtEnd) {
            audio.play().catch((error) => {
              console.error(`Failed to play audio ${index}:`, error);
            });
          } else if (isWaitingForLoop) {
            console.log(`Audio ${index} staying paused - waiting for loop`);
          }
        }
      });

      // Clear reset flag after first play attempt
      if (window.isVideoReset) {
        setTimeout(() => {
          window.isVideoReset = false;
        }, 1000);
      }
    } else {
      playPauseButton.textContent = "Play";
      playPauseButton.classList.remove("playing");

      audioElements.forEach((audio) => {
        if (audio) {
          audio.pause();
        }
      });
    }
  });

  resetButton.addEventListener("click", () => {
    isPlaying = false;
    isLoopRestarting = false;
    window.isLoopRestarting = false;
    playPauseButton.textContent = "Play";
    playPauseButton.classList.remove("playing");

    resetAllStates();
    window.isVideoReset = true;

    sendVideoMessage("RESET_VIDEO");

    audioElements.forEach((audio) => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
  });

  loopCheckbox.addEventListener("change", () => {
    // Update video loop status
    if (typeof updateVideoLoopStatus === "function") {
      updateVideoLoopStatus(loopCheckbox.checked);
    }

    findLongestAudioAndSetupLoop(); // Re-evaluate loop setup
  });
}
