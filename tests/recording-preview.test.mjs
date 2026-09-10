import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { startSession } from "./helpers/session.mjs";

test("recording state includes live audio and MIDI previews", async () => {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const rpc = startSession(
    mkdtempSync(resolve("artifacts/test-sessions/recording-preview-")),
  );
  const send = async (command) => {
    const response = await rpc.send(command);
    assert.equal(response.error, undefined, response.error);
    return response.result;
  };
  try {
    let state = await send({ op: "state" });
    const audio = state.tracks[0].id;
    await send({ op: "track", track: audio, armed: true, gain: 1 });
    await send({ op: "record" });
    state = (await send({ op: "pump", frames: 512, left: 0.5 })).state;
    const audioPreview = state.tracks[0].recordingPreview;
    assert.equal(audioPreview.kind, "audio");
    assert.ok(audioPreview.duration > 0);
    assert.ok(audioPreview.peaks.some((peak) => peak > 0.4));
    state = (await send({ op: "pump", frames: 8192, left: 0.25 })).state;
    const stable = state.tracks[0].recordingPreview;
    const completed = stable.peaks.slice(0, -1);
    for (let i = 0; i < 50; i++)
      state = (
        await send({ op: "pump", frames: 8192, left: i % 2 ? 0.1 : 0.7 })
      ).state;
    const longer = state.tracks[0].recordingPreview;
    assert.equal(longer.peakInterval, stable.peakInterval);
    assert.ok(longer.peaks.length > 400);
    assert.deepEqual(
      longer.peaks.slice(0, completed.length),
      completed,
      "Finished waveform buckets must not move or change",
    );
    state = await send({ op: "stop" });
    assert.equal(state.tracks[0].recordingPreview, undefined);
    assert.equal(state.tracks[0].clips.length, 1);

    state = await send({ op: "addTrack", kind: "midi" });
    const midi = state.tracks.at(-1).id;
    await send({ op: "track", track: midi, armed: true, midiDevice: "test" });
    await send({ op: "record" });
    await send({ op: "testMidi", track: midi, note: 60 });
    state = (await send({ op: "pump", frames: 480 })).state;
    const midiPreview = state.tracks.at(-1).recordingPreview;
    assert.equal(midiPreview.kind, "midi");
    assert.ok(midiPreview.notes.some((note) => note.note === 60));
    await send({ op: "stop" });
  } finally {
    await rpc.close();
  }
});
