import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
test("MIDI loop passes retain independent selectable notes and split sustained notes", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const rpc = startSession(
    mkdtempSync(resolve("artifacts/test-sessions/midi-takes-")),
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    const s = await send({ op: "addTrack", kind: "midi" }),
      track = s.tracks.at(-1).id;
    await send({ op: "track", track, armed: true, midiDevice: "test" });
    await send({ op: "loop", start: 0, end: 0.05, enabled: true });
    await send({ op: "record" });
    await send({ op: "testMidi", track, note: 36 });
    await send({ op: "pump", frames: 2400 });
    await send({ op: "testMidi", track, note: 36, off: true });
    await send({ op: "testMidi", track, note: 38 });
    await send({ op: "pump", frames: 2400 });
    let clips = (await send({ op: "stop" })).tracks.at(-1).clips;
    assert.equal(clips.length, 2);
    assert.equal(clips[1].notes[0].note, 38);
    clips = (
      await send({ op: "editClip", track, clip: clips[0].id, action: "take" })
    ).tracks.at(-1).clips;
    assert.equal(clips[0].notes[0].note, 36);
    clips = (
      await send({
        op: "editClip",
        track,
        clip: clips[0].id,
        action: "split",
        position: 0.025,
      })
    ).tracks.at(-1).clips;
    const selected = clips.filter((c) => c.active);
    assert.equal(selected.length, 2);
    assert.ok(selected.every((c) => c.notes[0].note === 36));
    assert.ok(
      selected.every((c) => Math.abs(c.notes[0].duration - 0.025) < 0.0011),
    );
  } finally {
    await rpc.close();
  }
});
test("count-in crossing an audio block captures only samples after the boundary", async () => {
  const rpc = startSession(
    mkdtempSync(resolve("artifacts/test-sessions/count-cross-")),
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    const s = await send({ op: "state" }),
      track = s.tracks[0].id;
    await send({ op: "track", track, armed: true });
    const midiTrack = (await send({ op: "addTrack", kind: "midi" })).tracks.at(
      -1,
    ).id;
    await send({ op: "track", track: midiTrack, armed: true });
    await send({ op: "tempo", value: 240 });
    await send({ op: "countIn", value: true });
    await send({ op: "record" });
    for (let i = 0; i < 5; ++i)
      await send({ op: "pump", frames: 8192, left: 0.9 });
    await send({ op: "testMidi", track: midiTrack, note: 60, sample: 7000 });
    await send({ op: "testMidi", track: midiTrack, note: 64, sample: 7200 });
    await send({ op: "pump", frames: 7808, left: 0.3 });
    const stopped = await send({ op: "stop" });
    const clip = stopped.tracks[0].clips[0];
    assert.ok(Math.abs(clip.duration - 768 / 48000) < 1e-9);
    assert.ok(clip.peaks.every((p) => Math.abs(p - 0.3) < 0.00001));
    const notes = stopped.tracks.at(-1).clips[0].notes;
    assert.deepEqual(
      notes.map((n) => n.note),
      [64],
      "Keep MIDI after count-in, discard notes before it",
    );
    assert.ok(Math.abs(notes[0].start - 160 / 48000) < 0.0011);
  } finally {
    await rpc.close();
  }
});
