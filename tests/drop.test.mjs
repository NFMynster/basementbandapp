import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { startSession } from "./helpers/session.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";
test("dropped audio imports to existing/new tracks, rejects mismatches and cleans up failed new imports", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/drop-"));
  const file = resolve(folder, "My riff.wav");
  writeMonoWav(file, 480, () => 0.1);
  const session = startSession(folder),
    handlers = new Map(),
    sender = {};
  const require = createRequire(import.meta.url),
    module = { exports: {} };
  runInNewContext(readFileSync("desktop/ipc.cjs", "utf8"), {
    module,
    process,
    require: (name) =>
      name === "electron"
        ? {
            ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
          }
        : require(name),
  });
  const send = async (command) => {
    const result = await session.send(command);
    if (result.error) throw new Error(result.error);
    return result.result;
  };
  module.exports.registerIpc({ webContents: sender }, send);
  const drop = (files, track, plugin) =>
    handlers.get("drop")({ sender }, files, track, plugin);
  try {
    const initial = await send({ op: "state" });
    let state = await drop([file], initial.tracks[0].id);
    assert.equal(state.tracks.length, 2);
    assert.equal(state.tracks[0].clips.length, 1);
    state = await drop([file]);
    assert.equal(state.tracks.length, 3);
    assert.equal(state.tracks[2].name, "My riff");
    await assert.rejects(drop(["relative.wav"]), /Invalid dropped/);
    await assert.rejects(drop([file], "missing-track"), /no longer exists/);
    await assert.rejects(drop([resolve(folder, "missing.wav")]));
    assert.equal((await send({ op: "state" })).tracks.length, 3);
    state = await send({ op: "addTrack", kind: "midi" });
    await assert.rejects(drop([file], state.tracks.at(-1).id), /matching/);
    await assert.rejects(drop([file], state.tracks.at(-1).id, true), /VST3/);
    await assert.rejects(
      handlers.get("drop")({ sender: {} }, [file]),
      /Unknown window/,
    );
  } finally {
    await session.close();
  }
});
