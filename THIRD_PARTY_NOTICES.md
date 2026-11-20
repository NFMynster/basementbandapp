# Third-party notices

Basement Band — Copyright © 2026 Basement Band contributors.
Original project code and assets are licensed under AGPL-3.0-only; see LICENSE.
No warranty is provided, to the extent permitted by law.

## JUCE 8.0.12

Copyright © Raw Material Software Limited and its licensors.
JUCE is dual-licensed; this project uses the AGPLv3 option, not a commercial
JUCE license. Its unmodified upstream license and dependency list are in
[licenses/JUCE.md](licenses/JUCE.md).

JUCE's embedded libraries retain their individual notices. In particular,
the bundled VST3 SDK uses MIT, while the Windows ASIO SDK is used under its
GPLv3 option (AGPLv3 section 13 permits combining with GPLv3).
No proprietary ASIO or commercial JUCE license is asserted.

## Desktop dependencies

- Tauri and its runtime crates (tauri, wry, tao, the dialog and opener plug-ins and their dependencies): MIT or Apache-2.0.
- The Rust crates linked into the desktop shell (serde, serde_json, tokio, reqwest, uuid, log and their dependencies): mostly MIT and/or Apache-2.0, with some BSD, ISC, Zlib, Unicode-3.0 and MPL-2.0 crates. Each crate's notices are collected under `licenses/rust/`.
- React and React DOM: MIT, Copyright Meta Platforms, Inc. and affiliates.
- Lucide: ISC, with Feather-derived icons under MIT; preserve its full license.
- @tauri-apps/api: MIT or Apache-2.0. npm notices are collected under `licenses/npm/`.
- The app renders with the operating system's webview (Microsoft Edge WebView2 on Windows, WKWebView on macOS), which is not redistributed with it.

Packaging includes a licenses directory generated from the installed npm
packages, the Rust dependency graph (`cargo metadata`) and the JUCE source,
alongside this notice and the complete project license.

## User plug-ins and trademarks

No third-party instruments, effects, samples or ASIO drivers are bundled.
Users install plug-ins separately under the vendors' terms. Compatibility
does not grant rights to redistribute those plug-ins.

JUCE, VST, ASIO, Tauri, WebView2 and other product names belong to their respective
owners. This project is not endorsed by Apple or the named vendors.

## Signalsmith audio processing

Pitch-preserving tempo matching uses [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) and [Signalsmith Linear](https://github.com/Signalsmith-Audio/linear), under the MIT license. The pinned source revisions are in `native/CMakeLists.txt`; upstream license notices are included by `scripts/licenses.mjs`.
