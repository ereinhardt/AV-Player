/* File Handling — Upload to server for Naudiodon playback */

const cleanupAudioElement = (el) => {
  if (el?._blobUrl) {
    URL.revokeObjectURL(el._blobUrl);
    el._blobUrl = null;
  }
};
const cleanupAllAudioElements = (els) =>
  els.forEach((el) => el && cleanupAudioElement(el));

const validateFileType = (file, isVideo, i) => {
  const ok = file.type.startsWith(isVideo ? "video/" : "audio/");
  if (!ok)
    alert(
      `Track ${i}: expected ${isVideo ? "video" : "audio"} file, got ${file.type}`,
    );
  return ok;
};

const uploadFileToServer = async (file, trackIndex) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/upload/${window.sessionId || "0"}/${trackIndex}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok)
    throw new Error(
      (await res.json().catch(() => ({}))).error || `HTTP ${res.status}`,
    );
  return res.json();
};

function setupFileHandling(tracks, audioEls) {
  tracks.forEach((track) => {
    const prog = track.querySelector(".timeline-progress"),
      disp = track.querySelector(".time-display");
    const i = parseInt(track.dataset.index),
      isVideo = track.classList.contains("video-track");

    track.querySelector(".file-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file || !validateFileType(file, isVideo, i)) return;

      sendAudioCommand("audio-remove-track", { trackIndex: i });
      if (audioEls[i]) {
        cleanupAudioElement(audioEls[i]);
        audioEls[i] = null;
      }
      prog.value = 0;
      disp.textContent = "00:00:00 | 00:00:00";
      track.querySelector(".file-name").textContent =
        `${file.name} (uploading...)`;

      try {
        const r = await uploadFileToServer(file, i);
        track.querySelector(".file-name").textContent = file.name;
        window.trackMetadata[i] = {
          fileName: file.name,
          duration: r.duration,
          channels: r.channels,
          totalFrames: r.totalFrames,
        };

        if (r.duration && isFinite(r.duration))
          disp.textContent = `${formatTime(0)} | ${formatTime(r.duration)}`;
        prog.value = 0;

        const devSel = track.querySelector(".audio-device-select");
        if (devSel?.value)
          sendAudioCommand("audio-set-device", {
            trackIndex: i,
            deviceId: parseInt(devSel.value),
          });

        if (isVideo && track.querySelector(".video-window-btn")) {
          const url = URL.createObjectURL(file);
          const videoEl = Object.assign(document.createElement("video"), {
            src: url,
            _blobUrl: url,
          });
          audioEls[i] = videoEl;
          window[`_pendingVideoFile_${i}`] = file;
          videoEl.addEventListener("loadedmetadata", () => {
            if (typeof loadVideoIntoWindow === "function")
              loadVideoIntoWindow(file, i);
          });
        }
      } catch (err) {
        track.querySelector(".file-name").textContent = `Error: ${err.message}`;
        console.error("Upload failed:", err);
      }
    });
  });
}

function removeFileFromTrack(i, audioEls) {
  const track = document.querySelector(
    `.audio-track[data-index="${i}"], .video-track[data-index="${i}"]`,
  );
  if (!track) return;

  sendAudioCommand("audio-remove-track", { trackIndex: i });
  if (audioEls[i]) {
    cleanupAudioElement(audioEls[i]);
    audioEls[i] = null;
  }
  delete window.trackMetadata?.[i];

  if (
    track.classList.contains("video-track") &&
    window.videoWindows?.[i] &&
    !window.videoWindows[i].closed
  ) {
    window.videoWindows[i].close();
    delete window.videoWindows[i];
  }

  const inp = track.querySelector(".file-input"),
    name = track.querySelector(".file-name");
  const prog = track.querySelector(".timeline-progress"),
    disp = track.querySelector(".time-display");
  if (inp) inp.value = "";
  if (name) name.textContent = "No file selected";
  if (prog) prog.value = 0;
  if (disp) disp.textContent = "00:00:00 | 00:00:00";
  delete window[`_pendingVideoFile_${i}`];
}

const setupRemoveButtons = (audioEls) => {
  document.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.trackIndex);
      if (!isNaN(i)) removeFileFromTrack(i, audioEls);
    });
  });
};

window.addEventListener("beforeunload", () => {
  if (window.audioElements) cleanupAllAudioElements(window.audioElements);
});

Object.assign(window, { setupRemoveButtons });
