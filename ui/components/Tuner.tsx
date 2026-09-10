import { AudioLines } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { Modal } from "./Modal";

export function Tuner({ controller }: { controller: WorkspaceController }) {
  const { s, track, run, busy } = controller;
  const frequency = s.tunerFrequency ?? 0;
  const pitch = frequency > 0 ? 69 + 12 * Math.log2(frequency / 440) : null;
  const note = pitch === null ? null : Math.round(pitch);
  const cents =
    pitch === null ? 0 : Math.round((pitch - Math.round(pitch)) * 100);
  const names = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
  ];
  const source = s.tracks.find((t) => t.id === s.tunerTrack);
  return (
    <>
      <button
        className="icon-button"
        title="Tuner · Select an audio track to tune"
        aria-label="Tuner"
        disabled={busy || s.playing || !track || track.kind === "midi"}
        onClick={() => void run({ op: "tuner", track: track.id }, false)}
      >
        <AudioLines size={22} />
      </button>
      {s.tunerTrack && (
        <Modal title="Tuner" onClose={() => void run({ op: "tuner" }, false)}>
          <h2>Tuner</h2>
          <p>
            {source?.name} · Input {(source?.input ?? 0) + 1} · A4 = 440 Hz
          </p>
          <p>
            Play one open string and let it ring. The tuner listens to dry
            input; monitoring is muted. Your effects return when you close the
            tuner.
          </p>
          <div className="tuner-reading" role="status">
            <strong>
              {note === null
                ? "—"
                : `${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`}
            </strong>
            <span>
              {note === null
                ? "Waiting for a clear signal"
                : `${cents > 0 ? "+" : ""}${cents} cents · ${Math.abs(cents) <= 3 ? "In tune" : cents < 0 ? "Flat — tighten string" : "Sharp — loosen string"}`}
            </span>
            <meter
              min={-50}
              max={50}
              value={cents}
              aria-label="Pitch deviation in cents"
            />
            <small>
              {frequency > 0
                ? `${frequency.toFixed(1)} Hz`
                : "Check the selected input if no note appears."}
            </small>
          </div>
        </Modal>
      )}
    </>
  );
}
