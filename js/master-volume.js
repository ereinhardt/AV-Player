/* Master Volume — server-side master volume/mute */

function setupMasterVolumeControl() {
  const slider = document.getElementById("master-volume-slider");
  const display = document.getElementById("master-volume-db");
  const mute = document.getElementById("master-mute-checkbox");
  if (!slider || !display || !mute) return;

  const update = () => {
    const db = parseFloat(slider.value);
    const muted = mute.checked;
    display.textContent = muted ? "-∞ dB" : formatDb(db);
    slider.disabled = muted;
    sendAudioCommand("audio-set-master-volume", {
      volume: Math.pow(10, db / 20),
    });
    sendAudioCommand("audio-set-master-mute", { muted });
  };

  slider.addEventListener("input", update);
  mute.addEventListener("change", update);
  update();
}
