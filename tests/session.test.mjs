import { writeMonoWav } from "./helpers/wav.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { startSession } from "./helpers/session.mjs";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { resolve, isAbsolute } from "node:path";
test("Electron session service saves portable audio, reopens edits, and preserves a session on missing media", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/project-"));
  writeMonoWav(
    resolve(folder, "source.wav"),
    480,
    (i) => Math.sin(i * 0.2) * 0.25,
  );
  const rpc = startSession(folder);
  const send = rpc.send;
  try {
    let r = await send({ op: "state" });
    const track = r.result.tracks[0].id;
    await send({ op: "import", track, path: resolve(folder, "source.wav") });
    await send({ op: "rename", title: "Two friends" });
    await send({ op: "track", track, pan: -0.5 });
    const path = resolve(folder, "Jam.basement");
    r = await send({ op: "save", path });
    assert.equal(r.result.saved, path);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(saved.version, 4);
    assert.equal(saved.title, "Two friends");
    assert.equal(isAbsolute(saved.tracks[0].clips[0].path), false);
    assert.ok(existsSync(resolve(folder, saved.tracks[0].clips[0].path)));
    await send({ op: "new" });
    r = await send({ op: "open", path });
    assert.equal(r.result.title, "Two friends");
    assert.equal(r.result.tracks[0].pan, -0.5);
    assert.equal(r.result.tracks[0].clips.length, 1);
    const legacy = structuredClone(saved);
    legacy.version = 3;
    for (const track of legacy.tracks) delete track.effects;
    const legacyPath = resolve(folder, "legacy.basement");
    writeFileSync(legacyPath, JSON.stringify(legacy));
    r = await send({ op: "open", path: legacyPath });
    assert.equal(r.error, undefined);
    assert.equal(
      r.result.tracks[0].clips.length,
      1,
      "Version 3 sessions still open",
    );
    assert.equal(
      saved.tracks[0].clips[0].peaks,
      undefined,
      "Waveforms are derived, not persisted",
    );
    for (const mutate of [
      (s) => (s.tempo = 0),
      (s) => (s.tracks[0].gain = 100),
      (s) => (s.tracks[0].id = "../escape"),
      (s) => s.tracks.push(structuredClone(s.tracks[0])),
    ]) {
      const bad = structuredClone(saved);
      mutate(bad);
      writeFileSync(resolve(folder, "invalid.basement"), JSON.stringify(bad));
      assert.ok(
        (await send({ op: "open", path: resolve(folder, "invalid.basement") }))
          .error,
      );
      assert.equal(
        (await send({ op: "state" })).result.title,
        "Two friends",
        "Invalid documents preserve current work",
      );
    }
    saved.tracks[0].clips[0].path = "missing.wav";
    writeFileSync(resolve(folder, "bad.basement"), JSON.stringify(saved));
    assert.ok(
      (await send({ op: "open", path: resolve(folder, "bad.basement") })).error,
    );
    assert.equal((await send({ op: "state" })).result.title, "Two friends");
  } finally {
    await rpc.close();
  }
});
