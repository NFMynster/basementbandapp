import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
import { PluginLibrary } from "../desktop/plugin-library.cjs";
import { validate } from "../desktop/session-files.cjs";
import { writeMonoWav } from "./helpers/wav.mjs";

function audioSamples(path) {
  const b = readFileSync(path);
  for (let at = 12; at + 8 <= b.length;) {
    const size = b.readUInt32LE(at + 4);
    if (b.toString("ascii", at, at + 4) === "data")
      return Array.from(
        { length: size / 6 },
        (_, i) => b.readIntLE(at + 8 + i * 6, 3) / 8388608,
      );
    at += 8 + size + (size % 2);
  }
  throw new Error("Missing WAV data");
}

test("built-in effects process sound, preserve raw capture, and survive history, presets and save/open", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/built-ins-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  const peak = (samples) => Math.max(...samples.map(Math.abs));
  try {
    let s = await send({ op: "state" });
    const track = s.tracks[0].id;
    assert.equal(s.limiterEnabled, true);
    await send({ op: "track", track, monitor: true, gain: 1 });
    const dry = await send({ op: "pump", frames: 8192, left: 0.4 });
    assert.ok(Math.abs(dry.left.at(-1) - 0.4) < 1e-5);
    await send({
      op: "track",
      track,
      compressorEnabled: true,
      compressorAmount: 1,
    });
    const compressed = await send({ op: "pump", frames: 8192, left: 0.4 });
    assert.ok(
      compressed.left.at(-1) < 0.1,
      "Compressor reduces sustained loud signals",
    );
    await send({
      op: "track",
      track,
      compressorEnabled: false,
      gateEnabled: true,
      gateThreshold: -40,
    });
    await send({ op: "pump", frames: 8192 });
    const quiet = await send({ op: "pump", frames: 8192, left: 0.001 });
    assert.ok(peak(quiet.left) < 0.0001, "Gate attenuates quiet input");
    const loud = await send({ op: "pump", frames: 8192, left: 0.2 });
    assert.ok(
      Math.abs(loud.left.at(-1) - 0.2) < 0.001,
      "Gate opens for the performance",
    );

    await send({ op: "track", track, armed: true });
    await send({ op: "record" });
    await send({ op: "pump", frames: 8192, left: 0.001 });
    s = await send({ op: "stop" });
    const snapshot = await send({ op: "snapshot" });
    const raw = readFileSync(snapshot.tracks[0].clips[0].path);
    assert.ok(raw.length > 1000);
    await send({ op: "track", track, gateEnabled: false, monitor: false });
    await send({ op: "seek", position: 0 });
    await send({ op: "play" });
    const recording = await send({ op: "pump", frames: 8192 });
    assert.ok(
      peak(recording.left) > 0.0009,
      "Gate never removes the original recording",
    );
    await send({ op: "stop" });

    await send({
      op: "track",
      track,
      monitor: true,
      reverbEnabled: true,
      reverbAmount: 1,
    });
    await send({ op: "pump", frames: 256, left: 0.2 });
    const tail = await send({ op: "pump", frames: 8192 });
    assert.ok(peak(tail.left) > 0.001, "Built-in room produces a tail");
    await send({ op: "track", track, reverbEnabled: false });
    assert.equal(
      peak((await send({ op: "pump", frames: 8192 })).left),
      0,
      "Bypass is dry",
    );
    const patch = {
      compressorEnabled: true,
      compressorAmount: 0.6,
      reverbEnabled: true,
      reverbAmount: 0.3,
      gateEnabled: true,
      gateThreshold: -48,
    };
    await send({ op: "track", track, ...patch });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].reverbEnabled, false);
    s = await send({ op: "redo" });
    for (const [key, value] of Object.entries(patch))
      typeof value === "number"
        ? assert.ok(Math.abs(s.tracks[0][key] - value) < 1e-5)
        : assert.equal(s.tracks[0][key], value);
    const library = new PluginLibrary(folder, "unused", []);
    const savedPreset = await library.command(
      { op: "savePreset", name: "Room", track },
      send,
    );
    await send({
      op: "track",
      track,
      reverbEnabled: false,
      gateEnabled: false,
    });
    await library.command(
      { op: "applyPreset", id: savedPreset.presets[0].id, track },
      send,
    );
    assert.equal((await send({ op: "state" })).tracks[0].gateEnabled, true);
    const path = resolve(folder, "effects.basement");
    await send({ op: "limiter", value: false });
    await send({ op: "save", path });
    const saved = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(saved.outputClipped, undefined);
    assert.equal(saved.tracks[0].compressorEnabled, true);
    await send({ op: "new" });
    s = await send({ op: "open", path });
    assert.equal(s.limiterEnabled, false);
    assert.equal(s.tracks[0].reverbEnabled, true);
    assert.throws(
      () => validate({ ...saved, limiterEnabled: "yes" }),
      /Invalid/,
    );
    saved.tracks[0].gateThreshold = -100;
    assert.throws(() => validate(saved), /Invalid/);
    assert.match(
      (await rpc.send({ op: "track", track, compressorAmount: 2 })).error,
      /Invalid effect/,
    );
  } finally {
    await rpc.close();
  }
});

test("output protection is transparent below its ceiling, stereo linked, resettable and undoable", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/protection-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    const s = await send({ op: "state" });
    await send({
      op: "track",
      track: s.tracks[0].id,
      monitor: true,
      gain: 1,
      pan: 0.5,
    });
    await send({ op: "master", value: 2 });
    const protectedAudio = await send({ op: "pump", frames: 512, left: 0.8 });
    assert.ok(protectedAudio.right.every((x) => x <= 0.98001));
    assert.ok(
      Math.abs(protectedAudio.left[0] / protectedAudio.right[0] - 0.5) < 1e-6,
    );
    assert.equal(protectedAudio.state.outputClipped, true);
    assert.equal((await send({ op: "clearDiagnostics" })).outputClipped, false);
    await send({ op: "limiter", value: false });
    const clipped = await send({ op: "pump", frames: 512, left: 0.8 });
    assert.equal(clipped.right[0], 1);
    assert.equal(clipped.state.outputClipped, true);
    assert.equal((await send({ op: "undo" })).limiterEnabled, true);
    assert.equal((await send({ op: "redo" })).limiterEnabled, false);
    const clear = await send({ op: "clearDiagnostics" });
    assert.equal(clear.processingDropouts, 0);
    assert.equal(clear.recordingDropouts, 0);
  } finally {
    await rpc.close();
  }
});

test("audio export includes built-in sound, deterministic reverb tails and peak protection", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/sound-export-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  const render = async () =>
    audioSamples(
      (await send({ op: "export", mode: "mix", path: folder })).files[0],
    );
  try {
    const s = await send({ op: "state" });
    const track = s.tracks[0].id;
    const source = resolve(folder, "dry.wav");
    writeMonoWav(source, 9600, () => 0.4);
    await send({ op: "import", track, path: source, position: 0 });
    await send({ op: "track", track, gain: 1 });
    const dry = await render();
    await send({
      op: "track",
      track,
      compressorEnabled: true,
      compressorAmount: 1,
    });
    const compressed = await render();
    assert.ok(compressed[8000] < dry[8000] * 0.3);
    await send({
      op: "track",
      track,
      compressorEnabled: false,
      reverbEnabled: true,
      reverbAmount: 0.7,
    });
    const wet = await render();
    assert.equal(wet.length, dry.length + 4 * 48000);
    assert.ok(
      wet.slice(dry.length, dry.length + 5000).some((x) => Math.abs(x) > 0.001),
    );
    assert.deepEqual(
      await render(),
      wet,
      "Export starts with clean DSP state each time",
    );
    await send({ op: "track", track, reverbEnabled: false, gain: 1.5 });
    await send({ op: "master", value: 2 });
    assert.ok((await render()).every((x) => x < 0.981));
    assert.equal((await send({ op: "state" })).outputClipped, true);
    await send({ op: "limiter", value: false });
    assert.ok((await render())[1000] > 0.999);
    const legacy = await send({ op: "snapshot" });
    legacy.version = 4;
    delete legacy.limiterEnabled;
    for (const t of legacy.tracks)
      for (const key of [
        "compressorEnabled",
        "compressorAmount",
        "reverbEnabled",
        "reverbAmount",
        "gateEnabled",
        "gateThreshold",
      ])
        delete t[key];
    validate(legacy);
    await send({ op: "restore", session: legacy, folder });
    const reopened = await send({ op: "state" });
    assert.equal(reopened.limiterEnabled, false);
    assert.equal(reopened.tracks[0].compressorEnabled, false);
  } finally {
    await rpc.close();
  }
});
