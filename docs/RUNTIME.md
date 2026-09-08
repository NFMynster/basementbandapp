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

MIDI endpoints are per track and independent of the single audio interface. Enable a MIDI track’s headphone (monitor) button to hear its VST3 instrument live, including while stopped; choose device/channel under Settings → MIDI tracks. Multiple independent audio interfaces are not supported.

MIDI capture supports channel messages up to three bytes, including notes/controllers/pitch bend. SysEx, MIDI clock sync, external MIDI output, piano-roll editing, quantization and tempo-relative region timing are not implemented. Capture is limited to 262,144 events and 20-minute source regions. Overflow raises a dropout warning.

On Stop, MIDI becomes a standard .mid asset with millisecond SMPTE timing. A note held at the end is closed. Until then, unfinished MIDI capture has no crash recovery.

Loop recording always starts at loopStart. Native capture stays continuous across passes while arrangement playback wraps. On Stop, each pass becomes a take window over the source; partial final passes are retained, and the latest is selected. The Take selector changes playback/export without discarding alternatives. There is no automatic comping.

Count-in is three beats (3, 2, 1) at the current tempo. JUCE generates its clicks and starts capture at the sample boundary; UI polling only displays progress. The metronome runs while transport is playing/recording and is not included in exported stems. Time signature is currently fixed at 4/4.

## Latency compensation

- Audio capture skips the initial reported input-plus-output latency while keeping the region anchored at the recording start.
- MIDI timestamps subtract reported output latency.
- Prerecorded sources can be read ahead: Latency.cpp primes each plugin and reads its source ahead by reported latency, aligning its output with dry tracks for playback/export.
- Start, seek, loop changes, bypass and export re-prime DSP. Reported latency changes are checked during state refresh; this is not seamless live graph reconfiguration. Reported plugin latency is limited to ten seconds.
- Live MIDI cannot be read ahead: the instrument, output buffer and device still add delay. For externally processed guitar/bass, use the interface’s direct monitoring.
- These corrections depend on truthful driver/plugin reports, not hardware loopback calibration. Extra external hardware delays still require measurement. Compensation is not a promise of zero latency.

The default requested device buffer is 256 samples for live playing (the driver may choose another supported size). Settings offers Live playing (nearest to 256) and Stable mixing (nearest to 1,024); Apply/Done confirms the selection. At 48 kHz these represent 5.3 ms and 21.3 ms per buffer, not total round-trip latency. Lower buffers can increase dropouts with heavy plug-ins. Region UI previews are cached so polling does not rebuild waveforms/notes under the audio lock. Meters refresh every 50 ms with native peak decay to retain short hits; playhead animation extrapolates between engine updates and freezes if updates stall. These display changes do not reduce hardware latency. The native callback still has control-lock contention risks; a larger buffer cannot fix every overloaded plug-in.

Monitoring and recording selection are independent. Audio monitoring defaults off to avoid speaker feedback or doubling hardware direct monitoring; new MIDI tracks default on. Monitoring feeds live input through the track plug-in, volume and pan. Mute/solo also affect monitoring. Arrangement playback remains audible with monitoring off. Master output volume scales playback, monitored input, clicks and merged exports, not captured source files or separate stems.

No external MIDI device is required to load/audition a plug-in using its editor. Keyboard support depends on the plug-in editor itself; the host gives its window focus. Editor clicks are not recorded as MIDI by this implementation. Use an actual MIDI input to capture notes. Count-in temporarily plays only the count clicks.

## Plugins

The default picker accepts VST3 files; “Choose a bundle folder” and drag-and-drop also handle directory bundles. Use plugins matching the native engine architecture. The provided Windows MT-PowerDrumKit 2.1.5.1 64-bit VST3 was successfully loaded by the JUCE test host; the old folder-only picker was inappropriate for that single-file plugin.

Only one stereo-compatible instrument/effect per track is supported. Plugins run inside the audio process, not a crash-isolated sandbox. A faulty plugin can stop that process; completed recordings remain on disk.

## Control defaults and diagnostics

On Windows, startup explicitly requests the system's default multimedia input and output through JUCE's Windows Audio driver. Manual selections still apply for the current run; devices are not switched underneath an active recording. The VST3 picker starts in `/Library/Audio/Plug-Ins/VST3` on macOS and the user's home folder elsewhere.

Master volume defaults to unity at the slider midpoint, with up to 2× gain above it. Final output is clamped to prevent out-of-range samples, not transparently limited: excessive boost can distort. Short loop regions also expose their takes in the arrangement toolbar when selected and in their context menu, independent of zoom.

Status JSON is built outside the audio lock, except for a short timing snapshot and plug-in state capture when saving. Seeking intentionally suspends transport while processors are reset/primed and then resumes; this reset is not reported as a recording dropout. Unexpected callback lock failures during transport and recording-writer/MIDI overflow still raise warnings. This reduces known contention but does not guarantee dropout-free performance with every driver or plug-in.

Loop selection remains visible when disabled; click its upper-ruler range to toggle it, or drag to choose a new range. Region edges trim and extend within the original source without changing source files. Those bounds survive saving/reopening. Loop takes are bounded by their original pass, not the complete multi-pass file. Tiny regions show the resize cursor without floating trim handles.

## Export, recovery and undo

Export opens the destination folder picker directly, then shows a waiting overlay while rendering. Settings → Export and the track inspector's Export tab share a remembered preference for separate 24-bit WAV stems or a merged mix. A single-track export always exports that track. Merged exports respect mute, solo and master gain; separate stems include muted tracks and omit master gain. Exports use the arrangement rather than repeating the loop, exclude metronome clicks and append reported plug-in tails capped at ten seconds.

The desktop service checkpoints completed edits while stopped, on Stop and on normal exit to `Sessions/recovery.json` under Electron's user-data directory. The next launch restores that session even without an explicit Save. Media stays in retained working folders; use Save to create a portable project with its media. Changes made during playback are checkpointed on Stop. A forced shutdown during recording can lose the unfinished take. Unreadable recovery files are preserved with a unique backup name and a warning instead of silently overwritten.

Undo/redo retains up to 30 edits in the running session, including region moves, trims, deletions and recording takes. It requires stopped playback because restoring an arrangement can recreate plug-in instances. History references existing media instead of copying audio; it is not retained across restarts. Plug-in editor parameter changes are not individual undo actions. History snapshots during playback omit live processor-state capture to avoid interrupting DSP.

Delete or Backspace removes the selected region; Ctrl/Cmd + Delete or Backspace asks to remove the entire selected track. Ctrl/Cmd + Z undoes, Ctrl/Cmd + Shift + Z redoes (Ctrl/Cmd + Y also works with the default redo binding). Bindings are editable in Settings. Ctrl-wheel and Chromium trackpad pinch zoom the timeline around the pointer. Dropping audio into the sidebar creates a new track; timeline drops target the lane, and imports smoothly reveal the insertion position.

MIDI tracks do not have an independent audio buffer. The shared device buffer remains 256 samples by default rather than forcing 16 for MIDI. MIDI settings show the active buffer duration, driver-reported output latency and selected track's reported plug-in latency; these are not a measured end-to-end delay. Plug-in editor windows request foreground activation on macOS, and Open editor recreates the editor window without unloading its processor.

Audio input is demand-driven: only an audio track marked for recording or with monitoring enabled keeps it open. MIDI monitoring/capture and arrangement playback alone use output-only operation, retaining the selected audio input for later. Transitions happen while stopped; enabling the first audio input during playback asks the user to stop, and releasing the last one during playback defers closure until Stop. Mixed live audio/MIDI still shares the duplex device clock. MIDI never receives microphone samples, but a duplex driver can affect when the shared callback runs; output-only operation removes that unnecessary dependency for MIDI-only playing without changing buffer size.

On macOS the console helper explicitly creates NSApplication before JUCE initializes its message dispatcher. JUCE's normal application entry point performs this step, but a standalone console main does not. Control messages and plug-in windows remain on the message thread; audio remains on the separate device callback, with no added audio buffering or polling delay. An unexpected event-loop exit fails immediately instead of hanging while joining the stdin reader.
