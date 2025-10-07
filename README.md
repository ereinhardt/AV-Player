# A/V-Player (v.1.2-10-2025)

"A/V-Player" with 16-channel audio and 8-channel video (each video track includes 2-channel audio), individual audio device/channel/volume mapping, a master timeline with loop function, Timecode via Art-Net, and UDP-Trigger-Sender (e.g., for additional BrightSign Mediaplayer in the same network – an `autorun.brs` (inside the `Brightsign-UDP` folder) for receiving UDP triggers is included).

by Erik Anton Reinhardt.<br>
[MIT License]

## Start (A/V-Player) Software:

```bash
npm i
node server.js
```

**Note**: <br> 
- The web interface opens by default at `localhost:3001`. 
- Supported file formats: `MP4`, `MP3`, `WAV`.
- Tested primarily with Google Chrome.
- All important information on how to handle the BrightSign script can be found as comments within the script itself.
- Make sure your computer can handle multiple media players running at the same time; otherwise, it could cause lag.
- (ONLY Mac-User): If you use macOS and an audio interface with more than 2 outputs, set it as the default output device (in your OS) to access more then 2 channels in the software.

## Debug:
- In the `debug` folder, there is a TouchDesigner patch for receiving Art-Net-Timecode (`HH:MM:SS:FF`) and UDP-Trigger messages in the current network.
- It folder also contains test video and audio material. 

## Known Bugs (TODO):

–No Bugs know–
