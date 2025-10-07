async function updateIPFieldForPreset(presetId, ipFieldId) {
  const preset = document.getElementById(presetId);
  const ipField = document.getElementById(ipFieldId);

  if (preset.value === "custom") {
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

const updateIPField = () =>
  updateIPFieldForPreset("artnet-ip-preset", "artnet-ip");
const updateUDPIPField = () =>
  updateIPFieldForPreset("udp-trigger-ip-preset", "udp-trigger-ip");

async function initializeIPConfiguration() {
  const broadcastIP = await getCurrentNetworkBroadcast();

  ["artnet-ip-preset", "udp-trigger-ip-preset"].forEach((presetId) => {
    const preset = document.getElementById(presetId);
    const autoBroadcastOption = preset?.querySelector(
      'option[value="auto-broadcast"]'
    );
    if (autoBroadcastOption) {
      autoBroadcastOption.textContent = `Broadcast (${broadcastIP})`;
    }
  });

  updateIPField();
  updateUDPIPField();
}

document.addEventListener("DOMContentLoaded", initializeIPConfiguration);
