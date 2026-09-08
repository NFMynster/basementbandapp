# Working on Basement Band

The desktop is React/Electron plus a separate C++/JUCE audio process. C# has been removed.

| Area             | Owns                                                  | Entry points                                   |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Renderer         | Presentation, selection, interaction, preferences     | ui/App.tsx, ui/hooks/, ui/components/          |
| Contract         | Typed commands and limited preload API                | ui/models.ts, desktop/preload.cjs              |
| Desktop shell    | Windows, dialogs, sender validation, file drops       | desktop/main.cjs, desktop/ipc.cjs              |
| Session service  | Validation, portable saves, working folders           | desktop/session-service.cjs                    |
| Native transport | Serialized pipe requests, framing, failure quarantine | desktop/native-client.cjs, desktop/backend.cjs |
| JUCE engine      | Devices, MIDI/audio capture, processing and rendering | native/Engine.h and focused .cpp files         |

## Extending behavior

1. Extend the typed contract in ui/models.ts.
2. Allow the command in desktop/ipc.cjs or use a dedicated validated handler for paths. Renderer code must not gain arbitrary filesystem or process access.
3. Put filesystem/session behavior in the Electron session service; put audio behavior in a focused native file.
4. Reuse Modal, TrackIcon, MIDI routing and the central shortcut hook. Avoid separate keyboard listeners for global actions.
5. Add deterministic integration tests and UI checks.

## Protocol and lifecycle

Electron’s SessionService serializes operations so save/open cannot race edits. NativeClient serializes JUCE requests and accepts only BASEMENT:-prefixed JSON replies. Plugin stdout diagnostics are ignored. Command errors leave the connection usable; malformed replies, timeouts and child failures quarantine it so late replies cannot be assigned to another request.

Close the child on Electron will-quit, after unsaved-work confirmation. EOF tells JUCE to finalize recording and exit. A bounded shutdown fallback terminates an unresponsive child. The normal app has no control TCP listener.

The renderer is sandboxed with context isolation and a narrow preload bridge. File-drop paths are derived from actual File objects by Electron webUtils, not arbitrary path strings supplied to the public renderer API. The main handler checks the sender, path type, file extensions and audio/MIDI track compatibility. Imports copy into the working session; new-track import failures remove the just-created empty track while stopped.

## Timing and recording

AudioCallback.cpp owns device-clock metronome/count-in and capture. A count-in crossing block is split at the exact sample boundary. Loop recording retains an unwrapped capture clock while the renderer and arrangement playback wrap through the cycle. On Stop, Recording.cpp finalizes writers, then Editing.cpp creates non-destructive take windows over the shared source file. MIDI takes are serialized in Midi.cpp.

Rendering.cpp chooses the last active overlapping region per track, so playback and WAV export agree with visual stacking. MIDI region transitions send panic messages and chase held notes. Region offsets/lengths are non-destructive; audio buffers are shared across copied regions and take windows, including after restore. Moving a take stack moves all alternatives; splitting creates two independent take stacks. Deleting a selected take promotes another remaining alternative.

The engine uses short control locks. Its callback attempts the lock without blocking and reports dropouts if unavailable. This remains an early real-time implementation; plug-in loading, memory allocation and graph changes are not a production lock-free engine.

## Session files

Session files use the current version 3 format. Persisted fields are validated before restore. Media lives beside the .basement document in its .basement.audio directory with relative paths.

Shared sources are copied once per save, not once per take. New asset copies have unique names so a failed save does not overwrite the previous document’s media. Metadata is written to a temporary file and renamed. Multi-file copying is not fully transactional: a failed save may leave unused media, which is deliberately not deleted automatically.

Waveforms and MIDI note previews are derived rather than saved. Removing a region never deletes its source media. MIDI capture is held in memory until Stop; unfinished MIDI takes do not have crash recovery.

## Export

Export requires stopped transport. Separate 24-bit stereo WAV stems share zero origin and common end; mixdown respects mute/solo. Only selected takes render. Processing, level, pan and latency correction share the playback renderer. Plugin tails are capped at ten seconds. Each export creates a new subfolder, so earlier exports are not overwritten; failures can leave partial files there. Long exports have a 30-minute deadline and cannot currently be canceled.

## Checks

Run npm run build:all, npm test, npm run check, npm run test:desktop and npm run test:visual. The native test fixtures never ship. Use npm run format for JS/TS/CSS/docs, and clang-format for native sources when available. See BUILD.md for F5 and platform packaging details.
