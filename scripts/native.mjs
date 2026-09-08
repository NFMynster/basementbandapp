import { existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
const candidates = [
  "C:/Program Files/Microsoft Visual Studio/18/Community/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe",
  "C:/Program Files/Microsoft Visual Studio/2022/Community/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe",
];
const cmake = process.env.CMAKE || candidates.find(existsSync) || "cmake";
const configuration = process.argv.includes("--debug") ? "Debug" : "Release";
const architecture = process.env.BASEMENT_ARCH || process.arch;
if (process.platform === "win32" && architecture !== "x64")
  throw new Error("Windows builds require x64");
const buildDirectory =
  architecture === process.arch
    ? "build/native"
    : `build/native-${architecture}`;
if (process.argv.includes("--clean")) {
  const result = spawnSync(
    cmake,
    ["--build", buildDirectory, "--config", configuration, "--target", "clean"],
    { stdio: "inherit" },
  );
  process.exit(result.status || 0);
}
for (const args of [
  [
    "-S",
    "native",
    "-B",
    buildDirectory,
    ...(process.platform === "win32"
      ? []
      : ["-DCMAKE_BUILD_TYPE=" + configuration]),
    ...(process.platform === "darwin"
      ? ["-DCMAKE_OSX_ARCHITECTURES=" + architecture]
      : process.platform === "win32" &&
          !existsSync(buildDirectory + "/CMakeCache.txt")
        ? ["-A", "x64"]
        : []),
  ],
  [
    "--build",
    buildDirectory,
    "--config",
    configuration,
    "--parallel",
    "4",
    ...(process.argv.includes("--engine-only")
      ? ["--target", "BasementAudio"]
      : []),
  ],
]) {
  const result = spawnSync(cmake, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const name =
  process.platform === "win32" ? "BasementAudio.exe" : "BasementAudio";
const source = [
  buildDirectory + "/BasementAudio_artefacts/" + configuration + "/",
  buildDirectory + "/BasementAudio_artefacts/",
]
  .map((p) => p + name)
  .find(existsSync);
if (!source) throw new Error("Native executable not found");
mkdirSync("artifacts/native", { recursive: true });
copyFileSync(source, "artifacts/native/" + name);
const pdb = source.replace(/\.exe$/, ".pdb");
if (process.platform === "win32" && existsSync(pdb))
  copyFileSync(pdb, "artifacts/native/BasementAudio.pdb");
else if (process.platform === "win32")
  rmSync("artifacts/native/BasementAudio.pdb", { force: true });
