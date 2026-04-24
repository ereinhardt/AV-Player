# A/V-Player (v.1.8-4-2026)

A 'A/V Player' with 24 audio tracks, 8 video tracks, individual audio device/channel/volume mapping, a master timeline with loop function, Art-Net timecode (via UDP), MIDI BPM clock (with metronome), and 8 UDP and 8 OSC (via UDP) trigger senders.

by Erik Anton Reinhardt.<br>
[MIT License]

---

**Pre-Setup (Checklist):**

1. Install Node.js.

## Start (A/V-Player) Software:

```bash
npm i
node server.js
```

**Note**: <br>

- The web interface opens by default at `localhost:3001`.
- Supported file formats: `MP3`, `WAV`, `MP4`, `MOV` (max. 16 GB per file).
- Make sure your computer can handle multiple media players running at the same time; otherwise, it could cause lag.

## Debug:

- In the `debug` folder, there is a TouchDesigner patch for receiving Art-Net-Timecode (`HH:MM:SS:FF`), UDP- and OSC-Trigger messages in the current network.
- It folder also contains test video and audio material.
