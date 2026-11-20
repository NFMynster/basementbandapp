// Queue coalescing itself is unit-tested in desktop/src/session_service.rs.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";

test("a long slider gesture undoes and redoes its endpoints in one step", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const rpc = startSession(
    mkdtempSync(resolve("artifacts/test-sessions/slider-")),
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r.result;
  };
  try {
    const initial = await send({ op: "state" });
    const track = initial.tracks[0].id;
    const start = initial.tracks[0].compressorAmount;
    await send({
      op: "track",
      track,
      compressorAmount: 0.1,
      historyGroup: "drag",
    });
    await Promise.all(
      Array.from({ length: 300 }, (_, i) =>
        send({
          op: "track",
          track,
          compressorAmount: (i + 1) / 300,
          historyGroup: "drag",
        }),
      ),
    );
    let s = await send({ op: "undo" });
    assert.equal(s.tracks[0].compressorAmount, start);
    s = await send({ op: "redo" });
    assert.equal(s.tracks[0].compressorAmount, 1);
    await send({
      op: "track",
      track,
      compressorAmount: 0.5,
      historyGroup: "next-drag",
    });
    s = await send({ op: "undo" });
    assert.equal(s.tracks[0].compressorAmount, 1);
  } finally {
    await rpc.close();
  }
});
