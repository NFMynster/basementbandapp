import { useRef, useState } from "react";
import type { Clip, Track } from "../models";
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
      <div>
        <strong>{clip.name}</strong>
        <p>Volume and fades for this recording.</p>
      </div>
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
      <button
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

export function FadeHandles({
  clip,
  track,
  controller: w,
}: {
  clip: Clip;
  track: Track;
  controller: WorkspaceController;
}) {
  const [preview, setPreview] = useState<{
    key: "fadeIn" | "fadeOut";
    value: number;
  } | null>(null);
  const current = (key: "fadeIn" | "fadeOut") =>
    Math.min(
      clip.duration,
      preview?.key === key ? preview.value : (clip[key] ?? 0),
    );
  return (
    <div
      className="clip-fades"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <svg preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
        <path
          d={`M0 0 L${(current("fadeIn") / clip.duration) * 100} 100 L0 100 Z M100 0 L${100 - (current("fadeOut") / clip.duration) * 100} 100 L100 100 Z`}
        />
      </svg>
      {(["fadeIn", "fadeOut"] as const).map((key) => (
        <div
          key={key}
          className={`fade-handle ${key}`}
          style={{
            [key === "fadeIn" ? "left" : "right"]:
              `clamp(5px, ${(current(key) / clip.duration) * 100}%, calc(100% - 15px))`,
          }}
          role="slider"
          aria-label={key === "fadeIn" ? "Region fade in" : "Region fade out"}
          aria-valuemin={0}
          aria-valuemax={clip.duration}
          aria-valuenow={current(key)}
          tabIndex={0}
          onPointerDown={(e) => {
            if (e.button !== 0 || w.s.recording) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setPreview({ key, value: current(key) });
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const rect = e.currentTarget.parentElement!.getBoundingClientRect();
            const value = Math.max(
              0,
              Math.min(
                clip.duration,
                ((key === "fadeIn"
                  ? e.clientX - rect.left
                  : rect.right - e.clientX) /
                  rect.width) *
                  clip.duration,
              ),
            );
            setPreview({ key, value });
          }}
          onPointerUp={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (preview)
              void w
                .run({
                  op: "editClip",
                  action: "sound",
                  track: track.id,
                  clip: clip.id,
                  [key]: preview.value,
                })
                .finally(() => setPreview(null));
          }}
          onPointerCancel={() => setPreview(null)}
          onKeyDown={(e) => {
            if (
              !["ArrowLeft", "ArrowRight", "Home"].includes(e.key) ||
              w.s.recording
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            void w.run({
              op: "editClip",
              action: "sound",
              track: track.id,
              clip: clip.id,
              [key]:
                e.key === "Home"
                  ? 0
                  : Math.max(
                      0,
                      Math.min(
                        clip.duration,
                        current(key) + (e.key === "ArrowLeft" ? -0.01 : 0.01),
                      ),
                    ),
            });
          }}
        />
      ))}
    </div>
  );
}
