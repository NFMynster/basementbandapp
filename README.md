# Basement Band

**A small, local recording room for jamming together.**

https://github.com/user-attachments/assets/befb47b2-9217-4558-a7aa-6ea6bee592dd

Plug in, hit record, play. Multi-track audio and MIDI, loop takes, your own VST3 instruments and effects. React in the system webview with a small Rust (Tauri) shell for the desktop UI, C++/JUCE for the audio engine. No cloud, no logins, no subscription.

Grab a precompiled release - or build it yourself for completely free

## What it is

A simple DAW built around usability. The kind of thing you open when the band is already in the room and nobody wants to spend forty minutes on setup.

- **Multi-track recording.** Arm as many tracks as your interface has inputs and capture the whole take at once.
- **Audio and MIDI side by side.** Load a VST3 instrument on a MIDI track, play it from your controller, record it like any other part.
- **Loop takes.** Loop a section, run it until it's right, then pick the take you liked.
- **Your plug-ins.** Bring your own VST3s. Nothing to buy, nothing to unlock.
- **Everything stays on your disk.** Projects and media live in a folder you choose. Export separate tracks individually or as one mix.
- **Fast to learn.** Pick an input, arm a track, hit record. Usability is the top priority.
- **Lightweight.** No bundled browser: about a 15 MB install that uses around 125 MB of memory and opens in about a second, so your computer's power goes to the audio.

Good for: basement rehearsals, demos, songwriting, capturing an idea before it evaporates.

## What it is not

- **Not a glorified asset browser.** No sample store, no loop marketplace, no carousel of things to buy on the landing screen. It's a recorder.
- **Not a professional mixing and mastering suite.** There is no surround panner, no spectral repair, no 40-band linear-phase anything. Mix the record somewhere else if that's what the record needs.
- **Not a login.** No account, no activation server, no licence check, no subscription that lapses and takes your session with it. It runs fully offline; the only network use is checking GitHub for a newer version, which the app downloads and installs when you close it.
- **Not a dongle host.** Nothing is licensed to a USB stick you'll leave at the rehearsal space.

## Build and run

Install **Node.js 22.12+**, npm, Git and **Rust** (via [rustup](https://rustup.rs)), plus your platform's native tools:

- **Windows x64:** Visual Studio 2022/2026 with **Desktop development with C++**, Windows SDK and **C++ CMake tools for Windows** (or install CMake 3.22+ separately).
- **macOS:** Install Xcode command-line tools with `xcode-select --install`. Install CMake 3.22+ and Node, for example `brew install cmake node` if you use Homebrew. Use a native arm64 Node installation on Apple Silicon.
- **Linux (development):** Install a C++20 compiler, CMake, ALSA, X11, OpenGL and WebKitGTK development libraries. See [platform details](docs/BUILD.md).

Then, in the repository root:

```sh
npm ci
npm run build:all
npm start
```

The app uses the system's own webview (WebView2 on Windows, WKWebView on macOS), so there is no bundled browser. The first build downloads JUCE and compiles the Rust shell, which takes a few minutes. Use `npm run dev` for UI hot reload.

**Windows / Visual Studio:** Open `BasementBand.sln`, choose **Debug | x64**, and press F5. For audio-engine breakpoints, attach the native debugger to `BasementAudio.exe`.

## Package

```sh
npm run package:win  # on Windows: x64 installer
npm run package:mac  # on macOS: Apple Silicon DMG
```

Build on the target OS. Files go to `release/`. Mac distribution requires your
own signing and notarization credentials. [Build, release and troubleshooting details](docs/BUILD.md)

## License

Copyright © 2026 Basement Band contributors. Released under **AGPL-3.0-only**, without warranty. JUCE 8 is used under its **AGPLv3** option. Third-party code retains its own licenses.

See [LICENSE](LICENSE) and the [third-party notices](THIRD_PARTY_NOTICES.md).
