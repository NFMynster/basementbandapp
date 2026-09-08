import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
test("loop takes, native count-in, metronome, non-destructive edits and portable take selection", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/edits-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    let s = await send({ op: "state" });
    const track = s.tracks[0].id;
    await send({
      op: "track",
      track,
      armed: true,
      gain: 1,
      color: "#aabbcc",
      icon: "drums",
    });
    await send({ op: "tempo", value: 240 });
    await send({ op: "loop", start: 0.1, end: 0.15, enabled: true });
    await send({ op: "seek", position: 10 });
    await send({ op: "countIn", value: true });
    s = await send({ op: "record" });
    assert.equal(s.position, 0.1);
    assert.equal(s.countdown, 3);
    let click = 0;
    for (let remaining = 36000; remaining > 0;) {
      const frames = Math.min(8192, remaining);
      remaining -= frames;
      const r = await send({ op: "pump", frames, left: 0.9 });
      click = Math.max(click, ...r.left.map(Math.abs));
      assert.equal(
        r.state.position,
        0.1,
        "count-in must not move or capture the transport",
      );
    }
    assert.ok(click > 0.01, "native count-in produces clicks");
    for (const left of [0.1, 0.2, 0.3])
      await send({ op: "pump", frames: 2400, left });
    s = await send({ op: "stop" });
    const takes = s.tracks[0].clips;
    assert.equal(takes.length, 3);
    assert.equal(takes.filter((c) => c.active).length, 1);
    assert.equal(takes[2].active, true);
    assert.ok(takes.every((c) => Math.abs(c.duration - 0.05) < 0.00001));
    await send({ op: "editClip", track, clip: takes[0].id, action: "take" });
    await send({ op: "loop", start: 0.1, end: 0.15, enabled: false });
    await send({ op: "seek", position: 0.1 });
    await send({ op: "play" });
    let out = await send({ op: "pump", frames: 100 });
    assert.ok(Math.abs(out.left[5] - 0.1) < 0.00001);
    await send({ op: "stop" });
    s = await send({
      op: "editClip",
      track,
      clip: takes[0].id,
      action: "move",
      position: 0,
    });
    assert.ok(
      s.tracks[0].clips.every((c) => c.start === 0),
      "moving a take stack moves every alternative",
    );
    await send({
      op: "editClip",
      track,
      clip: takes[0].id,
      action: "split",
      position: 0.025,
    });
    s = await send({ op: "state" });
    assert.equal(s.tracks[0].clips.length, 6);
    assert.equal(s.tracks[0].clips.filter((c) => c.active).length, 2);
    const right = s.tracks[0].clips.find((c) => c.active && c.start > 0);
    s = await send({
      op: "editClip",
      track,
      clip: right.id,
      action: "copy",
      position: 0.2,
    });
    const copy = s.tracks[0].clips.at(-1);
    assert.notEqual(copy.id, right.id);
    assert.equal(copy.takeGroup, "");
    const path = resolve(folder, "Edits.basement");
    await send({ op: "save", path });
    const saved = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(saved.version, 3);
    assert.equal(
      new Set(saved.tracks[0].clips.map((c) => c.path)).size,
      1,
      "all edits share one portable media file",
    );
    await send({ op: "new" });
    s = await send({ op: "open", path });
    assert.equal(s.tracks[0].icon, "drums");
    assert.equal(s.tracks[0].color, "#aabbcc");
    assert.equal(s.tracks[0].clips.length, 7);
    await send({ op: "metronome", value: true });
    await send({ op: "seek", position: 1 });
    await send({ op: "play" });
    out = await send({ op: "pump", frames: 2400 });
    assert.ok(out.left.some((v) => Math.abs(v) > 0.01));
    await send({ op: "stop" });
  } finally {
    await rpc.close();
  }
});
