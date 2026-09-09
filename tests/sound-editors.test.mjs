import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";

test("EQ processes audio and MIDI edits survive undo, copies and save/open", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/sound-editors-"));
  const rpc = startSession(folder);
  const send = async (command) => {
    const reply = await rpc.send(command);
    assert.equal(reply.error, undefined, reply.error);
    return reply.result;
  };
  try {
    let s = await send({ op: "state" });
    const audio = s.tracks[0].id;
    await send({
      op: "track",
      track: audio,
      monitor: true,
      gain: 1,
      eqBass: 6,
    });
    let rendered = await send({ op: "pump", frames: 8192, left: 0.1 });
    assert.ok(
      rendered.left.at(-1) > 0.13,
      "Bass shelf boosts DC/low frequencies",
    );
    await send({ op: "track", track: audio, eqEnabled: false });
    rendered = await send({ op: "pump", frames: 8192, left: 0.1 });
    assert.ok(Math.abs(rendered.left.at(-1) - 0.1) < 0.001, "Bypass is dry");
    await send({ op: "track", track: audio, monitor: false });
    s = await send({ op: "addTrack", kind: "midi" });
    const midi = s.tracks.at(-1).id;
    await send({ op: "track", track: midi, armed: true, midiDevice: "test" });
    await send({ op: "record" });
    await send({ op: "testMidi", track: midi, note: 60 });
    await send({ op: "pump", frames: 4800 });
    await send({ op: "testMidi", track: midi, note: 60, off: true });
    await send({ op: "pump", frames: 4800 });
    s = await send({ op: "stop" });
    const clip = s.tracks.at(-1).clips[0];
    await send({
      op: "editClip",
      action: "copy",
      track: midi,
      clip: clip.id,
      position: 1,
    });
    s = await send({
      op: "editClip",
      action: "note",
      track: midi,
      clip: clip.id,
      event: clip.notes[0].event,
      pitch: 64,
      position: 0.05,
      length: 0.08,
    });
    assert.equal(
      s.tracks.at(-1).clips.find((c) => c.id === clip.id).notes[0].note,
      64,
    );
    assert.equal(
      s.tracks.at(-1).clips.find((c) => c.id !== clip.id).notes[0].note,
      60,
    );
    s = await send({ op: "undo" });
    assert.equal(
      s.tracks.at(-1).clips.find((c) => c.id === clip.id).notes[0].note,
      60,
    );
    s = await send({ op: "redo" });
    assert.equal(
      s.tracks.at(-1).clips.find((c) => c.id === clip.id).notes[0].note,
      64,
    );
    const path = resolve(folder, "Edited.basement");
    await send({ op: "save", path });
    await send({ op: "new" });
    s = await send({ op: "open", path });
    assert.equal(s.tracks[0].eqBass, 6);
    assert.equal(s.tracks[0].eqEnabled, false);
    const note = s.tracks.at(-1).clips.find((c) => c.id === clip.id).notes[0];
    assert.equal(note.note, 64);
    assert.ok(Math.abs(note.start - 0.05) < 0.001);
    assert.ok(Math.abs(note.duration - 0.08) < 0.001);
  } finally {
    await rpc.close();
  }
});
