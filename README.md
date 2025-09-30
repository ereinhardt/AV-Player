# A/V-Player (v.1.0-10-2025)

"A/V-Player" with 16-channel audio and 8-channel video (each video track includes 2-channel audio), individual audio device/channel/volume mapping, a master timeline with loop function, Timecode via Art-Net, and UDP-Trigger-Sender (e.g., for additional BrightSign Mediaplayer in the same network – an `autorun.brs` (inside the `Brightsign-UDP` folder) for receiving UDP triggers is included).

by Erik Anton Reinhardt.<br>
[MIT License]

## Start (A/V-Player) Software:

```bash
npm i
node server.js
```

**Note**: <br> 
The web interface opens by default at `localhost:3001`. Change the port in `server.js` if necessary:
```js
(line 20) this.webPort = 3001; // Web-Server Port
```

## Known Bugs (TODO):

- When adding a longer audio or video file to an existing loop, the loop time does not adapt to the new longest file.
