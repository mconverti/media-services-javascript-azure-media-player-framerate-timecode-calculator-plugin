(function (mediaPlayer) {
    "use strict";

    mediaPlayer.plugin('frameRateTimecodeCalculator', function (options) {
        var player = this,
            defaultFrameRateValue = (!!options && !isNaN(options.default) && (options.default > 0)) ? options.default : 30,
            defaultTimeScaleValue = (!!options && !isNaN(options.timeScale) && (options.timeScale > 0)) ? options.timeScale : 10000000,
            frameRateValue = 0,
            timeScaleValue = 0,
            dropFrameValue = !!options ? !!options.dropFrame : false,
            EPSILON = 0.00000000000000000000001;

        // External event name to notify when the frame rate value is ready
        mediaPlayer.eventName.framerateready = "framerateready";

        // External event name to notify when the drop frame value is changed
        mediaPlayer.eventName.dropframechanged = "dropframechanged";

        // External event name to notify when the frame rate value was not properly calculated.
        mediaPlayer.eventName.framerateerror = "framerateerror";

        // External methods to add in Player API
        function frameRate(value) {
          if (value === undefined) {
            // Get value
            return (!isNaN(frameRateValue) && (frameRateValue > 0)) ? frameRateValue : defaultFrameRateValue;
          }

          // Set value
          if (frameRateValue !== value && !isNaN(frameRateValue)) {
            frameRateValue = value;
            player.trigger(mediaPlayer.eventName.framerateready);
          }

          return player;
        }

        function timeScale() {
            return (!isNaN(timeScaleValue) && (timeScaleValue > 0)) ? timeScaleValue : defaultTimeScaleValue;
        }

        function dropFrame(value) {
            if (value === undefined) {
                // Get value
                return dropFrameValue;
            }

            // Set value
            if (dropFrameValue !== !!value) {
                dropFrameValue = !!value;
                player.trigger(mediaPlayer.eventName.dropframechanged);
            }

            return player;
        }

        function toTimecode(absoluteTime) {
            if ((typeof absoluteTime !== 'number') || isNaN(absoluteTime) || !isFinite(absoluteTime) || (absoluteTime < 0)) {
                return null;
            }

            var timecode = "";
            var framesPerSecond = frameRate();
            var frameCount = absoluteTimeToFrames(absoluteTime, framesPerSecond);

            if (dropFrame() && (framesPerSecond > 29.97) && (framesPerSecond < 29.98)) {
                // Custom logic for 29.97 drop frame timecodes
                var days = Math.floor((frameCount / 107892) / 24);
                var hours = Math.floor((frameCount / 107892) % 24);
                var minutes = Math.floor(((frameCount + (2 * Math.floor((frameCount - (107892 * hours)) / 1800)) - (2 * Math.floor((frameCount - (107892 * hours)) / 18000)) - (107892 * hours)) / 1800) % 60);
                var seconds = Math.floor(((frameCount - (1798 * minutes) - (2 * Math.floor(minutes / 10)) - (107892 * hours)) / 30) % 60);
                var frames = Math.floor((frameCount - (30 * seconds) - (1798 * minutes) - (2 * Math.floor(minutes / 10)) - (107892 * hours)) % 30);

                timecode = formatTimecode(days, hours, minutes, seconds, frames, true);
            } else {
                // General logic for other timecodes
                var framesPerSecond = normalizeFrameRate(framesPerSecond);
                var framesPerMinute = framesPerSecond * 60;
                var framesPerHour = framesPerMinute * 60;

                var days = Math.floor((frameCount / framesPerHour) / 24);
                var hours = Math.floor((frameCount / framesPerHour) % 24);
                var minutes = Math.floor(((frameCount - (framesPerHour * hours)) / framesPerMinute) % 60);
                var seconds = Math.floor(((frameCount - (framesPerMinute * minutes) - (framesPerHour * hours)) / framesPerSecond) % 60);
                var frames = Math.floor((frameCount - (framesPerSecond * seconds) - (framesPerMinute * minutes) - (framesPerHour * hours)) % framesPerSecond);

                timecode = formatTimecode(days, hours, minutes, seconds, frames, false);
            }

            return timecode;
        }

        function fromTimecode(timecode) {
            if (!timecode || (typeof timecode !== 'string')) {
                return null;
            }

            var timecodeComponents = getTimecodeComponents(timecode);
            if (timecodeComponents.length < 4) {
                return null;
            }

            if (timecodeComponents.length > 5) {
                return null;
            }

            var index = -1;
            var days = timecodeComponents.length > 4 ? parseInt(timecodeComponents[++index]) : 0;
            var hours = parseInt(timecodeComponents[++index]);
            var minutes = parseInt(timecodeComponents[++index]);
            var seconds = parseInt(timecodeComponents[++index]);
            var frames = parseInt(timecodeComponents[++index]);
            var framesPerSecond = frameRate();

            if (isNaN(days) || isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(frames)) {
                return null;
            }

            if ((days < 0) || (hours < 0) || (minutes < 0) || (seconds < 0) || (frames < 0)) {
                return null;
            }

            if ((hours >= 24) || (minutes >= 60) || (seconds >= 60) || (frames >= framesPerSecond)) {
                return null;
            }

            var absoluteTime = 0;

            if (dropFrame() && (framesPerSecond > 29.97) && (framesPerSecond < 29.98)) {
                // Custom logic for 29.97 drop frame timecodes
                var totalFrames = frames + (30 * seconds) + (1798 * minutes) + (2 * Math.floor(minutes / 10)) + (107892 * hours) + (2589408 * days);
                absoluteTime = framesToAbsoluteTime(totalFrames, frameRate());
            } else {
                // General logic for other timecodes
                var framesPerSecond = normalizeFrameRate(framesPerSecond);
                var framesPerMinute = framesPerSecond * 60;
                var framesPerHour = framesPerMinute * 60;
                var totalFrames = frames + (seconds * framesPerSecond) + (minutes * framesPerMinute) + (hours * framesPerHour) + (days * framesPerHour * 24);

                absoluteTime = framesToAbsoluteTime(totalFrames, frameRate());
            }

            return absoluteTime;
        }

        // Internal methods to calculate frame rate and time code
        function calculateFrameRate(videoFragmentDataView, videoFragmentDuration, timescale) {
            var startPosition = 0;

            // Find "moof" box.
            var moofBoxStartPosition = getBoxStartPosition("moof", startPosition, videoFragmentDataView);

            // Find "moof" -> "traf" box.
            var trafBoxStartPosition = getBoxStartPosition("traf", moofBoxStartPosition, videoFragmentDataView);

            // Find "moof" -> "traf" ->  "tfhd" box.
            var tfhdBoxStartPosition = getBoxStartPosition("tfhd", trafBoxStartPosition, videoFragmentDataView);

            // Calculate framerate: if default-sample-duration-present, then return: timescale / default_sample_duration. Otherwise, -1.
            var frameRate = getFrameRateFromTfhdBox(tfhdBoxStartPosition, videoFragmentDataView, timescale);

            if (frameRate <= 0) {
                // if framerate could not be calculated in the "moof" -> "traf" ->  "tfhd" box.
                // Find "moof" -> "traf" ->  "trun" box.
                var trunStartPosition = getBoxStartPosition("trun", trafBoxStartPosition, videoFragmentDataView);

                // Calculate framerate: sample_count / video fragment duration in seconds.
                frameRate = getFrameRateFromTrunBox(trunStartPosition, videoFragmentDataView, videoFragmentDuration / timescale);
            }

            return frameRate;
        };

        function getType(typeString) {
            var c1 = typeString.charCodeAt(0);
            var c2 = typeString.charCodeAt(1);
            var c3 = typeString.charCodeAt(2);
            var c4 = typeString.charCodeAt(3);

            var type = ((((c1 << 0x18) | (c2 << 0x10)) | (c3 << 8)) | c4);

            return type >>> 0;
        };

        // Gets the start position of the box content and its size.
        function getBoxStartPosition(typeString, startPosition, dataView) {
            var uuidBoxType = getType("uuid"),
                boxType = getType(typeString),
                boxStartPosition = startPosition,
                boxSize = 0,
                boxEndPosition = boxStartPosition + boxSize;

            do {
                boxStartPosition = boxEndPosition;

                boxSize = dataView.getUint32(boxStartPosition);
                boxStartPosition += 4;

                boxEndPosition += boxSize;

                var type = dataView.getUint32(boxStartPosition);
                boxStartPosition += 4;

                if (type === uuidBoxType) {
                    boxStartPosition += 16;
                }
            } while ((type !== boxType) && (dataView.byteLength >= boxStartPosition));

            return boxStartPosition;
        };

        // Calculates the framerate our of the "tfhd" box. If default-sample-duration-presen, then return: timescale / default_sample_duration. Otherwise, -1.
        function getFrameRateFromTfhdBox(boxStartPosition, dataView, timescale) {
            var frameRate = -1;
            var defaultSampleDuration = getDefaultSampleDurationFromTfhdBox(boxStartPosition, dataView);

            if (defaultSampleDuration > 0) {
                frameRate = timescale / defaultSampleDuration;
            }

            return frameRate;
        };

        // Calculates the framerate out of the "trun" box: sample_count / video fragment duration in seconds.
        function getFrameRateFromTrunBox(boxStartPosition, dataView, fragmentDurationInSeconds) {
            var boxPosition = boxStartPosition;

            // Skip version and flags.
            boxPosition += 4;

            var sampleCount = dataView.getUint32(boxPosition);

            return sampleCount / fragmentDurationInSeconds;
        };

        function getDefaultSampleDurationFromTfhdBox(boxStartPosition, dataView) {
            var defaultSampleDuration = -1;
            var boxPosition = boxStartPosition;

            var fullbox = dataView.getUint32(boxPosition);
            boxPosition += 4;

            var version = (fullbox >> 0x18) & 0xff;
            var flags = fullbox & 0xffffff;

            // Skip track_ID position.
            boxPosition += 4;

            if ((flags & 1) !== 0) {
                // Skip base_data_offset position.
                boxPosition += 8;
            }

            if ((flags & 2) !== 0) {
                // Skip sample_description_index.
                boxPosition += 4;
            }

            if ((flags & 8) !== 0) {
                defaultSampleDuration = dataView.getUint32(boxPosition);
            }

            return defaultSampleDuration;
        };

        var DebugLog = (function () {
            function DebugLog() {
                this.log = function (message) {
                    console.log(message);
                };
            }
            return DebugLog;
        })();

        var ErrorLog = (function () {
            function ErrorLog() {
                this.manifestError = function (message, id, manifest) {
                    console.error(message);
                };
            }
            return ErrorLog;
        })();

        // Internal methods to calculate SMPTE timecodes
        function formatTimecode(days, hours, minutes, seconds, frames, dropFrame) {
            var framesSeparator = !!dropFrame ? ";" : ":";
            var daysFixed = days.toFixed(0);
            var hoursFixed = hours > 9 ? hours.toFixed(0) : "0" + hours.toFixed(0);
            var minutesFixed = minutes > 9 ? minutes.toFixed(0) : "0" + minutes.toFixed(0);
            var secondsFixed = seconds > 9 ? seconds.toFixed(0) : "0" + seconds.toFixed(0);
            var framesFixed = frames > 9 ? frames.toFixed(0) : "0" + frames.toFixed(0);

            var timecodeFormatted = days > 0 ? daysFixed + ":" : "";
            timecodeFormatted = timecodeFormatted + hoursFixed + ":" + minutesFixed + ":" + secondsFixed + framesSeparator + framesFixed;

            return timecodeFormatted;
        }

        function absoluteTimeToFrames(absoluteTime, frameRate) {
            return Math.floor(frameRate * (absoluteTime + EPSILON));
        }

        function framesToAbsoluteTime(frames, frameRate) {
            return +((frames / frameRate) + EPSILON).toFixed(6) + 0.0000015;
        }

        function normalizeFrameRate(frameRate) {
            if ((frameRate > 23.97) && (frameRate < 23.98)) {
                return 24;
            }

            if ((frameRate > 29.97) && (frameRate < 29.98)) {
                return 30;
            }

            return frameRate;
        }

        function getTimecodeComponents(timecode) {
            var timecodeSplit = timecode.split(";");
            var timecodeComponents = timecodeSplit[0].split(":");

            if (timecodeSplit.length > 1) {
                timecodeComponents.push(timecodeSplit[1]);
            }

            return timecodeComponents;
        }

        // Main function
        player.ready(function () {
            player.frameRate = frameRate;
            player.timeScale = timeScale;
            player.dropFrame = dropFrame;
            player.toTimecode = toTimecode;
            player.fromTimecode = fromTimecode;

            player.addEventListener(amp.eventName.loadedmetadata, function () {
                const manifestExtension = '.ism';
                const streamingUrlComponent = manifestExtension + '/manifest';
                const bandwidthPlaceholder = '$Bandwidth$';
                const timePlaceholder = '$Time$';

                var currentSrc = player.currentSrc();
                var streamingUrlComponentIndex = currentSrc.toLowerCase().lastIndexOf(streamingUrlComponent);
                if (streamingUrlComponentIndex !== -1) {
                    var dashManifestUrl = currentSrc.substring(0, streamingUrlComponentIndex + streamingUrlComponent.length) + '(format=mpd-time-csf)';

                    // Download MPEG-DASH manifest
                    var dashManifestRequest = new XMLHttpRequest();
                    dashManifestRequest.open("GET", dashManifestUrl, true);
                    dashManifestRequest.responseType = "text";
                    dashManifestRequest.onerror = function (error) {
                        console.error("There was an error downloading the '" + dashManifestUrl + "' manifest to calculate the Frame Rate and Time Scale. Using default values.", error);
                        player.trigger(mediaPlayer.eventName.framerateerror);
                    };
                    dashManifestRequest.onload = function () {
                        if (dashManifestRequest.status < 200 || dashManifestRequest.status >= 300) {
                            console.error("There was an error downloading the '" + dashManifestUrl + "' manifest to calculate the Frame Rate and Time Scale. Using default values.");
                            player.trigger(mediaPlayer.eventName.framerateerror);
                            return;
                        }

                        var baseManifestUrl = currentSrc.substring(0, streamingUrlComponentIndex + manifestExtension.length) + '/';

                        var dashParser = Dash.dependencies.DashParser();
                        dashParser.debug = new DebugLog;
                        dashParser.errHandler = new ErrorLog;
                        var manifest = dashParser.parse(dashManifestRequest.response, baseManifestUrl);

                        var videoAdaptationSet = manifest.Period.AdaptationSet.filter(function (adaptationSet) {
                            return (!!adaptationSet.contentType && adaptationSet.contentType.toLowerCase() === 'video') ||
                                (!!adaptationSet.mimeType && adaptationSet.mimeType.toLowerCase() === 'video/mp4');
                        })[0];

                        // TODO: improve the code to select the lowest bandwidth value. 
                        var videoBandwidth = +videoAdaptationSet.Representation_asArray[videoAdaptationSet.Representation_asArray.length - 1].bandwidth;

                        var videoSegmentTemplate = videoAdaptationSet.SegmentTemplate;

                        timeScaleValue = +videoSegmentTemplate.timescale;

                        var relativeVideoFragmentUrlTemplate = videoSegmentTemplate.media;
                        var firstVideoFragment = videoSegmentTemplate.SegmentTimeline.S_asArray[0];
                        var firstVideoFragmentDuration = +firstVideoFragment.d;
                        var firstVideoFragmentStartTime = +(firstVideoFragment.t || 0);

                        var firstVideoFragmentUrl = baseManifestUrl + relativeVideoFragmentUrlTemplate.replace(bandwidthPlaceholder, videoBandwidth).replace(timePlaceholder, firstVideoFragmentStartTime);

                        // Download MPEG-DASH video fragment
                        var firstVideoFragmentRequest = new XMLHttpRequest();
                        firstVideoFragmentRequest.open("GET", firstVideoFragmentUrl, true);
                        firstVideoFragmentRequest.responseType = "arraybuffer";
                        firstVideoFragmentRequest.onerror = function (error) {
                            console.error("There was an error downloading the '" + firstVideoFragmentUrl + "' video fragment to calculate the Frame Rate. Using default value.", error);
                            player.trigger(mediaPlayer.eventName.framerateerror);
                        };
                        firstVideoFragmentRequest.onload = function () {
                            if (firstVideoFragmentRequest.status < 200 || firstVideoFragmentRequest.status >= 300) {
                                console.error("There was an error downloading the '" + firstVideoFragmentUrl + "' video fragment to calculate the Frame Rate. Using default value.");
                                player.trigger(mediaPlayer.eventName.framerateerror);
                                return;
                            }

                            try {
                                var firstVideoFragmentDataView = new DataView(firstVideoFragmentRequest.response);

                                // Calculate frame rate by parsing MPEG-DASH video fragment
                                frameRateValue = calculateFrameRate(firstVideoFragmentDataView, firstVideoFragmentDuration, timeScaleValue);
                                player.trigger(mediaPlayer.eventName.framerateready);
                            } catch (error) {
                                console.warn("There was an error calculating the Frame Rate. Using default value of " + defaultFrameRateValue.toString() + " fps.");
                                player.trigger(mediaPlayer.eventName.framerateerror);
                            }

                            
                        };

                        firstVideoFragmentRequest.send();
                    };

                    dashManifestRequest.send();
                } else {
                    console.error("Unable to calculate Frame Rate and Time Scale for source '" + currentSrc + "'. Using default values.");
                    player.trigger(mediaPlayer.eventName.framerateerror);
                }
            });
        });
    });
}(window.amp));
