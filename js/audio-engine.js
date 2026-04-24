/**
 * Server-side Audio Engine — Naudiodon (PortAudio) low-level I/O.
 * Per-track device routing with per-device frame counters.
 * Requires: naudiodon2, ffmpeg-static, ffprobe-static
 */

const portAudio = require("naudiodon2");
const { execSync, spawn } = require("child_process");
const { Readable } = require("stream");
const path = require("path");
const fs = require("fs");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;

const toDb = (p) =>
  p > 0 ? Math.round(20 * Math.log10(p) * 10) / 10 : -Infinity;

/* DeviceMixerReadable */

class DeviceMixerReadable extends Readable {
  constructor(engine, deviceId, channels) {
    super({ highWaterMark: engine.framesPerBuffer * channels * 4 * 8 });
    this.engine = engine;
    this.deviceId = deviceId;
    this.channels = channels;
    this.position = 0;
  }

  _read() {
    try {
      const result = this.engine.mixFrameForDevice(
        this.deviceId,
        this.position,
      );
      if (this.engine.isPlaying) this.position += this.engine.framesPerBuffer;
      this.push(result);
    } catch (e) {
      console.error(`DeviceMixer[${this.deviceId}] error:`, e.message);
      this.push(Buffer.alloc(this.engine.framesPerBuffer * this.channels * 4));
    }
  }
}

/* AudioEngine */

class AudioEngine {
  constructor(opts = {}) {
    this.tracks = new Map();
    this.trackConfig = new Map();
    this.deviceStreams = new Map();

    this.sampleRate = opts.sampleRate ?? 48000;
    this.framesPerBuffer = opts.framesPerBuffer ?? 1024;
    this.masterVolume = 1.0;
    this.masterMuted = false;
    this.isPlaying = false;
    this.globalPosition = 0;
    this.looping = false;

    this.uploadDir = path.join(__dirname, "..", "av-data");
    if (!fs.existsSync(this.uploadDir))
      fs.mkdirSync(this.uploadDir, { recursive: true });

    this._deviceCache = null;
    this.peakLevels = []; // master output peak per channel
    this.trackPeaks = new Map(); // trackIdx -> Map(srcCh -> peak)
  }

  /* Devices */

  getDevices() {
    if (this._deviceCache) return this._deviceCache;
    try {
      this._deviceCache = portAudio
        .getDevices()
        .map(({ id, name, maxOutputChannels, defaultOutput }) => ({
          id,
          name,
          maxOutputChannels,
          defaultOutput: defaultOutput || false,
        }));
      return this._deviceCache;
    } catch (e) {
      console.error("Failed to enumerate audio devices:", e.message);
      return [];
    }
  }

  getOutputDevices() {
    return this.getDevices().filter((d) => d.maxOutputChannels > 0);
  }

  getDeviceChannelCount(deviceId) {
    const devs = this.getDevices();
    const d =
      deviceId < 0
        ? devs.find((d) => d.defaultOutput)
        : devs.find((d) => d.id === deviceId);
    return d?.maxOutputChannels ?? 2;
  }

  /* Device Streams */

  ensureDeviceStream(deviceId) {
    if (this.deviceStreams.has(deviceId))
      return this.deviceStreams.get(deviceId);

    const channels = this.getDeviceChannelCount(deviceId);
    const mixerStream = new DeviceMixerReadable(this, deviceId, channels);

    const outOptions = {
      channelCount: channels,
      sampleFormat: portAudio.SampleFormatFloat32,
      sampleRate: this.sampleRate,
      framesPerBuffer: this.framesPerBuffer,
      closeOnError: false,
    };
    if (deviceId >= 0) outOptions.deviceId = deviceId;

    const audioIO = new portAudio.AudioIO({ outOptions });
    mixerStream.pipe(audioIO);

    const ds = { mixerStream, audioIO, channels, started: false };
    this.deviceStreams.set(deviceId, ds);
    mixerStream.position = this.globalPosition;
    return ds;
  }

  ensureAllDeviceStreams() {
    const needed = new Set(
      [...this.trackConfig.values()].map((c) => c.deviceId ?? -1),
    );
    for (const did of needed) this.ensureDeviceStream(did);
  }

  startAllDeviceStreams() {
    for (const [, ds] of this.deviceStreams) {
      if (!ds.started) {
        ds.audioIO.start();
        ds.started = true;
      }
    }
  }

  closeDeviceStream(deviceId) {
    const ds = this.deviceStreams.get(deviceId);
    if (!ds) return;
    try {
      ds.audioIO.quit();
    } catch {}
    try {
      ds.mixerStream.destroy();
    } catch {}
    this.deviceStreams.delete(deviceId);
  }

  cleanupUnusedDeviceStreams() {
    const used = new Set(
      [...this.trackConfig.values()].map((c) => c.deviceId ?? -1),
    );
    for (const did of [...this.deviceStreams.keys()]) {
      if (!used.has(did)) this.closeDeviceStream(did);
    }
  }

  stopAllDeviceStreams() {
    for (const did of [...this.deviceStreams.keys()])
      this.closeDeviceStream(did);
  }

  setTrackDevice(trackIndex, deviceId) {
    const cfg = this.trackConfig.get(trackIndex);
    if (!cfg) return { success: false, error: "Track not loaded" };

    const wasPlaying = this.isPlaying;
    // Snapshot a consistent position BEFORE touching any stream.
    if (wasPlaying && this.deviceStreams.size > 0)
      this.globalPosition = this.firstStreamPos();

    const oldDevice = cfg.deviceId ?? -1;
    cfg.deviceId = deviceId;

    // Full restart of all device streams guarantees phase-aligned playback.
    // Individual position-tweaking can't compensate for per-stream PortAudio
    // buffering that has already been queued to the hardware.
    if (wasPlaying) {
      this.isPlaying = false;
      this.stopAllDeviceStreams();
    }

    try {
      // Re-open streams for every device still in use (incl. the new one)
      this.ensureAllDeviceStreams();
    } catch (e) {
      cfg.deviceId = oldDevice;
      this.isPlaying = wasPlaying;
      return { success: false, error: e.message };
    }

    if (wasPlaying) {
      this.syncAllDevicePositions(this.globalPosition);
      this.isPlaying = true;
      this.startAllDeviceStreams();
    }

    // Clamp channel mappings to new device's channel count
    const newChCount = this.getDeviceChannelCount(deviceId);
    for (const [srcCh, outCh] of cfg.channelMap) {
      if (outCh >= newChCount) cfg.channelMap.set(srcCh, outCh % newChCount);
    }
    this.cleanupUnusedDeviceStreams();
    return { success: true, channels: newChCount, deviceId };
  }

  /* File Decoding */

  probeFile(filePath) {
    try {
      const raw = execSync(
        `"${ffprobePath}" -v error -select_streams a:0 -show_entries stream=channels -of json "${filePath}"`,
        { timeout: 15000, stdio: ["pipe", "pipe", "pipe"] },
      );
      const s = JSON.parse(raw.toString()).streams?.[0] || {};
      return { channels: parseInt(s.channels) || 1 };
    } catch (e) {
      console.warn("ffprobe failed:", e.message);
      return { channels: 1 };
    }
  }

  decodeFileAsync(filePath, sourceChannels) {
    return new Promise((resolve, reject) => {
      const pcmPath = path.join(
        this.uploadDir,
        `pcm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.f32`,
      );
      const out = fs.createWriteStream(pcmPath);
      const fail = (msg) => {
        try {
          fs.unlinkSync(pcmPath);
        } catch {}
        reject(new Error(msg));
      };
      const proc = spawn(
        ffmpegPath,
        [
          "-i",
          filePath,
          "-f",
          "f32le",
          "-acodec",
          "pcm_f32le",
          "-ar",
          String(this.sampleRate),
          "-ac",
          String(sourceChannels),
          "-v",
          "error",
          "pipe:1",
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let stderr = "",
        exitCode = null,
        closed = false,
        finished = false;
      const done = () => {
        if (!closed || !finished) return;
        if (exitCode !== 0)
          return fail(`ffmpeg exit ${exitCode}: ${stderr.slice(0, 200)}`);
        const totalFrames = Math.floor(
          fs.statSync(pcmPath).size / 4 / sourceChannels,
        );
        resolve({ pcmPath, totalFrames });
      };
      proc.stderr.on("data", (d) => (stderr += d));
      proc.stdout.pipe(out);
      proc.on("error", (e) => {
        out.destroy();
        fail(`ffmpeg spawn failed: ${e.message}`);
      });
      proc.on("close", (c) => {
        exitCode = c;
        closed = true;
        done();
      });
      out.on("finish", () => {
        finished = true;
        done();
      });
      out.on("error", reject);
    });
  }

  _freeTrack(track) {
    if (!track) return;
    try {
      fs.closeSync(track.fd);
    } catch {}
    for (const p of [track.pcmPath, track.filePath])
      if (p)
        try {
          fs.unlinkSync(p);
        } catch {}
  }

  /* Track Management */

  ensureConfig(trackIndex) {
    let cfg = this.trackConfig.get(trackIndex);
    if (!cfg) {
      cfg = {
        volume: 1.0,
        muted: false,
        deviceId: -1,
        channelMap: new Map(),
        channelVolumes: new Map(),
        channelMutes: new Map(),
      };
      this.trackConfig.set(trackIndex, cfg);
    }
    return cfg;
  }

  async loadTrack(trackIndex, filePath, isVideoTrack = false) {
    const probe = this.probeFile(filePath);
    const channels = isVideoTrack
      ? Math.max(probe.channels, 2)
      : probe.channels;
    const { pcmPath, totalFrames } = await this.decodeFileAsync(
      filePath,
      channels,
    );
    const duration = totalFrames / this.sampleRate;
    const fd = fs.openSync(pcmPath, "r");

    // Release previous track resources if re-loading (keep the new source file)
    const prevTrack = this.tracks.get(trackIndex);
    if (prevTrack) this._freeTrack({ ...prevTrack, filePath: null });

    this.tracks.set(trackIndex, {
      pcmPath,
      fd,
      channels,
      totalFrames,
      duration,
      filePath,
    });

    const prev = this.trackConfig.get(trackIndex);
    const channelMap = new Map(),
      channelVolumes = new Map(),
      channelMutes = new Map();
    for (let ch = 0; ch < channels; ch++) {
      channelMap.set(ch, 0);
      channelVolumes.set(ch, 1.0);
      channelMutes.set(ch, false);
    }

    this.trackConfig.set(trackIndex, {
      volume: prev?.volume ?? 1.0,
      muted: prev?.muted ?? false,
      deviceId: prev?.deviceId ?? -1,
      channelMap,
      channelVolumes,
      channelMutes,
      pendingStart: this.isPlaying,
    });

    return { duration, channels, totalFrames };
  }

  removeTrack(trackIndex) {
    this._freeTrack(this.tracks.get(trackIndex));
    this.tracks.delete(trackIndex);
    this.trackConfig.delete(trackIndex);
    // If no tracks remain, fully reset transport so a new track doesn't
    // inherit a stale "playing" state from a previous session.
    if (this.tracks.size === 0) {
      this.isPlaying = false;
      this.globalPosition = 0;
      this.stopAllDeviceStreams();
    } else {
      this.cleanupUnusedDeviceStreams();
    }
  }

  /* Channel Mapping */

  setChannelMapping(trackIndex, sourceChannel, outputChannel) {
    this.ensureConfig(trackIndex).channelMap.set(sourceChannel, outputChannel);
  }

  setAllChannelsToOutput(trackIndex, outputChannel) {
    const cfg = this.ensureConfig(trackIndex);
    const srcChannels = this.tracks.get(trackIndex)?.channels ?? 2;
    cfg.channelMap.clear();
    for (let ch = 0; ch < srcChannels; ch++)
      cfg.channelMap.set(ch, outputChannel);
  }

  /* Volume */

  setTrackVolume(trackIndex, v) {
    const c = this.trackConfig.get(trackIndex);
    if (c) c.volume = Math.max(0, v);
  }
  setTrackMute(trackIndex, m) {
    const c = this.trackConfig.get(trackIndex);
    if (c) c.muted = !!m;
  }
  setChannelVolume(trackIndex, ch, v) {
    this.trackConfig.get(trackIndex)?.channelVolumes?.set(ch, Math.max(0, v));
  }
  setChannelMute(trackIndex, ch, m) {
    this.trackConfig.get(trackIndex)?.channelMutes?.set(ch, !!m);
  }
  setMasterVolume(v) {
    this.masterVolume = Math.max(0, v);
  }
  setMasterMute(m) {
    this.masterMuted = !!m;
  }

  /* Transport */

  firstStreamPos() {
    for (const [, ds] of this.deviceStreams) return ds.mixerStream.position;
    return this.globalPosition;
  }

  syncAllDevicePositions(posFrames) {
    for (const [, ds] of this.deviceStreams)
      ds.mixerStream.position = posFrames;
    this.globalPosition = posFrames;
  }

  play() {
    if (this.tracks.size === 0) return false;
    try {
      this.ensureAllDeviceStreams();
    } catch (e) {
      console.error(`Failed to start device streams:`, e.message);
      return false;
    }
    this.syncAllDevicePositions(this.globalPosition);
    this.isPlaying = true;
    // Start audioIO AFTER isPlaying so first _read produces real audio
    this.startAllDeviceStreams();
    return true;
  }

  pause() {
    this.globalPosition = this.firstStreamPos();
    this.isPlaying = false;
  }

  reset() {
    this.isPlaying = false;
    this.syncAllDevicePositions(0);
    for (const [, cfg] of this.trackConfig) cfg.pendingStart = false;
  }

  setLooping(loop) {
    this.looping = !!loop;
  }

  /* State */

  getPlaybackState() {
    let longestDuration = 0;
    const trackDurations = {};
    for (const [idx, track] of this.tracks) {
      const cfg = this.trackConfig.get(idx);
      if (cfg?.pendingStart) continue;
      longestDuration = Math.max(longestDuration, track.duration);
      trackDurations[idx] = track.duration;
    }

    let pos = this.globalPosition;
    if (this.isPlaying && this.deviceStreams.size > 0) {
      pos = this.firstStreamPos();
      this.globalPosition = pos;
    }

    // Read and reset peak levels (clear immediately when not playing or muted)
    let peaks,
      trackPeaks = {};
    if (!this.isPlaying || this.masterMuted) {
      peaks = this.peakLevels.map(() => -Infinity);
      this.peakLevels.fill(0);
      this.trackPeaks.clear();
    } else {
      peaks = this.peakLevels.map((p) => toDb(p));
      this.peakLevels = this.peakLevels.map((p) => p * 0.85);
      for (const [idx, chMap] of this.trackPeaks) {
        const cfg = this.trackConfig.get(idx);
        if (cfg?.muted) {
          chMap.clear();
          continue;
        }
        trackPeaks[idx] = {};
        for (const [ch, p] of chMap) {
          if (cfg?.channelMutes?.get(ch)) {
            chMap.set(ch, 0);
            continue;
          }
          trackPeaks[idx][ch] = toDb(p);
          chMap.set(ch, p * 0.85);
        }
      }
    }

    return {
      isPlaying: this.isPlaying,
      position: pos / this.sampleRate,
      duration: longestDuration,
      looping: this.looping,
      trackDurations,
      peaks,
      trackPeaks,
    };
  }

  /* Mixer Core */

  mixFrameForDevice(deviceId, posFrames) {
    const ds = this.deviceStreams.get(deviceId);
    if (!ds) return Buffer.alloc(this.framesPerBuffer * 2 * 4);

    const { channels } = ds;
    const frames = this.framesPerBuffer;
    const buf = Buffer.alloc(frames * channels * 4);
    if (!this.isPlaying) return buf;

    let maxFrames = 0;
    for (const [, t] of this.tracks)
      maxFrames = Math.max(maxFrames, t.totalFrames);
    if (maxFrames === 0) return buf;

    if (posFrames >= maxFrames) {
      if (this.looping) {
        posFrames %= maxFrames;
        ds.mixerStream.position = posFrames;
        for (const [, cfg] of this.trackConfig) cfg.pendingStart = false;
      } else {
        this.isPlaying = false;
        return buf;
      }
    }
    if (posFrames < 0) posFrames = 0;

    const masterVol = this.masterMuted ? 0 : this.masterVolume;
    if (masterVol === 0) return buf;

    const output = new Float32Array(
      buf.buffer,
      buf.byteOffset,
      frames * channels,
    );

    for (const [trackIdx, track] of this.tracks) {
      const cfg = this.trackConfig.get(trackIdx);
      if (
        !cfg ||
        cfg.muted ||
        cfg.pendingStart ||
        (cfg.deviceId ?? -1) !== deviceId
      )
        continue;

      const vol = cfg.volume * masterVol;
      if (vol === 0) continue;

      const avail = Math.min(frames, track.totalFrames - posFrames);
      if (avail <= 0) continue;

      // Read needed PCM window from disk (disk-backed, not RAM)
      const chunkBytes = avail * track.channels * 4;
      const chunkBuf = Buffer.allocUnsafe(chunkBytes);
      fs.readSync(
        track.fd,
        chunkBuf,
        0,
        chunkBytes,
        posFrames * track.channels * 4,
      );
      const pcm = new Float32Array(
        chunkBuf.buffer,
        chunkBuf.byteOffset,
        avail * track.channels,
      );

      for (const [srcCh, outCh] of cfg.channelMap) {
        if (srcCh >= track.channels || outCh >= channels) continue;
        if (cfg.channelMutes?.get(srcCh)) continue;
        const chVol = (cfg.channelVolumes?.get(srcCh) ?? 1.0) * vol;
        if (chVol === 0) continue;

        let tpk = 0;
        for (let f = 0; f < avail; f++) {
          const sample = pcm[f * track.channels + srcCh] * chVol;
          output[f * channels + outCh] += sample;
          const abs = Math.abs(sample);
          if (abs > tpk) tpk = abs;
        }
        // Track per-channel peaks
        if (!this.trackPeaks.has(trackIdx))
          this.trackPeaks.set(trackIdx, new Map());
        const chPeaks = this.trackPeaks.get(trackIdx);
        if (tpk > (chPeaks.get(srcCh) ?? 0)) chPeaks.set(srcCh, tpk);
      }
    }

    // Peak metering (before clipping to capture true levels)
    while (this.peakLevels.length < channels) this.peakLevels.push(0);
    for (let ch = 0; ch < channels; ch++) {
      let pk = 0;
      for (let f = 0; f < frames; f++) {
        const v = Math.abs(output[f * channels + ch]);
        if (v > pk) pk = v;
      }
      if (pk > this.peakLevels[ch]) this.peakLevels[ch] = pk;
    }

    // Soft clipping to prevent pops
    for (let i = 0; i < output.length; i++) {
      const s = output[i];
      if (s > 0.95) output[i] = 0.95 + 0.05 * Math.tanh((s - 0.95) / 0.05);
      else if (s < -0.95)
        output[i] = -0.95 + 0.05 * Math.tanh((s + 0.95) / 0.05);
    }

    return buf;
  }

  /* Shutdown */

  shutdown() {
    this.isPlaying = false;
    this.stopAllDeviceStreams();
    for (const [, track] of this.tracks) this._freeTrack(track);
    this.tracks.clear();
    this.trackConfig.clear();
  }
}

module.exports = AudioEngine;
