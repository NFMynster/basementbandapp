import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";

test("development readiness uses IPC and survives an occupied default port", async () => {
  const blocker = createServer((socket) => socket.destroy());
  const ownsPort = await new Promise((resolve, reject) => {
    blocker.once("error", (e) =>
      e.code === "EADDRINUSE" ? resolve(false) : reject(e),
    );
    blocker.listen(5173, "127.0.0.1", () => resolve(true));
  });
  const child = spawn(process.execPath, ["scripts/vite-server.mjs"], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  let diagnostics = "";
  child.stdout.on("data", (b) => {
    diagnostics += b;
  });
  child.stderr.on("data", (b) => {
    diagnostics += b;
  });
  const exited = new Promise((r) => child.once("exit", r));
  try {
    const url = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("No ready message: " + diagnostics)),
        20000,
      );
      child.once("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`UI server exited ${code}: ${diagnostics}`));
      });
      child.on("message", (m) => {
        if (m.type === "ready") {
          clearTimeout(timeout);
          resolve(m.url);
        }
      });
    });
    assert.equal(new URL(url).hostname, "127.0.0.1");
    assert.notEqual(new URL(url).port, "5173");
    assert.equal(
      (await fetch(url, { signal: AbortSignal.timeout(10000) })).status,
      200,
    );
  } finally {
    if (child.connected) child.disconnect();
    const timeout = setTimeout(() => child.kill(), 2000);
    await exited;
    child.stdout.destroy();
    child.stderr.destroy();
    clearTimeout(timeout);
    if (ownsPort) await new Promise((r) => blocker.close(r));
  }
});
