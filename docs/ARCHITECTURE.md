# Working on Basement Band

The desktop is React/Electron plus a separate C++/JUCE audio process.

| Area             | Owns                                                     | Entry points                                           |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Renderer         | Presentation, selection, interaction, preferences        | ui/App.tsx, ui/hooks/, ui/components/                  |
| Contract         | Typed commands and limited preload API                   | ui/models.ts, desktop/preload.cjs                      |
| Desktop shell    | Windows, dialogs, sender validation, file drops          | desktop/main.cjs, desktop/ipc.cjs                      |
| Session service  | Serialized commands, recovery, working folders           | desktop/session-service.cjs                            |
| Session storage  | Portable projects, validation and atomic writes          | desktop/session-storage.cjs, desktop/session-files.cjs |
| Session history  | Undo policy and immutable application of history entries | desktop/session-history.cjs                            |
| Native transport | Serialized pipe requests, framing, failure quarantine    | desktop/native-client.cjs, desktop/backend.cjs         |
| JUCE engine      | Devices, MIDI/audio capture, processing and rendering    | native/Engine.h and focused .cpp files                 |

## Extending behavior

1. Extend the typed contract in ui/models.ts.
2. Allow the command in desktop/ipc.cjs or use a dedicated validated handler for paths. Renderer code must not gain arbitrary filesystem or process access.
3. Put portable file operations in session-storage.cjs and ordering/history in SessionService. Route audio commands to their native domain handler.
4. Reuse Modal, TrackIcon, MIDI routing and the central shortcut hook. Avoid separate keyboard listeners for global actions.
5. Add deterministic integration tests and UI checks.

## Renderer coordination

`useWorkspace` coordinates selection, commands, polling and workspace actions. Pure optimistic session previews live in `ui/services/session-updates.ts`; they do not call the desktop bridge, and engine replies remain authoritative. `useConfirmation` owns pending confirmation promises and their cleanup. Panel layout and global shortcuts retain their own hooks. Keep new domain rules outside the workspace coordinator when they can operate on explicit inputs.

TrackInspector owns the panel shell and tabs; TrackRecordingPanel owns recording controls and pan gestures; TrackPluginsPanel owns the plug-in chain and drag ordering.

The renderer uses ordinary React hooks for behavior and components for rendering:

| Change                                                       | Start here                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Arrangement ruler seeking and loop selection                 | ui/hooks/useRulerGesture.ts                                          |
| Export preferences, MIDI choice and export focus restoration | ui/hooks/useExport.ts                                                |
| MIDI note selection, editing, clipboard and audition         | ui/hooks/useMidiEditor.ts                                            |
| MIDI scrolling, zoom, pitch range and playhead gestures      | ui/hooks/useMidiViewport.ts                                          |
| Selection movement and resizing bounds                       | ui/services/midi-note-edits.ts                                       |
| MIDI toolbar or piano-roll appearance                        | ui/components/MidiEditorToolbar.tsx, ui/components/MidiPianoRoll.tsx |

MidiEditor composes these pieces. Editing actions stay in the hook; the toolbar does not manage pending engine requests. Pure note transformations preserve relative timing and pitch intervals and have direct tests. Track/region changes remount the editor via its key in TrackInspector, resetting selection and cancelling an unfinished seek preview.

## Native command routing

Engine::command in native/Commands.cpp routes operations to TrackCommands, PluginCommands, TransportCommands, RegionCommands, SessionCommands, DeviceCommands or TestCommands. Each file owns its command validation and mutations; processing still lives in the existing recording, rendering, MIDI and DSP files. To add an operation, add its route and implementation in the appropriate domain, then extend the renderer contract and IPC allowlist.

Engine retains ownership of processors, devices and shared audio state. Handlers run on the message thread. Callback-visible mutations retain their existing guard scopes; those locks are released before syncAudioInput can restart a device. Test commands remain restricted to the test device. Splitting command files does not add another thread or queue.

## Session storage and desktop checks

SessionService owns the command queue, working folder, undo/redo and recovery ordering. desktop/session-storage.cjs only reads and writes portable projects: saveSession copies media and atomically replaces the document without mutating the supplied snapshot; readSession validates fields and resolves media before engine restore. The service adopts the new working folder only after restore succeeds. desktop/session-files.cjs owns validation and atomic JSON writing.

The desktop smoke entry point owns one Electron lifecycle and invokes named workflows in desktop/smoke/. Workflows are intentionally sequential; explicit return values carry any shared fixtures. Extend the relevant workflow for a UI change and register new workflows in desktop/smoke.cjs. The entry point alone owns app shutdown and failure exit status.

Session documents require CURRENT_SESSION_VERSION and all persisted sound fields. Optional plug-in state remains valid for snapshots that intentionally omit processor state. Keep driver fallbacks: they support current audio devices.

## Protocol and lifecycle

Electron’s SessionService serializes operations so save/open cannot race edits. NativeClient serializes JUCE requests and accepts only BASEMENT:-prefixed JSON replies. Plugin stdout diagnostics are ignored. Command errors leave the connection usable; malformed replies, timeouts and child failures quarantine it so late replies cannot be assigned to another request.

Close the child on Electron will-quit, after unsaved-work confirmation. EOF tells JUCE to finalize recording and exit. A bounded shutdown fallback terminates an unresponsive child. The normal app has no control TCP listener.

The renderer is sandboxed with context isolation and a narrow preload bridge. File-drop paths are derived from actual File objects by Electron webUtils, not arbitrary path strings supplied to the public renderer API. The main handler checks the sender, path type, file extensions and audio/MIDI track compatibility. Imports copy into the working session; new-track import failures remove the just-created empty track while stopped.

## Timing and recording

AudioCallback.cpp owns device-clock metronome/count-in and capture. A count-in crossing block is split at the exact sample boundary. Loop recording retains an unwrapped capture clock while the renderer and arrangement playback wrap through the cycle. On Stop, Recording.cpp finalizes writers, then Editing.cpp creates non-destructive take windows over the shared source file. MIDI takes are serialized in Midi.cpp.

Rendering.cpp chooses the last active overlapping region per track, so playback and WAV export agree with visual stacking. MIDI region transitions send panic messages and chase held notes. Region offsets/lengths are non-destructive; audio buffers are shared across copied regions and take windows, including after restore. Moving a take stack moves all alternatives; splitting creates two independent take stacks. Deleting a selected take promotes another remaining alternative.

The engine uses short control locks. Its callback attempts the lock without blocking and reports dropouts if unavailable. The processing graph is not fully lock-free: plug-in loading, memory allocation and graph changes happen outside the audio callback.

## Session files

Session files use version 4, which adds ordered effect chains. Version 3 sessions still open and are upgraded on save. Persisted fields are validated before restore. Media lives beside the .basement document in its .basement.audio directory with relative paths.

Undo/redo stores before/after snapshots and applies only the region and setting differences owned by an entry to the current session. `session-history.cjs` owns undo eligibility, descriptions, fingerprints and the pure history transformation; `SessionService` owns the stacks, command grouping, engine restore and recovery writes. Track settings, volume, tempo and plug-in changes participate in history. Surviving tracks retain their processors unless the entry requires a plug-in reload; restoring a deleted track loads its saved processors. Recovery saving remains independent of undo.

Shared sources are copied once per save, not once per take. New asset copies have unique names so a failed save does not overwrite the previous document’s media. Metadata is written to a temporary file and renamed. Multi-file copying is not fully transactional: a failed save may leave unused media, which is deliberately not deleted automatically.

Waveforms and MIDI note previews are derived rather than saved. Removing a region never deletes its source media. MIDI capture is held in memory until Stop; unfinished MIDI takes do not have crash recovery.

## Built-in sound and diagnostics

`TrackSound` in `SoundProcessing.h/.cpp` owns starter amp, compressor, room reverb and noise gate settings and DSP. Processors and wet buffers are prepared outside the audio callback. On audio tracks the gate and then the starter amp run before plug-ins; EQ, compressor and reverb complete the track chain. The starter amp is not a configurable effect: `desktop/starter-sounds.cjs` defines factory track presets (Clean guitar, Crunch guitar, Lead guitar, Bass) that pick an amp character alongside EQ and effects, and the Plug-ins tab shows the amp as a slot that can be bypassed or removed. Starter presets keep the track's volume and pan. The amp clips at 4x oversampling (IIR half-band filters, a few samples of uncompensated delay) between per-character input shaping and a filter-based speaker cabinet; the bass character drives only the band above a 250 Hz crossover. `ampCharacter` and `ampBypass` are optional in version 4 sessions; without them there is no amp. Captured source audio is always dry. Settings participate in snapshots, undo, recovery and track presets.

`OutputProtection` applies stereo-linked sample-peak limiting with immediate gain reduction, an 80 ms release and no lookahead or makeup gain. It is shared by playback and audio exports, enabled in new sessions. It does not provide true-peak/inter-sample protection. Audio status reports driver latency plus selected-track plug-in latency, device underruns (when supported), missed processing blocks and recording buffer overruns. Expected export silence is excluded from processing-dropout counts. Diagnostics are runtime readings, not saved session settings.

## Export

Export requires stopped transport. Separate 24-bit stereo WAV stems share zero origin and common end; mixdown respects mute/solo. Only selected takes render. Processing, level, pan and latency correction share the playback renderer. Each active processor contributes up to ten seconds of tail to its chain. Built-in room reverb adds four seconds of tail. The MIDI preference defaults to rendered instrument audio. In notes mode, `MidiExport.cpp` writes a standard MIDI file per MIDI track at 960 ticks per quarter note, with tempo, channels, velocity, visible overlap windows and trimmed notes. A merged export in this mode contains an audio-only mix plus separate MIDI files, all following mute/solo. Separate exports include muted tracks. MIDI files start at session zero and require no instrument. Each export creates a new subfolder, so earlier exports are not overwritten; failures can leave partial files there. Long exports have a 30-minute deadline and no cancellation control.

## Checks

Run npm run build:all, npm test, npm run check, npm run test:desktop and npm run test:visual. The native test fixtures never ship. Use npm run format for JS/TS/CSS/docs, and clang-format for native sources when available. See BUILD.md for F5 and platform packaging details.
