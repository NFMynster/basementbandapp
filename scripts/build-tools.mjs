import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

/** Cargo from PATH, or rustup's default location in a shell opened earlier. */
export function cargo() {
  const exe = process.platform === "win32" ? "cargo.exe" : "cargo";
  const probe = spawnSync(exe, ["--version"], { stdio: "ignore" });
  if (!probe.error) return exe;
  const installed = join(homedir(), ".cargo", "bin", exe);
  if (existsSync(installed)) return installed;
  throw new Error(
    "Rust is not installed. Install it from https://rustup.rs, then rerun.",
  );
}

/** Rust's toolchain needs to be on PATH for the Tauri CLI as well. */
export function withCargo(env = process.env) {
  const bin = dirname(cargo());
  if (bin === ".") return env;
  const key =
    Object.keys(env).find((name) => name.toUpperCase() === "PATH") || "PATH";
  return {
    ...env,
    [key]: bin + (process.platform === "win32" ? ";" : ":") + (env[key] || ""),
  };
}

export const appExecutable = () =>
  resolve(
    root,
    "desktop/target/release",
    process.platform === "win32" ? "Basement Band.exe" : "Basement Band",
  );

/** UI (type-checked) plus the release desktop shell and its test host. */
export function buildDesktop(env = process.env) {
  run(process.execPath, ["scripts/licenses.mjs"], env);
  // The icons are checked in; `npm run build:icons` updates them after the
  // SVG changes.
  runTool("typescript", ["--noEmit"], env, "tsc");
  runTool("vite", ["build"], env);
  const rust = withCargo(env);
  runTool("@tauri-apps/cli", ["build", "--no-bundle"], rust, "tauri");
  run(
    cargo(),
    [
      "build",
      "--release",
      "--manifest-path",
      "desktop/Cargo.toml",
      "--bin",
      "session-host",
    ],
    rust,
  );
}
