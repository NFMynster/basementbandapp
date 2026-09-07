import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// Shared integration-test transport. A crashed or hung child fails immediately
// and teardown is bounded, so a failing test cannot leave a background engine.
export function startRpc(
  executable,
  args,
  { env = process.env, framed = false } = {},
) {
  const child = spawn(executable, args, { windowsHide: true, env });
  const pending = [];
  let failure,
    sequence = 0,
    diagnostics = "";
  const fail = (error) => {
    failure ??= error;
    for (const p of pending.splice(0)) {
      clearTimeout(p.timer);
      p.reject(failure);
    }
  };
  child.stderr.on("data", (b) => {
    diagnostics = (diagnostics + b).slice(-4000);
  });
  child.on("error", fail);
  child.stdin.on("error", fail);
  const exited = new Promise((resolve) => child.once("close", resolve));
  child.on("exit", () =>
    fail(new Error("Test process exited: " + diagnostics)),
  );
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (framed && !line.startsWith("BASEMENT:")) return;
    const p = pending.shift();
    if (!p) return;
    clearTimeout(p.timer);
    try {
      p.resolve(JSON.parse(framed ? line.slice("BASEMENT:".length) : line));
    } catch (error) {
      p.reject(error);
      fail(error);
    }
  });
  return {
    send(command) {
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => fail(new Error("Test process timed out: " + diagnostics)),
          10000,
        );
        pending.push({ resolve, reject, timer });
        child.stdin.write(
          JSON.stringify({ ...command, id: ++sequence }) + "\n",
        );
      });
    },
    async close() {
      child.stdin.end();
      const timeout = setTimeout(() => child.kill(), 2000);
      await exited;
      clearTimeout(timeout);
    },
  };
}
