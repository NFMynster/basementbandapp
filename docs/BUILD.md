# Build and debug

## Prerequisites

- Node.js 22.12 or newer, npm and Git.
- Rust (stable, via [rustup](https://rustup.rs)) for the desktop shell. The default rustup profile includes `rustfmt` and `clippy`, which `npm run check` uses. The Tauri CLI is a local development dependency installed by `npm ci`.
- Windows: Visual Studio with **Desktop development with C++**, a Windows SDK and CMake tools (Rust links with the same MSVC tools). The app uses the WebView2 runtime that ships with Windows 10 and 11; the installer fetches it on the rare machine without it. No .NET development workload or runtime is required.
- macOS: run `xcode-select --install`; install CMake 3.22+ and Node (for example `brew install cmake node` with Homebrew). The distribution script targets Apple Silicon; run arm64 Node and the arm64 Rust toolchain, not Intel builds under Rosetta. The app uses the system WKWebView.
- Linux development needs C++20 and JUCE's ALSA, X11, font and OpenGL dependencies (on Debian/Ubuntu: `sudo apt install build-essential cmake git libasound2-dev libx11-dev libxext-dev libxinerama-dev libxrandr-dev libxcursor-dev libfreetype6-dev libfontconfig1-dev libgl1-mesa-dev`) plus Tauri's WebKitGTK packages (`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`). Install Node 22.12+ separately. No Linux installer script is supplied.

From the repository root:

```sh
npm ci
npm run build:all
npm start
```

The first native build downloads JUCE and the first desktop build compiles the Rust dependencies; both take a few minutes and are incremental afterwards. `npm run dev` starts Vite and a debug build of the shell that loads it, using the already-built native engine; rebuild native changes and restart the app. The main window shows a startup overlay while the audio engine connects, then fades into the session.

## Visual Studio F5 (Windows)

1. Run `npm ci` once.
2. Open `BasementBand.sln`. It separates **Basement Band Audio** (C++/JUCE) from **Basement Band Desktop** (the Rust shell, the React UI and the F5 launcher). Neither project uses C#.
3. Set **Basement Band Desktop** as startup project and select **Debug | x64**.
4. Press F5. The Desktop project depends on Audio, so Visual Studio first builds JUCE with Debug symbols, then the UI, licenses and a debug build of the shell (with the UI built in, so no dev server is needed), and launches it. Native compilation remains owned by CMake and Cargo; the solution does not duplicate their compiler settings.

The Desktop project uses Visual Studio's makefile-project tooling purely to build and launch the app. Solution Explorer groups the desktop shell (Rust sources, configuration, smoke tests), React interface, scripts and documentation separately. Clean targets the selected native configuration; the desktop build regenerates its own output without deleting shared packaging assets.

F5 debugs the Rust shell with the native debugger (breakpoints in `desktop/src/*.rs` work), **not its JUCE child**. For C++ audio breakpoints, use **Debug → Attach to Process → BasementAudio.exe**, choosing Native code. Debug symbols are copied alongside the engine. Pause the transport before stepping through real-time code. Control requests have a 60-second deadline; long debugger pauses can require restarting the app. To inspect the UI, right-click it in a debug build and choose **Inspect** (WebView2 DevTools).

For a native-only workspace, open the `native` folder as a CMake project in Visual Studio. The generated `build/native/BasementAudio.sln` is also available after the command-line native build. Running BasementAudio alone waits for pipe commands; it does not display the desktop UI.

Solution Explorer uses explicit file entries and matching `.vcxproj.filters` entries. When adding source files, add them to both files for the relevant project; `npm test` checks that source files are included and each has exactly one valid group. Reload the project if Visual Studio is still displaying cached groups after an update.

## Commands

| Command                                         | Result                                                     |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `npm run build:native`                          | Release JUCE engine and private VST3 test fixtures         |
| `npm run build:native -- --debug --engine-only` | Debug engine and symbols                                   |
| `npm run build`                                 | Type-check and build UI                                    |
| `npm run build:desktop`                         | Licenses, UI and the release shell (plus its test host)    |
| `npm run build:icons`                           | Regenerate `desktop/icons` from the vector mark            |
| `npm run build:all`                             | Release native engine and desktop                          |
| `npm start`                                     | Launch the local built app                                 |
| `npm run dev`                                   | Launch with UI hot reload                                  |
| `npm run package:win`                           | Windows x64 NSIS installer in `release/`                   |
| `npm run package:mac`                           | Signed (and notarized, with credentials) Apple Silicon DMG |
| `npm run release:win -- v0.1.0`                 | Build and upload a Windows draft release                   |
| `npm run release:mac -- v0.1.0`                 | Build and upload a macOS draft release                     |

## Distribution

Build Windows on Windows and macOS on macOS: JUCE needs the target platform SDK. The scripts reject the wrong host instead of bundling a Windows engine into a Mac app. The macOS script compiles the native engine with `CMAKE_OSX_ARCHITECTURES=arm64`. Universal/Intel distributions are not supplied.

`scripts/package.mjs` stages the engine as a Tauri sidecar (`build/bundle/BasementAudio-<target triple>`), which lands next to the app executable, adds the generated licenses as resources, and runs `tauri build` (NSIS on Windows, app and DMG on macOS). The app bundles the Rust shell, the React UI and JUCE, but no browser, Node or .NET runtime and no third-party plug-ins. Users install compatible VST3 plug-ins separately. The icons in `desktop/icons/` are checked in and packaging uses them as they are; after changing `desktop/assets/icon.svg`, run `npm run build:icons` and commit the results.

Windows packages are released unsigned, so users may see Unknown publisher or Microsoft Defender SmartScreen warnings. The NSIS installer installs per user.

macOS public releases require Developer ID signing, hardened runtime, notarization, and stapling. The package script signs with the keychain's Developer ID identity (or `APPLE_SIGNING_IDENTITY`). With `APPLE_KEYCHAIN_PROFILE` (a `notarytool` keychain profile) it notarizes and staples the app, then builds, signs, notarizes and staples the DMG itself; with `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` or `APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER` Tauri notarizes during the build. `desktop/entitlements.mac.plist` (microphone, JIT, third-party libraries) applies to the app and the engine sidecar; `desktop/Info.plist` adds the microphone usage text. Clean-machine release testing covers macOS microphone permissions and plug-in editor behavior, plus Windows trust-warning behavior and Visual C++ runtime dependencies.

### Self-updates

Installed Windows and macOS builds update themselves with the Tauri updater (`desktop/src/auto_update.rs`). Once per launch they read `latest.json` from the newest **published** release (`releases/latest/download/latest.json`), download the update in the background, and install it on quit or through the footer's **restart to update** (recovery is written first). Windows installs the new NSIS installer quietly; macOS replaces the app bundle from `Basement-Band-arm64.app.tar.gz`. Drafts are invisible to the updater, so testers only receive a release once it is published. Without the public key, in development and in smoke runs the footer shows the release-page notice instead.

Every update file is signed with the project's updater key (minisign, separate from Apple or Windows code signing) and the app refuses anything else, including an older release offered as newer (`requireSignedVersion`). One-time setup:

1. Generate the key pair on your machine: `npx tauri signer generate -w ~/.tauri/basement-band.key`. Choose a password. Keep the private key file and password safe (a password manager is a good place): losing it means installed apps can no longer be updated, and anyone holding it can ship updates to them.
2. Put the **public** key (the printed text, also in `~/.tauri/basement-band.key.pub`) into `plugins.updater.pubkey` in `desktop/tauri.conf.json` and commit it. Builds made before this commit cannot self-update; testers install the first such build by hand.
3. In the GitHub repository, under **Settings → Secrets and variables → Actions**, add the repository secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of the private key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The release workflow passes them to packaging.
4. On the Mac used for `release:mac`, export the same two variables in that shell (for example `export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/basement-band.key)"`).

The release scripts refuse to run without the public key in the config and the private key in the environment. Each platform's release adds its entry (`windows-x86_64`, `darwin-aarch64`) to the draft's `latest.json`, keeping the other platform's, so the Windows workflow and the Mac script can run in either order. Publish only after both are in, or Mac users will not see that release as an update.

Installers carry no version in their names: `Basement-Band-Setup.exe` and `Basement-Band-arm64.dmg` (copied into `release/` by the package script). The website (separate `basementband-site` repository) links to `https://github.com/NFMynster/basementbandapp/releases/latest/download/<name>` and so always serves the newest published build; keep these names stable. Because a stale installer from an earlier build would look identical, the release scripts only accept files written by the current packaging run.

For a release, set the version in `package.json` (and `desktop/Cargo.toml`), commit it, and push an exact matching tag such as `v0.1.0`. Pushing the tag starts `.github/workflows/release.yml` on GitHub Actions. It runs `npm run release:win` for the tag: it checks that the tag matches `package.json`, runs `npm ci`, check, package and test, and creates the draft with the installer, checksums and complete source, plus the Windows entry in `latest.json`.

Add the signed macOS build from an Apple Silicon Mac: from a clean checkout of the same tag, with GitHub CLI authenticated (`gh auth login`) and notarization credentials such as `APPLE_KEYCHAIN_PROFILE=basement-band-notary`, run `npm run release:mac -- <tag>`. It verifies Developer ID signing, hardened runtime and notarization, and adds the DMG and the update archive to the same draft, plus the macOS entry in `latest.json` (it keeps the source archive already there). Run it before publishing: the scripts refuse to add files to a published release.

Review the draft and test both packages before publishing it. Re-running the workflow for a tag fails while the draft already holds the Windows files; delete the draft (or those files) first. Do not also run `release:win` locally for a tag the workflow handles.

## Verification

```sh
npm run build:all
npm test
npm run check
npm run test:desktop
npm run test:visual
```

`npm test` runs the Rust unit tests, then the Node integration tests, which drive the shipped Rust session layer (`desktop/target/*/session-host`) and the real engine on its test device; they do not use physical audio inputs. `npm run test:desktop` exercises actual React → Rust shell → JUCE commands in the built app; `npm run test:visual` runs the built UI in headless Microsoft Edge against a clearly separate synthetic fixture (`scripts/visual-fixture.js`) in place of the shell, so it needs only `npm run build`. Both speak the DevTools protocol through `scripts/webview-driver.cjs`. The smoke run is Windows only, as macOS's WKWebView has no automation port; macOS gets a manual pass. Set `BASEMENT_APP` to test a different build of the app, or `BASEMENT_BROWSER` to run the visual checks in another Chromium browser.

To diagnose an installed MIDI instrument without opening its editor:

```sh
node scripts/check-plugin.mjs "C:/path/to/instrument.vst3"
```

This loads third-party executable code in the native test host; use only plugins you trust.

## Startup diagnostics

On macOS the app requests microphone permission before it starts the audio helper. If denied, startup uses output only; MIDI audition/playback remains available. Enable Basement Band under **System Settings → Privacy & Security → Microphone** and restart before audio capture. During `npm run dev` the permission belongs to the terminal that started it. If the OS never prompts, test the built .app and inspect logs; do not assume every timeout is a permissions issue.

Persistent `main.log` includes startup, permission results, helper path, native stderr and operation timeouts. Open it with **Open logs** on the startup error screen or **Quick guide → Open diagnostic logs**.

- macOS: `~/Library/Logs/Basement Band/main.log`
- Windows: `%APPDATA%\com.footstompstudios.basementband\logs\main.log`
- Linux: `~/.config/com.footstompstudios.basementband/logs/main.log`

Logs rotate on launch at 4 MiB. Review before sharing: driver and plug-in diagnostics can contain local paths/device names. Logs do not intentionally include recordings or command payloads.

If a running Windows app locks `artifacts/native/BasementAudio.exe`, close it before rebuilding/F5. For isolated regression tests, `BASEMENT_NATIVE_TEST` can point to a newly compiled engine; the app honors that override only with its test-device mode enabled. Normal app launches ignore it.

Third-party VST3 code is trusted executable code, not sandboxed. See [licensing release checklist](LICENSING.md).

Windows builds apply `native/PatchWasapi.cmake` to the pinned JUCE source. It fixes legacy IEEE float sample decoding and exposes validated shared-mode sample-rate conversion without repeating channel probes at every rate.
