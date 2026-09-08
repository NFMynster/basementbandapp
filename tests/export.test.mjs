import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startRpc } from "./helpers/process.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";

function wav(path) {
  const b = readFileSync(path);
  assert.equal(b.toString("ascii", 0, 4), "RIFF");
  let data;
  for (let offset = 12; offset + 8 <= b.length;) {
    const length = b.readUInt32LE(offset + 4);
    const name = b.toString("ascii", offset, offset + 4);
    if (name === "fmt ") {
      assert.equal(b.readUInt16LE(offset + 10), 2);
      assert.equal(b.readUInt32LE(offset + 12), 48000);
      assert.equal(b.readUInt16LE(offset + 22), 24);
    }
    if (name === "data") data = b.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  assert.ok(data);
  return {
    frames: data.length / 6,
    sample: (i, channel = 0) =>
      data.readIntLE(i * 6 + channel * 3, 3) / 8388608,
  };
}

test("WAV export preserves alignment, processing, mute/solo and existing exports", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/export-"));
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
    const s = await send({ op: "init", folder });
    const [g, b] = s.tracks;
    assert.match(
      (await send({ op: "export", mode: "separate", path: folder })).error,
      /No audible/,
    );
    const source = resolve(folder, "source.wav");
    writeMonoWav(source, 4800, () => 0.25);
    await send({ op: "seek", position: 0.1 });
    await send({ op: "import", track: g.id, path: source });
    await send({ op: "import", track: b.id, path: source });
    await send({ op: "track", track: g.id, gain: 1, pan: 0.5, mute: true });
    await send({ op: "track", track: b.id, gain: 1 });
    await send({
      op: "plugin",
      track: g.id,
      path: resolve(
        "build/native/TestGain_artefacts/Release/VST3/Basement Test Gain.vst3",
      ),
    });
    await send({ op: "loop", enabled: true, start: 0, end: 0.05 });
    const separate = await send({
      op: "export",
      mode: "separate",
      path: folder,
    });
    assert.equal(separate.error, undefined, separate.error);
    assert.equal(separate.files.length, 2);
    const first = wav(separate.files[0]),
      second = wav(separate.files[1]);
    assert.equal(first.frames, 9600);
    assert.equal(second.frames, first.frames);
    assert.equal(first.sample(100), 0);
    assert.ok(
      Math.abs(first.sample(5000) - 0.0625) < 0.0001,
      "Plugin and pan rendered even on muted stem",
    );
    assert.ok(Math.abs(first.sample(5000, 1) - 0.125) < 0.0001);
    const mix = await send({ op: "export", mode: "mix", path: folder });
    assert.notEqual(mix.folder, separate.folder);
    assert.ok(
      Math.abs(wav(mix.files[0]).sample(5000) - 0.25) < 0.0001,
      "Mix excludes muted guitar",
    );
    await send({ op: "track", track: g.id, mute: false, solo: true });
    await send({ op: "master", value: 0.5 });
    const solo = await send({ op: "export", mode: "mix", path: folder });
    assert.ok(
      Math.abs(wav(solo.files[0]).sample(5000) - 0.03125) < 0.0001,
      "Mix respects solo and master output volume",
    );
    await send({ op: "bypass", track: g.id, value: true });
    const single = await send({
      op: "export",
      mode: "separate",
      track: g.id,
      path: folder,
    });
    assert.equal(single.files.length, 1);
    assert.ok(
      Math.abs(wav(single.files[0]).sample(5000) - 0.125) < 0.0001,
      "Bypass is preserved",
    );
    const after = await send({ op: "state" });
    assert.equal(after.position, 0.1);
    assert.equal(after.looping, true);
    assert.equal(after.tracks[0].solo, true);
    await send({ op: "play" });
    assert.match(
      (await send({ op: "export", mode: "mix", path: folder })).error,
      /Stop playback/,
    );
  } finally {
    await rpc.close();
  }
});
