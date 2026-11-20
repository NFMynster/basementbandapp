// Runs the built desktop app (npm run build:all, or build:desktop after UI
// or shell changes).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appExecutable } from "./build-tools.mjs";

const executable = appExecutable();
if (!existsSync(executable)) {
  console.error("Run npm run build:all to build the desktop app first.");
  process.exit(1);
}
const child = spawn(executable, process.argv.slice(2), { stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
