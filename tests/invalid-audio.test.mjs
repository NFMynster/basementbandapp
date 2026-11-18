import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";

test("NaN from a track is silenced, keeps the metronome and does not stick in the EQ", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/invalid-audio-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  const finite = (samples) => samples.every(Number.isFinite);
  const peak = (samples) => Math.max(...samples.map(Math.abs));
  try {
    const s = await send({ op: "state" });
    const track = s.tracks[0].id;
    // The EQ keeps filter state between blocks, so a boost makes a stuck NaN
    // audible in the clean block that follows.
    await send({
      op: "track",
      track,
      monitor: true,
      gain: 1,
      eqEnabled: true,
      eqBass: 6,
    });
    const poisoned = await send({ op: "pump", frames: 4096, invalid: true });
    assert.ok(finite(poisoned.left) && finite(poisoned.right));
    assert.equal(peak(poisoned.left), 0, "The invalid block is silenced");
    assert.ok(Number.isFinite(poisoned.state.tracks[0].peak));

    await send({ op: "metronome", value: true });
    await send({ op: "seek", position: 0 });
    await send({ op: "play" });
    const withClick = await send({ op: "pump", frames: 1200, invalid: true });
    assert.ok(finite(withClick.left));
    assert.ok(peak(withClick.left) > 0.05, "The metronome still sounds");
    await send({ op: "stop" });
    await send({ op: "metronome", value: false });

    const clean = await send({ op: "pump", frames: 8192, left: 0.2 });
    assert.ok(finite(clean.left));
    assert.ok(peak(clean.left) > 0.1, "The track recovers on clean input");
  } finally {
    await rpc.close();
  }
});
