# Build and debug

## Prerequisites

- Node.js 22.12 or newer, npm and Git. Electron is installed as a local development dependency by `npm ci`; do not install it globally.
- Windows: Visual Studio with **Desktop development with C++**, a Windows SDK and CMake tools. No .NET development workload or runtime is required by this app.
- macOS: run `xcode-select --install`; install CMake 3.22+ and Node (for example `brew install cmake node` with Homebrew). The distribution script targets Apple Silicon; run arm64 Node, not an Intel Node under Rosetta.
- Linux development needs C++20 and JUCE's ALSA, X11, font and OpenGL dependencies. On Debian/Ubuntu: `sudo apt install build-essential cmake git libasound2-dev libx11-dev libxext-dev libxinerama-dev libxrandr-dev libxcursor-dev libfreetype6-dev libfontconfig1-dev libgl1-mesa-dev`. Install Node 22.12+ separately. No Linux installer script is supplied.

From the repository root:

```sh
npm ci
npm run build:all
npm start
```

The first native build downloads JUCE. Subsequent builds are incremental. `npm run dev` starts Vite and Electron using the already-built native engine; rebuild native changes and restart the app. The main window shows a startup overlay while the audio engine connects, then fades into the session. It appears after compilation when Electron starts.

## Visual Studio F5 (Windows)

1. Run `npm ci` once.
2. Open `BasementBand.sln`. It separates **Basement Band Audio** (C++/JUCE) from **Basement Band Desktop** (Electron/React and the F5 launcher). Neither project uses C#.
3. Set **Basement Band Desktop** as startup project and select **Debug | x64**.
4. Press F5. The Desktop project depends on Audio, so Visual Studio first builds JUCE with Debug symbols, then the UI/icons/licenses, and launches Electron. Native compilation remains owned by CMake; the solution does not duplicate its compiler settings.

The Desktop project uses Visual Studio's makefile-project tooling purely to build and launch the app; its `.cjs` files are Electron JavaScript, not C++ source. Solution Explorer groups the desktop runtime, React interface, scripts and documentation separately. No JavaScript-specific Visual Studio workload is required. Clean targets the selected native configuration; the desktop build regenerates its UI output without deleting shared packaging assets.

The first Debug engine build is separate from Release and can take several minutes. F5 initially debugs Electron, **not its JUCE child**. For C++ audio breakpoints, use **Debug → Attach to Process → BasementAudio.exe**, choosing Native code. Debug symbols are copied alongside the engine. Pause the transport before stepping through real-time code. Control requests have a 60-second deadline; long debugger pauses can require restarting the app.

For a native-only workspace, open the `native` folder as a CMake project in Visual Studio. The generated `build/native/BasementAudio.sln` is also available after the command-line native build. Running BasementAudio alone waits for pipe commands; it does not display the desktop UI.

The former .NET launch profile and TCP debug bridge have been removed. No C# build artifacts are packaged or invoked.

Solution Explorer uses explicit file entries and matching `.vcxproj.filters` entries. When adding source files, add them to both files for the relevant project; `npm test` checks that source files are included and each has exactly one valid group. Reload the project if Visual Studio is still displaying cached groups after an update.

## Commands

| Command                                         | Result                                             |
| ----------------------------------------------- | -------------------------------------------------- |
| `npm run build:native`                          | Release JUCE engine and private VST3 test fixtures |
| `npm run build:native -- --debug --engine-only` | Debug engine and symbols                           |
| `npm run build`                                 | Type-check and build UI                            |
| `npm run build:icons`                           | Generate PNG/ICO from the checked-in vector mark   |
| `npm run build:all`                             | Release native engine, icon and UI                 |
| `npm start`                                     | Launch local built app                             |
| `npm run dev`                                   | Launch with UI hot reload                          |
| `npm run package:win`                           | Windows x64 NSIS installer and unpacked app        |
| `npm run package:mac`                           | macOS Apple Silicon DMG                            |
| `npm run package`                               | Unpacked distribution for current host             |
| `npm run release:win -- v0.1.0`                 | Build and upload a Windows draft release           |
| `npm run release:mac -- v0.1.0`                 | Build and upload a macOS draft release             |

## Distribution

Build Windows on Windows and macOS on macOS: JUCE needs the target platform SDK. The scripts reject the wrong host instead of bundling a Windows engine into a Mac app. The macOS script compiles the native engine with `CMAKE_OSX_ARCHITECTURES=arm64` and packages arm64 Electron. Universal/Intel distributions are not supplied.

Output goes to `release/`. The app bundles Electron and JUCE, but no .NET runtime or third-party plug-ins. Users install compatible VST3 plugins separately. The Windows app and installer use the waveform icon; the same mark is used for the tray and macOS packaging.

Windows packages are released unsigned, so users may see Unknown publisher or Microsoft Defender SmartScreen warnings. macOS public releases require Developer ID signing, hardened runtime, notarization, and stapling. Clean-machine release testing covers macOS microphone permissions and plug-in editor behavior, plus Windows trust-warning behavior and Visual C++ runtime dependencies.

Packaged Windows builds update themselves with `electron-updater` (`desktop/updates.cjs`): they read `latest.yml` from the newest published GitHub release of the public repository, download the installer in the background, and install silently on quit or through the footer's **restart to update** (the session is flushed to recovery first). The NSIS installer is named `Basement-Band-Setup-<version>.exe` so the uploaded file matches `latest.yml`; the Windows release script uploads `latest.yml` and the blockmap alongside it. Drafts are invisible to the updater, so testers only receive a release once it is published. macOS and development builds keep the notice that opens the release page.

Each release also carries version-free copies, `Basement-Band-Setup.exe` and `Basement-Band-arm64.dmg`, so the website (separate `basementband-site` repository) can link to `https://github.com/NFMynster/basementbandapp/releases/latest/download/<name>` and always serve the newest published build. Keep these names stable; the site depends on them.

For a release, set the version in `package.json`, commit it, and push an exact
matching tag such as `v0.1.0`. Pushing the tag starts
`.github/workflows/release.yml` on GitHub Actions:

It runs `npm run release:win` for the tag: it checks that the tag matches
`package.json`, runs `npm ci`, check, package and test, and creates the draft
with the installer, `latest.yml`, blockmap, checksums and complete source.

Add the signed macOS build from an Apple Silicon Mac: from a clean checkout of
the same tag, with GitHub CLI authenticated (`gh auth login`) and notarization
credentials such as `APPLE_KEYCHAIN_PROFILE=basement-band-notary`, run
`npm run release:mac -- <tag>`. It verifies Developer ID signing, hardened
runtime and notarization, and adds the DMG to the same draft (it keeps the
source archive already there). Run it before publishing: the scripts refuse to
add files to a published release.

Review the draft and test both packages before publishing it. Re-running the
workflow for a tag fails while the draft already holds the Windows files;
delete the draft (or those files) first. Do not also run `release:win` locally
for a tag the workflow handles.

## Verification

```sh
npm run build:all
npm test
npm run check
npm run test:desktop
npm run test:visual
node scripts/smoke.mjs "release/win-unpacked/Basement Band.exe"
```

The deterministic tests do not use physical audio inputs. Desktop smoke tests exercise actual React → Electron → JUCE commands. Visual tests use a clearly separate synthetic fixture.

To diagnose an installed MIDI instrument without opening its editor:

```sh
node scripts/check-plugin.mjs "C:/path/to/instrument.vst3"
```

This loads third-party executable code in the native test host; use only plugins you trust.

## Startup diagnostics

On macOS the app requests microphone permission before it starts the audio helper. If denied, startup uses output only; MIDI audition/playback remains available. Enable the app (or Electron during development) under **System Settings → Privacy & Security → Microphone** and restart before audio capture. If the OS never prompts, test the built .app and inspect logs; do not assume every timeout is a permissions issue.

Persistent `main.log` includes startup, permission results, helper path, native stderr and operation timeouts. Open it with **Open logs** on the startup error screen or **Quick guide → Open diagnostic logs**.

- macOS: `~/Library/Logs/Basement Band/main.log`
- Windows: app user-data folder under `%APPDATA%`, then `logs/main.log`
- Linux: app user-data folder under `~/.config/`, then `logs/main.log`

Logs rotate on launch at 4 MiB. Review before sharing: driver and plug-in diagnostics can contain local paths/device names. Logs do not intentionally include recordings or command payloads.

If a running Windows app locks `artifacts/native/BasementAudio.exe`, close it before rebuilding/F5. For isolated regression tests, `BASEMENT_NATIVE_TEST` can point to a newly compiled engine; desktop smoke tests honor that override only with their test-device mode enabled. Normal app launches ignore it.

For public signed Mac releases, packaging includes microphone/JIT/third-party-library entitlements for the app and helper. Third-party VST3 code is trusted executable code, not sandboxed. Supply Developer ID credentials and notarize before distribution. See [licensing release checklist](LICENSING.md).

Windows builds apply `native/PatchWasapi.cmake` to the pinned JUCE source. It fixes legacy IEEE float sample decoding and exposes validated shared-mode sample-rate conversion without repeating channel probes at every rate.
