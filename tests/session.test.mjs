import { saveSession, readSession } from "../desktop/session-storage.cjs";
import { SessionService } from "../desktop/session-service.cjs";
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
    const portable = await readSession(path);
    const beforeStorage = structuredClone(portable);
    const copyPath = resolve(folder, "Copy.basement");
    await saveSession(copyPath, portable);
    assert.deepEqual(
      portable,
      beforeStorage,
      "Saving must not mutate the caller's snapshot",
    );
    assert.equal((await readSession(copyPath)).title, portable.title);
    const previousFile = readFileSync(copyPath, "utf8");
    const broken = structuredClone(portable);
    broken.tracks[0].clips[0].path = resolve(folder, "missing.wav");
    await assert.rejects(saveSession(copyPath, broken));
    assert.equal(
      readFileSync(copyPath, "utf8"),
      previousFile,
      "Failed saves preserve the previous document",
    );
    const service = Object.create(SessionService.prototype);
    service.folder = "current-working-folder";
    service.workingDirectory = async () => "next-working-folder";
    service.engine = {
      request: async () => {
        throw new Error("Could not restore media");
      },
    };
    await assert.rejects(
      service.executeRaw({ op: "open", path }),
      /Could not restore media/,
    );
    assert.equal(
      service.folder,
      "current-working-folder",
      "Failed restores keep the active working folder",
    );
    await send({ op: "new" });
    r = await send({ op: "open", path });
    assert.equal(r.result.title, "Two friends");
    assert.equal(r.result.tracks[0].pan, -0.5);
    assert.equal(r.result.tracks[0].clips.length, 1);
    assert.equal(
      saved.tracks[0].clips[0].peaks,
      undefined,
      "Waveforms are derived, not persisted",
    );
    for (const mutate of [
      (s) => (s.version = 3),
      (s) => delete s.tracks[0].effects,
      (s) => delete s.limiterEnabled,
      (s) => delete s.metronomeGain,
      (s) => delete s.tracks[0].eqEnabled,
      (s) => delete s.tracks[0].clips[0].gain,
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
