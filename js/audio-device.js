/* Audio Device Management — Naudiodon (Server-side) */

const AUDIO_CONFIG = { FALLBACK_CHANNELS: 2, DEFAULT_CHANNEL: 1 };

const sendAudioCommand = (type, data = {}) => {
  if (window.audioWs?.readyState === WebSocket.OPEN)
    window.audioWs.send(JSON.stringify({ type, ...data }));
};

const populateDeviceSelectors = (devices, defaultDeviceId) => {
  const selects = document.querySelectorAll(".audio-device-select");
  if (!devices?.length) {
    selects.forEach(
      (s) => (s.innerHTML = `<option value="-1">Default Audio Output</option>`),
    );
    return;
  }
  const selectedId = devices.some((d) => d.id === defaultDeviceId)
    ? defaultDeviceId
    : devices[0].id;
  const opts = devices
    .map(
      (d) =>
        `<option value="${d.id}" ${d.id === selectedId ? "selected" : ""}>${d.name} (${d.maxOutputChannels}ch)</option>`,
    )
    .join("");
  selects.forEach((s) => {
    s.innerHTML = opts;
    if (!s.dataset.deviceSet) s.value = String(selectedId);
  });
};

const getChannelSelectors = (track) => {
  const i = parseInt(track.dataset.index);
  const sels = track.classList.contains("video-track")
    ? [
        track.querySelector(`#channel-select-${i}-left`),
        track.querySelector(`#channel-select-${i}-right`),
      ]
    : [track.querySelector(".channel-select")];
  return sels.filter(Boolean);
};

const updateChannelOptions = (selects, max) => {
  const opts = Array.from(
    { length: max },
    (_, i) => `<option value="${i + 1}">Channel ${i + 1}</option>`,
  ).join("");
  selects.forEach((s) => {
    const v = parseInt(s.value);
    s.innerHTML = opts;
    s.value = v && v <= max ? v : AUDIO_CONFIG.DEFAULT_CHANNEL;
  });
};

const updateAllChannelSelectors = (outputChannels) => {
  const max = outputChannels || AUDIO_CONFIG.FALLBACK_CHANNELS;
  document.querySelectorAll(".audio-track, .video-track").forEach((track) => {
    const sels = getChannelSelectors(track);
    if (sels.length) updateChannelOptions(sels, max);
  });
};

const setupDeviceChangeListeners = () => {
  document.querySelectorAll(".audio-track, .video-track").forEach((track) => {
    const i = parseInt(track.dataset.index);
    track.querySelectorAll(".audio-device-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        sel.dataset.deviceSet = "1";
        sendAudioCommand("audio-set-device", {
          trackIndex: i,
          deviceId: parseInt(sel.value),
        });
      });
    });
  });
};
