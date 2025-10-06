function setupPlaybackControls(audioElements, audioContextContainer) {
  const playPauseButton = document.getElementById("play-pause-button");
  const resetButton = document.getElementById("reset-button");
  const loopCheckbox = document.getElementById("loop-checkbox");
  
  let isPlaying = false;
  let longestAudio = null;
  let isLoopRestarting = false;
  let audioWaitingStates = {};

  // Helper functions
  const resetStates = () => {
    audioWaitingStates = {};
    if (window.videoStates) window.videoStates = {};
  };

  const sendVideoMessage = (type) => {
    const message = { type };
    Object.values(window.videoWindows || {}).forEach((videoWindow) => {
      if (videoWindow && !videoWindow.closed) {
        videoWindow.postMessage(message, window.location.origin);
      }
    });
  };

  const isVideoAtEnd = (audio) => 
    audio.tagName === "VIDEO" && 
    (audio.ended || (audio.currentTime >= audio.duration - 0.1 && audio.duration > 0));

  const triggerUDP = (action) => {
    if (window.udpTrigger) {
      window.udpTrigger.sendTrigger(action);
    }
  };

  const setupLoopHandlers = () => {
    // Find longest audio
    let maxDuration = 0;
    let currentLongestAudio = null;

    audioElements.forEach((audio) => {
      if (audio && audio.duration > maxDuration) {
        maxDuration = audio.duration;
        currentLongestAudio = audio;
      }
    });

    // Setup main loop handler
    if (currentLongestAudio && currentLongestAudio !== longestAudio) {
      // Clean up previous
      if (longestAudio?._loopHandler) {
        longestAudio.removeEventListener("ended", longestAudio._loopHandler);
      }

      longestAudio = currentLongestAudio;
      longestAudio._loopHandler = () => {
        if (loopCheckbox.checked && isPlaying && !isLoopRestarting) {
          restartAll();
        }
      };
      longestAudio.addEventListener("ended", longestAudio._loopHandler);
    }

    // Setup waiting handlers for shorter audios
    audioElements.forEach((audio, index) => {
      if (audio && audio !== longestAudio) {
        if (audio._waitingHandler) {
          audio.removeEventListener("ended", audio._waitingHandler);
        }

        audio._waitingHandler = () => {
          if (loopCheckbox.checked && isPlaying && !isLoopRestarting) {
            audio.pause();
            audioWaitingStates[index] = true;
          }
        };
        audio.addEventListener("ended", audio._waitingHandler);
      }
    });
  };

  const restartAll = () => {
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

    resetStates();
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
  };

  // Event listeners
  document.addEventListener("fileLoaded", setupLoopHandlers);

  playPauseButton.addEventListener("click", () => {
    const hasContext = audioContextContainer.contexts?.some(ctx => ctx !== null);
    
    if (!hasContext) {
      alert("Please add at least one audio file.");
      return;
    }

    // Resume suspended contexts
    audioContextContainer.contexts?.forEach((context, index) => {
      if (context?.state === "suspended") {
        context.resume().catch(error => console.error(`Failed to resume context ${index}:`, error));
      }
    });

    isPlaying = !isPlaying;
    playPauseButton.textContent = isPlaying ? "Pause" : "Play";
    playPauseButton.classList.toggle("playing", isPlaying);

    if (isPlaying) {
      audioElements.forEach((audio, index) => {
        if (audio) {
          const isWaiting = audioWaitingStates[index];
          const atEnd = isVideoAtEnd(audio);
          
          if (!isWaiting && !atEnd) {
            audio.play().catch(error => console.error(`Failed to play audio ${index}:`, error));
          }
        }
      });

      if (window.isVideoReset) {
        setTimeout(() => { window.isVideoReset = false; }, 1000);
      }
    } else {
      audioElements.forEach(audio => audio?.pause());
    }
  });

  resetButton.addEventListener("click", () => {
    isPlaying = false;
    isLoopRestarting = false;
    window.isLoopRestarting = false;
    
    playPauseButton.textContent = "Play";
    playPauseButton.classList.remove("playing");

    resetStates();
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
    if (typeof updateVideoLoopStatus === "function") {
      updateVideoLoopStatus(loopCheckbox.checked);
    }
    setupLoopHandlers();
  });
}
