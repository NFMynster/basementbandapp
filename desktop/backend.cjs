const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { NativeClient } = require("./native-client.cjs");
const { SessionService } = require("./session-service.cjs");
/**
 * @param {string} root
 * @param {string} dataDirectory
 */
function startBackend(root, dataDirectory, inputAllowed = true) {
  const native =
    process.env.BASEMENT_TEST_DEVICE === "1" && process.env.BASEMENT_NATIVE_TEST
      ? path.resolve(process.env.BASEMENT_NATIVE_TEST)
      : path.join(
          root,
          "artifacts/native",
          process.platform === "win32" ? "BasementAudio.exe" : "BasementAudio",
        );
  if (!existsSync(native))
    throw new Error("Run npm run build:all to build the audio engine.");
  console.log("Launching audio engine", native, { inputAllowed });
  return new SessionService(
    new NativeClient(
      spawn(
        native,
        process.env.BASEMENT_TEST_DEVICE === "1"
          ? ["--test-device"]
          : inputAllowed
            ? []
            : ["--no-input"],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      ),
    ),
    dataDirectory,
    { recover: process.env.BASEMENT_SMOKE !== "1" },
  );
}
module.exports = { startBackend };
