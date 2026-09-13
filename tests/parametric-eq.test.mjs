import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";

test("parametric EQ gestures undo together and settings survive save/open", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/parametric-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    const track = (await send({ op: "state" })).tracks[0].id;
    for (const frequency of [800, 1200, 2400])
      await send({
        op: "track",
        track,
        eqMidFrequency: frequency,
        eqMid: 6,
        historyGroup: "graph-drag",
      });
    let state = await send({ op: "undo" });
    assert.equal(state.tracks[0].eqMidFrequency, 1000);
    assert.equal(state.tracks[0].eqMid, 0);
    state = await send({ op: "redo" });
    assert.equal(state.tracks[0].eqMidFrequency, 2400);
    assert.equal(state.tracks[0].eqMid, 6);
    const settings = {
      eqBassFrequency: 90,
      eqTrebleFrequency: 8000,
      eqMidQ: 3,
      eqLowCut: 75,
    };
    await send({ op: "track", track, ...settings });
    const path = resolve(folder, "eq.basement");
    await send({ op: "save", path });
    await send({ op: "track", track, eqMidQ: 1, eqLowCut: 20 });
    state = await send({ op: "open", path });
    for (const [key, value] of Object.entries(settings))
      assert.equal(state.tracks[0][key], value);
  } finally {
    await rpc.close();
  }
});

test("rumble cut changes native audio and bypass restores it", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const rpc = startSession(
    mkdtempSync(resolve("artifacts/test-sessions/eq-audio-")),
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    const track = (await send({ op: "state" })).tracks[0].id;
    await send({ op: "track", track, monitor: true, gain: 1, eqLowCut: 100 });
    const filtered = await send({ op: "pump", frames: 8192, left: 0.2 });
    assert.ok(Math.abs(filtered.left.at(-1)) < 0.001, "High-pass removes DC");
    await send({ op: "track", track, eqEnabled: false });
    const bypassed = await send({ op: "pump", frames: 256, left: 0.2 });
    assert.ok(bypassed.left.at(-1) > 0.1, "Bypass restores the input");
  } finally {
    await rpc.close();
  }
});
