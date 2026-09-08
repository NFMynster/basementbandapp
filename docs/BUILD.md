# Build and debug

## Prerequisites

- Node.js 22 or newer, npm and Git.
- Windows: Visual Studio with **Desktop development with C++**, a Windows SDK and CMake tools. No .NET development workload or runtime is required by this app.
- macOS: Xcode command-line tools and CMake. The distribution script targets Apple Silicon.
- Linux development additionally needs JUCE’s ALSA, X11, font and OpenGL development packages; no Linux installer script is supplied.

From the repository root:

```sh
npm ci
npm run build:all
npm start
```

The first native build downloads JUCE. Subsequent builds are incremental. `npm run dev` starts Vite and Electron using the already-built native engine; rebuild native changes and restart the app. The splash appears once Electron starts, not during compilation.

## Visual Studio F5 (Windows)

1. Run `npm ci` once.
2. Open `BasementBand.sln`. It contains a C++ makefile project, not the removed C# backend.
3. Set **Basement Band Desktop** as startup project and select **Debug | x64**.
4. Press F5. The project invokes `scripts/vs-build.mjs`, builds JUCE with Debug symbols plus the UI/icon, and launches Electron.

The first Debug engine build is separate from Release and can take several minutes. F5 initially debugs Electron, **not its JUCE child**. For C++ audio breakpoints, use **Debug → Attach to Process → BasementAudio.exe**, choosing Native code. Debug symbols are copied alongside the engine. Pause the transport before stepping through real-time code. Control requests have a 60-second deadline; long debugger pauses can require restarting the app.

For a native-only workspace, open the `native` folder as a CMake project in Visual Studio. The generated `build/native/BasementAudio.sln` is also available after the command-line native build. Running BasementAudio alone waits for pipe commands; it does not display the desktop UI.

The former .NET launch profile and TCP debug bridge have been removed. No C# build artifacts are packaged or invoked.

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

## Distribution

Build Windows on Windows and macOS on macOS: JUCE needs the target platform SDK. The scripts reject the wrong host instead of bundling a Windows engine into a Mac app. The macOS script compiles the native engine with `CMAKE_OSX_ARCHITECTURES=arm64` and packages arm64 Electron. Universal/Intel distributions are not supplied.

Output goes to `release/`. The app bundles Electron and JUCE, but no .NET runtime or third-party plug-ins. Users install compatible VST3 plugins separately. The Windows app and installer use the waveform icon; the same mark is used for the tray and macOS packaging.

No signing/notarization credentials are configured. Supply your own electron-builder signing configuration for public distribution; OS trust warnings are otherwise expected. macOS microphone permissions and plug-in editor behavior must still be checked on a Mac. Test Windows on a clean machine for Visual C++ runtime dependencies before public release.

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
