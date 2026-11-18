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

test("metronome sounds are selectable, validated and survive save/open", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/click-sound-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  const clickAt = async (sound) => {
    await send({ op: "metronomeSound", value: sound });
    await send({ op: "seek", position: 0 });
    await send({ op: "play" });
    const left = (await send({ op: "pump", frames: 1200 })).left;
    await send({ op: "stop" });
    return left;
  };
  try {
    assert.equal((await send({ op: "state" })).metronomeSound, "beep");
    await send({ op: "metronome", value: true });
    const beep = await clickAt("beep");
    const wood = await clickAt("woodblock");
    const stick = await clickAt("stick");
    for (const [name, left] of Object.entries({ beep, wood, stick })) {
      const peak = Math.max(...left.map(Math.abs));
      assert.ok(
        peak > 0.05 && peak < 0.5,
        `${name} click is audible (${peak})`,
      );
    }
    assert.notDeepEqual(wood, beep);
    assert.notDeepEqual(stick, beep);
    const invalid = await rpc.send({ op: "metronomeSound", value: "cowbell" });
    assert.match(invalid.error, /Invalid metronome sound/);
    assert.equal((await send({ op: "state" })).metronomeSound, "stick");
    const path = resolve(folder, "Stick.basement");
    await send({ op: "save", path });
    await send({ op: "metronomeSound", value: "beep" });
    assert.equal((await send({ op: "open", path })).metronomeSound, "stick");
  } finally {
    await rpc.close();
  }
});
