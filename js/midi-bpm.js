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
    this.startTime = 0; // Time in seconds when first beat should start
    this.firstBeatTriggered = false;
    this.lastTriggeredBeat = -1; // Track last triggered beat to avoid duplicates
    this.midiStartSent = false; // Track if MIDI start has been sent
    this.metronomeChannel = 1; // Default channel 1 (mono)

    this.elements = {
      enabled: document.getElementById("midi-bpm-enabled"),
      deviceSelect: document.getElementById("midi-device-select"),
      bpmInput: document.getElementById("midi-bpm-input"),
      startTimeInput: document.getElementById("midi-start-time"),
      applyBtn: document.getElementById("midi-bpm-apply"),
      status: document.getElementById("midi-bpm-status-display"),
      metronomeMute: document.getElementById("metronome-mute"),
      metronomeDeviceSelect: document.getElementById("metronome-device-select"),
      metronomeChannelSelect: document.getElementById("metronome-channel-select"),
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
    const { deviceSelect } = this.elements;
    if (!deviceSelect || !this.midiAccess) return;

    const outputs = Array.from(this.midiAccess.outputs.values());
    deviceSelect.innerHTML = outputs.length 
      ? outputs.map(o => `<option value="${o.id}">${o.name || `MIDI Output ${o.id}`}</option>`).join('')
      : '<option value="">No MIDI devices available</option>';

    if (!this.selectedOutput && outputs.length) {
      this.selectedOutput = outputs[0];
      deviceSelect.value = outputs[0].id;
    }
    this.updateStatus();
  }

  setupUI() {
    const { enabled, bpmInput, applyBtn, metronomeMute, metronomeVolume, metronomeVolumeDisplay, metronomeTimeSignature, startTimeInput } = this.elements;
    const isTimelinePlaying = () => document.getElementById("play-pause-button")?.classList.contains("playing");

    enabled?.addEventListener("change", () => {
      this.enabled = enabled.checked;
      this.updateStatus();
      if (this.enabled && isTimelinePlaying() && !this.isPlaying) this.start();
      else if (!this.enabled && this.isPlaying) this.stop();
    });
    if (enabled) enabled.checked = this.enabled;

    if (bpmInput) bpmInput.value = this.bpm;
    if (startTimeInput) {
      startTimeInput.value = this.formatTime(this.startTime);
      startTimeInput.addEventListener("blur", () => {
        startTimeInput.value = this.formatTime(this.parseTime(startTimeInput.value));
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
      
      if (metronomeTimeSignature) {
        this.beatsPerBar = parseInt(metronomeTimeSignature.value.split('/')[0]) || 4;
      }
      
      if (!this.bpmValid && this.isPlaying) this.stop();
      this.applySettings();
      if (this.bpmValid) {
        this.updateBPM(newBPM);
        if (this.enabled && !this.isPlaying && isTimelinePlaying()) this.start();
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
      metronomeVolumeDisplay.textContent = `${this.metronomeDB.toFixed(1)} dB`;
      metronomeVolume.addEventListener("input", () => {
        this.metronomeDB = parseFloat(metronomeVolume.value);
        this.metronomeVolume = Math.pow(10, this.metronomeDB / 20);
        metronomeVolumeDisplay.textContent = `${this.metronomeDB.toFixed(1)} dB`;
      });
    }

    if (metronomeTimeSignature) metronomeTimeSignature.value = "4/4";
    this.updateMetronomeVolumeDisplay();
    this.updateStatus();
  }

  updateMetronomeVolumeDisplay() {
    const { metronomeVolume, metronomeVolumeDisplay, metronomeMute } = this.elements;
    if (!metronomeVolume || !metronomeVolumeDisplay) return;
    
    const muted = metronomeMute?.checked;
    metronomeVolumeDisplay.textContent = muted ? "-∞ dB" : `${this.metronomeDB.toFixed(1)} dB`;
    metronomeVolume.disabled = muted;
  }

  applySettings() {
    const { deviceSelect, metronomeDeviceSelect } = this.elements;
    if (!this.midiAccess || !deviceSelect) return;

    this.selectedOutput = deviceSelect.value ? this.midiAccess.outputs.get(deviceSelect.value) : null;
    
    if (metronomeDeviceSelect?.value && this.metronomeAudioContext?.setSinkId) {
      this.metronomeAudioContext.setSinkId(metronomeDeviceSelect.value).catch(() => {});
    }
    this.updateStatus();
  }

  updateStatus(customMessage = null) {
    const { status, metronomeTimeSignature } = this.elements;
    if (!status) return;

    status.classList.remove("enabled", "error");

    if (customMessage) {
      status.textContent = `(${customMessage})`;
      status.classList.add("error");
      return;
    }

    const timeSignature = metronomeTimeSignature?.value || "4/4";
    const timeStr = this.formatTime(this.startTime || 0);
    status.textContent = `(${this.selectedOutput?.name || "No MIDI device"} | ${this.bpm} BPM | ${timeStr} | ${timeSignature})`;
    
    const hasError = !this.bpmValid || (this.enabled && !this.selectedOutput);
    status.classList.toggle("error", hasError);
    status.classList.toggle("enabled", !hasError && this.enabled && this.selectedOutput);
  }

  async initMetronome() {
    this.metronomeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create merger for channel routing
    const maxChannels = Math.max(this.metronomeAudioContext.destination.maxChannelCount, 18);
    this.metronomeChannelMerger = this.metronomeAudioContext.createChannelMerger(maxChannels);
    this.metronomeChannelMerger.channelCountMode = "explicit";
    this.metronomeChannelMerger.channelInterpretation = "discrete";
    this.metronomeChannelMerger.connect(this.metronomeAudioContext.destination);
    
    this.metronomeMasterGain = this.metronomeAudioContext.createGain();
    this.metronomeMasterGain.gain.value = 1.0;
    
    // Connect to default channel (1)
    this.connectMetronomeToChannel(1);
    
    this.registerWithMasterVolume();
    await this.populateAudioDevices();
    await this.populateChannelOptions();
  }

  registerWithMasterVolume() {
    const container = window.audioContextContainer;
    if (container?.masterGains) {
      if (!container.masterGains.includes(this.metronomeMasterGain)) {
        container.masterGains.push(this.metronomeMasterGain);
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
      
      // Add change listener to update channels when device changes
      metronomeDeviceSelect.addEventListener('change', () => {
        this.populateChannelOptions();
      });
    } catch (error) {}
  }

  async populateChannelOptions() {
    const { metronomeChannelSelect, metronomeDeviceSelect } = this.elements;
    if (!metronomeChannelSelect) return;

    const deviceId = metronomeDeviceSelect?.value || '';
    const maxChannels = await this.getMaxChannelsForDevice(deviceId);
    
    metronomeChannelSelect.innerHTML = Array.from({ length: maxChannels }, (_, i) => 
      `<option value="${i + 1}">Channel ${i + 1}</option>`
    ).join('');
    metronomeChannelSelect.value = this.metronomeChannel;
    
    if (!metronomeChannelSelect._listenerAdded) {
      metronomeChannelSelect._listenerAdded = true;
      metronomeChannelSelect.addEventListener('change', () => {
        this.metronomeChannel = parseInt(metronomeChannelSelect.value) || 1;
        this.connectMetronomeToChannel(this.metronomeChannel);
      });
    }
  }

  async getMaxChannelsForDevice(deviceId) {
    let context;
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
      if (deviceId && context.setSinkId) {
        await context.setSinkId(deviceId);
      }
      return context.destination.maxChannelCount;
    } catch (error) {
      return 18;
    } finally {
      if (context) context.close();
    }
  }

  connectMetronomeToChannel(channelNumber) {
    if (!this.metronomeMasterGain || !this.metronomeChannelMerger) return;
    
    try {
      this.metronomeMasterGain.disconnect();
      this.metronomeMasterGain.connect(this.metronomeChannelMerger, 0, channelNumber - 1);
    } catch (error) {}
  }

  playMetronomeClick(isBeat1 = false) {
    if (!this.metronomeAudioContext || !this.bpmValid || this.metronomeMuted || this.elements.masterMute?.checked) return;

    const ctx = this.metronomeAudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.frequency.value = isBeat1 ? 1000 : 800;
    gain.gain.value = (isBeat1 ? 0.6 : 0.4) * this.metronomeVolume;
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc.connect(gain).connect(this.metronomeMasterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  sendMIDI(data) {
    if (!this.enabled || !this.selectedOutput || !this.bpmValid) return;
    try {
      this.selectedOutput.send(data);
    } catch (error) {}
  }

  createTickFunction() {
    let tickCount = 0;
    const intervalMs = 60000 / this.bpm / this.PPQN;
    
    const tick = () => {
      if (!this.isPlaying) return;
      
      if (this.midiStartSent) this.sendMIDI([0xF8]);
      if (++tickCount >= this.PPQN) tickCount = 0;
      
      this.expectedNextTime += intervalMs;
      this.clockInterval = setTimeout(tick, Math.max(0, intervalMs - (performance.now() - this.expectedNextTime)));
    };
    return tick;
  }

  startClock(midiCommand) {
    if (!this.enabled || this.isPlaying || !this.bpmValid) return;

    this.isPlaying = true;
    this.beatCounter = 0;
    this.lastTriggeredBeat = -1;
    this.midiStartSent = false;
    this.midiStartCommand = midiCommand;
    this.updateStatus();

    const intervalMs = 60000 / this.bpm / this.PPQN;
    this.expectedNextTime = performance.now() + intervalMs;
    this.clockInterval = setTimeout(this.createTickFunction(), intervalMs);
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

    if (this.midiStartSent) this.sendMIDI([0xFC]);
    if (this.clockInterval) clearTimeout(this.clockInterval);
    
    this.clockInterval = null;
    this.firstBeatTriggered = false;
    this.lastTriggeredBeat = -1;
    this.midiStartSent = false;

    setTimeout(() => {
      this.beatCounter = 0;
      const intervalMs = 60000 / this.bpm / this.PPQN;
      this.expectedNextTime = performance.now() + intervalMs;
      this.clockInterval = setTimeout(this.createTickFunction(), intervalMs);
    }, 10);
  }

  showSendMessage() {
    const { status, metronomeTimeSignature } = this.elements;
    if (!status) return;
    const timeSignature = metronomeTimeSignature?.value || "4/4";
    status.textContent = `(${this.selectedOutput?.name || "No MIDI device"} | ${this.bpm} BPM | ${this.formatTime(this.startTime)} | ${timeSignature} – SEND FIRST BEAT)`;
    status.classList.remove("error");
    status.classList.add("enabled");
    setTimeout(() => this.updateStatus(), 2000);
  }

  parseTime(timeStr) {
    const parts = timeStr.split(':').map(p => parseInt(p) || 0);
    if (parts.length !== 3) return 0;
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  checkStartTime(currentTime) {
    if (!this.enabled || !this.isPlaying) return;
    
    const tolerance = 0.05;
    
    if (!this.midiStartSent && currentTime >= this.startTime - tolerance) {
      this.midiStartSent = true;
      this.sendMIDI([this.midiStartCommand || 0xFA]);
    }
    
    const beatInterval = 60 / this.bpm;
    const beatNumber = Math.floor((currentTime - this.startTime) / beatInterval);
    const beatTime = this.startTime + (beatNumber * beatInterval);
    
    if (Math.abs(currentTime - beatTime) <= tolerance && beatNumber !== this.lastTriggeredBeat) {
      this.lastTriggeredBeat = beatNumber;
      const beatInBar = ((beatNumber % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar + 1;
      this.beatCounter = beatInBar;
      
      if (currentTime >= this.startTime - tolerance) {
        this.playMetronomeClick(beatInBar === 1);
        
        if (beatInBar === 1 && !this.firstBeatTriggered) {
          this.firstBeatTriggered = true;
          this.showSendMessage();
        }
      }
    }
  }

  resetFirstBeat() {
    this.firstBeatTriggered = false;
    this.lastTriggeredBeat = -1;
    this.midiStartSent = false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.midiBpm = new MIDIBpm();
});
