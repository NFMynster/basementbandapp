# Basement Band

A small, local recording room for jamming together. Record audio and MIDI tracks, loop takes, and bring your own VST3 instruments/effects. React + Electron for the desktop UI; C++/JUCE for audio. No cloud, C# or .NET runtime.

## Build and run

Install **Node.js 22.12+**, npm and Git, plus your platform's native tools:

- **Windows x64:** Visual Studio 2022/2026 with **Desktop development with C++**, Windows SDK and **C++ CMake tools for Windows** (or install CMake 3.22+ separately).
- **macOS:** Install Xcode command-line tools with `xcode-select --install`. Install CMake 3.22+ and Node, for example `brew install cmake node` if you use Homebrew. Use a native arm64 Node installation on Apple Silicon.
- **Linux (development):** Install a C++20 compiler, CMake, ALSA, X11 and OpenGL development libraries. See [platform details](docs/BUILD.md).

Then, in the repository root:

```sh
npm ci
npm run build:all
npm start
```

**Electron is installed locally by `npm ci`**; no separate global Electron install is needed. The first build downloads JUCE and takes a few minutes. Use `npm run dev` for UI hot reload.

**Windows / Visual Studio:** Open `BasementBand.sln`, choose **Debug | x64**, and press F5. For audio-engine breakpoints, attach the native debugger to `BasementAudio.exe`.

## Package

```sh
npm run package:win  # on Windows: x64 installer
npm run package:mac  # on macOS: Apple Silicon DMG
```

Build on the target OS. Files go to `release/`. Signing/notarization needs your own credentials; Mac hardware and permissions still need platform validation. [Build, debugging and troubleshooting](docs/BUILD.md)

## First recording

1. In **Input settings**, choose your audio interface/output and each track's input channel. Click **Done**.
2. Use **+** to choose Audio or MIDI. A MIDI track needs a VST3 instrument for sound; external MIDI hardware is optional for plug-in preview.
3. The headphone button enables live monitoring. Use headphones to avoid feedback; leave it off when using your interface's direct monitoring. **R** marks tracks for simultaneous recording.
4. Drag the ruler's top half to loop; bottom half to seek. Loop recording keeps selectable takes. **123** enables count-in.
5. Right-click regions to edit, or the timeline to add an audio file at that position. **Save** preserves the project/media; **Export** makes separate stems or one mix.

Output volume affects listening, not exported files. Plug-in editor pad clicks are preview only; record MIDI using a MIDI input. This is an early DAW: one audio interface, one plug-in per track, no undo or piano roll yet. [Timing and limitations](docs/RUNTIME.md)

## Logs and checks

If startup fails, click **Open logs**. It is also in **Quick guide**. On Mac: `~/Library/Logs/Basement Band/main.log`. Allow microphone access in **System Settings → Privacy & Security → Microphone**, then restart.

After building: `npm test`, `npm run check`, `npm run test:desktop`.

## License

Copyright © 2026 Basement Band contributors. Released under **AGPL-3.0-only**, without warranty. JUCE 8 is used under its **AGPLv3** option. Third-party code retains its own licenses.

You may sell precompiled binaries, but recipients retain source, modification and redistribution rights. Provide the matching complete source and build instructions alongside every download. See [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md) and the [release licensing checklist](docs/LICENSING.md) before distributing.
