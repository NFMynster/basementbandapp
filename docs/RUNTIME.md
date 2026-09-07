# Runtime, networking and the C# layer

## What carries the sound?

Audio interface → JUCE audio callback → plug-in processing → audio output.

MIDI input → JUCE MIDI collector → instrument in the audio callback → audio output.

Neither path passes through React, Electron IPC, C#, JSON, HTTP or TCP. Those layers carry control commands and UI state, not samples or hardware MIDI performance events. The `testMidi` command exists only with the native `--test-device` flag for deterministic integration tests; it is not a renderer command.

## Ordinary desktop launch

```text
React renderer
  ↕ restricted Electron IPC through the preload bridge
Electron main process
  ↕ child-process stdin/stdout pipes (JSON commands and replies)
C# session service
  ↕ child-process stdin/stdout pipes (framed native replies)
JUCE engine
  ↕ native audio/MIDI drivers and VST3 plug-ins
Hardware
```

Electron loads the built UI from local files. It starts the published C# service, which starts JUCE. There is no app-owned TCP listener, web server or cloud dependency in this launch mode. Third-party plug-ins can have their own activation/network behavior, outside this guarantee.

## F5 from Visual Studio

Visual Studio must own the C# service process to debug it. `backend/Development/DesktopHost.cs` is a development bootstrapper, not an audio or web backend:

1. Locate the repository and check dependencies; build JUCE only if its executable is missing.
2. Open a TCP listener on `127.0.0.1` with an OS-assigned port and generate a 256-bit random authentication token.
3. Start `node scripts/dev.mjs`, passing the port/token through its environment.
4. That script starts Vite, waits for its ready message over Node child-process IPC, then starts Electron with the local UI URL.
5. Electron connects to the already-debugged C# service and sends the token before JSON commands. It does not spawn another C# service.
6. C# starts JUCE using the same pipes as a normal launch. The bootstrap listener closes after the authenticated connection is accepted; the established socket remains until shutdown.

There are two unrelated local network uses:

| Connection                                        | Purpose                                    | Contents                            |
| ------------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| Electron renderer ↔ Vite, loopback HTTP/WebSocket | Development UI and hot reload              | HTML, JS, CSS, reload notifications |
| Electron main ↔ C#, loopback TCP                  | Reach the service owned by the VS debugger | Control commands and state replies  |

Loopback traffic remains on the computer; it is not a cloud call or LAN service. This is raw TCP, not ASP.NET/Kestrel, REST or TLS. The token rejects clients without the startup secret, but is not a security boundary against a compromised local process with access to the environment. The port and token are not hardcoded. Breakpoint-mode command timeouts are disabled so pausing the debugger does not invalidate the connection. JUCE's independent audio process may continue playing while C# is paused; transport commands will wait for the debugger to resume.

`npm run dev` without the VS environment also uses Vite, but Electron starts C# through ordinary pipes. Only the F5 connection needs the extra TCP control link. TCP is convenient here because VS owns the parent process; named pipes or another local IPC mechanism could replace it.

## What C# contributes today

- `SessionStore`: working folders, portable asset copying, relative paths, removal of derived/runtime values from saves, temporary-file/rename metadata saving and missing-media checks on load.
- `SessionDocument`: validation of version, IDs, field types, bounds and colors before values reach filenames and native commands.
- `SessionService`: save/open/new orchestration around native snapshots and restoration.
- `EngineClient`: JUCE child-process lifetime, serialized requests, diagnostic/protocol separation, deadlines, failure quarantine and orderly shutdown.
- `DesktopHost`: the F5 experience above.

These are real application responsibilities, but none needs C# specifically. Most transport/device/plugin commands are forwarded to JUCE, which owns the live session and audio graph. C# currently contributes no DSP, recording callback, MIDI timing or latency-compensation algorithm.

Removing the C# process could reduce startup work, memory, deployment size, JSON serialization and control-command hops. No before/after performance benchmark has been done, so no numerical improvement is claimed. It would not directly reduce audio buffer latency or a plug-in's internal delay because C# is not in that path. UI state polling is currently about 8 Hz; that also affects visible responsiveness independently of the audio engine.

For a lean desktop-only architecture, moving the session services and native-process supervision into typed Electron main-process modules is reasonable. Keeping C# is reasonable if maintaining these responsibilities in C# is worth the extra process/runtime to the owner. A removal would need to preserve the file-validation, portable-save and shutdown tests, and replace the C# F5 workflow. No C# removal is part of the MIDI implementation.

## MIDI and timing implementation

- Add a MIDI track, choose its device/channel in Input settings, load a stereo-output VST3 instrument, then mark it to monitor/record. Instruments are not bundled. One audio interface remains active; MIDI devices are independent of its audio channels.
- MIDI channel messages (notes, controllers, pitch bend, etc.) are captured in a pre-reserved take buffer. SysEx, MIDI clock synchronization and MIDI output are not implemented. Each take is capped at 262,144 events and the supported MIDI-region length is 20 minutes. Capacity overflow raises the existing dropout warning.
- Takes are buffered in memory until Stop and then saved as standard `.mid` assets using millisecond SMPTE timestamps; unfinished MIDI takes do not yet have crash recovery. Regions currently keep absolute timing when project tempo changes, like audio regions. A piano roll, quantization, tempo-relative editing and full controller-state chasing are not implemented. The overview displays at most 2,048 notes per region; playback retains the full event sequence.
- Audio-only saves remain version 1. Sessions with MIDI use version 2; the app reads both. MIDI preview notes are regenerated on load, not duplicated in session metadata.
- JUCE reports plug-in latency; `Latency.cpp` primes each processor and reads prerecorded regions ahead by that latency. This aligns rendered audio and MIDI regions without delaying the dry tracks. Playback start, seek, loop configuration, bypass and export re-prime processors. Reported latency changes are detected on control-state refresh and re-prime the affected track; this is not a glitch-free live graph reconfiguration. Supported reported latency is at most ten seconds. Live MIDI cannot be read ahead and still incurs its instrument/device latency.
- Audio takes discard the initial input-plus-output latency in samples while keeping the region at the recording cursor. MIDI take timestamps subtract the reported output latency. These are driver-reported corrections, not hardware loopback calibration: inaccurate drivers or extra external hardware delay can still need calibration. Recording remains a non-cycling take; loop playback resumes afterwards.
- Compensation does not make monitoring instantaneous. Device buffer size and instrument processing still determine the delay a performer hears. The early engine still has short control locks; removing C# alone does not fix native callback contention.

Reference: [JUCE plug-in latency](https://docs.juce.com/master/classjuce_1_1AudioProcessor.html), [MIDI collector timing](https://docs.juce.com/master/classjuce_1_1MidiMessageCollector.html), [MIDI file time formats](https://docs.juce.com/master/classjuce_1_1MidiFile.html).
