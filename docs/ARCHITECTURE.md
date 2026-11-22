# Working on Basement Band

The desktop is a React UI in the system webview (WebView2 on Windows, WKWebView on macOS), a Rust/Tauri shell, and a separate C++/JUCE audio process. There is no bundled browser and no Node runtime in the app.

| Area             | Owns                                                     | Entry points                                                 |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Renderer         | Presentation, selection, interaction, preferences        | ui/App.tsx, ui/hooks/, ui/components/                        |
| Contract         | Typed commands and the shell bridge                      | ui/models.ts, desktop/commands.json, ui/services/desktop.ts  |
| Desktop shell    | Window, dialogs, file drops, quit with recovery          | desktop/src/main.rs, desktop/src/ipc.rs                      |
| Session service  | Ordered command queue, undo/redo, recovery, folders      | desktop/src/session_service.rs                               |
| Session storage  | Portable projects, validation and atomic writes          | desktop/src/session_storage.rs, desktop/src/session_files.rs |
| Session history  | Undo policy and immutable application of history entries | desktop/src/history.rs                                       |
| Native transport | Serialized pipe requests, framing, failure quarantine    | desktop/src/native_client.rs                                 |
| Sound library    | Plug-in scans, favourites, track presets, starter sounds | desktop/src/plugin_library.rs, desktop/starter-sounds.json   |
| JUCE engine      | Devices, MIDI/audio capture, processing and rendering    | native/Engine.h and focused .cpp files                       |

## Extending behavior

1. Extend the typed contract in ui/models.ts.
2. Register the op in desktop/commands.json with its native domain, sender and policy flags (`undoable`, `edits` for recovery, `gesture` for slider coalescing, `query`). The shell derives its allowlist from that registry (desktop/src/contract.rs); ops that carry paths are `desktop`-only and go through a dedicated handler in desktop/src/ipc.rs that gets its path from a native dialog or drop. Renderer code must not gain arbitrary filesystem or process access.
3. Put portable file operations in session_storage.rs and ordering/history in SessionService. Route audio commands to their native domain handler.
4. Reuse Modal, TrackIcon, MIDI routing and the central shortcut hook. Avoid separate keyboard listeners for global actions.
5. Add deterministic integration tests and UI checks.

## Desktop shell

`desktop/` is a Cargo crate: a library (`basement_desktop`, everything testable without a window), the app binary (`src/main.rs`: Tauri window, commands, dialogs, quit flow) and `session-host`, a test-only binary that exposes SessionService, PluginLibrary and the drop/import handlers over stdin/stdout so `npm test` drives the shipped Rust code with the real engine. It is never bundled: it builds only with the `session-host` Cargo feature, which `tauri build` doesn't enable (Tauri bundles every enabled binary target).

The UI reaches the shell only through `ui/services/desktop.ts`, which calls Tauri commands with `@tauri-apps/api`. The capability in `desktop/capabilities/main.json` grants the window core events and the app's own commands, nothing else: no filesystem, shell or HTTP plug-ins. Commands check that they come from the main window. Session commands are synchronous Tauri commands that queue the request the moment it arrives and reply on a channel, so rapid slider updates keep their order. Native dialogs and updates run in Rust; the CSP is set in `desktop/tauri.conf.json`. The window behaves like an app, not a browser tab: outside `npm run dev` WebView2's own shortcuts (F5/Ctrl+R reload, Ctrl+F find, Ctrl+P print, F7 caret browsing) are off (`disable_browser_shortcuts` in `main.rs`), form autofill is off, and the UI cancels the browser context menu. Installed builds update themselves through the Tauri updater (`desktop/src/auto_update.rs`): the newest published release's `latest.json` names a signed installer (Windows) or app archive (macOS), which downloads in the background and installs after recovery is written, on quit or through "restart to update". Development, smoke runs and builds without the updater's public key show the release-page notice instead (`desktop/src/updates.rs`).

User data (recovery, the Sound library, the remembered device) lives in `com.footstompstudios.basementband` under the platform's app-data folder (`%APPDATA%` on Windows, `~/Library/Application Support` on macOS). Logs go to `logs/main.log` there (macOS: `~/Library/Logs/Basement Band`), rotated at 4 MiB. The engine is a Tauri sidecar next to the app executable; development builds use `artifacts/native`.

Rust code is checked by `cargo fmt --check` and `cargo clippy -D warnings` in `npm run check`, and unit tests run first in `npm test`. White-box tests (gesture coalescing, device restore, storage, history, the pipe client) live next to the code in `desktop/src`; behaviour that needs the engine stays in `tests/*.test.mjs`. `desktop/types.d.ts` types the smoke workflows and the webview test driver; the visual fixture in `scripts/visual-fixture.js` is checked against the same `DesktopApi` the renderer calls.

## File drops and in-app drags

Files dragged in from the desktop arrive as one native Tauri drop event with real paths, not as DOM events. Drop zones opt in with `data-file-drop="audio" | "plugin"` (and `data-file-drop-track`); `ui/services/fileDrop.ts` hands the drop to the innermost zone under the pointer. The shell accepts `drop_files` only for paths from the latest native drop, so the UI cannot name arbitrary files. Because native drops own the drag channel (on Windows they cannot share it with HTML5 drag-and-drop), in-app reordering of tracks and plug-ins uses pointer events through `ui/services/pointerReorder.ts`: a threshold before the drag starts, a following ghost, edge auto-scroll, and cancellation on Escape, blur or pointer cancel. Use it for new reorderable lists instead of `draggable`.

## Renderer coordination

`useWorkspace` only composes the workspace domains in `ui/hooks/workspace/` and wires the cross-domain workflows (new project, shortcuts, recovery notice). Shortcuts that edit or toggle something (split, paste, delete, loop, metronome, undo/redo, save) confirm with a footer notice, and warn when there is nothing to act on:

| Domain hook      | Owns                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| useEngineSession | Session state, `run` (optimistic commands), `task` (busy file work), polling |
| useNotices       | Transient footer notices and their timer                                     |
| useTimeline      | Zoom, scale, arrangement length, bar/beat readout, scroll refs               |
| useSelection     | Selected track, primary and multi-region selection, new-track reveal         |
| useEditing       | Track/region edits with rollback, clipboard, file drops                      |
| useDialogs       | Open dialogs and inspector panel, device list for setup                      |
| useTempoChange   | Tempo edits that wait for a region-matching choice                           |

Components still receive the composed `WorkspaceController`. Put new state in the domain that owns it and pass other domains in explicitly; keep `useWorkspace` to wiring. Pure optimistic session previews live in `ui/services/session-updates.ts`; they do not call the desktop bridge, and engine replies remain authoritative. `useConfirmation` owns pending confirmation promises and their cleanup. Panel layout and global shortcuts retain their own hooks. Keep new domain rules outside the workspace coordinator when they can operate on explicit inputs.

The arrangement is one scroller (`.arrangement-scroll`, the `timelineScroll` ref) holding the track sidebar and the timeline. The sidebar is pinned left, and the ruler, the track title and the playhead rail are pinned with `position: sticky`, so headers and lanes scroll together natively without scroll listeners. Do not split it into synced scrollers again: copying `scrollTop` between them cancels smooth and momentum scrolling and lags a frame. `scrollLeft` maps to timeline pixels as before, but the visible timeline starts right of the sidebar; use `timelineViewport()` from `useTimeline.ts` for its client-space edges and width.

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

## Stylesheets

Each file in `ui/styles/` covers one area: `base` (element defaults and the shared palette tokens), `arrangement`, `shell` (title bar, transport, footer), `dialogs`, `overlays` (toasts, count-in, startup, keyframes), `inspector`, `sound-editors` (EQ, effects, MIDI, region) and `plugins` (chain and starter sounds). Every rule lives in its component's file, and no file relies on loading after another: where two components style the same element (dialog labels over the inspector's routing labels), the winner is expressed with selector specificity, not import order. Use the `:root` tokens in `base.css` (`--accent`, `--tint-NN`, `--shadow`...) for new styles.

## Native command routing

Engine::command in native/Commands.cpp looks each op up in one route table and hands it to TrackCommands, PluginCommands, TransportCommands, RegionCommands, SessionCommands, DeviceCommands or TestCommands. Each file owns its command validation and mutations; processing still lives in the existing recording, rendering, MIDI and DSP files. desktop/commands.json is the single command list: tests/command-contract.test.mjs fails when the native route table or the types in ui/models.ts disagree with it. To add an operation, register it there, add its route and implementation in the appropriate domain, and type it in ui/models.ts if the renderer sends it.

Engine retains ownership of processors, devices and shared audio state. Handlers run on the message thread. Callback-visible mutations retain their existing guard scopes; those locks are released before syncAudioInput can restart a device. Test commands remain restricted to the test device. Splitting command files does not add another thread or queue.

## Session storage and desktop checks

SessionService owns the command queue, working folder, undo/redo and recovery ordering. desktop/src/session_storage.rs only reads and writes portable projects: save_session copies media and atomically replaces the document without mutating the supplied snapshot; read_session validates fields and resolves media before engine restore. The service adopts the new working folder only after restore succeeds. desktop/src/session_files.rs owns validation and atomic JSON writing.

The desktop smoke run (`scripts/smoke.mjs`) starts the built app on the engine's test device and invokes named workflows in desktop/smoke/. Workflows are intentionally sequential; explicit return values carry any shared fixtures. Extend the relevant workflow for a UI change and register new workflows in scripts/smoke.mjs, which alone owns app shutdown and failure exit status.

The smoke and visual runs drive WebView2 over the Chrome DevTools Protocol through `scripts/webview-driver.cjs`, which gives the scripts the window surface they were written against: page scripts, real mouse and key input (Electron's `sendInputEvent` shape), screenshots, injected CSS, resizing and reloads. With `BASEMENT_SMOKE=1` the shell opens the DevTools port, uses a disposable webview profile and smoke user data, keeps timers running while covered, and answers file dialogs from the test (`win.dialogs`) instead of showing them. Smoke-only shell commands (`smoke_request`, `smoke_set_size`, `smoke_dialog`) refuse to run otherwise. Navigate from inside the page (the driver does): navigations started over DevTools skip the shell's bridge script. These runs are Windows-only; macOS's WKWebView has no automation port, so check macOS by hand.

Session documents require CURRENT_SESSION_VERSION and all persisted sound fields. Optional plug-in state remains valid for snapshots that intentionally omit processor state. Keep driver fallbacks: they support current audio devices.

## Protocol and lifecycle

SessionService runs every operation on one worker in arrival order, so save/open cannot race edits. NativeClient serializes JUCE requests and accepts only BASEMENT:-prefixed JSON replies. Plugin stdout diagnostics are logged, not parsed. Command errors leave the connection usable; malformed replies, timeouts and child failures quarantine it so late replies cannot be assigned to another request.

Closing the window, Quit in the macOS menu bar, and Restart all go through one quit flow: stop the transport, write recovery, then end the engine. EOF tells JUCE to finalize recording and exit; a bounded fallback kills an unresponsive child. If recovery cannot be written the user chooses between keeping the app open and quitting without recovery. The normal app has no control TCP listener.

The renderer has no filesystem or process access. Paths reach the engine only from native dialogs or the latest native file drop. The drop handler checks the path type, file extensions and audio/MIDI track compatibility. Imports copy into the working session; new-track import failures remove the just-created empty track while stopped.

## Timing and recording

AudioCallback.cpp owns device-clock metronome/count-in and capture. A count-in crossing block is split at the exact sample boundary. Loop recording retains an unwrapped capture clock while the renderer and arrangement playback wrap through the cycle. On Stop, Recording.cpp finalizes writers, then Editing.cpp creates non-destructive take windows over the shared source file. MIDI takes are serialized in Midi.cpp.

Rendering.cpp chooses the last active overlapping region per track, so playback and WAV export agree with visual stacking. MIDI region transitions send panic messages and chase held notes. Region offsets/lengths are non-destructive; audio buffers are shared across copied regions and take windows, including after restore. Moving a take stack moves all alternatives; splitting creates two independent take stacks. Deleting a selected take promotes another remaining alternative.

The engine uses short control locks. Its callback attempts the lock without blocking and reports dropouts if unavailable. The processing graph is not fully lock-free: plug-in loading, memory allocation and graph changes happen outside the audio callback.

## Session files

Session files use version 4, which adds ordered effect chains; older versions are rejected. Persisted fields are validated before restore. Media lives beside the .basement document in its .basement.audio directory with relative paths.

Undo/redo stores before/after snapshots and applies only the region and setting differences owned by an entry to the current session. `desktop/src/history.rs` owns undo eligibility, descriptions, fingerprints and the pure history transformation; `SessionService` owns the stacks, command grouping, engine restore and recovery writes. Track settings, volume, tempo and plug-in changes participate in history. Surviving tracks retain their processors unless the entry requires a plug-in reload; restoring a deleted track loads its saved processors. Recovery saving remains independent of undo.

Shared sources are copied once per save, not once per take. New asset copies have unique names so a failed save does not overwrite the previous document’s media. Metadata is written to a temporary file and renamed. Multi-file copying is not fully transactional: a failed save may leave unused media, which is deliberately not deleted automatically.

Waveforms and MIDI note previews are derived rather than saved. Removing a region never deletes its source media. MIDI capture is held in memory until Stop; unfinished MIDI takes do not have crash recovery.

## Built-in sound and diagnostics

`TrackSound` in `SoundProcessing.h/.cpp` owns starter amp, compressor, room reverb and noise gate settings and DSP. Processors and wet buffers are prepared outside the audio callback. On audio tracks the gate and then the starter amp run before plug-ins; EQ, compressor and reverb complete the track chain. The starter amp is not a configurable effect: `desktop/starter-sounds.json` defines factory track presets (Clean guitar, Crunch guitar, Lead guitar, Bass) that pick an amp character alongside EQ and effects, and the Plug-ins tab shows the amp as a slot that can be bypassed or removed. Starter presets keep the track's volume and pan. The amp clips at 4x oversampling (IIR half-band filters, a few samples of uncompensated delay) between per-character input shaping and a filter-based speaker cabinet; the bass character drives only the band above a 250 Hz crossover. `ampCharacter` and `ampBypass` are optional in version 4 sessions; without them there is no amp. Captured source audio is always dry. Settings participate in snapshots, undo, recovery and track presets.

`OutputProtection` applies stereo-linked sample-peak limiting with immediate gain reduction, an 80 ms release and no lookahead or makeup gain. It is shared by playback and audio exports, enabled in new sessions. It does not provide true-peak/inter-sample protection. Non-finite samples never leave the engine: `renderTrack` checks the buffer after the built-in amp, after each plug-in and after the built-in chain, and on NaN/inf it silences that block and resets the offending stage, the EQ filters and `TrackSound`, so one broken plug-in cannot latch the whole mix silent. `OutputProtection` zeroes any that still reach the master. The audio thread only sets flags; a one-second message-thread timer in `Engine` logs them (capped at 20 reports), logs device errors, and acts as a watchdog: if an open, running device delivers no callbacks for two seconds (WASAPI can stop without reporting an error), it logs the device and reopens it once. The device in use (type, input/output names, rate, buffer, active channels, latency) is logged on open, configure and input changes. Audio status reports driver latency plus selected-track plug-in latency, device underruns (when supported), missed processing blocks and recording buffer overruns. Expected export silence is excluded from processing-dropout counts. Diagnostics are runtime readings, not saved session settings.

## Export

Export requires stopped transport. Separate 24-bit stereo WAV stems share zero origin and common end; mixdown respects mute/solo. Only selected takes render. Processing, level, pan and latency correction share the playback renderer. Each active processor contributes up to ten seconds of tail to its chain. Built-in room reverb adds four seconds of tail. The MIDI preference defaults to rendered instrument audio. In notes mode, `MidiExport.cpp` writes a standard MIDI file per MIDI track at 960 ticks per quarter note, with tempo, channels, velocity, visible overlap windows and trimmed notes. A merged export in this mode contains an audio-only mix plus separate MIDI files, all following mute/solo. Separate exports include muted tracks. MIDI files start at session zero and require no instrument. Each export creates a new subfolder, so earlier exports are not overwritten; failures can leave partial files there. Long exports have a 30-minute deadline and no cancellation control.

## Checks

Run npm run build:all, npm test, npm run check, npm run test:desktop and npm run test:visual. The native test fixtures never ship. Use npm run format for JS/TS/CSS/docs, and clang-format for native sources when available. See BUILD.md for F5 and platform packaging details.
