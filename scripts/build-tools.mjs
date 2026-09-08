import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));

export function run(executable, args, env = process.env) {
  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

export function runTool(
  packageName,
  args,
  env = process.env,
  command = packageName,
) {
  const manifest = require.resolve(packageName + "/package.json");
  const { bin } = require(manifest);
  const entry = typeof bin === "string" ? bin : bin[command];
  if (!entry) throw new Error("No CLI entry for " + packageName);
  run(process.execPath, [resolve(dirname(manifest), entry), ...args], env);
}

export function buildDesktop(env = process.env) {
  run(process.execPath, ["scripts/licenses.mjs"], env);
  run(require("electron"), ["scripts/icons.cjs"], env);
  runTool("typescript", ["--noEmit"], env, "tsc");
  runTool("vite", ["build"], env);
}
