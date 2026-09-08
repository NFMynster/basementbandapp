# Open-source and paid releases

This project uses **AGPL-3.0-only** for its original code/assets and JUCE 8's
AGPLv3 licensing option. Selling convenient precompiled downloads is allowed.
Payment does not remove recipients' rights to inspect, modify or redistribute
the covered software, including redistribution at no charge.

The full license is in LICENSE. Third-party components keep their own licenses.
In particular JUCE's Windows ASIO SDK is used under GPLv3, combined as allowed
by AGPLv3 section 13; VST3's bundled SDK is MIT.

## Before publishing each binary

1. Tag the exact source revision and retain all patches, the lockfile, build
   scripts and toolchain/platform versions used.
2. Provide the complete corresponding source of that build (including JUCE,
   embedded SDKs, any modifications, and other covered dependencies), plus
   build/install instructions. Place the source download beside the binary,
   accessible without an additional source fee. A link to a changing main
   branch or merely saying “source available” is not sufficient.
3. Run `npm run build:licenses` after building native dependencies. Packaging
   includes the generated notices and license texts; verify they and Electron's
   Chromium notices remain in the final installer/app. Review dependency
   license changes when updating versions.
4. Do not impose an EULA or store restriction that prohibits redistribution,
   modification, or other rights granted by these licenses. Do not bundle
   proprietary plug-ins or drivers without separately reviewing their terms.
5. Publish required installation information where applicable. If remote
   interaction is added later, implement the AGPL section 13 source offer too.

The current packaging scripts prepare binaries and license notices; **they do
not publish a source download or satisfy the release checklist automatically**.
No public repository/download URL has been configured yet.

If you want proprietary binaries, restrictions on redistribution, or a different
license model, obtain a commercial JUCE license and review ASIO and other
dependency terms independently. Buying JUCE alone does not relicense third-party
code or contributions you do not own.

This is implementation guidance, not a legal opinion; review your actual sale,
distribution channel and plug-in model before a paid launch.

Primary references: [JUCE 8.0.12 license](https://github.com/juce-framework/JUCE/blob/8.0.12/LICENSE.md),
[JUCE commercial terms](https://juce.com/legal/juce-8-licence/),
[AGPLv3](https://www.gnu.org/licenses/agpl-3.0.html.en),
[GNU FAQ: selling software](https://www.gnu.org/licenses/gpl-faq.en.html#DoesTheGPLAllowMoney).
