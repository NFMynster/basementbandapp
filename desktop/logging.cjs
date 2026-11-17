const fs = require("node:fs");
const path = require("node:path");
/** @param {string} directory */
function initializeLogging(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch (error) {
    console.error("Could not create diagnostic log directory", error);
    return;
  }
  const file = path.join(directory, "main.log");
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 4194304) {
      fs.rmSync(file + ".previous", { force: true });
      fs.renameSync(file, file + ".previous");
    }
  } catch (error) {
    console.error("Could not rotate diagnostic log", error);
  }
  for (const level of /** @type {const} */ (["log", "warn", "error"])) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const line = args
        .map((v) =>
          v instanceof Error
            ? v.stack
            : typeof v === "string"
              ? v
              : JSON.stringify(v),
        )
        .join(" ");
      try {
        fs.appendFileSync(
          file,
          `${new Date().toISOString()} [${level}] ${line}\n`,
        );
      } catch {
        /* Logging must not break audio startup. */
      }
      original(...args);
    };
  }
  console.log("Starting Basement Band", {
    platform: process.platform,
    arch: process.arch,
  });
}
module.exports = { initializeLogging };
