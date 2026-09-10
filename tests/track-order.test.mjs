import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";
test("track order survives undo, redo and save/open without changing track settings", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/track-order-"));
  const rpc = startSession(folder);
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    let s = await send({ op: "addTrack", kind: "midi" });
    const ids = s.tracks.map((t) => t.id);
    s = await send({ op: "reorderTrack", track: ids[2], index: 0 });
    assert.deepEqual(
      s.tracks.map((t) => t.id),
      [ids[2], ids[0], ids[1]],
    );
    assert.equal(s.tracks[0].kind, "midi");
    s = await send({ op: "undo" });
    assert.deepEqual(
      s.tracks.map((t) => t.id),
      ids,
    );
    s = await send({ op: "redo" });
    assert.equal(s.tracks[0].id, ids[2]);
    const path = resolve(folder, "Order.basement");
    await send({ op: "seek", position: 12 });
    await send({ op: "save", path });
    s = await send({ op: "new" });
    assert.equal(s.position, 0);
    await send({ op: "seek", position: 8 });
    s = await send({ op: "open", path });
    assert.equal(s.position, 0);
    assert.deepEqual(
      s.tracks.map((t) => t.id),
      [ids[2], ids[0], ids[1]],
    );
    await send({ op: "seek", position: 17 });
  } finally {
    await rpc.close();
  }
  const recovered = startSession(folder);
  try {
    const state = await recovered.send({ op: "state" });
    assert.equal(state.error, undefined);
    assert.equal(state.result.position, 0, "Startup recovery begins at zero");
  } finally {
    await recovered.close();
  }
});
