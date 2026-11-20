import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const exe = process.platform === "win32" ? ".exe" : "";

/** The desktop shell's session layer, built by `npm run build:desktop`. */
export function sessionHost() {
  if (process.env.BASEMENT_SESSION_HOST)
    return resolve(process.env.BASEMENT_SESSION_HOST);
  const builds = ["release", "debug"]
    .map((profile) => resolve(`desktop/target/${profile}/session-host${exe}`))
    .filter((path) => existsSync(path))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!builds.length)
    throw new Error("Run npm run build:desktop to build the session host.");
  return builds[0];
}

export function engineExecutable() {
  return (
    process.env.BASEMENT_NATIVE_TEST ||
    resolve(`artifacts/native/BasementAudio${exe}`)
  );
}

/**
 * Drives the shipped Rust SessionService (with PluginLibrary and the desktop
 * drop/import handlers) on the engine's test device. A crashed or hung host
 * fails pending requests, and teardown is bounded.
 */
export function startSession(folder) {
  const child = spawn(
    sessionHost(),
    ["--engine", engineExecutable(), "--folder", folder],
    { windowsHide: true },
  );
  const pending = new Map();
  let sequence = 0;
  let failure;
  let diagnostics = "";
  const fail = (error) => {
    failure ??= error;
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve({ error: failure.message });
      pending.delete(id);
    }
  };
  child.stderr.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-4000);
  });
  child.on("error", fail);
  child.stdin.on("error", fail);
  const exited = new Promise((r) => child.once("close", r));
  child.on("exit", () =>
    fail(new Error("Session host exited: " + diagnostics)),
  );
  createInterface({ input: child.stdout }).on("line", (line) => {
    const reply = JSON.parse(line);
    const entry = pending.get(reply.id);
    if (!entry) return;
    pending.delete(reply.id);
    clearTimeout(entry.timer);
    entry.resolve(
      reply.error !== undefined
        ? { error: reply.error }
        : { result: reply.result },
    );
  });
  /** @returns {Promise<{ result?: any, error?: string }>} */
  const message = (body) => {
    if (failure) return Promise.resolve({ error: failure.message });
    const id = ++sequence;
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => fail(new Error("Session host timed out: " + diagnostics)),
        60000,
      );
      pending.set(id, { resolve, timer });
      child.stdin.write(JSON.stringify({ id, ...body }) + "\n");
    });
  };
  const unwrap = async (body) => {
    const reply = await message(body);
    if (reply.error !== undefined) throw new Error(reply.error);
    return reply.result;
  };
  return {
    /** A session request; resolves `{ result }` or `{ error }`. */
    send: (command) => message({ command }),
    /** A Sound library action; rejects with the library's message. */
    library: (command) => unwrap({ library: command }),
    /** `drop` or `import` with the native dialog answering `dialog`. */
    desktop: (name, args, dialog = null) =>
      unwrap({ desktop: name, args, dialog }),
    /** Scans plug-ins in `folder` and resolves once the scan finished. */
    scanLibrary: (folder) => unwrap({ scan: folder }),
    /** The library as a fresh process would load it from disk. */
    reloadLibrary: () => unwrap({ reloadLibrary: true }),
    /** Session document validation; rejects with the reason. */
    validate: (session) => unwrap({ validate: session }),
    // Ending input stops the transport, writes recovery and closes the
    // engine; a host that hangs is killed instead of holding the run open.
    async close() {
      child.stdin.end();
      const timeout = setTimeout(() => child.kill(), 5000);
      await exited;
      clearTimeout(timeout);
    },
  };
}
