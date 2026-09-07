import test from "node:test";
import assert from "node:assert/strict";
import { startRpc } from "./helpers/process.mjs";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeMonoWav } from "./helpers/wav.mjs";

test("native engine: synchronized capture, routing, loop boundaries, mute/solo, session restore", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/take-"));
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
    assert.equal(s.tracks.length, 2);
    const [g, b] = s.tracks;
    assert.match((await send({ op: "record" })).error, /Arm at least/);
    await send({ op: "track", track: g.id, armed: true, input: 0, gain: 1 });
    await send({ op: "track", track: b.id, armed: true, input: 1, gain: 1 });
    await send({ op: "record" });
    const emptyTake = await send({ op: "stop" });
    assert.equal(
      emptyTake.error,
      undefined,
      "Immediately stopping a take is safe",
    );
    assert.ok(emptyTake.tracks.every((t) => t.clips.length === 0));
    await send({ op: "seek", position: 1 });
    s = await send({ op: "record" });
    assert.equal(s.recording, true);
    assert.match(
      (await send({ op: "track", track: g.id, input: 1 })).error,
      /Stop recording/,
    );
    for (let i = 0; i < 4; i++)
      await send({ op: "pump", frames: 512, left: 0.25, right: -0.5 });
    s = await send({ op: "stop" });
    assert.equal(s.recording, false);
    const clips = s.tracks.map((t) => t.clips[0]);
    assert.equal(clips[0].start, 1);
    assert.equal(clips[1].start, 1);
    assert.ok(Math.abs(clips[0].duration - 2048 / 48000) < 1e-12);
    assert.equal(clips[0].duration, clips[1].duration);
    await send({ op: "seek", position: 1 });
    await send({ op: "play" });
    let rendered = await send({ op: "pump", frames: 16 });
    assert.ok(
      rendered.left.every((x) => Math.abs(x + 0.25) < 0.00001),
      "Distinct input channels mix to -0.25",
    );
    await send({ op: "track", track: g.id, solo: true });
    rendered = await send({ op: "pump", frames: 16 });
    assert.ok(
      rendered.left.every((x) => Math.abs(x - 0.25) < 0.00001),
      "Solo excludes bass",
    );
    await send({ op: "track", track: g.id, mute: true });
    rendered = await send({ op: "pump", frames: 16 });
    assert.ok(
      rendered.left.every((x) => x === 0),
      "Mute overrides solo",
    );
    await send({ op: "track", track: g.id, mute: false, solo: false });
    await send({ op: "loop", start: 1, end: 1.05, enabled: true });
    await send({ op: "seek", position: 1.0499 });
    rendered = await send({ op: "pump", frames: 16 });
    assert.ok(
      rendered.state.position >= 1 && rendered.state.position < 1.001,
      "Loop wraps within the audio block",
    );
    assert.ok(
      Math.abs(rendered.left[15] + 0.25) < 0.00001,
      "Audio resumes inside loop after wrap",
    );
    await send({ op: "stop" });
    const snapshot = await send({ op: "snapshot" });
    for (const t of snapshot.tracks) {
      const wav = readFileSync(t.clips[0].path);
      assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    }
    const pluginPath = resolve(
      "build/native/TestGain_artefacts/Release/VST3/Basement Test Gain.vst3",
    );
    const pluginResult = await send({
      op: "plugin",
      track: g.id,
      path: pluginPath,
    });
    assert.equal(pluginResult.error, undefined, pluginResult.error);
    assert.equal(pluginResult.tracks[0].pluginName, "Basement Test Gain");
    await send({ op: "track", track: g.id, solo: true });
    await send({ op: "seek", position: 1 });
    await send({ op: "play" });
    rendered = await send({ op: "pump", frames: 16 });
    assert.ok(
      rendered.left.every((x) => Math.abs(x - 0.125) < 0.00001),
      "VST3 processes audio",
    );
    await send({ op: "bypass", track: g.id, value: true });
    rendered = await send({ op: "pump", frames: 16 });
    assert.ok(
      rendered.left.every((x) => Math.abs(x - 0.25) < 0.00001),
      "VST3 bypass restores dry signal",
    );
    await send({ op: "stop" });
    await send({ op: "bypass", track: g.id, value: false });
    const withPlugin = await send({ op: "snapshot" });
    assert.ok(withPlugin.tracks[0].pluginState.length > 0);
    await send({ op: "new", folder });
    s = await send({ op: "restore", folder, session: withPlugin });
    assert.equal(
      s.tracks[0].pluginName,
      "Basement Test Gain",
      "Plugin restored with session",
    );
    await send({ op: "seek", position: 1 });
    await send({ op: "play" });
    rendered = await send({ op: "pump", frames: 16 });
    assert.ok(
      rendered.left.every((x) => Math.abs(x - 0.125) < 0.00001),
      "Restored plugin processes with saved gain",
    );
    await send({ op: "stop" });
    const removed = await send({ op: "removePlugin", track: g.id });
    assert.equal(removed.tracks[0].pluginName, "");
    assert.equal((await send({ op: "snapshot" })).tracks[0].pluginPath, "");
    await send({ op: "new", folder });
    s = await send({ op: "restore", folder, session: snapshot });
    assert.equal(s.tracks[0].clips[0].id, clips[0].id);
    assert.equal(s.looping, true);
    const invalid = structuredClone(snapshot);
    invalid.tracks[0].clips[0].path = resolve(folder, "missing.wav");
    assert.ok((await send({ op: "restore", folder, session: invalid })).error);
    assert.equal(
      (await send({ op: "state" })).tracks[0].clips[0].id,
      clips[0].id,
      "Invalid restore preserves existing session",
    );
    const longAudio = resolve(folder, "long.wav");
    writeMonoWav(longAudio, 6_000_000, () => 0.25);
    const imported = await send({ op: "import", track: g.id, path: longAudio });
    assert.equal(imported.error, undefined, imported.error);
    const longClip = imported.tracks[0].clips.at(-1);
    assert.equal(longClip.duration, 125);
    assert.equal(longClip.peaks.length, 400);
    assert.ok(
      longClip.peaks.every(
        (p) => Number.isFinite(p) && Math.abs(p - 0.25) < 0.0001,
      ),
      "Long-file waveform buckets do not overflow 32-bit multiplication",
    );
  } finally {
    await rpc.close();
  }
});
