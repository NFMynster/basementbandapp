import { useRef } from "react";
import { Power } from "lucide-react";
import type { Track, TrackPatch } from "../models";

const effects = {
  compressor: {
    title: "Compressor",
    hint: "Even out loud and quiet parts",
    toggle: "compressorEnabled",
    value: "compressorAmount",
    initial: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    label: "Amount",
  },
  reverb: {
    title: "Reverb",
    hint: "Give your sound a little space",
    toggle: "reverbEnabled",
    value: "reverbAmount",
    initial: 0.2,
    min: 0,
    max: 1,
    step: 0.01,
    label: "Room",
  },
  gate: {
    title: "Noise gate",
    hint: "Quiet between phrases. Original audio is kept.",
    toggle: "gateEnabled",
    value: "gateThreshold",
    initial: -45,
    min: -80,
    max: -10,
    step: 1,
    label: "Threshold",
  },
} as const;

export function TrackEffect({
  track,
  update,
  effect,
}: {
  track: Track;
  update: (track: Track, patch: TrackPatch) => unknown;
  effect: keyof typeof effects;
}) {
  const gesture = useRef<string | undefined>(undefined);
  const config = effects[effect];
  const enabled = !!track[config.toggle];
  const value = track[config.value] ?? config.initial;
  const display =
    effect === "gate" ? `${value} dB` : `${Math.round(value * 100)}%`;
  return (
    <section
      className={`built-in-effect ${enabled ? "enabled" : ""}`}
      aria-label={config.title}
    >
      <div className="effect-heading">
        <strong>{config.title}</strong>
        <button
          className="effect-power"
          aria-label={`Enable ${config.title.toLowerCase()}`}
          aria-pressed={enabled}
          onClick={() => update(track, { [config.toggle]: !enabled })}
        >
          <Power size={14} />
        </button>
      </div>
      <p>{config.hint}</p>
      <label className="effect-amount">
        <span>
          {config.label}
          <output>{display}</output>
        </span>
        <input
          type="range"
          aria-label={`${config.title} ${config.label.toLowerCase()}`}
          aria-valuetext={display}
          min={config.min}
          max={config.max}
          step={config.step}
          value={value}
          disabled={!enabled}
          onPointerDown={() => {
            gesture.current = crypto.randomUUID();
          }}
          onPointerUp={() => {
            gesture.current = undefined;
          }}
          onPointerCancel={() => {
            gesture.current = undefined;
          }}
          onBlur={() => {
            gesture.current = undefined;
          }}
          onChange={(e) =>
            update(track, {
              [config.value]: +e.target.value,
              historyGroup: gesture.current,
            })
          }
          onDoubleClick={() =>
            update(track, { [config.value]: config.initial })
          }
        />
      </label>
    </section>
  );
}
