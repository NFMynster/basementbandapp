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
