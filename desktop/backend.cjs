const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { connect } = require("node:net");
const { ServiceClient } = require("./service-client.cjs");

function startBackend(root, dataDirectory) {
  if (process.env.BASEMENT_DEV === "1" && process.env.BASEMENT_BACKEND_PORT) {
    const port = Number(process.env.BASEMENT_BACKEND_PORT);
    const token = process.env.BASEMENT_BACKEND_TOKEN;
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !token)
      throw new Error("Invalid Visual Studio backend connection");
    const socket = connect({ host: "127.0.0.1", port });
    socket.setNoDelay(true);
    // Authentication precedes JSON requests. No timeout while stopped at a breakpoint.
    const client = new ServiceClient(socket, 0);
    socket.write(token + "\n");
    return client;
  }
  const native = path.join(
    root,
    "artifacts/native",
    process.platform === "win32" ? "BasementAudio.exe" : "BasementAudio",
  );
  const dll = path.join(root, "artifacts/backend/BasementBand.dll");
  const published = path.join(
    root,
    "artifacts/backend",
    process.platform === "win32" ? "BasementBand.exe" : "BasementBand",
  );
  if (!existsSync(native) || !existsSync(dll))
    throw new Error("Run npm run build:all to build the audio service.");
  return new ServiceClient(
    spawn(
      existsSync(published) ? published : "dotnet",
      existsSync(published) ? [] : [dll],
      {
        windowsHide: true,
        env: {
          ...process.env,
          BASEMENT_NATIVE: native,
          BASEMENT_DATA: dataDirectory,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    ),
  );
}
module.exports = { startBackend };
