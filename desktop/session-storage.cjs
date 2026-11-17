const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  CURRENT_SESSION_VERSION,
  sessionClips,
  validate,
  writeJsonAtomically,
} = require("./session-files.cjs");
// File operations only. The caller owns the engine, queue, history and recovery.
/** @param {string} targetPath @param {import("./types").Snapshot} snapshot */
async function saveSession(targetPath, snapshot) {
  snapshot = structuredClone(snapshot);
  snapshot.version = CURRENT_SESSION_VERSION;
  validate(snapshot);
  const target = path.resolve(targetPath),
    assets = target + ".audio";
  await fs.mkdir(assets, { recursive: true });
  const copied = new Map();
  for (const clip of sessionClips(snapshot)) {
    const source = path.resolve(clip.path),
      key = process.platform === "win32" ? source.toLowerCase() : source;
    let destination = copied.get(key);
    if (!destination) {
      destination =
        path.dirname(source) === assets
          ? source
          : path.join(assets, randomUUID() + path.extname(source));
      if (source !== destination) await fs.copyFile(source, destination);
      copied.set(key, destination);
    }
    clip.path = path.relative(path.dirname(target), destination);
    delete clip.peaks;
    delete clip.notes;
  }
  for (const key of [
    "position",
    "playing",
    "recording",
    "device",
    "deviceError",
    "diskOverrun",
    "sampleRate",
    "bufferSize",
    "inputLatencySamples",
    "outputLatencySamples",
    "countdown",
    "audioCpu",
    "masterPeak",
    "outputClipped",
    "processingDropouts",
    "recordingDropouts",
    "deviceDropouts",
  ])
    delete snapshot[key];
  for (const track of snapshot.tracks)
    for (const key of ["peak", "recordStart", "latencySamples"])
      delete track[key];
  await writeJsonAtomically(target, snapshot, 2);
  return { saved: target };
}
/** @param {string} targetPath */
async function readSession(targetPath) {
  const target = path.resolve(targetPath);
  const session = JSON.parse(await fs.readFile(target, "utf8"));
  validate(session);
  for (const track of session.tracks) track.monitor = false;
  for (const clip of sessionClips(session)) {
    clip.path = path.resolve(path.dirname(target), clip.path);
    await fs.access(clip.path);
  }
  return session;
}
module.exports = { saveSession, readSession };
