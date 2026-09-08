import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";

test("effect chains survive fast structural undo, redo and session recovery", async (t) => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/chain-"));
  const file = resolve(folder, "audio.wav");
  writeMonoWav(file, 48000, () => 0.2);
  const effectPath = resolve(
    "build/native/TestGain_artefacts/Release/VST3/Basement Test Gain.vst3",
  );
  const instrumentPath = resolve(
    "build/native/TestInstrument_artefacts/Release/VST3/Basement TestInstrument.vst3",
  );
  let rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    let s = await send({ op: "state" });
    const track = s.tracks[0].id;
    s = await send({ op: "import", track, path: file });
    const clip = s.tracks[0].clips[0].id;
    await send({ op: "track", track, gain: 1 });
    await send({ op: "plugin", track, path: effectPath });
    await send({ op: "plugin", track, path: effectPath, append: true });
    s = await send({ op: "plugin", track, path: effectPath, append: true });
    const effects = s.tracks[0].effects;
    assert.equal(effects.length, 2);
    await send({ op: "play" });
    let audio = await send({ op: "pump", frames: 64 });
    assert.ok(
      audio.left.every((value) => Math.abs(value - 0.025) < 0.0001),
      "Three serial gains process audio",
    );
    await send({ op: "stop" });
    await send({ op: "editClip", action: "move", track, clip, position: 2 });
    await send({ op: "loop", start: 4, end: 8, enabled: true });
    await send({ op: "track", track, gain: 0.7, pan: 0.25 });
    await send({ op: "bypass", track, effect: effects[0].id, value: true });
    s = await send({ op: "import", track, path: file, position: 10 });
    const imported = s.tracks[0].clips.at(-1).id;
    const started = performance.now();
    s = await send({ op: "undo" });
    t.diagnostic(
      `Undo with three loaded VSTs: ${(performance.now() - started).toFixed(1)} ms`,
    );
    assert.equal(s.tracks[0].clips.find((c) => c.id === clip).start, 0);
    assert.ok(
      s.tracks[0].clips.some((c) => c.id === imported),
      "Later imports survive undo",
    );
    assert.equal(s.looping, true);
    assert.equal(s.loopStart, 4);
    assert.ok(Math.abs(s.tracks[0].gain - 0.7) < 1e-6);
    assert.equal(s.tracks[0].effects[0].bypass, true);
    s = await send({ op: "redo" });
    assert.equal(s.tracks[0].clips.find((c) => c.id === clip).start, 2);
    // Moving between tracks retains the media path in recovery/history.
    const destination = s.tracks[1].id;
    await send({
      op: "editClip",
      action: "move",
      track,
      clip,
      target: destination,
      position: 3,
    });
    await send({ op: "undo" });
    await send({ op: "redo" });
    s = await send({ op: "undo" });
    assert.ok(s.tracks[0].clips.some((c) => c.id === clip));
    await send({ op: "editClip", action: "copy", track, clip, position: 5 });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].clips.length, 2);
    s = await send({ op: "redo" });
    assert.equal(s.tracks[0].clips.length, 3);
    await send({ op: "editClip", action: "split", track, clip, position: 2.5 });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].clips.find((c) => c.id === clip).duration, 1);
    s = await send({ op: "redo" });
    assert.equal(s.tracks[0].clips.find((c) => c.id === clip).duration, 0.5);
    await send({ op: "removeTrack", track });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].effects.length, 2);
    assert.equal(s.tracks[0].effects[0].bypass, true);
    const saved = resolve(folder, "chain.basement");
    await send({ op: "save", path: saved });
    await send({ op: "open", path: saved });
    await rpc.close();
    rpc = startSession(folder);
    s = await send({ op: "state" });
    assert.equal(s.recovered, true);
    assert.deepEqual(
      s.tracks[0].effects,
      effects.map((effect, index) => ({ ...effect, bypass: index === 0 })),
    );
    await send({ op: "removePlugin", track, effect: effects[1].id });
    s = await send({ op: "state" });
    assert.equal(s.tracks[0].effects.length, 1);
    const delayPath = resolve(
      "build/native/TestDelay_artefacts/Release/VST3/Basement TestDelay.vst3",
    );
    await send({ op: "plugin", track, path: delayPath, append: true });
    s = await send({ op: "plugin", track, path: delayPath, append: true });
    assert.equal(
      s.tracks[0].latencySamples,
      960,
      "Effect latency is cumulative",
    );
    await send({ op: "loop", start: 0, end: 8, enabled: false });
    await send({ op: "seek", position: 10 });
    await send({ op: "play" });
    audio = await send({ op: "pump", frames: 64 });
    assert.ok(
      audio.left.every((value) => Math.abs(value - 0.013125) < 0.0001),
      "Both delays are compensated from the first sample",
    );
    await send({ op: "stop" });
    const exported = await send({
      op: "export",
      track,
      mode: "separate",
      path: folder,
    });
    assert.equal(exported.files.length, 1);
    s = await send({ op: "addTrack", kind: "midi" });
    const midiTrack = s.tracks.at(-1).id;
    await send({ op: "plugin", track: midiTrack, path: instrumentPath });
    await send({
      op: "plugin",
      track: midiTrack,
      path: effectPath,
      append: true,
    });
    const invalid = await rpc.send({
      op: "plugin",
      track: midiTrack,
      path: instrumentPath,
      append: true,
    });
    assert.match(invalid.error, /audio effect/);
    await send({ op: "track", track: midiTrack, gain: 1, monitor: true });
    await send({ op: "testMidi", track: midiTrack, note: 60 });
    audio = await send({ op: "pump", frames: 64 });
    assert.ok(
      audio.left.every((value) => Math.abs(value - 0.125) < 0.0001),
      "MIDI instrument feeds its effect",
    );
  } finally {
    await rpc.close();
  }
});

test("unsaved session recovery and undo/redo preserve deleted and trimmed audio", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/recovery-"));
  const file = resolve(folder, "audio.wav");
  writeMonoWav(file, 48000, () => 0.2);
  let rpc = startSession(folder);
  const send = async (c) => {
    const response = await rpc.send(c);
    assert.equal(response.error, undefined, response.error);
    return response.result;
  };
  try {
    let s = await send({ op: "state" });
    const track = s.tracks[0].id;
    const originalGain = s.tracks[0].gain;
    await send({ op: "track", track, gain: 0.6, historyGroup: "drag-one" });
    await send({ op: "state" });
    await send({ op: "track", track, gain: 0.3, historyGroup: "drag-one" });
    s = await send({ op: "undo" });
    assert.ok(
      Math.abs(s.tracks[0].gain - 0.3) < 1e-6,
      "Volume gestures are not undoable",
    );
    s = await send({ op: "redo" });
    assert.ok(
      Math.abs(s.tracks[0].gain - 0.3) < 1e-6,
      "Redo does not restore volume gestures",
    );
    assert.notEqual(s.tracks[0].gain, originalGain);
    await send({ op: "rename", title: "Unsaved jam" });
    s = await send({ op: "import", track, path: file, position: 3 });
    const clip = s.tracks[0].clips[0].id;
    await send({
      op: "editClip",
      action: "trim",
      track,
      clip,
      position: 3.25,
      length: 0.5,
    });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].clips[0].duration, 1);
    s = await send({ op: "redo" });
    assert.equal(s.tracks[0].clips[0].duration, 0.5);
    s = await send({
      op: "editClip",
      action: "move",
      track,
      clip,
      position: 5,
    });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].clips[0].start, 3.25);
    s = await send({ op: "redo" });
    assert.equal(s.tracks[0].clips[0].start, 5);
    await send({ op: "removeTrack", track });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].id, track);
    assert.equal(s.tracks[0].clips[0].id, clip);
    await rpc.close();
    rpc = startSession(folder);
    s = await send({ op: "state" });
    assert.equal(s.recovered, true);
    assert.equal(s.title, "Unsaved jam");
    assert.equal(s.tracks[0].clips[0].duration, 0.5);
    assert.equal(s.canUndo, false, "History is limited to the running session");
    assert.equal(
      JSON.parse(readFileSync(resolve(folder, "recovery.json"), "utf8")).title,
      s.title,
    );
    await send({ op: "removeClip", track, clip });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].clips[0].id, clip);
  } finally {
    await rpc.close();
  }
});
