const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { NativeClient } = require("./native-client.cjs");
const { SessionService } = require("./session-service.cjs");
function startBackend(root, dataDirectory) {
  const native = path.join(
    root,
    "artifacts/native",
    process.platform === "win32" ? "BasementAudio.exe" : "BasementAudio",
  );
  if (!existsSync(native))
    throw new Error("Run npm run build:all to build the audio engine.");
  return new SessionService(
    new NativeClient(
      spawn(
        native,
        process.env.BASEMENT_TEST_DEVICE === "1" ? ["--test-device"] : [],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      ),
    ),
    dataDirectory,
  );
}
module.exports = { startBackend };
