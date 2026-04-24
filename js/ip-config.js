async function updateIPFieldForPreset(presetId, ipFieldId) {
  const preset = document.getElementById(presetId),
    ipField = document.getElementById(ipFieldId);
  if (!preset || !ipField) return;

  if (preset.value === "custom") {
    ipField.value = "";
    ipField.style.display = "inline-block";
    ipField.focus();
  } else {
    ipField.style.display = "none";
    if (preset.value === "auto-broadcast") {
      const broadcastIP = await getCurrentNetworkBroadcast();
      ipField.value = broadcastIP;
      const opt = preset.querySelector('option[value="auto-broadcast"]');
      if (opt) opt.textContent = `Broadcast (${broadcastIP})`;
    } else {
      ipField.value = preset.value;
    }
  }
}

const updateIPField = () =>
  updateIPFieldForPreset("artnet-ip-preset", "artnet-ip");
const updateUDPIPField = (i = 0) =>
  updateIPFieldForPreset(
    `udp-trigger-ip-preset${i > 0 ? `-${i}` : ""}`,
    `udp-trigger-ip${i > 0 ? `-${i}` : ""}`
  );
const updateOSCIPField = (i = 0) =>
  updateIPFieldForPreset(
    `osc-trigger-ip-preset${i > 0 ? `-${i}` : ""}`,
    `osc-trigger-ip${i > 0 ? `-${i}` : ""}`
  );

async function initializeIPConfiguration() {
  const broadcastIP = await getCurrentNetworkBroadcast();
  const updateBroadcastLabel = (id) => {
    const opt = document
      .getElementById(id)
      ?.querySelector('option[value="auto-broadcast"]');
    if (opt) opt.textContent = `Broadcast (${broadcastIP})`;
  };

  updateBroadcastLabel("artnet-ip-preset");
  for (let i = 0; i < 8; i++) {
    const suffix = i > 0 ? `-${i}` : "";
    updateBroadcastLabel(`udp-trigger-ip-preset${suffix}`);
    updateBroadcastLabel(`osc-trigger-ip-preset${suffix}`);
    updateUDPIPField(i);
    updateOSCIPField(i);
  }
  updateIPField();
}

document.addEventListener("DOMContentLoaded", initializeIPConfiguration);
