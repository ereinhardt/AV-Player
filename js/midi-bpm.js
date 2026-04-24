// MIDI BPM Sync - Send MIDI Clock messages based on BPM
class MIDIBpm {
  constructor() {
    Object.assign(this, {
      enabled: false,
      bpm: 120,
      midiAccess: null,
      selectedOutput: null,
      isPlaying: false,
      PPQN: 24,
      metronomeMuted: true,
      metronomeVolume: 1.0,
      metronomeDB: 0,
      metronomeAudioContext: null,
      beatCounter: 0,
      beatsPerBar: 4,
      bpmValid: true,
      startTime: 0,
      firstBeatTriggered: false,
      lastTriggeredBeat: -1,
      midiStartSent: false,
      metronomeChannel: 1,
    });

    const el = (id) => document.getElementById(id);
    this.elements = {
      enabled: el("midi-bpm-enabled"),
      deviceSelect: el("midi-device-select"),
      bpmInput: el("midi-bpm-input"),
      startTimeInput: el("midi-start-time"),
      applyBtn: el("midi-bpm-apply"),
      status: el("midi-bpm-status-display"),
      metronomeMute: el("metronome-mute"),
      metronomeDeviceSelect: el("metronome-device-select"),
      metronomeChannelSelect: el("metronome-channel-select"),
      metronomeVolume: el("metronome-volume"),
      metronomeVolumeDisplay: el("metronome-volume-display"),
      metronomeTimeSignature: el("metronome-time-signature"),
      masterMute: el("master-mute-checkbox"),
    };

    this.initMIDI();
    this.setupUI();
    this.initMetronome();
  }

  async initMIDI() {
    if (!navigator.requestMIDIAccess)
      return this.updateStatus("MIDI not supported");
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.midiAccess.addEventListener("statechange", () =>
        this.populateMIDIDevices(),
      );
      this.populateMIDIDevices();
    } catch {
      this.updateStatus("MIDI access denied");
    }
  }

  populateMIDIDevices() {
    const { deviceSelect } = this.elements;
    if (!deviceSelect || !this.midiAccess) return;
    const outputs = Array.from(this.midiAccess.outputs.values());
    deviceSelect.innerHTML = outputs.length
      ? outputs
          .map(
            (o) =>
              `<option value="${o.id}">${o.name || `MIDI Output ${o.id}`}</option>`,
          )
          .join("")
      : '<option value="">No MIDI devices available</option>';
    if (!this.selectedOutput && outputs.length) {
      [this.selectedOutput] = outputs;
      deviceSelect.value = outputs[0].id;
    }
    this.updateStatus();
  }

  setupUI() {
    const {
      enabled,
      bpmInput,
      applyBtn,
      metronomeMute,
      metronomeVolume,
      metronomeVolumeDisplay,
      metronomeTimeSignature,
      startTimeInput,
    } = this.elements;
    const isPlaying = () =>
      document
        .getElementById("play-pause-button")
        ?.classList.contains("playing");

    enabled?.addEventListener("change", () => {
      this.enabled = enabled.checked;
      this.updateStatus();
      this.enabled && isPlaying() && !this.isPlaying
        ? this.start()
        : !this.enabled && this.isPlaying && this.stop();
    });
    if (enabled) enabled.checked = this.enabled;
    if (bpmInput) bpmInput.value = this.bpm;

    if (startTimeInput) {
      startTimeInput.value = this.formatTime(this.startTime);
      startTimeInput.addEventListener("blur", () => {
        this.startTime = this.parseTime(startTimeInput.value);
        startTimeInput.value = this.formatTime(this.startTime);
        this.updateStatus();
      });
    }

    applyBtn?.addEventListener("click", () => {
      const newBPM = parseFloat(bpmInput?.value) || 120;
      this.bpmValid = newBPM >= 20 && newBPM <= 400;
      this.bpm = newBPM;
      if (startTimeInput) {
        this.startTime = this.parseTime(startTimeInput.value);
        startTimeInput.value = this.formatTime(this.startTime);
      }
      if (metronomeTimeSignature)
        this.beatsPerBar =
          parseInt(metronomeTimeSignature.value.split("/")[0]) || 4;
      if (!this.bpmValid && this.isPlaying) this.stop();
      this.applySettings();
      // Reset MIDI state when settings change - stop sending until new startTime is reached
      this.resetFirstBeat();
      if (this.bpmValid) {
        this.updateBPM(newBPM);
        this.enabled && !this.isPlaying && isPlaying() && this.start();
      }
      this.updateStatus();
    });

    metronomeMute?.addEventListener("change", () => {
      this.metronomeMuted = metronomeMute.checked;
      this.updateMetronomeVolumeDisplay();
    });
    if (metronomeMute) metronomeMute.checked = this.metronomeMuted;

    if (metronomeVolume && metronomeVolumeDisplay) {
      metronomeVolume.value = this.metronomeDB;
      metronomeVolumeDisplay.textContent = formatDb(this.metronomeDB);
      metronomeVolume.addEventListener("input", () => {
        this.metronomeDB = parseFloat(metronomeVolume.value);
        this.metronomeVolume = Math.pow(10, this.metronomeDB / 20);
        metronomeVolumeDisplay.textContent = formatDb(this.metronomeDB);
      });
    }
    if (metronomeTimeSignature) metronomeTimeSignature.value = "4/4";
    this.updateMetronomeVolumeDisplay();
    this.updateStatus();
  }

  updateMetronomeVolumeDisplay() {
    const {
      metronomeVolume: vol,
      metronomeVolumeDisplay: disp,
      metronomeMute,
    } = this.elements;
    if (!vol || !disp) return;
    const muted = metronomeMute?.checked;
    disp.textContent = muted ? "-∞ dB" : formatDb(this.metronomeDB);
    vol.disabled = muted;
  }

  applySettings() {
    const { deviceSelect, metronomeDeviceSelect } = this.elements;
    if (!this.midiAccess || !deviceSelect) return;
    this.selectedOutput = deviceSelect.value
      ? this.midiAccess.outputs.get(deviceSelect.value)
      : null;
    if (metronomeDeviceSelect?.value && this.metronomeAudioContext?.setSinkId)
      this.metronomeAudioContext
        .setSinkId(metronomeDeviceSelect.value)
        .catch(() => {});
    this.updateStatus();
  }

  updateStatus(msg = null) {
    const { status, metronomeTimeSignature } = this.elements;
    if (!status) return;
    status.classList.remove("enabled", "error");
    if (msg) {
      status.textContent = `(${msg})`;
      status.classList.add("error");
      return;
    }
    const ts = metronomeTimeSignature?.value || "4/4";
    status.textContent = `(${this.selectedOutput?.name || "No MIDI device"} | ${this.bpm} BPM | ${this.formatTime(this.startTime)} | ${ts})`;
    const hasError = !this.bpmValid || (this.enabled && !this.selectedOutput);
    status.classList.toggle("error", hasError);
    status.classList.toggle(
      "enabled",
      !hasError && this.enabled && this.selectedOutput,
    );
  }

  async initMetronome() {
    const ctx = (this.metronomeAudioContext = new (
      window.AudioContext || window.webkitAudioContext
    )());
    const merger = (this.metronomeChannelMerger = ctx.createChannelMerger(
      Math.max(ctx.destination.maxChannelCount, 18),
    ));
    Object.assign(merger, {
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    });
    merger.connect(ctx.destination);
    this.metronomeMasterGain = ctx.createGain();
    this.connectMetronomeToChannel(1);
    await this.populateAudioDevices();
    await this.populateChannelOptions();
  }

  async populateAudioDevices() {
    const { metronomeDeviceSelect } = this.elements;
    if (!metronomeDeviceSelect) return;
    try {
      const outputs = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "audiooutput",
      );
      metronomeDeviceSelect.innerHTML =
        '<option value="">Default Audio Output</option>' +
        outputs
          .map(
            (d) =>
              `<option value="${d.deviceId}">${d.label || `Audio Output ${d.deviceId.slice(0, 8)}`}</option>`,
          )
          .join("");
      metronomeDeviceSelect.addEventListener("change", () =>
        this.populateChannelOptions(),
      );
    } catch {}
  }

  async populateChannelOptions() {
    const { metronomeChannelSelect: sel, metronomeDeviceSelect } =
      this.elements;
    if (!sel) return;
    const max = await this.getMaxChannelsForDevice(
      metronomeDeviceSelect?.value || "",
    );
    sel.innerHTML = Array.from(
      { length: max },
      (_, i) => `<option value="${i + 1}">Channel ${i + 1}</option>`,
    ).join("");
    sel.value = this.metronomeChannel;
    if (!sel._listenerAdded) {
      sel._listenerAdded = true;
      sel.addEventListener("change", () => {
        this.metronomeChannel = parseInt(sel.value) || 1;
        this.connectMetronomeToChannel(this.metronomeChannel);
      });
    }
  }

  async getMaxChannelsForDevice(deviceId) {
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (deviceId && ctx.setSinkId) await ctx.setSinkId(deviceId);
      return ctx.destination.maxChannelCount;
    } catch {
      return 18;
    } finally {
      ctx?.close();
    }
  }

  connectMetronomeToChannel(ch) {
    if (!this.metronomeMasterGain || !this.metronomeChannelMerger) return;
    try {
      this.metronomeMasterGain.disconnect();
      this.metronomeMasterGain.connect(this.metronomeChannelMerger, 0, ch - 1);
    } catch {}
  }

  playMetronomeClick(isBeat1 = false) {
    if (
      !this.metronomeAudioContext ||
      !this.bpmValid ||
      this.metronomeMuted ||
      this.elements.masterMute?.checked
    )
      return;
    const ctx = this.metronomeAudioContext,
      now = ctx.currentTime;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.frequency.value = isBeat1 ? 1000 : 800;
    gain.gain.setValueAtTime((isBeat1 ? 0.6 : 0.4) * this.metronomeVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.connect(gain).connect(this.metronomeMasterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  sendMIDI(data) {
    if (this.enabled && this.selectedOutput && this.bpmValid)
      try {
        this.selectedOutput.send(data);
      } catch {}
  }

  scheduleClock() {
    if (this.clockRAF) {
      cancelAnimationFrame(this.clockRAF);
      this.clockRAF = null;
    }

    const interval = 60000 / this.bpm / this.PPQN;
    const startTime = performance.now();
    let nextTickTime = startTime;
    let ticks = 0;

    // Use high-frequency check with requestAnimationFrame for precise timing
    const tick = () => {
      if (!this.isPlaying) return;

      const now = performance.now();

      // Check if it's time to send the next MIDI clock pulse
      while (now >= nextTickTime && this.isPlaying) {
        if (this.midiStartSent) this.sendMIDI([0xf8]);
        if (++ticks >= this.PPQN) ticks = 0;
        nextTickTime += interval;
      }

      // Continue checking at high frequency
      this.clockRAF = requestAnimationFrame(tick);
    };

    this.clockRAF = requestAnimationFrame(tick);
  }

  startClock() {
    if (!this.enabled || this.isPlaying || !this.bpmValid) return;
    Object.assign(this, {
      isPlaying: true,
      beatCounter: 0,
      lastTriggeredBeat: -1,
      midiStartSent: false,
    });
    this.updateStatus();
    this.scheduleClock();
  }

  start() {
    this.startClock(0xfa);
  }

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.sendMIDI([0xfc]);
    if (this.clockRAF) cancelAnimationFrame(this.clockRAF);
    this.clockRAF = null;
    this.updateStatus();
  }

  updateBPM(bpm) {
    if (bpm < 20 || bpm > 400) return;
    this.bpm = bpm;
    if (this.elements.bpmInput) this.elements.bpmInput.value = bpm;
    if (this.isPlaying) this.scheduleClock();
    this.updateStatus();
  }

  restart() {
    if (!this.enabled || !this.isPlaying) return;
    if (this.midiStartSent) this.sendMIDI([0xfc]);
    if (this.clockRAF) cancelAnimationFrame(this.clockRAF);
    Object.assign(this, {
      clockRAF: null,
      firstBeatTriggered: false,
      lastTriggeredBeat: -1,
      midiStartSent: false,
    });
    setTimeout(() => {
      this.beatCounter = 0;
      this.scheduleClock();
    }, 10);
  }

  parseTime(str) {
    const p = str.split(":").map((v) => parseInt(v) || 0);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : 0;
  }

  formatTime(s) {
    const pad = (n) => String(Math.floor(n)).padStart(2, "0");
    return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
  }

  checkStartTime(t) {
    if (!this.enabled || !this.isPlaying) return;
    const tol = 0.05,
      interval = 60 / this.bpm;
    if (!this.midiStartSent && t >= this.startTime - tol) {
      this.midiStartSent = true;
      this.sendMIDI([0xfa]);
    }
    const beat = Math.floor((t - this.startTime) / interval);
    if (
      Math.abs(t - (this.startTime + beat * interval)) <= tol &&
      beat !== this.lastTriggeredBeat
    ) {
      this.lastTriggeredBeat = beat;
      const beatInBar = (this.beatCounter =
        (((beat % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar) +
        1);
      if (t >= this.startTime - tol) {
        this.playMetronomeClick(beatInBar === 1);
        if (beatInBar === 1 && !this.firstBeatTriggered) {
          this.firstBeatTriggered = true;
          const { status } = this.elements;
          if (status) {
            const ts = this.elements.metronomeTimeSignature?.value || "4/4";
            status.textContent = `(${this.selectedOutput?.name || "No MIDI device"} | ${this.bpm} BPM | ${this.formatTime(this.startTime)} | ${ts} – SEND FIRST BEAT)`;
            status.classList.remove("error");
            status.classList.add("enabled");
            setTimeout(() => this.updateStatus(), 2000);
          }
        }
      }
    }
  }

  resetFirstBeat() {
    Object.assign(this, {
      firstBeatTriggered: false,
      lastTriggeredBeat: -1,
      midiStartSent: false,
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.midiBpm = new MIDIBpm();
});
