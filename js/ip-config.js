// Update IP input field based on preset selection
async function updateIPFieldForPreset(presetId, ipFieldId) {
  const preset = document.getElementById(presetId);
  const ipField = document.getElementById(ipFieldId);

  if (!preset || !ipField) return;

  if (preset.value === "custom") {
    ipField.value = "";
    ipField.style.display = "inline-block";
    ipField.focus();
  } else if (preset.value === "auto-broadcast") {
    ipField.style.display = "none";
    const broadcastIP = await getCurrentNetworkBroadcast();
    ipField.value = broadcastIP;

    const autoBroadcastOption = preset.querySelector(
      'option[value="auto-broadcast"]'
    );
    if (autoBroadcastOption) {
      autoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
    }
  } else {
    ipField.style.display = "none";
    ipField.value = preset.value;
  }
}

// Update Art-Net IP field based on preset selection
const updateIPField = () =>
  updateIPFieldForPreset("artnet-ip-preset", "artnet-ip");
// Update UDP trigger IP field based on preset selection
const updateUDPIPField = (index = 0) => {
  const suffix = index > 0 ? `-${index}` : "";
  updateIPFieldForPreset(`udp-trigger-ip-preset${suffix}`, `udp-trigger-ip${suffix}`);
};
// Update OSC trigger IP field based on preset selection
const updateOSCIPField = (index = 0) => {
  const suffix = index > 0 ? `-${index}` : "";
  updateIPFieldForPreset(`osc-trigger-ip-preset${suffix}`, `osc-trigger-ip${suffix}`);
};

// Initialize IP configuration with broadcast detection and update presets
async function initializeIPConfiguration() {
  const broadcastIP = await getCurrentNetworkBroadcast();

  // Initialize Art-Net preset
  const artnetPreset = document.getElementById("artnet-ip-preset");
  const artnetAutoBroadcast = artnetPreset?.querySelector('option[value="auto-broadcast"]');
  if (artnetAutoBroadcast) {
    artnetAutoBroadcast.textContent = `Broadcast (${broadcastIP})`;
  }

  // Initialize all 8 UDP trigger presets
  for (let i = 0; i < 8; i++) {
    const suffix = i > 0 ? `-${i}` : "";
    const presetId = `udp-trigger-ip-preset${suffix}`;
    const preset = document.getElementById(presetId);
    const autoBroadcastOption = preset?.querySelector(
      'option[value="auto-broadcast"]'
    );
    if (autoBroadcastOption) {
      autoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
    }
    updateUDPIPField(i);
  }

  // Initialize all 8 OSC trigger presets
  for (let i = 0; i < 8; i++) {
    const suffix = i > 0 ? `-${i}` : "";
    const presetId = `osc-trigger-ip-preset${suffix}`;
    const preset = document.getElementById(presetId);
    const autoBroadcastOption = preset?.querySelector(
      'option[value="auto-broadcast"]'
    );
    if (autoBroadcastOption) {
      autoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
    }
    updateOSCIPField(i);
  }

  updateIPField();
}

document.addEventListener("DOMContentLoaded", initializeIPConfiguration);
