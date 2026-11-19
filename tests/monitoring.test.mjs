import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { startRpc } from "./helpers/process.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";

test("monitoring is independent of capture; master volume, no-device MIDI and positioned imports", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/monitor-"));
  const rpc = startRpc(
    resolve(
      "artifacts/native/BasementAudio" +
        (process.platform === "win32" ? ".exe" : ""),
    ),
    ["--test-device"],
    { framed: true },
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r;
  };
  const output = async (expected, left = 0.4) => {
    const r = await send({ op: "pump", frames: 128, left });
    assert.ok(
      r.left.every((v) => Math.abs(v - expected) < 0.00001),
      `Expected ${expected}, got ${r.left[0]}`,
    );
  };
  try {
    let s = await send({ op: "init", folder });
    assert.equal(s.bufferSize, 256);
    assert.equal(
      s.audioInputActive,
      false,
      "Unmarked audio tracks must not keep the input open",
    );
    assert.equal(
      s.masterGain,
      1,
      "Default output leaves room below the 2x maximum",
    );
    await send({ op: "play" });
    for (const position of [4, 0, 8, 1]) {
      s = await send({ op: "seek", position });
      assert.equal(s.playing, true);
      assert.equal(s.position, position);
      assert.equal(s.diskOverrun, false);
    }
    await send({ op: "stop" });
    await send({ op: "seek", position: 0 });
    const audio = s.tracks[0].id;
    assert.equal(s.tracks[0].monitor, false);
    await send({ op: "track", track: audio, gain: 1 });
    await output(0);
    s = await send({ op: "track", track: audio, monitor: true });
    assert.equal(s.audioInputActive, true, "Audio monitoring needs input");
    await output(0.4);
    await send({ op: "master", value: 2 });
    await output(0.8);
    await output(0.98, 0.8); // Output protection catches boosted peaks.
    await send({ op: "limiter", value: false });
    await output(1, 0.8); // Bypass retains the final hard safety clamp.
    await send({ op: "master", value: 0.5 });
    await output(0.2);
    await send({ op: "track", track: audio, mute: true });
    await output(0);
    await send({
      op: "track",
      track: audio,
      mute: false,
      monitor: false,
      armed: true,
    });
    await send({ op: "record" });
    await output(0);
    s = await send({ op: "stop" });
    assert.ok(
      s.tracks[0].clips[0].peaks.every((v) => Math.abs(v - 0.4) < 0.00001),
      "Monitor/master must not change raw capture",
    );
    await send({ op: "track", track: audio, armed: false });
    const file = resolve(folder, "import.wav");
    writeMonoWav(file, 480, () => 0.1);
    await send({ op: "seek", position: 0 });
    s = await send({ op: "import", track: audio, path: file, position: 3.5 });
    assert.equal(s.position, 0, "Import must not move playhead");
    assert.equal(s.tracks[0].clips.at(-1).start, 3.5);
    s = await send({ op: "addTrack", kind: "midi" });
    const midi = s.tracks.at(-1).id;
    assert.equal(
      s.audioInputActive,
      false,
      "MIDI monitoring must use output-only when no audio track needs input",
    );
    assert.equal(s.tracks.at(-1).monitor, true);
    assert.equal(s.tracks.at(-1).midiDevice, "");
    assert.equal(s.tracks.at(-1).armed, false);
    await send({
      op: "plugin",
      track: midi,
      path: resolve(
        "build/native/TestInstrument_artefacts/Release/VST3/Basement TestInstrument.vst3",
      ),
    });
    await send({ op: "track", track: midi, gain: 1 });
    await send({ op: "testMidi", track: midi, note: 36 });
    await output(0.125, 0);
    s = await send({ op: "track", track: midi, armed: true });
    assert.equal(
      s.audioInputActive,
      false,
      "Marking MIDI for capture must not enable microphone input",
    );
    await send({ op: "seek", position: 1 });
    await send({ op: "record" }); // No MIDI device required.
    await send({ op: "testMidi", track: midi, note: 36 });
    await output(0.125, 0); // MIDI tracks have no monitor switch: you hear what you record.
    s = await send({ op: "stop" });
    assert.equal(s.tracks.at(-1).clips[0].notes[0].note, 36);
    const snapshot = await send({ op: "snapshot" });
    s = await send({ op: "restore", session: snapshot, folder });
    assert.equal(s.masterGain, 0.5);
    await send({ op: "seek", position: 1 });
    await send({ op: "play" });
    await output(0.125, 0);
  } finally {
    await rpc.close();
  }
});
