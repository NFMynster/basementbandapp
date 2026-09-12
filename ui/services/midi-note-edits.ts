import type { Clip } from "../models";
type Note = NonNullable<Clip["notes"]>[number];
// Clamp the whole selection together so intervals and relative timing stay intact.
export function moveNotes(
  notes: readonly Note[],
  seconds: number,
  semitones: number,
  duration: number,
  low = 0,
  high = 127,
): Note[] {
  if (!notes.length) return [];
  const time = Math.max(
    -Math.min(...notes.map((n) => n.start)),
    Math.min(
      duration - Math.max(...notes.map((n) => n.start + n.duration)),
      seconds,
    ),
  );
  const pitch = Math.max(
    low - Math.min(...notes.map((n) => n.note)),
    Math.min(high - Math.max(...notes.map((n) => n.note)), semitones),
  );
  return notes.map((note) => ({
    ...note,
    start: note.start + time,
    note: note.note + pitch,
  }));
}
export function resizeNotes(
  notes: readonly Note[],
  seconds: number,
  duration: number,
): Note[] {
  if (!notes.length) return [];
  const delta = Math.max(
    0.001 - Math.min(...notes.map((n) => n.duration)),
    Math.min(
      duration - Math.max(...notes.map((n) => n.start + n.duration)),
      seconds,
    ),
  );
  return notes.map((note) => ({ ...note, duration: note.duration + delta }));
}
