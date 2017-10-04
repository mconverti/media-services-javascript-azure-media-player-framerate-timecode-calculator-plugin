---
services: media-services
platforms: javascript
author: @mconverti
---

# Media Services: Frame Rate and Timecode Calculator Plugin for Azure Media Player

## Information
Attributions:  Southworks 2017 

# Introduction
This plugin calculates the frame rate of the current video source based on the `tfhd`/`trun` MP4 boxes of the first MPEG-DASH video fragment, parses the time scale value from the MPEG-DASH client manifest, and also provides a way to generate the timecode for a given absolute time from the player (and the other way around).

In order to expose these features, the plugin adds the following methods and events to the Azure Media Player (AMP) API:

> **IMPORTANT:** The frame rate calculation does not support Advanced Encryption Standard (AES) clear key encrypted content. For this scenario, the default frame rate value from the plugin configuration options will be used or you can manually override the frame rate value.

### `frameRate` method
This method returns the frame rate value of the current video source based on the `tfhd`/`trun` MP4 boxes of the first MPEG-DASH video fragment. If the calculation fails, it returns the default value configured in the plugin options.

This method also lets the user override the frame rate value manually.

```
// Get frame rate value
var frameRate = player.frameRate();

// Manually override frame rate value to 24 fps
player.frameRate(24);
```

### `timeScale` method

This method exposes the time scale value parsed from the MPEG-DASH client manifest of the current video source. If the parsing fails, it returns the default value configured in the plugin options.

```
// Get time scale value
var timeScale = player.timeScale();
```

### `dropFrame` method

This method lets the user get or set a flag to enable/disable drop frame timecodes for 29.97fps. It takes the default value from the plugin configuration options.

```
// Get drop frame flag value for 29.97fps
var dropFrameFlag = player.dropFrame();

dropFrameFlag = !dropFrameFlag;

// Update drop frame flag value for 29.97fps
player.dropFrame(dropFrameFlag);
```

### `toTimecode` method

This method lets the user obtain the timecode string from a given absolute time; the method internally uses the frame rate value and the drop frame flag. If the absolute time value is invalid, it returns `null`.

```
// Get the current absolute time from the player
var absoluteTime = player.toPresentationTime(player.currentTime());

// Convert the absolute time into timecode
var timecode = player.toTimecode(absoluteTime);
```

### `fromTimecode` method

This method lets the user obtain an absolute time based on a given timecode string; the method internally uses the frame rate value and the drop frame flag. If the timecode value is invalid, it returns `null`.

```
// Get the absolute time for the timecode
var timecode = "0:01:07:12:20";
var absoluteTime = player.fromTimecode(timecode);

// Seek to the absolute time represented by the timecode
player.currentTime(player.fromPresentationTime(absoluteTime));
```

### `framerateready` event

The calculation and parsing logic are asynchronous operations that start when loading a video source into the player; in order to be notified when the frame rate and time scale values are available, you can register a listener for the `amp.eventName.framerateready` event.

### `framerateerror` event

If there is an error while calculating the frame rate value (for example, the input is an AES encrypted source), the `amp.eventName.framerateerror` event is fired in order to notify the user about the error and that the default configuration values will be used.

### `dropframechanged` event

The `amp.eventName.dropframechanged` event lets the user to get a notification every time the drop frame flag value changes.

# Getting Started
Include the plugin JavaScript file *after* the AMP script in the `<head>` of your html page:

```<script src="amp-frameRateTimecodeCalculator.js"></script>```

Then add a listener for the `amp.eventName.framerateready` event in order to be notified when the frame rate value is available. It's also recommended to add a listner for the `amp.eventName.framerateerror` event in order to be notified if there is an error during the calculation process (meaning that default values in configuration will be used).

```
<script>
    var player = amp('azuremediaplayer', {
        "nativeControlsForTouch": false,
        "plugins": {
            // Enable plugin
            "frameRateTimecodeCalculator": {
                // Optional: default frame rate value to use if calculation fails
                // If not provided, the default value is 30
                "default": 30,
                // Optional: default time scale value to use if client manifest parsing fails
                // If not provided, the default value is 10000000
                "timeScale": 10000000,
                // Optional: Flag to determine whether to use drop frame timecode or not for 29.97fps
                // If not provided, the default value is false (non-drop frame timecode)
                "dropFrame": false
            }
        }
    });

    player.src([{
        src: "//amssamples.streaming.mediaservices.windows.net/91492735-c523-432b-ba01-faba6c2206a2/AzureMediaServicesPromo.ism/manifest",
        type: "application/vnd.ms-sstr+xml"
    }]);

    player.ready(function () {
        // Listen the "framerateready" event to be notified when the frame rate and timecode 
        // calculations are available
        player.addEventListener(amp.eventName.framerateready, function () {
            onFrameRateReady();
        });

        // Listen the "framerateerror" event to be notified if there is an error during the 
        // calculation process and the default frame rate and time scales values is configuation
        // will be used
        player.addEventListener(amp.eventName.framerateerror, function () {
            alert("There was an error calculating the Frame Rate and Time Scale. Using default values in configuration.");

            onFrameRateReady();
        });

        function onFrameRateReady() {
            // Frame rate value available
            var framerate = player.frameRate();
            // Time scale value available
            var timeScale = player.timeScale();

            player.addEventListener(amp.eventName.timeupdate, function () {
                // Convert the player absolute time into timecode
                var timecode = player.toTimecode(player.toPresentationTime(player.currentTime()));
            });

            // Listen the "dropframechanged" event to be notified when the drop frame flag changes
            player.addEventListener(amp.eventName.dropframechanged, function () {
                // Convert the player absolute time into timecode
                var timecode = player.toTimecode(player.toPresentationTime(player.currentTime()));
            });
        }
    });

    // ...

    function onSeekToTimecode() {
        // Convert the timecode into player absolute time
        var timecode = "0:01:27:47:20";
        var absoluteTime = player.fromTimecode(timecode);

        player.currentTime(player.fromPresentationTime(absoluteTime));
    }
</script>
```

See `example.html` for a full example on how to enable and use the plugin.

## Options
Currently supported JSON options: 

```
{
    // Optional: default frame rate value to use if calculation fails
    // If not provided, the default value is 30
    "default": 30,
    // Optional: default time scale value to use if client manifest parsing fails
    // If not provided, the default value is 10000000
    "timeScale": 10000000,
    // Optional: Flag to determine whether to use drop frame timecode or not for 29.97fps
    // If not provided, the default value is false (non-drop frame timecode)
    "dropFrame": false
}
```
