// Remembers the audio device chosen in Settings between launches. The file
// lives in the app's user-data folder; a missing or damaged file just means
// the default device, as on first launch.
const fs = require("node:fs/promises");
const { writeJsonAtomically } = require("./session-files.cjs");

/** @typedef {import("../ui/models").DeviceConfiguration} DeviceConfiguration */

/**
 * @param {unknown} value
 * @returns {DeviceConfiguration | null}
 */
function deviceConfiguration(value) {
  const v = /** @type {Record<string, unknown> | null} */ (value);
  if (
    !v ||
    typeof v.type !== "string" ||
    typeof v.output !== "string" ||
    typeof v.input !== "string" ||
    typeof v.sampleRate !== "number" ||
    typeof v.bufferSize !== "number" ||
    !v.type ||
    !v.output
  )
    return null;
  return {
    type: v.type,
    output: v.output,
    input: v.input,
    sampleRate: v.sampleRate,
    bufferSize: v.bufferSize,
  };
}

/** @param {string} file */
async function loadAudioDevice(file) {
  try {
    return deviceConfiguration(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Stores what the engine actually applied (it may adjust rate or buffer).
 * @param {string} file
 * @param {unknown} devices the engine's reply to `configure`
 */
async function saveAudioDevice(file, devices) {
  const configuration = deviceConfiguration(devices);
  if (configuration) await writeJsonAtomically(file, configuration, 2);
}

module.exports = { loadAudioDevice, saveAudioDevice, deviceConfiguration };
