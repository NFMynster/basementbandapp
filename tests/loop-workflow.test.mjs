import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
test("loop preview, trailing takes, overdub silence and grouped region history", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const rpc = startSession(
    mkdtempSync(resolve("artifacts/test-sessions/loop-workflow-")),
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    let s = await send({ op: "state" });
    const track = s.tracks[0].id;
    for (const t of s.tracks)
      await send({
        op: "track",
        track: t.id,
        armed: t.id === track,
        monitor: false,
        gain: 1,
      });
    await send({ op: "loop", start: 0, end: 0.1, enabled: true });
    await send({ op: "record" });
    await send({ op: "pump", frames: 4800, left: 0.2 });
    await send({ op: "pump", frames: 4800, left: 0.3 });
    const tail = await send({ op: "pump", frames: 192, left: 0.9 });
    assert.ok(tail.state.position < 0.1);
    assert.ok(
      tail.state.tracks[0].recordingPreview.duration < 0.02,
      "Preview wraps into current pass",
    );
    s = await send({ op: "stop" });
    assert.equal(
      s.tracks[0].clips.length,
      2,
      "Accidental short third pass is discarded",
    );
    const active = s.tracks[0].clips.find((c) => c.active);
    assert.equal(active.take, 2);
    await send({ op: "loop", start: 0, end: 0.1, enabled: false });
    await send({ op: "seek", position: 0 });
    await send({ op: "play" });
    assert.ok(
      (await send({ op: "pump", frames: 480 })).left.some((x) => x > 0.2),
    );
    await send({ op: "stop" });
    await send({ op: "seek", position: 0 });
    await send({ op: "record" });
    assert.ok(
      (await send({ op: "pump", frames: 480, left: 0 })).left.every(
        (x) => Math.abs(x) < 1e-6,
      ),
      "Existing take is silent while recording on its track",
    );
    s = await send({ op: "stop" });
    await send({ op: "removeClip", track, clip: active.id });
    s = await send({ op: "state" });
    assert.equal(
      s.tracks[0].clips.length,
      1,
      "Delete removes the whole take group",
    );
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].clips.length, 3, "Undo restores all takes");
    const regions = s.tracks[0].clips
      .filter((c) => c.active)
      .map((c) => ({ track, clip: c.id }));
    s = await send({ op: "editRegions", action: "move", regions, delta: 2 });
    assert.ok(
      s.tracks[0].clips.every((c) => c.start === 2),
      "All selected regions and hidden takes move together",
    );
    s = await send({ op: "undo" });
    assert.ok(s.tracks[0].clips.every((c) => c.start === 0));
    s = await send({ op: "editRegions", action: "delete", regions });
    assert.equal(s.tracks[0].clips.length, 0);
    s = await send({ op: "undo" });
    assert.equal(
      s.tracks[0].clips.length,
      3,
      "One undo restores grouped deletion",
    );
  } finally {
    await rpc.close();
  }
});

test("four-second loop discards a half-second stopping tail but retains a short first attempt", async () => {
  const rpc = startSession(
    mkdtempSync(resolve("artifacts/test-sessions/stop-tail-")),
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  const pump = async (seconds) => {
    for (let remaining = Math.round(seconds * 48000); remaining > 0;) {
      const frames = Math.min(8192, remaining);
      await send({ op: "pump", frames, left: 0.2 });
      remaining -= frames;
    }
  };
  try {
    const s = await send({ op: "state" }),
      track = s.tracks[0].id;
    await send({ op: "track", track, armed: true });
    await send({ op: "loop", start: 0, end: 4, enabled: true });
    await send({ op: "record" });
    await pump(4.5);
    let clips = (await send({ op: "stop" })).tracks[0].clips;
    assert.equal(clips.length, 1);
    assert.equal(clips[0].duration, 4);
    await send({ op: "record" });
    await pump(0.5);
    clips = (await send({ op: "stop" })).tracks[0].clips;
    assert.equal(clips.length, 2);
    assert.equal(
      clips.at(-1).duration,
      0.5,
      "A short first attempt is never discarded",
    );
  } finally {
    await rpc.close();
  }
});
