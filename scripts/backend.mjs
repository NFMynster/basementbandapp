import { spawnSync } from "node:child_process";
const os = { win32: "win", darwin: "osx", linux: "linux" }[process.platform];
if (!os) throw new Error("Unsupported platform");
const r = spawnSync(
  "dotnet",
  [
    "publish",
    "backend/BasementBand.csproj",
    "-c",
    "Release",
    "-r",
    `${os}-${process.arch}`,
    "--self-contained",
    "true",
    "-o",
    "artifacts/backend",
  ],
  { stdio: "inherit" },
);
if (r.error) console.error(r.error.message);
process.exit(r.status ?? 1);
