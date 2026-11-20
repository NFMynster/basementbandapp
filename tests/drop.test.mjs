import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";
test("dropped audio imports to existing/new tracks, rejects mismatches and cleans up failed new imports", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/drop-"));
  const file = resolve(folder, "My riff.wav");
  writeMonoWav(file, 480, () => 0.1);
  const session = startSession(folder);
  const send = async (command) => {
    const result = await session.send(command);
    if (result.error) throw new Error(result.error);
    return result.result;
  };
  const drop = (paths, track, plugin) =>
    session.desktop("drop", { paths, track, plugin });
  // The native open dialog answers with `file`.
  const importAt = (track, position) =>
    session.desktop("import", { track, position }, file);
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
    const imported = await importAt(initial.tracks[0].id, 3.5);
    assert.equal(imported.tracks[0].clips.at(-1).start, 3.5);
    assert.equal(imported.position, initial.position);
    const created = await importAt(undefined, 4.5);
    assert.equal(created.tracks.at(-1).name, "My riff");
    assert.equal(created.tracks.at(-1).clips[0].start, 4.5);
    await assert.rejects(
      importAt(initial.tracks[0].id, -1),
      /Invalid import position/,
    );
  } finally {
    await session.close();
  }
});
