import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const candidates = [
  "C:/Program Files/Microsoft Visual Studio/18/Community/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe",
  "C:/Program Files/Microsoft Visual Studio/2022/Community/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe",
];
const cmake = process.env.CMAKE || candidates.find(existsSync) || "cmake";
for (const args of [
  ["-S", "native", "-B", "build/native", "-DCMAKE_BUILD_TYPE=Release"],
  ["--build", "build/native", "--config", "Release", "--parallel", "4"],
]) {
  const result = spawnSync(cmake, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const name =
  process.platform === "win32" ? "BasementAudio.exe" : "BasementAudio";
const source = [
  "build/native/BasementAudio_artefacts/Release/",
  "build/native/BasementAudio_artefacts/",
]
  .map((p) => p + name)
  .find(existsSync);
if (!source) throw new Error("Native executable not found");
mkdirSync("artifacts/native", { recursive: true });
copyFileSync(source, "artifacts/native/" + name);
