# Basement Band

A local, cross-platform recording room for jamming together. React/TypeScript provides the desktop UI, Electron owns session files, and C++/JUCE handles audio, MIDI and VST3 hosting. No C# or .NET runtime is used.

## Run

```sh
npm ci
npm run build:all
npm start
```

Use `npm run dev` for UI hot reload. On Windows, open [BasementBand.sln](BasementBand.sln), set **Basement Band Desktop** as startup project, select x64, and press F5. This is now a C++ makefile/desktop-launch project; attach the native debugger to BasementAudio.exe for audio-engine breakpoints. See [Build and debugging](docs/BUILD.md).

## Make a recording

1. Open Settings → Audio inputs & output. Choose your interface and output, assign separate channels to audio tracks, then click Done.
2. Use **+ Add track** to choose Audio or MIDI instrument. MIDI pads/keyboards are selected per MIDI track under Settings → MIDI tracks, separately from the audio driver.
3. Load your VST3 instrument for MIDI sound. Choose a .vst3 file, choose a bundle folder, or drop it on the Plug-ins inspector. On Windows use 64-bit plugins; the Apple Silicon build requires compatible arm64 plugins.
4. Mark each track you want to record with its R button. Press the red transport button to capture them together. Enable **123** for a three-beat count-in and the metronome button for playback/recording clicks.
5. Drag the ruler’s upper strip to select a loop; its lower tick-mark strip moves the playhead. Recording with a loop starts at its beginning. On Stop, use the region’s Take selector to choose a pass.
6. Drag regions to move them, including between matching track types. Right-click a region for split/copy/paste/delete. Split happens at the playhead; paste uses the selected track and playhead. The last moved region plays on top of overlaps. Earlier media remains intact.
7. Save to keep the project and its adjacent media folder together. Export next to New/Open/Save defaults to separate aligned WAV stems; choose a mix when wanted.

Drop audio/MIDI from Explorer or Finder onto a matching track to import it, or empty arrangement space to create a track named after the file. Double-click a track for properties; change its color/icon in Recording. Right-click tracks for properties, deletion and export.

Default shortcuts: Space play/stop, R record/stop, L loop, M metronome, Enter return to start, Ctrl/Cmd+S save, Ctrl/Cmd+T split, Ctrl/Cmd+C/V copy/paste, Delete remove region. Rebind in Settings → Keyboard shortcuts. The welcome dialog appears once per app launch, not whenever tracks are deleted; “Don’t show again” disables it on this computer.

## Build applications

```sh
npm run package:win
npm run package:mac
```

Run the Windows command on Windows for an x64 installer; run the macOS command on macOS for an Apple Silicon DMG. Output is in `release/`. Signing/notarization credentials are not included. Windows has been tested here; macOS still requires native build and device validation.

## Checks and limitations

```sh
npm test
npm run check
npm run test:desktop
npm run test:visual
```

Build first. Tests exercise the native callback using simulated inputs, not a physical microphone. Private VST3 test fixtures are not distributed.

This is an early DAW: one audio interface, up to 32 tracks, one plug-in per track, no undo/redo, piano roll, quantization, time stretching or plug-in crash isolation. Audio assets and MIDI source recordings are limited to 20 minutes; MIDI capture holds at most 262,144 channel events until Stop. Short partial loop passes are retained as takes and the latest pass is selected. No automatic comping is performed.

Device-reported capture correction and plug-in latency compensation are implemented, but live monitoring still has hardware/buffer/plug-in latency. Direct monitoring is best for external guitar/bass sounds. No amps, effects or instrument samples are bundled. See [Runtime and timing](docs/RUNTIME.md) and [Architecture](docs/ARCHITECTURE.md).
