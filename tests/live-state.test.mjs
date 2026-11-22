import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/ui-modules.mjs";

// The renderer's live store and optimistic previews, imported as shipped.
const live = await import("../ui/services/liveState.ts");
const { optimisticSession } = await import("../ui/services/session-updates.ts");

const audioPreview = (peaks, extra = {}) => ({
  kind: "audio",
  start: 0,
  duration: peaks.length * 0.02,
  peakInterval: 0.02,
  peaks,
  ...extra,
});

/** An engine reply: the session with its live values. */
const reply = (revision, position, extra = {}) => ({
  title: "Friday night",
  playing: false,
  recording: false,
  looping: false,
  loopStart: 0,
  loopEnd: 8,
  tempo: 120,
  sampleRate: 48000,
  bufferSize: 256,
  device: "Test",
  deviceError: "",
  diskOverrun: false,
  canUndo: true,
  tracks: [
    {
      id: "a",
      name: "Guitar",
      clips: [],
      peak: 0.5,
      recordingPreview: audioPreview([0.1, 0.2]),
    },
  ],
  position,
  masterPeak: 0.7,
  audioCpu: 12,
  tunerFrequency: 110,
  revision,
  ...extra,
});

/** A live frame's values. */
const frame = (position, preview) => ({
  position,
  masterPeak: 0.2,
  audioCpu: 4,
  tunerFrequency: 0,
  tracks: { a: { peak: 0.3, recordingPreview: preview } },
});

// The store is one module instance, so revisions only grow through the file.
test("a reply splits into the session React keeps and live values for the store", () => {
  const session = live.acceptEngineState(reply(10, 3));
  for (const key of [
    "position",
    "masterPeak",
    "audioCpu",
    "tunerFrequency",
    "revision",
  ])
    assert.equal(key in session, false, `${key} stays out of the session`);
  assert.equal("peak" in session.tracks[0], false);
  assert.equal("recordingPreview" in session.tracks[0], false);
  assert.equal(session.tracks[0].name, "Guitar");
  assert.equal(session.canUndo, true, "the shell's flags stay");
  const values = live.getLive();
  assert.equal(values.position, 3);
  assert.equal(values.masterPeak, 0.7);
  assert.equal(values.audioCpu, 12);
  assert.equal(values.tunerFrequency, 110);
  assert.equal(values.tracks.a.peak, 0.5);
  assert.deepEqual(values.tracks.a.recordingPreview.peaks, [0.1, 0.2]);
});

test("live values never go back to an older engine state", () => {
  live.acceptLive(frame(5), 9);
  assert.equal(live.getLive().position, 3, "a frame older than the reply");
  live.acceptLive(frame(6), 12);
  assert.equal(live.getLive().position, 6);
  const session = live.acceptEngineState(reply(11, 4, { tempo: 90 }));
  assert.equal(session.tempo, 90, "the session still arrives");
  assert.equal(live.getLive().position, 6, "a reply older than the frame");
  live.acceptEngineState(reply(undefined, 7));
  assert.equal(live.getLive().position, 7, "a reply without a revision");
  live.acceptLive(frame(8), 13);
  assert.equal(live.getLive().position, 8);
});

test("incremental recording waveforms continue what was sent before", () => {
  const continued = live.continuePreview(
    audioPreview([1, 2, 9]),
    audioPreview([3, 4], { from: 2, duration: 0.08 }),
  );
  assert.deepEqual(
    continued.peaks,
    [1, 2, 3, 4],
    "the unfinished peak is replaced",
  );
  assert.equal(continued.duration, 0.08, "timing comes from the newest frame");
  assert.equal("from" in continued, false);
  assert.deepEqual(
    live.continuePreview(undefined, audioPreview([5], { from: 3 })).peaks,
    [0, 0, 0, 5],
    "a window that joined mid-take shows silence for what it missed",
  );
  const full = audioPreview([7, 8]);
  assert.equal(live.continuePreview(audioPreview([1]), full), full);
  const midi = { kind: "midi", start: 0, duration: 1, notes: [] };
  assert.equal(live.continuePreview(audioPreview([1]), midi), midi);
  assert.equal(live.continuePreview(audioPreview([1]), undefined), undefined);

  live.acceptLive(frame(8, audioPreview([1, 2, 0.5], { from: 0 })), 20);
  live.acceptLive(frame(8.1, audioPreview([3, 0.4], { from: 2 })), 21);
  live.acceptLive(frame(8.2, audioPreview([4, 0.6], { from: 3 })), 22);
  assert.deepEqual(
    live.getLive().tracks.a.recordingPreview.peaks,
    [1, 2, 3, 4, 0.6],
  );
  live.acceptLive(frame(8.3), 23);
  assert.equal(live.getLive().tracks.a.recordingPreview, undefined);
});

test("subscribers hear each change and a seek shows at once", () => {
  let heard = 0;
  const stop = live.subscribeLive(() => heard++);
  live.previewPosition(12);
  assert.equal(live.getLive().position, 12);
  live.acceptLive(frame(12.5), 30);
  assert.equal(heard, 2);
  stop();
  live.acceptLive(frame(13), 31);
  assert.equal(heard, 2, "an unsubscribed listener hears nothing");
});

test("optimistic previews touch only session state", () => {
  const session = live.acceptEngineState(reply(40, 1));
  assert.equal(
    optimisticSession(session, { op: "seek", position: 4 }),
    null,
    "the position is live, previewed by the store",
  );
  const tuning = optimisticSession(session, { op: "tuner", track: "a" });
  assert.equal(tuning.tunerTrack, "a");
  assert.equal("tunerFrequency" in tuning, false);
  const loop = optimisticSession(session, {
    op: "loop",
    start: -2,
    end: 0,
    enabled: true,
  });
  assert.deepEqual(
    [loop.loopStart, loop.loopEnd, loop.looping],
    [0, 0.05, true],
  );
  const patched = optimisticSession(session, {
    op: "track",
    track: "a",
    gain: 0.4,
    historyGroup: "drag",
  });
  assert.equal(patched.tracks[0].gain, 0.4);
  assert.equal("historyGroup" in patched.tracks[0], false);
  assert.equal("op" in patched.tracks[0], false);
});
