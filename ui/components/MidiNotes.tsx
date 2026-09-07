import type { Clip } from "../models";
export function MidiNotes({ clip }: { clip: Clip }) {
  const notes = (clip.notes ?? []).slice(0, 2048);
  const low = Math.min(36, ...notes.map((n) => n.note)),
    high = Math.max(72, ...notes.map((n) => n.note));
  return (
    <svg
      className="midi-notes"
      viewBox="0 0 1000 60"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {notes.map((n, i) => (
        <rect
          key={i}
          x={(n.start / clip.duration) * 1000}
          y={((high - n.note) / (high - low + 1)) * 54}
          width={Math.max(4, (n.duration / clip.duration) * 1000)}
          height="3"
          rx="1"
        />
      ))}
    </svg>
  );
}
