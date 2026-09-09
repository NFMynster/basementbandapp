import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";

test("MIDI export preserves visible notes, trims, overlaps and timing without an instrument", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/midi-export-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    let s = await send({ op: "addTrack", kind: "midi" });
    const track = s.tracks.at(-1).id;
    await send({ op: "tempo", value: 90 });
    s = await send({ op: "createMidi", track, position: 1, length: 3 });
    const clip = s.tracks.at(-1).clips[0].id;
    await send({
      op: "editClip",
      action: "notes",
      track,
      clip,
      edits: [{ start: 0, duration: 3, note: 60, velocity: 83, channel: 3 }],
    });
    await send({
      op: "editClip",
      action: "trim",
      track,
      clip,
      position: 2,
      length: 1,
    });
    s = await send({ op: "createMidi", track, position: 2.5, length: 0.25 });
    const top = s.tracks.at(-1).clips.at(-1).id;
    await send({
      op: "editClip",
      action: "notes",
      track,
      clip: top,
      edits: [{ start: 0, duration: 0.25, note: 64, velocity: 95, channel: 3 }],
    });
    s = await send({ op: "createMidi", track, position: 0, length: 1 });
    const hidden = s.tracks.at(-1).clips.at(-1).id;
    await send({
      op: "editClip",
      action: "notes",
      track,
      clip: hidden,
      edits: [{ start: 0, duration: 0.5, note: 72 }],
    });
    const snapshot = await send({ op: "snapshot" });
    snapshot.tracks.at(-1).clips.at(-1).active = false;
    await send({ op: "restore", session: snapshot, folder });
    assert.match(
      (await rpc.send({ op: "export", mode: "separate", track, path: folder }))
        .error,
      /active instrument/,
    );
    const exported = await send({
      op: "export",
      mode: "separate",
      track,
      midi: "midi",
      path: folder,
    });
    assert.equal(exported.files.length, 1);
    assert.match(exported.files[0], /\.mid$/);
    const bytes = readFileSync(exported.files[0]);
    assert.equal(bytes.toString("ascii", 0, 4), "MThd");
    assert.equal(bytes.readUInt16BE(12), 960);
    s = await send({ op: "addTrack", kind: "midi" });
    const importedTrack = s.tracks.at(-1).id;
    s = await send({
      op: "import",
      track: importedTrack,
      path: exported.files[0],
      position: 0,
    });
    const notes = s.tracks.at(-1).clips[0].notes;
    assert.equal(
      notes.length,
      3,
      "Hidden takes and overlapping source notes are excluded",
    );
    for (const [i, [note, start, duration]] of [
      [60, 2, 0.5],
      [64, 2.5, 0.25],
      [60, 2.75, 0.25],
    ].entries()) {
      assert.equal(notes[i].note, note);
      assert.equal(notes[i].channel, 3);
      assert.ok(Math.abs(notes[i].start - start) < 0.002);
      assert.ok(Math.abs(notes[i].duration - duration) < 0.002);
    }
    assert.equal(notes[0].velocity, 83);
    const source = resolve(folder, "audio.wav");
    writeMonoWav(source, 4800, () => 0.1);
    await send({
      op: "import",
      track: s.tracks[0].id,
      path: source,
      position: 0,
    });
    const combined = await send({
      op: "export",
      mode: "mix",
      midi: "midi",
      path: folder,
    });
    assert.equal(combined.files.filter((p) => p.endsWith(".mid")).length, 2);
    assert.equal(combined.files.filter((p) => p.endsWith(".wav")).length, 1);
    await send({ op: "track", track, solo: true });
    const solo = await send({
      op: "export",
      mode: "mix",
      midi: "midi",
      path: folder,
    });
    assert.equal(solo.files.length, 1, "Mix MIDI selection follows solo");
    assert.match(solo.files[0], /\.mid$/);
    await send({ op: "play" });
    assert.match(
      (
        await rpc.send({
          op: "export",
          mode: "separate",
          midi: "midi",
          path: folder,
        })
      ).error,
      /Stop/,
    );
    await send({ op: "stop" });
  } finally {
    await rpc.close();
  }
});
