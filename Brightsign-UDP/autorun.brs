' UDP Video Trigger Script - Listens for UDP messages and plays video
' This script listens for incoming UDP messages and plays a video when a trigger message is received.
' by Erik Anton Reinhart.

' Usage
' Place this script at the root of a blank microSD card.
' Typically this file would be renamed to autorun.brs so it starts automatically.
' Send a UDP message "START" to trigger video playback.
' Make adjustments to the variables below.

sub Main()
    '''''''''''''''''''''''''''''''''''''''''''''''''''''''''
    ' Variables
    videoFileName$ = "auto"
    '    (use "auto" to automatically play the first video file found on the SD card, otherwise insert the filename of your video "in quotes")
    
    VideoMode = "auto"
    '    (use "auto" to automatically negotiate the display resolution, or insert from list below "in quotes")
   
    ' VIDEO MODES
    ' The list below shows resolutions supported by MOST players. For the exact resolutions that YOUR player supports, go here:
    ' https://brightsign.zendesk.com/hc/en-us/articles/218065627-Supported-video-output-resolutions

    ' Older players with VGA ports can display NTSC/PAL component/S-Video/composite(CVBS) via an adapter: 
    ' http://support.brightsign.biz/entries/22929977-Can-I-use-component-and-composite-video-with-BrightSign-players-
    '    
    '    via HDMI / Component:
    '    ---------------------
    '    ntsc-component
    '    pal-component 
    '    ntsc-m 
    '    ntsc-m-jpn 
    '    pal-i 
    '    pal-bg 
    '    pal-n 
    '    pal-nc 
    '    pal-m 
    '    720x576x50p
    '    720x480x59.94p
    '    720x480x60p
    '    1280x720x50p
    '    1280x720x59.94p
    '    1280x720x60p
    '    1920x1080x50i
    '    1920x1080x59.94i
    '    1920x1080x60i
    '    1920x1080x24p   (not backwards compatible)
    '    1920x1080x29.97p
    '    1920x1080x30p   (not backwards compatible)
    '    1920x1080x50p
    '    1920x1080x59.94p
    '    1920x1080x60p

    '    via HDMI / VGA:
    '    ---------------
    '    640x480x60p 
    '    800x600x60p 
    '    800x600x75p 
    '    1024x768x60p 
    '    1024x768x75p 
    '    1280x768x60p 
    '    1280x800x60p 
    '    1360x768x60p 

    '    4k output via HDMI (upscaled from HD content)
    '    for HD222, HD1022, XD232, XD1032, XD1132 players
    '    ---------------
    '    3840x2160x24p
    '    3840x2160x25p
    '    3840x2160x29.97p
    '    3840x2160x30p
    
    ScaleMode = 1
    '	 (How should the video be scaled if it doesn't match the screen? ... Insert a number from list below, NOT in quotes)
    '    0 = "Scale To Fit"				Scales the video to fill the window in both dimensions. The aspect ratio of the video is ignored, so the video may be stretched/squashed.
    '    1 = "Letterboxed And Centered"	(recommended) Scales the video to fill the window in the longest dimension, adding letterbox/pillarbox if required to maintain video aspect ratio.
    '    2 = "Fill Screen And Centered"	Scales the video to fill the window in the shortest dimension. The aspect ratio is maintained, so the long dimension may be cropped.
    '    3 = "Centered"					Centers the window with no scaling.
    
    audioVolume = 1
    '    (the volume of the audio output, in percent... 
    '     These players have LOUD outputs so try 10-20 for sane headphone levels!)
    
    udpListenPort% = 9998
        '    (the Port your UDP messages will be sent to – must match your UDP server setup)

    triggerMessage$ = "START"
        '    (UDP message that triggers video playbook - case sensitive)
        '    IMPORTANT: Change this trigger word to match your UDP server setup!

    '''''''''''''''''''''''''''''''''''''''''''''''''''''''''

' ----------------------------------------------------
' DON'T edit anything below this line.
' (unless you know exactly what you're doing)
' ----------------------------------------------------

    '---- Find first playable file on SD card ----
    if videoFileName$ = "auto" then
        DIM mylist[5]
        list = ListDir("/")
        countFound = 0
        for each file in list
            if ucase(right(file,3)) = "MOV" or ucase(right(file,3)) = "MP4" or ucase(right(file,3)) = "MPG" or ucase(right(file,3)) = "VOB" or ucase(right(file,2)) = "TS" then 
                if not left(file,1) = "." then 'reject dotfiles!
                    mylist[countFound] = file
                    countFound = countFound + 1
                endif
            endif
        next
        if countFound > 0 then
            videoFileName$ = mylist[0] 'choose first file found (in case of multiples)
        else
            print "ERROR: No video files found on SD card!"
            videoFileName$ = "video.mp4" 'fallback to default
        endif
    endif

    ' Create UDP receiver
    udpReceiver = CreateObject("roDatagramReceiver", udpListenPort%)
    messagePort = CreateObject("roMessagePort")
    udpReceiver.SetPort(messagePort)

    ' Create video player
    videoPlayer = CreateObject("roVideoPlayer")
    videoPlayer.SetPort(messagePort)
    videoPlayer.SetViewMode(ScaleMode)
    videoPlayer.SetVolume(audioVolume)

    print "UDP Video Trigger Script started"
    print "Listening on UDP port: "; udpListenPort%
    print "Trigger message: "; triggerMessage$
    print "Video file: "; videoFileName$

    ' Give system time to initialize
    sleep(2000)
    print "System ready - listening for UDP triggers..."

    ' Main event loop
    isPlaying = false
    
    while true
        ' Wait for messages (UDP or Video events)
        event = messagePort.WaitMessage(0)
        
        if event <> invalid then
            if type(event) = "roDatagramEvent" then
                ' Received UDP message
                udpMsg = event.GetString()
                print "Received UDP message: "; udpMsg
                
                ' Check if message matches trigger word (case sensitive)
                if udpMsg = triggerMessage$ then
                    print "Trigger received! Starting video playback..."
                    
                    ' Stop current playback if running
                    if isPlaying then
                        videoPlayer.Stop()
                        sleep(100) ' Brief pause to ensure clean stop
                    endif
                    
                    ' Start video from beginning
                    videoPlayer.PlayFile(videoFileName$)
                    isPlaying = true
                    print "Video playback started: "; videoFileName$
                else
                    print "Unknown UDP message ignored: "; udpMsg
                end if
                
            else if type(event) = "roVideoEvent" then
                ' Video player event
                eventType = event.GetInt()
                print "Video event: "; eventType
                
                if eventType = 8 then ' Video finished
                    print "Video playback completed"
                    isPlaying = false
                    ' Force black screen by destroying and recreating video player
                    videoPlayer.Stop()
                    videoPlayer = invalid  ' Destroy current player
                    ' Recreate video player (this should clear the screen)
                    videoPlayer = CreateObject("roVideoPlayer")
                    videoPlayer.SetPort(messagePort)
                    videoPlayer.SetViewMode(ScaleMode)
                    videoPlayer.SetVolume(audioVolume)
                    print "Video player reset - black screen should be displayed"
                end if
            end if
        end if

        ' Delay to prevent excessive CPU usage (reduced for higher accuracy)
        sleep(5)
    end while
end sub

