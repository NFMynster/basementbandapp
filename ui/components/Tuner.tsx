import { useState } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { Modal } from "./Modal";

export function Tuner({ controller }: { controller: WorkspaceController }) {
  const { s, track, run, busy } = controller;
  const [instrument, setInstrument] = useState<"guitar" | "bass" | "chromatic">(
    track?.icon === "bass" ? "bass" : "guitar",
  );
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
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M7 3v7a5 5 0 0 0 10 0V3M12 15v6" />
        </svg>
      </button>
      {s.tunerTrack &&
        createPortal(
          <Modal
            title="Tuner"
            className="tuner-dialog"
            onClose={() => void run({ op: "tuner" }, false)}
          >
            <span className="eyebrow">CHROMATIC TUNER</span>
            <h2>{source?.name}</h2>
            <p className="tuner-source">
              Input {(source?.input ?? 0) + 1} · A = 440 Hz
            </p>
            <div
              className="tuner-modes"
              role="group"
              aria-label="Tuning instrument"
            >
              {(["guitar", "bass", "chromatic"] as const).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={instrument === mode}
                  onClick={() => setInstrument(mode)}
                >
                  {mode === "guitar"
                    ? "Guitar"
                    : mode === "bass"
                      ? "Bass"
                      : "Chromatic"}
                </button>
              ))}
            </div>
            <div
              className={`tuner-reading ${note !== null && Math.abs(cents) <= 3 ? "in-tune" : ""}`}
            >
              <strong>
                {note === null ? "—" : names[((note % 12) + 12) % 12]}
              </strong>
              <span className="tuner-string">
                {note === null
                  ? instrument === "chromatic"
                    ? "Play a note"
                    : "Play one string"
                  : ((instrument === "guitar"
                      ? {
                          40: "6th string / Low E",
                          45: "5th string / A",
                          50: "4th string / D",
                          55: "3rd string / G",
                          59: "2nd string / B",
                          64: "1st string / High E",
                        }
                      : instrument === "bass"
                        ? {
                            23: "5th string / Low B",
                            28: "4th string / E",
                            33: "3rd string / A",
                            38: "2nd string / D",
                            43: "1st string / G",
                          }
                        : ({} as Record<number, string>))[note] ??
                    `Octave ${Math.floor(note / 12) - 1}`)}
              </span>
              <div
                className="tuner-scale"
                role="meter"
                aria-label="Pitch deviation in cents"
                aria-valuemin={-50}
                aria-valuemax={50}
                aria-valuenow={cents}
              >
                <div className="tuner-target" />
                <i
                  style={{
                    left: `${50 + cents}%`,
                    opacity: note === null ? 0 : 1,
                  }}
                />
              </div>
              <div className="tuner-scale-labels">
                <span>Flat</span>
                <span>In tune</span>
                <span>Sharp</span>
              </div>
              <p role="status">
                {note === null
                  ? "Let the note ring"
                  : Math.abs(cents) <= 3
                    ? "In tune"
                    : `${instrument === "chromatic" ? (cents < 0 ? "Flat" : "Sharp") : cents < 0 ? "Tighten slightly" : "Loosen slightly"} · ${Math.abs(cents)} cents`}
              </p>
              <small>
                {note === null
                  ? instrument === "guitar"
                    ? "Standard guitar: E A D G B E"
                    : instrument === "bass"
                      ? "Standard bass: E A D G / Low B supported"
                      : "Any instrument / Concert pitch"
                  : `${frequency.toFixed(1)} Hz · ${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1} (octave)`}
              </small>
            </div>
            <p className="tuner-footnote">
              Dry input · Monitoring muted while tuning
            </p>
          </Modal>,
          document.body,
        )}
    </>
  );
}
