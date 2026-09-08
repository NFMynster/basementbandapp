import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startRpc } from "./helpers/process.mjs";
import { writeMonoWav } from "./helpers/wav.mjs";

test("region edge trims preserve source, reject extension, survive restore and align playback", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/trim-"));
  const source = resolve(folder, "source.wav");
  writeMonoWav(source, 48000, (i) => (i < 24000 ? 0.2 : 0.4));
  const original = readFileSync(source);
  const rpc = startRpc(
    process.env.BASEMENT_NATIVE_TEST ||
      resolve(
        "artifacts/native/BasementAudio" +
          (process.platform === "win32" ? ".exe" : ""),
      ),
    ["--test-device"],
    { framed: true },
  );
  const send = async (c) => {
    const result = await rpc.send(c);
    assert.equal(result.error, undefined, result.error);
    return result;
  };
  try {
    let s = await send({ op: "init", folder });
    const track = s.tracks[0].id;
    await send({ op: "track", track, gain: 1 });
    s = await send({ op: "import", track, path: source, position: 2 });
    const clip = s.tracks[0].clips[0].id;
    s = await send({
      op: "editClip",
      track,
      clip,
      action: "trim",
      position: 2.5,
      length: 0.5,
    });
    assert.equal(s.tracks[0].clips[0].offset, 0.5);
    s = await send({
      op: "editClip",
      track,
      clip,
      action: "trim",
      position: 2.5,
      length: 0.25,
    });
    assert.equal(s.tracks[0].clips[0].duration, 0.25);
    for (const changes of [
      { position: 2.4, length: 0.25 },
      { position: 2.5, length: 0.6 },
      { position: 2.5, length: 0 },
    ]) {
      assert.match(
        (
          await rpc.send({
            op: "editClip",
            track,
            clip,
            action: "trim",
            ...changes,
          })
        ).error,
        /Trim/,
      );
    }
    const snapshot = await send({ op: "snapshot" });
    s = await send({ op: "restore", folder, session: snapshot });
    assert.equal(s.tracks[0].clips[0].duration, 0.25);
    await send({ op: "seek", position: 2.5 });
    await send({ op: "play" });
    const out = await send({ op: "pump", frames: 128 });
    assert.ok(out.left.every((v) => Math.abs(v - 0.4) < 0.00001));
    assert.deepEqual(readFileSync(source), original);
  } finally {
    await rpc.close();
  }
});
