import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
test("metronome volume scales playback and count-in and survives save/open", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/click-volume-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  const peak = async () =>
    Math.max(...(await send({ op: "pump", frames: 1200 })).left.map(Math.abs));
  try {
    await send({ op: "metronome", value: true });
    await send({ op: "play" });
    const normal = await peak();
    await send({ op: "stop" });
    await send({ op: "metronomeVolume", value: 4 });
    await send({ op: "seek", position: 0 });
    await send({ op: "play" });
    assert.ok(Math.abs((await peak()) / normal - 4) < 0.0001);
    await send({ op: "stop" });
    const path = resolve(folder, "Loud.basement");
    await send({ op: "save", path });
    await send({ op: "metronomeVolume", value: 0 });
    assert.equal((await send({ op: "open", path })).metronomeGain, 4);
    const s = await send({ op: "state" });
    await send({ op: "track", track: s.tracks[0].id, armed: true });
    await send({ op: "countIn", value: true });
    await send({ op: "record" });
    assert.ok(Math.abs((await peak()) / normal - 4) < 0.0001);
    await send({ op: "stop" });
    await send({ op: "metronomeVolume", value: 0 });
    await send({ op: "play" });
    assert.equal(await peak(), 0);
    await send({ op: "stop" });
  } finally {
    await rpc.close();
  }
});
