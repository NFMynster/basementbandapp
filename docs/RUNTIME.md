# Runtime and timing

## Processes and networking

```text
React renderer
  ↕ restricted Electron IPC
Electron main: session files and process management
  ↕ local stdin/stdout pipes, framed JSON control messages
C++ JUCE: audio/MIDI devices and VST3 hosting
```

No C# process, .NET runtime or TCP control bridge remains. Installed builds load UI files locally. Development adds a loopback Vite HTTP/WebSocket server for HTML/CSS/JS hot reload only.

Audio samples never travel through JavaScript, JSON, HTTP or TCP. Hardware MIDI performance messages enter JUCE directly. Third-party plugins may have their own networking or activation behavior.

Removing C# reduces process/runtime and control-hop overhead, but does not directly lower device-buffer or plugin latency. No numerical performance improvement is claimed without measurement.

## MIDI and loop takes

MIDI endpoints are per track and independent of the single audio interface. Mark a MIDI track to hear its VST3 instrument live; choose device/channel under Settings → MIDI tracks. Multiple independent audio interfaces are not supported.

MIDI capture supports channel messages up to three bytes, including notes/controllers/pitch bend. SysEx, MIDI clock sync, external MIDI output, piano-roll editing, quantization and tempo-relative region timing are not implemented. Capture is limited to 262,144 events and 20-minute source regions. Overflow raises a dropout warning.

On Stop, MIDI becomes a standard .mid asset with millisecond SMPTE timing. A note held at the end is closed. Until then, unfinished MIDI capture has no crash recovery.

Loop recording always starts at loopStart. Native capture stays continuous across passes while arrangement playback wraps. On Stop, each pass becomes a take window over the source; partial final passes are retained, and the latest is selected. The Take selector changes playback/export without discarding alternatives. There is no automatic comping or undo history.

Count-in is three beats (3, 2, 1) at the current tempo. JUCE generates its clicks and starts capture at the sample boundary; UI polling only displays progress. The metronome runs while transport is playing/recording and is not included in exported stems. Time signature is currently fixed at 4/4.

## Latency compensation

- Audio capture skips the initial reported input-plus-output latency while keeping the region anchored at the recording start.
- MIDI timestamps subtract reported output latency.
- Prerecorded sources can be read ahead: Latency.cpp primes each plugin and reads its source ahead by reported latency, aligning its output with dry tracks for playback/export.
- Start, seek, loop changes, bypass and export re-prime DSP. Reported latency changes are checked during state refresh; this is not seamless live graph reconfiguration. Reported plugin latency is limited to ten seconds.
- Live MIDI cannot be read ahead: the instrument, output buffer and device still add delay. For externally processed guitar/bass, use the interface’s direct monitoring.
- These corrections depend on truthful driver/plugin reports, not hardware loopback calibration. Extra external hardware delays still require measurement. Compensation is not a promise of zero latency.

The native callback still has control-lock contention risks, which are unrelated to the removed C# layer.

## Plugins

The default picker accepts VST3 files; “Choose a bundle folder” and drag-and-drop also handle directory bundles. Use plugins matching the native engine architecture. The provided Windows MT-PowerDrumKit 2.1.5.1 64-bit VST3 was successfully loaded by the JUCE test host; the old folder-only picker was inappropriate for that single-file plugin.

Only one stereo-compatible instrument/effect per track is supported. Plugins run inside the audio process, not a crash-isolated sandbox. A faulty plugin can stop that process; completed recordings remain on disk.
