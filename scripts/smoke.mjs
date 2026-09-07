import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const executable = process.argv[2] || require("electron");
const child = spawn(executable, process.argv[2] ? [] : ["."], {
  windowsHide: true,
  stdio: "inherit",
  env: { ...process.env, BASEMENT_SMOKE: "1", BASEMENT_TEST_DEVICE: "1" },
});
const timeout = setTimeout(() => {
  console.error("Desktop smoke test timed out");
  child.kill();
  process.exitCode = 1;
}, 30000);
child.on("error", (error) => {
  clearTimeout(timeout);
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  clearTimeout(timeout);
  process.exitCode = code ?? 1;
});
