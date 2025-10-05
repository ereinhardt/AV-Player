function setupMasterTimeline(audioElements) {
    const masterTimelineProgress = document.getElementById('master-timeline-progress');
    const masterTimeDisplay = document.getElementById('master-time-display');

    let longestDuration = 0;
    let longestAudio = null;

    function updateMasterTimeline() {
        longestDuration = 0;
        longestAudio = null;

        audioElements.forEach(audio => {
            if (audio && audio.duration > longestDuration) {
                longestDuration = audio.duration;
                longestAudio = audio;
            }
        });

        if (longestAudio) {
            masterTimeDisplay.textContent = `${formatTime(longestAudio.currentTime)} / ${formatTime(longestDuration)}`;
            const progress = (longestAudio.currentTime / longestDuration) * 100;
            masterTimelineProgress.value = progress;
            
            // Send Art-Net timecode if available
            if (window.artNetTimecode && typeof window.artNetTimecode.sendTimecode === 'function') {
                const timecode = window.artNetTimecode.sendTimecode(longestAudio.currentTime, longestDuration);
                // Debug output (will be visible in browser console)
                if (timecode && longestAudio.currentTime > 0) {
                    console.debug(`Art-Net Timecode sent: ${timecode.formatted} to ${window.artNetTimecode.ip}:${window.artNetTimecode.port}`);
                }
            }
        } else {
            masterTimeDisplay.textContent = '00:00:00 / 00:00:00';
            masterTimelineProgress.value = 0;
        }
    }

    // Update the master timeline every 250ms
    setInterval(updateMasterTimeline, 250);

    // Also update when files are loaded
    document.addEventListener('fileLoaded', updateMasterTimeline);
}