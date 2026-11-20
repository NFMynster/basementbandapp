// UI hot reload: Vite on a free loopback port, and a debug build of the
// desktop shell loading it. The native engine must already be built.
import { spawn } from "node:child_process";
import { cargo, withCargo } from "./build-tools.mjs";
const vite = spawn(process.execPath, ["scripts/vite-server.mjs"], {
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
vite.stdout.pipe(process.stdout);
vite.stderr.pipe(process.stderr);
let desktop;
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  vite.kill();
  desktop?.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => close(130));
process.on("SIGTERM", () => close(143));
try {
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("The UI server did not start within 60 seconds.")),
      60000,
    );
    vite.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    vite.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error("The UI server exited with code " + code));
    });
    vite.on("message", (message) => {
      if (message?.type === "ready" && typeof message.url === "string") {
        clearTimeout(timeout);
        resolve(message.url);
      }
    });
  });
  if (!closing) {
    desktop = spawn(
      cargo(),
      [
        "run",
        "--manifest-path",
        "desktop/Cargo.toml",
        "--bin",
        "basement-band",
      ],
      {
        stdio: "inherit",
        env: withCargo({
          ...process.env,
          BASEMENT_DEV: "1",
          BASEMENT_DEV_URL: url,
        }),
      },
    );
    desktop.on("error", (error) => {
      console.error(error.message);
      close(1);
    });
    desktop.on("exit", (code) => close(code ?? 1));
    vite.on("exit", () => {
      if (!closing) {
        console.error("The UI server stopped.");
        close(1);
      }
    });
  }
} catch (error) {
  console.error(error.message);
  close(1);
}
