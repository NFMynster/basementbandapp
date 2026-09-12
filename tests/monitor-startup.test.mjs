import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";

test("opening and recovering projects disables saved monitoring", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/monitor-start-"));
  let rpc = startSession(folder);
  const send = async (command) => {
    const reply = await rpc.send(command);
    assert.equal(reply.error, undefined, reply.error);
    return reply.result;
  };
  try {
    let state = await send({ op: "state" });
    assert.ok(state.tracks.every((track) => !track.monitor));
    const track = state.tracks[0].id;
    await send({ op: "track", track, monitor: true });
    const path = resolve(folder, "monitor.basement");
    await send({ op: "save", path });
    state = await send({ op: "open", path });
    assert.ok(state.tracks.every((track) => !track.monitor));
    state = await send({ op: "track", track, monitor: true });
    assert.equal(state.tracks[0].monitor, true);
    await send({ op: "track", track, gain: 0.7 });
    state = await send({ op: "undo" });
    assert.equal(
      state.tracks[0].monitor,
      true,
      "Ordinary undo keeps monitoring",
    );
    await rpc.close();
    rpc = startSession(folder);
    state = await send({ op: "state" });
    assert.equal(state.recovered, true);
    assert.ok(state.tracks.every((track) => !track.monitor));
  } finally {
    await rpc.close();
  }
});
