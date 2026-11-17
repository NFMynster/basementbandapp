import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { NativeClient } from "../../desktop/native-client.cjs";
import { SessionService } from "../../desktop/session-service.cjs";
export function startSession(folder) {
  const child = spawn(
    process.env.BASEMENT_NATIVE_TEST ||
      resolve(
        "artifacts/native/BasementAudio" +
          (process.platform === "win32" ? ".exe" : ""),
      ),
    ["--test-device"],
    { windowsHide: true },
  );
  const exited = new Promise((resolve) => child.once("close", resolve));
  const service = new SessionService(new NativeClient(child, 10000), folder);
  return {
    async send(command) {
      try {
        return { result: await service.request(command) };
      } catch (error) {
        return { error: error.message };
      }
    },
    // Bounded like startRpc: an engine that ignores EOF (for example one stuck
    // in init) is killed instead of hanging the test run.
    async close() {
      service.close();
      const timeout = setTimeout(() => child.kill(), 2000);
      await exited;
      clearTimeout(timeout);
    },
  };
}
