# Runtime and timing

## Processes and networking

```text
React UI in the system webview (WebView2 / WKWebView)
  ↕ Tauri commands: the app's own, allowlisted by desktop/commands.json
Rust shell: window, dialogs, session files, undo, recovery, engine process
  ↕ local stdin/stdout pipes, framed JSON control messages
C++ JUCE: audio/MIDI devices and VST3 hosting
```

No browser runtime, Node, .NET or TCP control bridge ships with the app. Installed builds serve the UI from inside the executable. Development adds a loopback Vite HTTP/WebSocket server for HTML/CSS/JS hot reload only.

Once per launch, the shell makes one best-effort request to the public GitHub latest-release endpoint. It sends the app version in its user-agent, shows a small footer link only when a newer semantic version exists, and stays quiet when there is no published release or the network is unavailable. The Quick guide's Feedback action opens a local dialog; choosing Write to me hands a pre-addressed `mailto:` draft to the operating system's default mail client. The app does not send the message itself.

Audio samples never travel through JavaScript, JSON, HTTP or TCP. Hardware MIDI performance messages enter JUCE directly. Third-party plugins may have their own networking or activation behavior.

Replacing Electron with the system webview shrinks the download and the app's memory use, but does not change device-buffer or plugin latency: audio never passed through the UI process. No numerical performance improvement is claimed without measurement.

## MIDI and loop takes

MIDI endpoints are per track and independent of the audio interface. MIDI tracks have no monitor switch: their instrument always runs, so live notes, the plug-in's own pads, preview buttons and start screens are audible, including while stopped. Live MIDI input plays every MIDI track listening to that device and channel (Settings → MIDI tracks); mute a track to stop hearing it, and mark several for recording to capture them together, for example two drum tracks with different kits. The app uses one audio interface at a time.

MIDI capture supports channel messages up to three bytes, including notes/controllers/pitch bend; it excludes SysEx, MIDI clock sync and external MIDI output. The note editor supports drawing, selection, velocity, quantization and tempo matching. Capture is limited to 262,144 events and 20-minute source regions. Overflow raises a dropout warning.

During capture, the arrangement shows live audio peaks and MIDI notes from the in-memory take. On Stop, MIDI becomes a standard .mid asset with millisecond SMPTE timing. A note held at the end is closed. Until then, unfinished MIDI capture has no crash recovery.

Loop recording always starts at loopStart. Native capture stays continuous across passes while arrangement playback wraps. On Stop, each pass becomes a take window over the source; partial final passes are retained, and the latest is selected. The Take selector changes playback/export without discarding alternatives. There is no automatic comping.

Count-in is four beats (4, 3, 2, 1) at the current tempo. JUCE generates its clicks and starts capture at the sample boundary; UI polling only displays progress. The metronome runs while transport is playing/recording and is not included in exported stems. Right-clicking the metronome button opens its menu: click volume, a typed tempo field (as in the transport display) with tap tempo below it (button or T; up to five taps are averaged and the tempo applies 1.5 seconds after the last tap, going through the usual tempo dialog when regions exist) and the click sound (`beep`, `woodblock` or `stick`, synthesized in the callback without allocation; wood block and stick levels are set to at least match the beep's energy over 50 ms, since short clicks otherwise sound quieter at the same volume). The sound also drives count-in clicks; `metronomeSound` is optional in version 4 sessions and defaults to `beep`. Time signature is fixed at 4/4.

## Latency compensation

- Audio capture skips the initial reported input-plus-output latency while keeping the region anchored at the recording start.
- MIDI timestamps subtract reported output latency.
- Prerecorded sources can be read ahead: Latency.cpp primes each plugin and reads its source ahead by reported latency, aligning its output with dry tracks for playback/export.
- Start, seek, loop changes, bypass and export re-prime DSP. Reported latency changes are checked during state refresh; this is not seamless live graph reconfiguration. Reported plugin latency is limited to ten seconds.
- Live MIDI cannot be read ahead: the instrument, output buffer and device still add delay. For externally processed guitar/bass, use the interface’s direct monitoring.
- These corrections depend on truthful driver/plugin reports, not hardware loopback calibration. Extra external hardware delays still require measurement. Compensation is not a promise of zero latency.

The default requested device buffer is 64 samples (the driver may choose another supported size). At 44.1 kHz that gives about 1.45 ms per buffer, versus 0.36 ms at 16 samples. Sixteen is selectable when supported, but gives plug-ins and the audio callback very little processing time. Device, rate and buffer selections apply immediately while stopped; audio setup help is collapsed behind a disclosure. These buffer durations are not total round-trip latency. Region UI previews are cached so polling does not rebuild waveforms/notes under the audio lock. Meters refresh every 50 ms with native peak decay to retain short hits; playhead animation extrapolates between engine updates and freezes if updates stall. These display changes do not reduce hardware latency. The native callback still has control-lock contention risks; a larger buffer cannot fix every overloaded plug-in.

Monitoring and recording selection are independent. Audio monitoring defaults off to avoid speaker feedback or doubling hardware direct monitoring; MIDI tracks are always live (see above). Monitoring feeds live input through the track plug-in, volume and pan. Mute/solo also affect monitoring. Arrangement playback remains audible with monitoring off. Master output volume scales playback, monitored input, clicks and merged exports, not captured source files or separate stems.

No external MIDI device is required to load/audition a plug-in using its editor. Double-clicking a plug-in card (outside its buttons) opens its editor, like Open editor. Keyboard support depends on the plug-in editor itself; the host gives its window focus. Editor clicks are not recorded as MIDI by this implementation. Use an actual MIDI input to capture notes. Count-in temporarily plays only the count clicks.

## Plugins

The default picker accepts VST3 files; “Choose a bundle folder” and drag-and-drop also handle directory bundles. Use plugins matching the native engine architecture.

A MIDI track supports one stereo-compatible instrument followed by up to 16 audio effects. Audio tracks support a primary effect plus up to 16 additional effects. Effects run in the displayed order, with separate editor, bypass and remove controls. Use Add VST3 effect to append; dropping onto a track with a primary plug-in also appends. Stop playback to change the effect chain. Combined active processor latency is limited to ten seconds and compensated during playback/export. Plug-ins run inside the audio process; a faulty plug-in can stop that process, while completed recordings remain on disk.

## Control defaults and diagnostics

On Windows, startup explicitly requests the system's default multimedia input and output through JUCE's Windows Audio driver. Manual selections still apply for the current run; devices are not switched underneath an active recording. The VST3 picker starts in `/Library/Audio/Plug-Ins/VST3` on macOS and the user's home folder elsewhere.

Master volume defaults to unity at the slider midpoint, with up to 2× gain above it. New sessions enable Protect output peaks: stereo-linked limiting keeps sample peaks below full scale without lookahead delay. The Audio status panel and Settings > Export expose its switch. A final clamp remains when protection is off; excessive boost can distort. Short loop regions also expose their takes in the arrangement toolbar when selected and in their context menu, independent of zoom.

Status JSON is built outside the audio lock, except for a short timing snapshot and plug-in state capture when saving. Seeking intentionally suspends transport while processors are reset/primed and then resumes; this reset is not reported as a recording dropout. Unexpected callback lock failures during transport and recording-writer/MIDI overflow still raise warnings. This reduces known contention but does not guarantee dropout-free performance with every driver or plug-in.

Loop selection remains visible when disabled; click its upper-ruler range to toggle it, or drag to choose a new range. Region edges trim and extend within the original source without changing source files. Those bounds survive saving/reopening. Loop takes are bounded by their original pass, not the complete multi-pass file. Tiny regions show the resize cursor without floating trim handles.

## Built-in effects and audio status

EQ & Effects contains the equalizer, compressor amount/attack/release, and reverb amount/room size/damping/stereo width. Damping softens high-frequency reflections; it is not a frequency-calibrated high-cut filter. The Recording tab adds a noise gate for audio tracks, with a threshold slider. All three start bypassed and affect monitoring, playback and audio export; original recordings remain dry and editable. Their settings are saved with the session, track presets and undo history.

Click the footer Audio percentage to see estimated monitoring delay, processing load, separate device/processing/recording interruption counts and output peak status. Reset readings clears these counters; the output-protection switch changes the session. Driver-reported latency is an estimate, not a physical loopback measurement.

## Export, recovery and undo

Session and audio-track export open the destination folder picker directly, then show a waiting overlay. MIDI-track export first offers Instrument audio or MIDI notes. Settings > Export remembers the MIDI preference, defaulting to instrument audio. MIDI notes exports preserve arrangement placement, selected takes, trims, channels and velocities, without requiring a plug-in. With MIDI notes selected, a merged export produces an audio-only mix plus separate .mid files; mute/solo applies to both. Settings > Export has a remembered preference for separate 24-bit WAV stems or a merged mix. A single-track export always exports that track. Merged exports respect mute, solo and master gain; separate stems include muted tracks and omit master gain. Exports use the arrangement rather than repeating the loop, exclude metronome clicks and append reported plug-in tails capped at ten seconds.

The desktop service checkpoints completed edits while stopped, on Stop and on normal exit to `Sessions/recovery.json` in the app's user-data folder (`com.footstompstudios.basementband` under the platform's app-data folder). The next launch restores that session even without an explicit Save. Media stays in retained working folders; use Save to create a portable project with its media. Changes made during playback are checkpointed on Stop. A forced shutdown during recording can lose the unfinished take. Unreadable recovery files are preserved with a unique backup name and a warning instead of silently overwritten.

Undo/redo retains up to 30 edits in the running session, including region moves, trims, fades, volume, MIDI note edits, imports, track creation/deletion, mix/EQ controls, plug-in loading/reordering and track presets. It requires stopped playback because restoring an arrangement can recreate plug-in instances. History references existing media instead of copying audio; it is not retained across restarts. Plug-in editor parameter changes are not individual undo actions. History snapshots during playback omit live processor-state capture to avoid interrupting DSP.

Delete or Backspace removes the selected region; Ctrl/Cmd + Delete or Backspace asks to remove the entire selected track. Ctrl/Cmd + Z undoes, Ctrl/Cmd + Shift + Z redoes (Ctrl/Cmd + Y also works with the default redo binding). Bindings are editable in Settings. Ctrl-wheel and trackpad pinch zoom the timeline around the pointer. Dropping audio into the sidebar creates a new track; timeline drops target the lane, and imports smoothly reveal the insertion position.

MIDI tracks do not have an independent audio buffer. The shared device buffer defaults to 64 samples for both MIDI and audio. MIDI settings show the active buffer duration, driver-reported output latency and selected track's reported plug-in latency; these are not a measured end-to-end delay. Plug-in editor windows request foreground activation on macOS, and Open editor recreates the editor window without unloading its processor.

Audio input is demand-driven: only an audio track marked for recording or with monitoring enabled keeps it open. Launch opens the default output only and remembers the default input by name, so starting the app never turns on the microphone indicator. The device chosen in Settings is remembered in `audio-device.json` in the app's user-data folder (`desktop/src/audio_device.rs`) and reapplied right after the engine starts; if that device is gone it is retried without its input, then the launch default stays. Test devices never read or write it. ASIO is the exception (JUCE reports `hasSeparateInputsAndOutputs() == false`): input and output are one driver instance, so changing its input channels reopens the whole driver and probing it loads a second instance of a usually single-instance driver. The configured ASIO input therefore stays open with the device, and its channel names come from the open device instead of a probe. MIDI monitoring/capture and arrangement playback alone use output-only operation, retaining the selected audio input for later. Transitions happen while stopped; enabling the first audio input during playback asks the user to stop, and releasing the last one during playback defers closure until Stop. Mixed live audio/MIDI still shares the duplex device clock. MIDI never receives microphone samples, but a duplex driver can affect when the shared callback runs; output-only operation removes that unnecessary dependency for MIDI-only playing without changing buffer size.

On macOS the console helper explicitly creates NSApplication before JUCE initializes its message dispatcher. JUCE's normal application entry point performs this step, but a standalone console main does not. Control messages and plug-in windows remain on the message thread; audio remains on the separate device callback, with no added audio buffering or polling delay. An unexpected event-loop exit fails immediately instead of hanging while joining the stdin reader.

## Sound library and MIDI composition

The plug-in library is stored in `sound-library.json` in the app's user-data folder. Scans walk standard VST3 locations or a user-selected folder, cache discovered types by path and modification time, and retain favorites and recent selections. Each uncached bundle is scanned in a separate native process with a 15-second timeout. A failed scan is reported without stopping the session engine. Presets store plug-in paths and state, not copies of installed plug-ins.

MIDI composition edits use copy-on-write source files; other regions sharing the original source are preserved. Batch edits preserve unrelated controller messages and MIDI channels. The editor shows up to 2048 notes, matching the existing preview limit; native quantization processes the full region. Quantization keeps note lengths and leaves notes crossing trimmed boundaries in place. Regions are stored in seconds. Tempo changes offer unchanged timing, matching MIDI only, or matching all recordings. Matching scales region positions, notes, fades and loop points; audio uses offline Signalsmith Stretch to preserve pitch. Prepared media is committed together and Undo restores the previous sources.

Audio clip gain and linear fades apply before track plug-ins, in monitoring-independent playback and export. The three-band track EQ follows the plug-in chain. Hosted processors receive per-block tempo, 4/4 time signature, seconds, samples, PPQ, loop bounds and playing/recording flags. Export reports playing with looping disabled.

Loop recording silences existing regions on armed tracks while other tracks keep playing. Its preview wraps inside the cycle. After a completed pass, a final partial take shorter than 20% of the loop duration (capped at one second) is discarded; a short first attempt is retained. Take selection is available in the Region panel and region badge. Deleting a take region removes its entire group, and undo restores it.

Shift/Ctrl-click toggles region selection. Dragging empty timeline space draws a selection box across tracks. Selected regions move horizontally together on the beat grid, and Delete removes the selection as one undoable edit. Region loop-extension handles also snap to beats.

## macOS separate input and output

When input and output are different CoreAudio devices, the engine first tries a private aggregate device. The output device supplies the clock; input drift correction is enabled. Input numbering is preserved, and the interface's own output channels are skipped so playback reaches the selected speakers. The temporary device is removed when the route closes and is hidden from the app's device list. If creation, channel validation or opening fails, the engine uses JUCE's previous separate-device path. Single-device and output-only routes stay on JUCE's direct path.

The build applies `native/PatchCoreAudio.cmake` to pinned JUCE 8.0.12. The adapter is `native/CoreAudioAggregate.h`. Logs report `private aggregate active` or `using separate-device fallback`, along with the active rate and buffer on success. Set `BASEMENT_COREAUDIO_AGGREGATE=0` before launching to compare against the previous path.

The tuner uses an opaque workspace overlay with Guitar, Bass and Chromatic modes. String labels distinguish low E from octave numbers, including low B on five-string bass. Detection covers 25 Hz upwards; tuning mutes monitoring without changing saved effects. Timeline following eases the viewport into position on playback and seeks, respecting reduced-motion preferences without delaying transport audio.
