import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";

test("The session service persists mixed audio/MIDI sessions and reconstructs MIDI note previews", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/midi-project-"));
  const rpc = startSession(folder);
  try {
    const send = async (command) => {
      const reply = await rpc.send(command);
      assert.equal(reply.error, undefined, reply.error);
      return reply.result;
    };
    let s = await send({ op: "addTrack", kind: "midi" });
    const audio = s.tracks[0].id,
      midi = s.tracks.at(-1).id;
    await send({ op: "track", track: audio, armed: true });
    await send({ op: "track", track: midi, armed: true, midiDevice: "test" });
    await send({ op: "record" });
    await send({ op: "testMidi", track: midi, note: 36 });
    await send({ op: "pump", frames: 480, left: 0.25 });
    s = await send({ op: "stop" });
    assert.equal(s.error, undefined, s.error);
    assert.equal(s.tracks[0].clips[0].start, s.tracks.at(-1).clips[0].start);
    assert.equal(
      s.tracks[0].clips[0].duration,
      s.tracks.at(-1).clips[0].duration,
    );
    const path = resolve(folder, "Mixed.basement");
    assert.equal((await send({ op: "save", path })).error, undefined);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(saved.version, 4);
    assert.equal(saved.tracks.at(-1).clips[0].notes, undefined);
    assert.ok(existsSync(resolve(folder, saved.tracks.at(-1).clips[0].path)));
    await send({ op: "new" });
    s = await send({ op: "open", path });
    assert.equal(s.error, undefined, s.error);
    assert.equal(s.tracks.at(-1).kind, "midi");
    assert.equal(s.tracks.at(-1).clips[0].notes[0].note, 36);
    assert.ok(
      Math.abs(s.tracks.at(-1).clips[0].notes[0].duration - 0.01) < 0.0011,
      "Held note is closed at the take boundary",
    );
  } finally {
    await rpc.close();
  }
});
