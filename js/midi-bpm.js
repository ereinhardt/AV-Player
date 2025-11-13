// MIDI BPM Sync - Send MIDI Clock messages based on BPM
class MIDIBpm {
  constructor() {
    this.enabled = false;
    this.bpm = 120;
    this.midiAccess = null;
    this.selectedOutput = null;
    this.isPlaying = false;
    this.clockInterval = null;
    this.expectedNextTime = 0;
    this.PPQN = 24;
    this.metronomeMuted = true;
    this.metronomeVolume = 1.0;
    this.metronomeDB = 0;
    this.metronomeAudioContext = null;
    this.beatCounter = 0;
    this.beatsPerBar = 4;
    this.bpmValid = true;

    this.elements = {
      enabled: document.getElementById("midi-bpm-enabled"),
      deviceSelect: document.getElementById("midi-device-select"),
      bpmInput: document.getElementById("midi-bpm-input"),
      applyBtn: document.getElementById("midi-bpm-apply"),
      status: document.getElementById("midi-bpm-status-display"),
      metronomeMute: document.getElementById("metronome-mute"),
      metronomeDeviceSelect: document.getElementById("metronome-device-select"),
      metronomeVolume: document.getElementById("metronome-volume"),
      metronomeVolumeDisplay: document.getElementById("metronome-volume-display"),
      metronomeTimeSignature: document.getElementById("metronome-time-signature"),
      masterMute: document.getElementById("master-mute-checkbox"),
    };

    this.initMIDI();
    this.setupUI();
    this.initMetronome();
  }

  async initMIDI() {
    if (!navigator.requestMIDIAccess) return this.updateStatus("MIDI not supported");
    
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.midiAccess.addEventListener("statechange", () => this.populateMIDIDevices());
      this.populateMIDIDevices();
    } catch {
      this.updateStatus("MIDI access denied");
    }
  }

  populateMIDIDevices() {
    if (!this.elements.deviceSelect || !this.midiAccess) return;

    const outputs = Array.from(this.midiAccess.outputs.values());
    this.elements.deviceSelect.innerHTML = outputs.length 
      ? outputs.map(o => `<option value="${o.id}">${o.name || `MIDI Output ${o.id}`}</option>`).join('')
      : '<option value="">No MIDI devices available</option>';

    if (!this.selectedOutput && outputs.length) {
      this.selectedOutput = outputs[0];
      this.elements.deviceSelect.value = outputs[0].id;
    }
    this.updateStatus();
  }

  setupUI() {
    const { enabled, bpmInput, applyBtn, metronomeMute, metronomeVolume, metronomeVolumeDisplay, metronomeTimeSignature } = this.elements;
    const isTimelinePlaying = () => document.getElementById("play-pause-button")?.classList.contains("playing");

    if (enabled) {
      enabled.addEventListener("change", () => {
        this.enabled = enabled.checked;
        this.updateStatus();
        if (this.enabled && isTimelinePlaying() && !this.isPlaying) this.start();
        else if (!this.enabled && this.isPlaying) this.stop();
      });
      enabled.checked = this.enabled;
    }

    if (bpmInput) bpmInput.value = this.bpm;

    applyBtn?.addEventListener("click", () => {
      const newBPM = parseFloat(bpmInput.value) || 120;
      this.bpmValid = newBPM >= 20 && newBPM <= 400;
      this.bpm = newBPM;
      
      // Update time signature
      if (metronomeTimeSignature) {
        const [numerator] = metronomeTimeSignature.value.split('/').map(Number);
        this.beatsPerBar = numerator;
      }
      
      if (!this.bpmValid && this.isPlaying) this.stop();
      this.applySettings();
      if (this.bpmValid) {
        this.updateBPM(newBPM);
        if (this.enabled && !this.isPlaying && isTimelinePlaying()) this.start();
      }
      this.updateStatus();
    });

    if (metronomeMute) {
      metronomeMute.addEventListener("change", () => {
        this.metronomeMuted = metronomeMute.checked;
        this.updateMetronomeVolumeDisplay();
      });
      metronomeMute.checked = this.metronomeMuted;
    }

    if (metronomeVolume && metronomeVolumeDisplay) {
      metronomeVolume.value = this.metronomeDB;
      metronomeVolumeDisplay.textContent = `${this.metronomeDB.toFixed(1)} dB`;
      metronomeVolume.addEventListener("input", () => {
        this.metronomeDB = parseFloat(metronomeVolume.value);
        this.metronomeVolume = Math.pow(10, this.metronomeDB / 20);
        metronomeVolumeDisplay.textContent = `${this.metronomeDB.toFixed(1)} dB`;
      });
    }

    if (metronomeTimeSignature) {
      metronomeTimeSignature.value = "4/4";
    }

    this.updateMetronomeVolumeDisplay();
    this.updateStatus();
  }

  updateMetronomeVolumeDisplay() {
    const { metronomeVolume, metronomeVolumeDisplay, metronomeMute } = this.elements;
    if (!metronomeVolume || !metronomeVolumeDisplay || !metronomeMute) return;
    
    metronomeVolumeDisplay.textContent = metronomeMute.checked ? "-∞ dB" : `${this.metronomeDB.toFixed(1)} dB`;
    metronomeVolume.disabled = metronomeMute.checked;
  }

  applySettings() {
    const { deviceSelect, metronomeDeviceSelect } = this.elements;
    if (!this.midiAccess || !deviceSelect) return;

    this.selectedOutput = deviceSelect.value ? this.midiAccess.outputs.get(deviceSelect.value) : null;
    
    if (metronomeDeviceSelect?.value && this.metronomeAudioContext?.setSinkId) {
      this.metronomeAudioContext.setSinkId(metronomeDeviceSelect.value)
        .catch(err => console.warn('Could not set metronome audio output device:', err));
    }
    this.updateStatus();
  }

  updateStatus(customMessage = null) {
    if (!this.elements.status) return;

    this.elements.status.classList.remove("enabled", "error");

    if (customMessage) {
      this.elements.status.textContent = `(${customMessage})`;
      this.elements.status.classList.add("error");
      return;
    }

    const timeSignature = this.elements.metronomeTimeSignature?.value || "4/4";
    this.elements.status.textContent = `(${this.selectedOutput?.name || "No MIDI device"} / ${this.bpm} BPM / ${timeSignature})`;
    if (!this.bpmValid || (this.enabled && !this.selectedOutput)) {
      this.elements.status.classList.add("error");
    } else if (this.enabled && this.selectedOutput) {
      this.elements.status.classList.add("enabled");
    }
  }

  async initMetronome() {
    this.metronomeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    this.metronomeMasterGain = this.metronomeAudioContext.createGain();
    this.metronomeMasterGain.connect(this.metronomeAudioContext.destination);
    this.metronomeMasterGain.gain.value = 1.0;
    
    this.registerWithMasterVolume();
    await this.populateAudioDevices();
  }

  registerWithMasterVolume() {
    const container = window.audioContextContainer;
    if (container?.masterGains) {
      if (!container.masterGains.includes(this.metronomeMasterGain)) {
        container.masterGains.push(this.metronomeMasterGain);
        console.log('Metronome registered with master volume system');
      }
      if (container.masterVolume !== undefined) {
        this.metronomeMasterGain.gain.value = container.masterVolume;
      }
    } else {
      setTimeout(() => this.registerWithMasterVolume(), 100);
    }
  }

  async populateAudioDevices() {
    const { metronomeDeviceSelect } = this.elements;
    if (!metronomeDeviceSelect) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      
      metronomeDeviceSelect.innerHTML = '<option value="">Default Audio Output</option>' +
        audioOutputs.map(d => `<option value="${d.deviceId}">${d.label || `Audio Output ${d.deviceId.slice(0, 8)}`}</option>`).join('');
    } catch (error) {
      console.error('Error enumerating audio devices:', error);
    }
  }

  playMetronomeClick(isBeat1 = false) {
    if (!this.metronomeAudioContext || !this.bpmValid || this.metronomeMuted || this.elements.masterMute?.checked) return;

    const ctx = this.metronomeAudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = isBeat1 ? 1000 : 800;
    gain.gain.value = (isBeat1 ? 0.6 : 0.4) * this.metronomeVolume;
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

    osc.connect(gain).connect(this.metronomeMasterGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  }

  sendMIDI(data) {
    if (this.enabled && this.selectedOutput && this.bpmValid) {
      try {
        this.selectedOutput.send(data);
      } catch (error) {
        console.error("Failed to send MIDI message:", error);
      }
    }
  }

  createTickFunction() {
    let tickCount = 0;
    const intervalMs = 60000 / this.bpm / this.PPQN;
    
    const tick = () => {
      if (!this.isPlaying) return;
      
      this.sendMIDI([0xF8]);
      
      if (++tickCount >= this.PPQN) {
        tickCount = 0;
        this.beatCounter = (this.beatCounter % this.beatsPerBar) + 1;
        this.playMetronomeClick(this.beatCounter === 1);
      }
      
      this.expectedNextTime += intervalMs;
      this.clockInterval = setTimeout(tick, Math.max(0, intervalMs - (performance.now() - this.expectedNextTime)));
    };
    return tick;
  }

  startClock(midiCommand) {
    if (!this.enabled || this.isPlaying || !this.bpmValid) return;

    this.isPlaying = true;
    this.beatCounter = 0;
    this.updateStatus();
    this.sendMIDI([midiCommand]);

    // Play first beat immediately
    this.beatCounter = 1;
    this.playMetronomeClick(true);

    const intervalMs = 60000 / this.bpm / this.PPQN;
    this.expectedNextTime = performance.now() + intervalMs;
    this.clockInterval = setTimeout(this.createTickFunction(), intervalMs);
    console.log(`MIDI Clock ${midiCommand === 0xFA ? 'started' : 'continued'} at ${this.bpm} BPM`);
  }

  start() { this.startClock(0xFA); }
  continue() { this.startClock(0xFB); }
  
  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.updateStatus();
    this.sendMIDI([0xFC]);
    if (this.clockInterval) clearTimeout(this.clockInterval);
    this.clockInterval = null;
    console.log("MIDI Clock stopped");
  }

  updateBPM(newBPM) {
    if (newBPM < 20 || newBPM > 400) return;

    this.bpm = newBPM;
    if (this.elements.bpmInput) this.elements.bpmInput.value = this.bpm;

    if (this.isPlaying && this.clockInterval) {
      clearTimeout(this.clockInterval);
      const intervalMs = 60000 / this.bpm / this.PPQN;
      this.expectedNextTime = performance.now() + intervalMs;
      this.clockInterval = setTimeout(this.createTickFunction(), intervalMs);
    }
    this.updateStatus();
  }

  restart() {
    if (!this.enabled || !this.isPlaying) return;

    this.showSendMessage();
    this.sendMIDI([0xFC]);
    if (this.clockInterval) clearTimeout(this.clockInterval);
    this.clockInterval = null;

    setTimeout(() => {
      this.sendMIDI([0xFA]);
      
      // Play first beat immediately
      this.beatCounter = 1;
      this.playMetronomeClick(true);
      
      const intervalMs = 60000 / this.bpm / this.PPQN;
      this.expectedNextTime = performance.now() + intervalMs;
      this.clockInterval = setTimeout(this.createTickFunction(), intervalMs);
    }, 10);
  }

  showSendMessage() {
    if (!this.elements.status) return;
    const timeSignature = this.elements.metronomeTimeSignature?.value || "4/4";
    this.elements.status.textContent = `(${this.selectedOutput?.name || "No MIDI device"} / ${this.bpm} BPM / ${timeSignature} – SEND FIRST BEAT)`;
    this.elements.status.classList.remove("error");
    this.elements.status.classList.add("enabled");
    setTimeout(() => this.updateStatus(), 2000);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.midiBpm = new MIDIBpm();
});
