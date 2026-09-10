import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";

test("track copies preserve routing, regions and plugin state through undo/redo", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/track-copy-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    const source = (await send({ op: "state" })).tracks[0].id;
    const path = resolve(folder, "note.wav");
    writeMonoWav(path, 4800, () => 0.2);
    await send({ op: "import", track: source, path });
    await send({
      op: "track",
      track: source,
      input: 1,
      eqBass: 4,
      reverbEnabled: true,
      reverbAmount: 0.4,
    });
    const plugin = resolve(
      "build/native/TestGain_artefacts/Release/VST3/Basement Test Gain.vst3",
    );
    await send({ op: "plugin", track: source, path: plugin });
    await send({ op: "plugin", track: source, path: plugin, append: true });
    const before = (await send({ op: "snapshot" })).tracks[0];
    let s = await send({ op: "duplicateTrack", track: source });
    const id = s.tracks.at(-1).id;
    const copy = (await send({ op: "snapshot" })).tracks.at(-1);
    for (const key of [
      "input",
      "eqBass",
      "reverbEnabled",
      "reverbAmount",
      "pluginState",
      "pluginPath",
    ])
      assert.deepEqual(copy[key], before[key], key);
    assert.equal(copy.effects[0].state, before.effects[0].state);
    assert.notEqual(copy.effects[0].id, before.effects[0].id);
    assert.equal(copy.clips[0].path, before.clips[0].path);
    assert.notEqual(copy.clips[0].id, before.clips[0].id);
    assert.equal(copy.armed, false);
    s = await send({ op: "undo" });
    assert.ok(!s.tracks.some((t) => t.id === id));
    await send({ op: "redo" });
    assert.equal(
      (await send({ op: "snapshot" })).tracks.at(-1).effects[0].state,
      before.effects[0].state,
    );
    s = await send({ op: "duplicateTrack", track: source, empty: true });
    assert.equal(s.tracks.at(-1).clips.length, 0);
    assert.equal(s.tracks.at(-1).input, 1);
    assert.equal(s.tracks.at(-1).pluginName, before.pluginName);
  } finally {
    await rpc.close();
  }
});

test("loop starts, musical loop bounds, project end and dry tuner", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const rpc = startSession(
    mkdtempSync(resolve("artifacts/test-sessions/transport-fixes-")),
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    let s = await send({ op: "state" });
    const track = s.tracks[0].id;
    await send({ op: "loop", start: 4, end: 8, enabled: true });
    assert.equal((await send({ op: "play" })).position, 4);
    await send({ op: "pump", frames: 4800 });
    const at = (await send({ op: "state" })).position;
    s = await send({ op: "loop", start: 4, end: 8, enabled: false });
    assert.equal(s.position, at);
    assert.equal(s.processingDropouts, 0);
    await send({ op: "stop" });
    s = await send({ op: "tempo", value: 60 });
    assert.equal(s.loopStart, 8);
    assert.equal(s.loopEnd, 16);
    s = await send({ op: "undo" });
    assert.equal(s.tempo, 120);
    assert.equal(s.loopStart, 4);
    assert.equal(s.loopEnd, 8);
    await send({ op: "seek", position: 63.99 });
    await send({ op: "play" });
    s = (await send({ op: "pump", frames: 4800 })).state;
    assert.equal(s.playing, false);
    assert.equal(s.position, 64);
    await send({ op: "track", track, monitor: true, reverbEnabled: true });
    await send({ op: "tuner", track });
    for (const frequency of [41.2, 82.41, 110, 440]) {
      await send({ op: "pump", frames: 8192, frequency });
      const result = await send({
        op: "pump",
        frames: 8192,
        frequency,
        sampleOffset: 8192,
      });
      assert.ok(
        result.left.every((v) => v === 0),
        "Tuning mutes output",
      );
      assert.ok(
        Math.abs(1200 * Math.log2(result.state.tunerFrequency / frequency)) < 3,
        `Tuner detects ${frequency} Hz, got ${result.state.tunerFrequency}`,
      );
    }
    await send({ op: "pump", frames: 8192 });
    s = (await send({ op: "pump", frames: 8192 })).state;
    assert.equal(s.tunerFrequency, 0);
    s = await send({ op: "tuner" });
    assert.equal(s.tunerTrack, "");
    assert.equal(s.tracks[0].reverbEnabled, true);
    assert.equal(s.tracks[0].monitor, true);
  } finally {
    await rpc.close();
  }
});
