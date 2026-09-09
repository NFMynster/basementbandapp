import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
test("editor audition sounds without monitoring, stops cleanly and never enters a take", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const rpc = startSession(
    mkdtempSync(resolve("artifacts/test-sessions/audition-")),
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    let s = await send({ op: "addTrack", kind: "midi" });
    const track = s.tracks.at(-1).id;
    await send({
      op: "plugin",
      track,
      path: resolve(
        "build/native/TestInstrument_artefacts/Release/VST3/Basement TestInstrument.vst3",
      ),
    });
    await send({ op: "track", track, monitor: false, gain: 1, armed: true });
    await send({ op: "audition", track, note: 60, velocity: 100, channel: 1 });
    let audio = await send({ op: "pump", frames: 512 });
    assert.ok(audio.left.some((v) => v > 0.1));
    await send({ op: "audition", track, note: 64, velocity: 80, channel: 2 });
    for (let i = 0; i < 4; i++)
      audio = await send({ op: "pump", frames: 8192 });
    assert.ok(
      audio.left.every((v) => Math.abs(v) < 1e-6),
      "Preview must send note-off",
    );
    s = await send({ op: "state" });
    assert.equal(s.playing, false);
    assert.equal(s.position, 0);
    assert.equal(s.tracks.at(-1).monitor, false);
    assert.equal(s.tracks.at(-1).clips.length, 0);
    await send({ op: "record" });
    await send({ op: "audition", track, note: 60, velocity: 100, channel: 1 });
    await send({ op: "pump", frames: 1024 });
    s = await send({ op: "stop" });
    assert.equal(
      s.tracks.at(-1).clips.length,
      0,
      "Auditions must not be recorded",
    );
  } finally {
    await rpc.close();
  }
});
