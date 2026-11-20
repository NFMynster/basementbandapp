import {
  buildDesktop,
  cargo,
  run,
  runTool,
  withCargo,
} from "./build-tools.mjs";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const configuration = process.argv[2] || "Debug";
const stage = process.argv[3] || "desktop";
if (!["Debug", "Release"].includes(configuration))
  throw new Error("Expected Debug or Release configuration");
if (!["desktop", "native", "clean-native", "clean-desktop"].includes(stage))
  throw new Error("Unknown Visual Studio build stage: " + stage);
// Vite and Cargo replace their own output on each build. Leave packaged and
// shared assets intact when cleaning; the native project owns CMake cleaning.
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
if (stage !== "desktop")
  for (const [executable, args] of nativeCommands) run(executable, args);
else if (configuration === "Release") buildDesktop();
else {
  // Debug: a debug shell (with PDBs for the Visual Studio debugger) that
  // serves the built UI, so F5 needs no dev server.
  run(process.execPath, ["scripts/licenses.mjs"]);
  runTool("typescript", ["--noEmit"], process.env, "tsc");
  runTool("vite", ["build"]);
  run(
    cargo(),
    [
      "build",
      "--manifest-path",
      "desktop/Cargo.toml",
      "--features",
      "custom-protocol",
      "--bins",
    ],
    withCargo(),
  );
}
