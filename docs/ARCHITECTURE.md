# Working on Basement Band

The app has three processes. Keep raw audio in JUCE; the other two processes send commands and display state.

| Area                   | Owns                                                               | Entry points                                                  |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| React renderer         | Workspace state, interaction, presentation                         | `ui/App.tsx`, `ui/hooks/useWorkspace.ts`, `ui/components/`    |
| Renderer contract      | Typed commands, results and preload access                         | `ui/models.ts`, `ui/services/desktop.ts`                      |
| Electron shell         | Windows, dialogs, allowed IPC and service lifecycle                | `desktop/main.cjs`, `desktop/ipc.cjs`, `desktop/backend.cjs`  |
| Process transport      | Request IDs, deadlines and child failures                          | `desktop/service-client.cjs`, `backend/Audio/EngineClient.cs` |
| C# application service | Session save/open, validation and working folders                  | `backend/Sessions/`                                           |
| JUCE engine            | Audio callback, recording, devices, plugin hosting and arrangement | `native/Engine.h` and its focused implementation files        |

`native/Main.cpp` only runs the message loop and framed JSON transport. `Commands.cpp` dispatches commands. Disk recording and waveform loading live in `Recording.cpp`; plugin loading is in `PluginHost.cpp`; device and session commands have their own implementation files. The engine owns tracks/plugins and its short control lock. The callback uses a non-blocking lock attempt and reports dropouts; this is still an early audio engine, not a production real-time design.

## Adding behavior

1. Add the renderer command/result to `ui/models.ts`. Use the existing desktop adapter; do not add direct filesystem or process access to React.
2. Allow a user-facing command in `desktop/ipc.cjs`, or use a dedicated dialog handler when a path is needed. Internal commands such as `restore`, `snapshot` and test `pump` are not renderer commands.
3. Implement project/filesystem behavior in the C# session service, and audio behavior in a focused native implementation. Add engine members/declarations in `Engine.h`.
4. Update a focused UI component and the workspace hook. Reuse `Modal` for focus trapping, Escape handling and isolation from transport shortcuts.
5. Extend the integration test for the affected boundary, then build and run the checks below.

Avoid placeholder controls and unreachable protocol operations for future features. Add MIDI, editing and plugin-chain capabilities when their workflows are implemented. The unused move-region command was removed during cleanup; it can return with an actual editing interaction.

## Protocol and lifecycle

Electron sends `{id, op, ...}` to C# and receives `{id, result}` or `{id, error}`. C# serializes native requests and reads `BASEMENT:`-prefixed JSON lines from JUCE. Unframed native/plugin stdout is diagnostic text, so a plugin log line cannot become a command response. Command errors leave the channel usable; a timeout or transport failure invalidates it to prevent a late response from being applied to a different request.

Close the backend at Electron's `will-quit`, after any unsaved-work confirmation. `before-quit` is too early: the user can cancel closing. EOF asks C# to finalize JUCE recording and close the child. UI smoke-test code is isolated in `desktop/smoke.cjs`; it runs only under the explicit test environment flag.

## Export and track interactions

`Rendering.cpp` shares interpolation and VST processing between playback and `Export.cpp`. Export runs while transport is stopped, writes 24-bit stereo WAV at the current session sample rate, ignores cycling, and does not move the playhead. Separate tracks include muted/unsoloed tracks with audio and share a zero-time origin and common end. Mixdown respects mute/solo. A selected-track export only includes that track. Level, pan and bypass are preserved; plug-in tails are capped at 10 seconds. Plug-in latency compensation is not implemented (the same limitation applies to playback). Exports are rendered on the native control thread; polling is paused and export-specific deadlines allow up to 30 minutes. The current export cannot be canceled mid-render.

The Electron export handler validates options and owns the folder picker; renderer code cannot supply an arbitrary export path. Each export creates a new subfolder so earlier exports remain untouched. Failed writes can leave partial files in that new folder. `tests/export.test.mjs` verifies actual samples, alignment, plug-in processing, bypass, mute/solo and non-overwrite behavior. `tests/ipc.test.mjs` guards file-dialog sender validation.

Track headers and lanes expose contextual actions; header double-click and Properties select the Recording inspector. The playhead uses pointer capture and commits release coordinates, independent of React paint timing. Recording terminology is “mark for recording” throughout user-facing controls; the existing `armed` protocol/session field is retained for compatibility.

Future input work should model MIDI endpoints independently from audio-device channels: a USB MIDI drum pad can coexist with an audio interface, but requires MIDI capture and an instrument/drum track. Multiple independent audio interfaces additionally need clock-drift handling or OS aggregation. Neither is implemented in this pass; channel routing remains scoped to the active audio device.

## Session storage

Version 1 `.basement` files contain persistent arrangement values and relative audio paths into the adjacent `.basement.audio` directory. Waveforms and runtime device/transport state are not saved. `SessionDocument` validates IDs, types, bounds and colors before a loaded document reaches filenames, CSS or audio math. Keep existing version-1 documents readable; introduce an explicit migration when the schema changes.

Raw WAV files are retained when arrangement regions are removed. On stop, every recording writer is finalized before loading takes into memory; one failed decode must not leave other WAV headers unfinished. Saving metadata is atomic, but the entire multi-file asset copy is not transactional.

## Checks

```sh
npm run build:all
npm test
npm run check
npm run test:desktop
npm run test:visual
```

`npm run format` formats JS/TS/CSS and documentation. Use `dotnet format whitespace backend/BasementBand.csproj --no-restore` for C# and `clang-format -i native/*.cpp native/*.h` for C++. Unused TypeScript locals and parameters fail compilation.

Integration tests use the real native callback with deterministic samples and the private VST3 test fixture. Shared test-process helpers bound timeouts and shutdown. Test subprocesses never record a physical microphone. `npm run test:desktop` checks the real React → Electron → C# → JUCE path with the simulated device. To check an unpacked build, pass its executable path to `node scripts/smoke.mjs`.

Windows is the validated platform so far. Cross-platform source does not replace testing drivers, permissions, native plugin editors and packaging on macOS/Linux.
