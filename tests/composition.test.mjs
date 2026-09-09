import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";
import { PluginLibrary } from "../desktop/plugin-library.cjs";

test("MIDI composition, fades, tempo host, mixer history and track presets", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/complete-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    let s = await send({ op: "addTrack", kind: "midi" });
    const track = s.tracks.at(-1).id;
    s = await send({ op: "undo" });
    assert.ok(!s.tracks.some((t) => t.id === track));
    s = await send({ op: "redo" });
    assert.equal(s.tracks.at(-1).id, track);
    s = await send({ op: "createMidi", track, position: 1, length: 4 });
    let clip = s.tracks.at(-1).clips[0];
    assert.equal(clip.notes.length, 0);
    s = await send({
      op: "editClip",
      action: "notes",
      track,
      clip: clip.id,
      edits: [
        { start: 0, duration: 0.5, note: 60, velocity: 50, channel: 2 },
        { start: 1, duration: 0.25, note: 64, velocity: 100, channel: 2 },
      ],
    });
    clip = s.tracks.at(-1).clips[0];
    assert.deepEqual(
      clip.notes.map((n) => [n.note, n.velocity, n.channel]),
      [
        [60, 50, 2],
        [64, 100, 2],
      ],
    );
    s = await send({
      op: "editClip",
      action: "notes",
      track,
      clip: clip.id,
      edits: clip.notes.map((n) => ({
        ...n,
        start: n.start + 0.25,
        note: n.note + 2,
        velocity: 75,
      })),
    });
    clip = s.tracks.at(-1).clips[0];
    assert.equal(clip.notes[0].start, 0.25);
    assert.equal(clip.notes[1].note, 66);
    s = await send({
      op: "editClip",
      action: "notes",
      track,
      clip: clip.id,
      edits: [{ event: clip.notes[0].event, delete: true }],
    });
    assert.equal(s.tracks.at(-1).clips[0].notes.length, 1);
    s = await send({ op: "undo" });
    assert.equal(s.tracks.at(-1).clips[0].notes.length, 2);
    s = await send({
      op: "editClip",
      action: "trim",
      track,
      clip: clip.id,
      position: 1,
      length: 6,
    });
    assert.equal(s.tracks.at(-1).clips[0].duration, 6);
    s = await send({
      op: "editClip",
      action: "trim",
      track,
      clip: clip.id,
      position: 0,
      length: 7,
    });
    assert.equal(s.tracks.at(-1).clips[0].notes[0].start, 1.25);
    s = await send({ op: "undo" });
    assert.equal(s.tracks.at(-1).clips[0].notes[0].start, 0.25);
    s = await send({ op: "redo" });
    assert.equal(s.tracks.at(-1).clips[0].duration, 7);
    s = await send({
      op: "editClip",
      action: "notes",
      track,
      clip: clip.id,
      edits: [{ start: 6, duration: 0.5, note: 72, velocity: 90, channel: 2 }],
    });
    assert.equal(s.tracks.at(-1).clips[0].notes.at(-1).start, 6);
    const instrument = resolve(
      "build/native/TestInstrument_artefacts/Release/VST3/Basement TestInstrument.vst3",
    );
    const gain = resolve(
      "build/native/TestGain_artefacts/Release/VST3/Basement Test Gain.vst3",
    );
    const delay = resolve(
      "build/native/TestDelay_artefacts/Release/VST3/Basement TestDelay.vst3",
    );
    await send({ op: "plugin", track, path: instrument });
    await send({ op: "tempo", value: 90 });
    await send({ op: "loop", start: 1, end: 3, enabled: true });
    await send({ op: "seek", position: 1 });
    await send({ op: "play" });
    await send({ op: "testMidi", track, note: 127 });
    const hostProbe = await send({ op: "pump", frames: 64 });
    assert.ok(
      Math.abs(hostProbe.left[0] - 0.072) < 0.00001,
      "Instrument receives tempo and playing state",
    );
    assert.ok(
      Math.abs(hostProbe.right[0] - 0.012) < 0.00001,
      "Instrument receives PPQ and looping state",
    );
    await send({ op: "stop" });
    await send({ op: "plugin", track, path: gain, append: true });
    s = await send({ op: "plugin", track, path: delay, append: true });
    const order = s.tracks.at(-1).effects.map((e) => e.id);
    s = await send({ op: "reorderEffect", track, effect: order[1], index: 0 });
    assert.deepEqual(
      s.tracks.at(-1).effects.map((e) => e.id),
      order.toReversed(),
    );
    s = await send({ op: "undo" });
    assert.deepEqual(
      s.tracks.at(-1).effects.map((e) => e.id),
      order,
    );
    s = await send({ op: "redo" });
    assert.deepEqual(
      s.tracks.at(-1).effects.map((e) => e.id),
      order.toReversed(),
    );
    await send({
      op: "track",
      track,
      eqBass: 2,
      gain: 0.5,
      historyGroup: "mix",
    });
    await send({
      op: "track",
      track,
      eqBass: 4,
      gain: 0.7,
      historyGroup: "mix",
    });
    s = await send({ op: "undo" });
    assert.equal(s.tracks.at(-1).eqBass, 0);
    s = await send({ op: "redo" });
    assert.equal(s.tracks.at(-1).eqBass, 4);
    assert.ok(Math.abs(s.tracks.at(-1).gain - 0.7) < 1e-6);
    const library = new PluginLibrary(
      folder,
      resolve(
        "artifacts/native/BasementAudio" +
          (process.platform === "win32" ? ".exe" : ""),
      ),
      [],
    );
    let lib = await library.command(
      { op: "savePreset", track, name: "Keys" },
      send,
    );
    assert.equal(lib.presets.length, 1);
    s = await send({ op: "addTrack", kind: "midi" });
    const second = s.tracks.at(-1).id;
    lib = await library.command(
      { op: "applyPreset", track: second, id: lib.presets[0].id },
      send,
    );
    assert.equal(lib.session.tracks.at(-1).eqBass, 4);
    assert.equal(lib.session.tracks.at(-1).effects.length, 2);
    assert.equal(lib.session.tracks.at(-1).clips.length, 0);
    s = await send({ op: "undo" });
    assert.equal(s.tracks.at(-1).pluginName, "");
    s = await send({ op: "redo" });
    assert.equal(s.tracks.at(-1).effects.length, 2);
    const audio = s.tracks[0].id,
      file = resolve(folder, "flat.wav");
    writeMonoWav(file, 48000, () => 0.2);
    s = await send({ op: "import", track: audio, path: file, position: 0 });
    const audioClip = s.tracks[0].clips[0].id;
    await send({ op: "track", track: audio, gain: 1 });
    await send({
      op: "editClip",
      action: "sound",
      track: audio,
      clip: audioClip,
      gain: 0.5,
      fadeIn: 0.1,
      fadeOut: 0.1,
    });
    await send({ op: "loop", start: 0, end: 1, enabled: false });
    await send({ op: "seek", position: 0 });
    await send({ op: "play" });
    const block = await send({ op: "pump", frames: 4800 });
    assert.ok(Math.abs(block.left[0]) < 1e-6);
    assert.ok(Math.abs(block.left[2400] - 0.05) < 0.001);
    await send({ op: "stop" });
    const saved = resolve(folder, "Full.basement");
    await send({ op: "save", path: saved });
    await send({ op: "new" });
    s = await send({ op: "open", path: saved });
    assert.equal(s.tracks.find((t) => t.id === track).clips[0].duration, 7);
    assert.equal(
      s.tracks.find((t) => t.id === track).clips[0].notes.at(-1).start,
      6,
    );
    assert.equal(s.tracks[0].clips[0].fadeIn, 0.1);
    assert.equal(s.tracks[0].clips[0].gain, 0.5);
    assert.equal(
      s.tracks.find((t) => t.id === track).clips[0].notes[0].velocity,
      75,
    );
    assert.ok(
      readFileSync(resolve(folder, "sound-library.json"), "utf8").includes(
        "Keys",
      ),
    );
    await library.ready;
    await library.scan(resolve("build/native/TestGain_artefacts/Release/VST3"));
    lib = await library.command({ op: "list" }, send);
    assert.equal(lib.plugins.length, 1, JSON.stringify(lib.errors));
    assert.ok(lib.plugins[0].name.includes("Gain"));
    lib = await library.command(
      { op: "favorite", id: lib.plugins[0].id },
      send,
    );
    assert.equal(lib.plugins[0].favorite, true);
    const again = new PluginLibrary(folder, "", []);
    await again.ready;
    assert.equal(again.data.plugins[0].favorite, true);
  } finally {
    await rpc.close();
  }
});
