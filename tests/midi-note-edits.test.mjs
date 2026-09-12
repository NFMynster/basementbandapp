import test from "node:test";
import assert from "node:assert/strict";
import { moveNotes, resizeNotes } from "../ui/services/midi-note-edits.ts";
const notes = [
  { event: 1, start: 1, duration: 0.5, note: 60, velocity: 80, channel: 2 },
  { event: 2, start: 2, duration: 1, note: 64, velocity: 100, channel: 3 },
];
test("moving selected notes clamps the group and preserves timing, intervals and source notes", () => {
  const before = structuredClone(notes);
  const right = moveNotes(notes, 10, 100, 4);
  assert.deepEqual(
    right.map((n) => [n.start, n.note]),
    [
      [2, 123],
      [3, 127],
    ],
  );
  assert.deepEqual(
    moveNotes(notes, -10, -100, 4).map((n) => [n.start, n.note]),
    [
      [0, 0],
      [1, 4],
    ],
  );
  assert.deepEqual(
    moveNotes(notes, 0, 20, 4, 48, 72).map((n) => n.note),
    [68, 72],
  );
  assert.equal(right[0].velocity, 80);
  assert.equal(right[1].channel, 3);
  assert.equal(right[0].event, 1);
  assert.deepEqual(notes, before);
});
test("resizing selected notes preserves starts and enforces both region end and minimum duration", () => {
  assert.deepEqual(
    resizeNotes(notes, 10, 4).map((n) => [n.start, n.duration]),
    [
      [1, 1.5],
      [2, 2],
    ],
  );
  const short = resizeNotes(notes, -10, 4);
  assert.ok(Math.abs(short[0].duration - 0.001) < 1e-10);
  assert.ok(Math.abs(short[1].duration - 0.501) < 1e-10);
  assert.deepEqual(moveNotes([], 1, 1, 4), []);
  assert.deepEqual(resizeNotes([], 1, 4), []);
});
