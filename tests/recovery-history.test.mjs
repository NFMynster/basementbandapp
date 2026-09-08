import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";

test("unsaved session recovery and undo/redo preserve deleted and trimmed audio", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/recovery-"));
  const file = resolve(folder, "audio.wav");
  writeMonoWav(file, 48000, () => 0.2);
  let rpc = startSession(folder);
  const send = async (c) => {
    const response = await rpc.send(c);
    assert.equal(response.error, undefined, response.error);
    return response.result;
  };
  try {
    let s = await send({ op: "state" });
    const track = s.tracks[0].id;
    await send({ op: "rename", title: "Unsaved jam" });
    s = await send({ op: "import", track, path: file, position: 3 });
    const clip = s.tracks[0].clips[0].id;
    await send({
      op: "editClip",
      action: "trim",
      track,
      clip,
      position: 3.25,
      length: 0.5,
    });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].clips[0].duration, 1);
    s = await send({ op: "redo" });
    assert.equal(s.tracks[0].clips[0].duration, 0.5);
    await send({ op: "removeTrack", track });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].id, track);
    assert.equal(s.tracks[0].clips[0].id, clip);
    await rpc.close();
    rpc = startSession(folder);
    s = await send({ op: "state" });
    assert.equal(s.recovered, true);
    assert.equal(s.title, "Unsaved jam");
    assert.equal(s.tracks[0].clips[0].duration, 0.5);
    assert.equal(s.canUndo, false, "History is limited to the running session");
    assert.equal(
      JSON.parse(readFileSync(resolve(folder, "recovery.json"), "utf8")).title,
      s.title,
    );
    await send({ op: "removeClip", track, clip });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].clips[0].id, clip);
  } finally {
    await rpc.close();
  }
});
