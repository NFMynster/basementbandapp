import { buildDesktop, run } from "./build-tools.mjs";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const configuration = process.argv[2] || "Debug";
const stage = process.argv[3] || "desktop";
if (!["Debug", "Release"].includes(configuration))
  throw new Error("Expected Debug or Release configuration");
if (!["desktop", "native", "clean-native", "clean-desktop"].includes(stage))
  throw new Error("Unknown Visual Studio build stage: " + stage);
// Vite replaces its generated output on each build. Leave packaged/shared assets
// intact when cleaning the launcher; the native project owns CMake cleaning.
if (stage === "clean-desktop") process.exit(0);
const nativeCommands = [
  [
    process.execPath,
    [
      "scripts/native.mjs",
      ...(configuration === "Debug" ? ["--debug"] : []),
      ...(stage === "clean-native" ? ["--clean"] : []),
      "--engine-only",
    ],
  ],
];
if (stage === "desktop") buildDesktop();
else for (const [executable, args] of nativeCommands) run(executable, args);
