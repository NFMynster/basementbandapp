import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startRpc } from "./helpers/process.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";

test("MIDI instruments record, loop, chase notes, restore and export; plug-in and capture latency align", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/midi-"));
  const rpc = startRpc(
    resolve(
      "artifacts/native/BasementAudio" +
        (process.platform === "win32" ? ".exe" : ""),
    ),
    ["--test-device"],
    { framed: true },
  );
  const send = rpc.send;
  try {
    let s = await send({ op: "init", folder });
    s = await send({ op: "addTrack", kind: "midi" });
    const id = s.tracks.at(-1).id;
    assert.equal(s.tracks.at(-1).kind, "midi");
    let result = await send({
      op: "plugin",
      track: id,
      path: resolve(
        "build/native/TestInstrument_artefacts/Release/VST3/Basement TestInstrument.vst3",
      ),
    });
    assert.equal(result.error, undefined, result.error);
    await send({
      op: "track",
      track: id,
      armed: true,
      gain: 1,
      midiDevice: "test",
      midiChannel: 10,
    });
    await send({ op: "testMidi", track: id, note: 36, channel: 1 });
    result = await send({ op: "pump", frames: 240 });
    assert.ok(
      result.left.every((v) => v === 0),
      "Channel filter rejects channel 1",
    );
    await send({ op: "testMidi", track: id, note: 36, channel: 10 });
    result = await send({ op: "pump", frames: 240 });
    assert.ok(
      result.left.every((v) => Math.abs(v - 0.25) < 0.0001),
      "Live MIDI sounds while transport stopped",
    );
    await send({ op: "stop" });
    await send({ op: "record" });
    await send({ op: "testMidi", track: id, note: 36, channel: 10 });
    await send({ op: "pump", frames: 480 });
    await send({ op: "testMidi", track: id, note: 36, channel: 10, off: true });
    await send({ op: "pump", frames: 480 });
    s = await send({ op: "stop" });
    const clip = s.tracks.at(-1).clips[0];
    assert.equal(clip.kind, "midi");
    assert.equal(clip.notes[0].note, 36);
    assert.ok(Math.abs(clip.notes[0].duration - 0.01) < 0.0011);
    await send({ op: "track", track: id, armed: false });
    await send({ op: "seek", position: 0.005 });
    await send({ op: "play" });
    result = await send({ op: "pump", frames: 120 });
    assert.ok(
      result.left.every((v) => Math.abs(v - 0.25) < 0.0001),
      "Seeking into held note chases note-on",
    );
    await send({ op: "loop", start: 0, end: 0.05, enabled: true });
    await send({ op: "seek", position: 0.049 });
    result = await send({ op: "pump", frames: 240 });
    assert.ok(
      result.left.slice(60).every((v) => Math.abs(v - 0.25) < 0.0001),
      "Loop wrap retriggers MIDI",
    );
    await send({ op: "stop" });
    const snapshot = await send({ op: "snapshot" });
    assert.match(snapshot.tracks.at(-1).clips[0].path, /\.mid$/);
    assert.equal(
      readFileSync(snapshot.tracks.at(-1).clips[0].path).toString(
        "ascii",
        0,
        4,
      ),
      "MThd",
    );
    const exported = await send({
      op: "export",
      mode: "separate",
      track: id,
      path: folder,
    });
    assert.equal(exported.error, undefined, exported.error);
    assert.equal(exported.files.length, 1);
    await send({ op: "new", folder });
    result = await send({ op: "restore", folder, session: snapshot });
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.tracks.at(-1).midiChannel, 10);
    assert.equal(result.tracks.at(-1).clips[0].notes.length, 1);
    await send({ op: "new", folder });
    s = await send({ op: "state" });
    const g = s.tracks[0].id,
      b = s.tracks[1].id;
    const source = resolve(folder, "impulse.wav");
    writeMonoWav(source, 4800, (i) => (i === 0 || i === 1000 ? 0.5 : 0));
    await send({ op: "import", track: g, path: source });
    await send({ op: "import", track: b, path: source });
    await send({ op: "track", track: g, gain: 1 });
    await send({ op: "track", track: b, gain: 0.5 });
    result = await send({
      op: "plugin",
      track: g,
      path: resolve(
        "build/native/TestDelay_artefacts/Release/VST3/Basement TestDelay.vst3",
      ),
    });
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.tracks[0].latencySamples, 480);
    await send({ op: "play" });
    result = await send({ op: "pump", frames: 512 });
    assert.ok(
      Math.abs(result.left[0] - 0.5) < 0.0001,
      "Delayed and dry impulses align at timeline zero",
    );
    assert.ok(Math.abs(result.left[480]) < 0.0001, "No late duplicate impulse");
    await send({ op: "seek", position: 1000 / 48000 });
    result = await send({ op: "pump", frames: 10 });
    assert.ok(
      Math.abs(result.left[0] - 0.5) < 0.0001,
      "Seek reprimes delay compensation",
    );
    await send({ op: "stop" });
    const stems = await send({ op: "export", mode: "separate", path: folder });
    assert.equal(stems.error, undefined, stems.error);
    assert.equal(
      Buffer.compare(
        readFileSync(stems.files[0]),
        readFileSync(stems.files[1]),
      ),
      0,
      "Compensated export matches equivalent dry track",
    );
    await send({ op: "new", folder });
    s = await send({ op: "state" });
    await send({ op: "testLatency", input: 240, output: 240 });
    await send({ op: "track", track: s.tracks[0].id, armed: true });
    await send({ op: "record" });
    await send({ op: "pump", frames: 480, left: 0.1 });
    await send({ op: "pump", frames: 480, left: 0.5 });
    s = await send({ op: "stop" });
    assert.ok(Math.abs(s.tracks[0].clips[0].duration - 0.01) < 0.0001);
    assert.ok(
      s.tracks[0].clips[0].peaks.every((v) => Math.abs(v - 0.5) < 0.0001),
      "Capture removes input/output delay from take placement",
    );
  } finally {
    await rpc.close();
  }
});
