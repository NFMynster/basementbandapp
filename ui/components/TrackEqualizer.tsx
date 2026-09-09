import { useRef } from "react";
import { Power, RotateCcw } from "lucide-react";
import type { Track, TrackPatch } from "../models";

const presets = [
  { name: "Flat", values: [0, 0, 0] },
  { name: "Warm", values: [3, 0, -2] },
  { name: "Bright", values: [-1, 1, 3] },
  { name: "Vocal clarity", values: [-3, 2, 2] },
  { name: "Bass boost", values: [5, 0, 0] },
] as const;
const bands = [
  { key: "eqBass", name: "Bass", frequency: "180 Hz" },
  { key: "eqMid", name: "Mid", frequency: "1 kHz" },
  { key: "eqTreble", name: "Treble", frequency: "6 kHz" },
] as const;
export function TrackEqualizer({
  track,
  update,
}: {
  track: Track;
  update: (track: Track, patch: TrackPatch) => unknown;
}) {
  const gesture = useRef<string | undefined>(undefined);
  const enabled = track.eqEnabled !== false;
  const preset = presets.find((p) =>
    bands.every((b, i) => (track[b.key] ?? 0) === p.values[i]),
  );
  return (
    <div className="track-eq">
      <div className="eq-summary">
        <strong>Equalizer</strong>
        <span>Shape your sound</span>
        <div className="eq-actions">
          <button
            aria-label="Enable equalizer"
            aria-pressed={enabled}
            className={enabled ? "enabled" : ""}
            onClick={() => update(track, { eqEnabled: !enabled })}
          >
            <Power size={15} />
          </button>
          <select
            aria-label="Equalizer preset"
            value={preset?.name ?? "Custom"}
            onChange={(e) => {
              const p = presets.find((p) => p.name === e.target.value);
              if (p)
                update(track, {
                  eqBass: p.values[0],
                  eqMid: p.values[1],
                  eqTreble: p.values[2],
                  eqEnabled: true,
                });
            }}
          >
            {!preset && <option>Custom</option>}
            {presets.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
          <button
            aria-label="Reset equalizer"
            title="Reset to flat"
            onClick={() => update(track, { eqBass: 0, eqMid: 0, eqTreble: 0 })}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
      {bands.map((b) => (
        <label className={`eq-band ${enabled ? "" : "bypassed"}`} key={b.key}>
          <span>
            {b.name}
            <small>{b.frequency}</small>
            <output>
              {(track[b.key] ?? 0) > 0 ? "+" : ""}
              {(track[b.key] ?? 0).toFixed(1)} dB
            </output>
          </span>
          <input
            type="range"
            aria-label={`${b.name} gain`}
            aria-valuetext={`${track[b.key] ?? 0} decibels`}
            min={-12}
            max={12}
            step={0.5}
            value={track[b.key] ?? 0}
            disabled={!enabled}
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
              update(track, {
                [b.key]: +e.target.value,
                historyGroup: gesture.current,
              })
            }
            onDoubleClick={() => update(track, { [b.key]: 0 })}
          />
          <div className="eq-scale">
            <span>−12</span>
            <span>0</span>
            <span>+12</span>
          </div>
        </label>
      ))}
    </div>
  );
}
