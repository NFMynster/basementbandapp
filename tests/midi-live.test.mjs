import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { startRpc } from "./helpers/process.mjs";

const instrument = resolve(
  "build/native/TestInstrument_artefacts/Release/VST3/Basement TestInstrument.vst3",
);

test("live MIDI plays every MIDI track without a monitor switch; mute silences one; armed tracks record together", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(resolve("artifacts/test-sessions/midi-live-"));
  const rpc = startRpc(
    resolve(
      "artifacts/native/BasementAudio" +
        (process.platform === "win32" ? ".exe" : ""),
    ),
    ["--test-device"],
    { framed: true },
  );
  const send = async (c) => {
    const r = await rpc.send(c);
    assert.equal(r.error, undefined, r.error);
    return r;
  };
  // The test instrument outputs 0.25 per held note. Panning the first track
  // hard left and the second hard right separates their contributions.
  const levels = async () => {
    const r = await send({ op: "pump", frames: 256 });
    return { first: r.left.at(-1), second: r.right.at(-1) };
  };
  const notes = async (off = false) => {
    for (const track of [first, second])
      await send({ op: "testMidi", track, note: 60, ...(off && { off }) });
  };
  let first = "",
    second = "";
  try {
    await send({ op: "init", folder });
    first = (await send({ op: "addTrack", kind: "midi" })).tracks.at(-1).id;
    second = (await send({ op: "addTrack", kind: "midi" })).tracks.at(-1).id;
    for (const [track, pan] of [
      [first, -1],
      [second, 1],
    ]) {
      await send({ op: "plugin", track, path: instrument });
      await send({ op: "track", track, gain: 1, pan, monitor: false });
    }

    await notes();
    let level = await levels();
    assert.ok(level.first > 0.2, "First MIDI track plays with monitoring off");
    assert.ok(level.second > 0.2, "Second MIDI track plays too");
    await notes(true);
    await levels();

    await send({ op: "track", track: second, mute: true });
    await notes();
    level = await levels();
    assert.ok(level.first > 0.2);
    assert.equal(level.second, 0, "Mute stops hearing a track");
    await notes(true);
    await send({ op: "track", track: second, mute: false });

    for (const track of [first, second])
      await send({ op: "track", track, armed: true });
    await send({ op: "record" });
    await notes();
    await send({ op: "pump", frames: 480 });
    await notes(true);
    await send({ op: "pump", frames: 480 });
    const s = await send({ op: "stop" });
    for (const id of [first, second])
      assert.equal(
        s.tracks.find((t) => t.id === id).clips[0]?.notes[0]?.note,
        60,
        "Each armed MIDI track records the same input",
      );
  } finally {
    await rpc.close();
  }
});
