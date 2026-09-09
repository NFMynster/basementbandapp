import { useRef } from "react";
import type { WorkspaceController } from "../hooks/useWorkspace";

export function ClipSound({
  controller: w,
}: {
  controller: WorkspaceController;
}) {
  const clip = w.track?.clips.find(
    (c) => c.id === w.clipId && c.kind === "audio",
  );
  const gesture = useRef<string | undefined>(undefined);
  if (!clip)
    return (
      <p className="notes-empty">
        Select an audio region to adjust its volume and fades.
      </p>
    );
  return (
    <div className="clip-sound">
      <div className="region-heading">
        <strong title={clip.name}>{clip.name}</strong>
      </div>
      <div className="region-controls">
        {(["gain", "fadeIn", "fadeOut"] as const).map((key) => (
          <label key={key}>
            {key === "gain"
              ? "Clip volume"
              : key === "fadeIn"
                ? "Fade in"
                : "Fade out"}
            <input
              aria-label={
                key === "gain"
                  ? "Clip volume"
                  : key === "fadeIn"
                    ? "Fade in"
                    : "Fade out"
              }
              type="range"
              min={key === "gain" ? -48 : 0}
              max={key === "gain" ? 12 : clip.duration}
              step={key === "gain" ? 0.5 : 0.001}
              disabled={w.s.recording || w.busy}
              value={
                key === "gain"
                  ? Math.max(-48, 20 * Math.log10(clip.gain ?? 1))
                  : Math.min(clip.duration, clip[key] ?? 0)
              }
              onPointerDown={() => {
                gesture.current = crypto.randomUUID();
              }}
              onPointerUp={() => {
                gesture.current = undefined;
              }}
              onBlur={() => {
                gesture.current = undefined;
              }}
              onChange={(e) =>
                void w.run({
                  op: "editClip",
                  action: "sound",
                  track: w.track.id,
                  clip: clip.id,
                  [key]:
                    key === "gain"
                      ? 10 ** (+e.target.value / 20)
                      : +e.target.value,
                  historyGroup: gesture.current,
                })
              }
            />
            <output>
              {key === "gain"
                ? `${(20 * Math.log10(clip.gain ?? 1)).toFixed(1)} dB`
                : `${(clip[key] ?? 0).toFixed(2)} s`}
            </output>
          </label>
        ))}
      </div>
      <button
        className="region-reset"
        disabled={w.s.recording || w.busy}
        onClick={() =>
          void w.run({
            op: "editClip",
            action: "sound",
            track: w.track.id,
            clip: clip.id,
            gain: 1,
            fadeIn: 0,
            fadeOut: 0,
          })
        }
      >
        Reset
      </button>
    </div>
  );
}
