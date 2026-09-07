# Build and debug

## First-time setup on Windows

Install:

- **Visual Studio 2026** with the **.NET desktop development** and **Desktop development with C++** workloads, including a Windows SDK and CMake tools. The backend targets .NET 10.
- **Node.js 22 or newer** with npm on PATH.
- **Git** on PATH so CMake can fetch the pinned JUCE dependency.

Open a terminal in the repository and run:

```powershell
npm ci
npm run build:all
```

This downloads JUCE, compiles the native audio engine and private VST3 test fixture, publishes the C# service, and builds the React UI. Internet access is needed for the initial dependency downloads. No cloud service is used by the app.

## F5 from Visual Studio

1. Open **`BasementBand.sln`**.
2. Use **Debug / Any CPU** and make **BasementBand** the startup project if Visual Studio has not selected it.
3. Select the **Basement Band desktop** launch profile and press **F5**.

Visual Studio runs the actual C# backend with `--desktop`. That process starts the UI development server and Electron, then Electron connects back to the **same debugged process**. It does not create a second backend. Set breakpoints in `Sessions/SessionService.cs`, `Sessions/SessionStore.cs`, or `Audio/EngineClient.cs`; actions in the desktop UI reach those breakpoints. Requests have no desktop timeout in this mode, so you can inspect C# state while paused.

The React UI reloads as you edit it. C# changes use Visual Studio's normal build/debug workflow. C++ changes require `npm run build:native` before relaunching; the native engine is built automatically on F5 only when its executable is missing. The first launch still requires `npm ci`.

Development sessions are written to **`artifacts/dev-sessions`**, separate from sessions in the installed app. Close the app window to let recording writers finalize and the debugger exit normally. Stopping the debugger forcibly can interrupt a take.

The F5 connection binds a random **loopback-only** port and authenticates one client using a per-launch token. This is development IPC, not a web API. Normal packaged launches use process pipes and need no listening port. The UI development server also picks an available local port and reports readiness through IPC, so a leftover server on port 5173 does not block F5.

The equivalent terminal launch is:

```powershell
dotnet run --project backend/BasementBand.csproj --launch-profile "Basement Band desktop"
```

## Normal development and builds

| Command                         | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `dotnet build BasementBand.sln` | Build only the C# project in the solution                     |
| `npm run build:native`          | Rebuild JUCE audio engine and VST3 test fixture               |
| `npm run build:backend`         | Publish a self-contained C# service for the host OS/CPU       |
| `npm run build`                 | Type-check and bundle the UI                                  |
| `npm run build:all`             | Build all three application layers                            |
| `npm run dev`                   | Start UI hot reload and Electron using the published service  |
| `npm start`                     | Run the compiled desktop app                                  |
| `npm run package`               | Build everything and assemble an unpacked app under `release` |

On Windows, launch the unpacked app at **`release/win-unpacked/Basement Band.exe`**. Keep the whole folder together. This is an unsigned development build, not an installer. A clean Windows machine may need the Microsoft Visual C++ x64 runtime; .NET is included in the package.

## Verification

```powershell
npm test
npm run check
npm run test:desktop
npm run test:visual
```

Build first. Tests cover deterministic multichannel recording, looping, VST3 processing/state, session persistence/validation, and process failures. Desktop smoke tests exercise the actual UI-to-native path with a simulated device; they do not record your microphone.

To exercise the F5 launch path headlessly from a terminal:

```powershell
$env:BASEMENT_SMOKE = '1'
$env:BASEMENT_TEST_DEVICE = '1'
dotnet run --project backend/BasementBand.csproj --launch-profile "Basement Band desktop"
Remove-Item Env:BASEMENT_SMOKE
Remove-Item Env:BASEMENT_TEST_DEVICE
```

To test the packaged Windows app:

```powershell
node scripts/smoke.mjs "release/win-unpacked/Basement Band.exe"
```

## Troubleshooting

- **F5 says to run npm ci:** install dependencies from the repository root. Restart Visual Studio after installing Node if its PATH is stale.
- **C++ compiler or SDK missing:** install the Visual Studio C++ workload. `scripts/native.mjs` checks the bundled Visual Studio CMake locations, then CMake on PATH. Set `CMAKE` to a custom executable path if needed.
- **Audio engine binary is locked:** close the desktop app and finish any debug session before rebuilding native code.
- **Audio device unavailable:** use Audio setup to choose the interface and a supported configuration. Driver/hardware compatibility must be tested on the actual interface.
- **UI dev server fails to start:** check Visual Studio's Debug output for the forwarded Node/Vite error. Startup failures distinguish a launcher exit from a connection timeout. Startup deadlines are disabled while the C# debugger is attached, so stepping through initialization does not cancel startup.

## macOS and Linux

Build natively on each target OS and architecture; the Windows binaries are not portable. macOS requires Xcode command-line tools, CMake, .NET 10 and Node. Linux additionally needs the JUCE ALSA/X11/font/OpenGL development packages. `npm run build:all` selects the C# runtime for the current platform. macOS/Linux packaging, device permissions and plugin editor behavior still need validation. Visual Studio F5 instructions above apply to Windows; the `dotnet run` launch mode is also available from a terminal.

See [Architecture](ARCHITECTURE.md) for the module boundaries and extension workflow, and [README](../README.md) for current audio limitations and JUCE licensing.
