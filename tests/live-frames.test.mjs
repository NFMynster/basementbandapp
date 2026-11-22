import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { engineExecutable } from "./helpers/session.mjs";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** The engine with its live stream on: replies in order, frames collected. */
function startStreamingEngine() {
  const child = spawn(engineExecutable(), ["--test-device", "--stream-state"], {
    windowsHide: true,
  });
  const frames = [];
  const pending = [];
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!line.startsWith("BASEMENT:")) return;
    const message = JSON.parse(line.slice("BASEMENT:".length));
    if (message.event) frames.push(message);
    else pending.shift()?.(message);
  });
  const exited = new Promise((r) => child.once("close", r));
  return {
    frames,
    send(command) {
      return new Promise((resolve) => {
        pending.push(resolve);
        child.stdin.write(JSON.stringify(command) + "\n");
      });
    },
    async close() {
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 3000);
      await exited;
      clearTimeout(timer);
    },
  };
}

/** What the UI does with a frame's incremental waveform (liveState.ts). */
function continuePreview(previous, next) {
  if (next?.from === undefined) return next;
  const kept = previous ? previous.peaks.slice(0, next.from) : [];
  while (kept.length < next.from) kept.push(0);
  return { ...next, peaks: kept.concat(next.peaks) };
}

test("the engine streams live frames and the session only when it changes", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/live-"));
  const engine = startStreamingEngine();
  try {
    const initial = await engine.send({ op: "init", folder });
    assert.equal(typeof initial.revision, "number");
    await delay(400);
    assert.ok(
      engine.frames.length >= 6,
      "frames arrive about 30 times a second",
    );
    const latest = engine.frames.at(-1);
    assert.equal(typeof latest.live.position, "number");
    const track = initial.tracks[0].id;
    assert.equal(typeof latest.live.tracks[track].peak, "number");
    const sessions = engine.frames.filter((frame) => frame.session);
    assert.ok(sessions.length >= 1, "the first frame carries the session");
    const session = sessions[0].session;
    assert.equal(session.position, undefined, "live values stay out of it");
    assert.equal(session.tracks[0].peak, undefined);

    // An idle engine sends no session; a change sends it once, newer than
    // the reply that caused it.
    const idle = engine.frames.length;
    await delay(200);
    assert.ok(engine.frames.slice(idle).every((frame) => !frame.session));
    const reply = await engine.send({ op: "tempo", value: 100 });
    await delay(150);
    const changed = engine.frames.filter(
      (frame) => frame.session?.tempo === 100,
    );
    assert.equal(changed.length, 1);
    assert.ok(changed[0].revision > reply.revision);

    // Recording waveforms arrive incrementally and add up to the full one.
    await engine.send({ op: "track", track, armed: true, gain: 1 });
    await engine.send({ op: "record" });
    let preview;
    for (let i = 0; i < 12; i++) {
      await engine.send({ op: "pump", frames: 4096, left: i % 2 ? 0.2 : 0.6 });
      await delay(40);
    }
    await delay(80);
    for (const frame of engine.frames)
      preview = continuePreview(
        preview,
        frame.live.tracks[track]?.recordingPreview,
      );
    const full = (await engine.send({ op: "state" })).tracks[0]
      .recordingPreview;
    assert.ok(full.peaks.length > 40);
    assert.deepEqual(
      preview.peaks.slice(0, -1),
      full.peaks.slice(0, preview.peaks.length - 1),
      "streamed peaks match the engine's waveform",
    );
    assert.ok(
      engine.frames.some(
        (frame) => frame.live.tracks[track]?.recordingPreview?.from > 0,
      ),
      "later frames send only new peaks",
    );
    await engine.send({ op: "stop" });
  } finally {
    await engine.close();
  }
});

test("snapshots stay documents while every UI-bound state is numbered in order", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/live-order-"));
  const engine = startStreamingEngine();
  try {
    const first = await engine.send({ op: "init", folder });
    const snapshot = await engine.send({ op: "snapshot" });
    assert.equal(
      snapshot.revision,
      undefined,
      "saved projects carry no revision",
    );
    assert.equal(snapshot.deviceListVersion, 0);
    assert.equal(first.deviceListVersion, 0, "the test device never changes");
    await delay(150);
    const added = await engine.send({ op: "addTrack", kind: "midi" });
    assert.ok(added.revision > first.revision);
    await delay(150);
    const revisions = engine.frames.map((frame) => frame.revision);
    assert.ok(
      revisions.every((revision, i) => i === 0 || revision > revisions[i - 1]),
      "frames count up",
    );
    const id = added.tracks.at(-1).id;
    const announced = engine.frames.find((frame) =>
      frame.session?.tracks.some((track) => track.id === id),
    );
    assert.ok(announced, "the new track arrives in a session frame");
    assert.ok(announced.revision > added.revision);
    assert.ok(id in engine.frames.at(-1).live.tracks, "and in the live values");
    assert.ok(
      engine.frames.every((frame) =>
        Object.values(frame.live.tracks).every(
          (track) => track.recordingPreview === undefined,
        ),
      ),
      "no previews while nothing records",
    );
  } finally {
    await engine.close();
  }
});

test("a cycle recording starts each pass's streamed waveform over", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/live-cycle-"));
  const engine = startStreamingEngine();
  try {
    const state = await engine.send({ op: "init", folder });
    const track = state.tracks[0].id;
    await engine.send({ op: "loop", start: 0, end: 0.5, enabled: true });
    await engine.send({ op: "track", track, armed: true, gain: 1 });
    await engine.send({ op: "record" });
    for (let i = 0; i < 14; i++) {
      await engine.send({ op: "pump", frames: 4096, left: 0.5 });
      await delay(40);
    }
    await delay(80);
    await engine.send({ op: "stop" });
    const starts = engine.frames
      .map((frame) => frame.live.tracks[track]?.recordingPreview?.from)
      .filter((from) => from !== undefined);
    assert.ok(
      starts.some((from, i) => i > 0 && from === 0 && starts[i - 1] > 0),
      `a new pass restarts at 0: ${starts.join(",")}`,
    );
  } finally {
    await engine.close();
  }
});
