import { buildDesktop, run, runTool } from "./build-tools.mjs";
const platform =
  process.argv[2] || (process.platform === "win32" ? "win" : "mac");
if (!["win", "mac"].includes(platform)) throw new Error("Choose win or mac");
if (process.platform !== (platform === "win" ? "win32" : "darwin"))
  throw new Error(
    "Build Windows on Windows and macOS on macOS: JUCE and plug-in hosting require the native platform SDK.",
  );
const env = {
  ...process.env,
  BASEMENT_ARCH: platform === "mac" ? "arm64" : "x64",
};
run(process.execPath, ["scripts/native.mjs"], env);
buildDesktop(env);
runTool(
  "electron-builder",
  [
    platform === "win" ? "--win" : "--mac",
    platform === "win" ? "nsis" : "dmg",
    platform === "win" ? "--x64" : "--arm64",
  ],
  env,
);
