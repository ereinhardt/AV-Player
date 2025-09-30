# A/V-Player (v.1.0-10-2025)

"A/V-Player" with 16-channel audio and 8-channel video (each video track includes 2-channel audio), individual audio device/channel/volume mapping, a master timeline with loop function, Art-Net timecode, and UDP triggers (e.g., for BrightSign devices, with an autorun.brs script included for receiving UDP triggers).

by Erik Anton Reinhardt.<br>
[MIT License]

## Start (A/V-Player) Software:

```bash
npm i
node server.js
```

**Note**: <br> 
The web interface opens by default at `localhost:3001`. Change the port in `server.js` if necessary:
```bash
this.webPort = 3001; // Web-Server Port
```
