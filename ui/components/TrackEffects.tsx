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
    label: "Amount",
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
  const gesture = useRef<{ id: string; released: boolean } | undefined>(
    undefined,
  );
  const config = effects[effect];
  const enabled = !!track[config.toggle];
  const extras = {
    compressor: [
      {
        value: "compressorAttack",
        label: "Attack",
        initial: 12,
        min: 1,
        max: 100,
        step: 1,
        hint: "How quickly loud notes are softened. Slower keeps more pick attack.",
        unit: " ms",
      },
      {
        value: "compressorRelease",
        label: "Release",
        initial: 140,
        min: 20,
        max: 1000,
        step: 10,
        hint: "How quickly the volume recovers after a loud note.",
        unit: " ms",
      },
    ],
    reverb: [
      {
        value: "reverbSize",
        label: "Room size",
        initial: 0.55,
        min: 0,
        max: 1,
        step: 0.01,
        hint: "Small room to a spacious hall with a longer decay.",
        unit: "%",
      },
      {
        value: "reverbDamping",
        label: "Damping",
        initial: 0.55,
        min: 0,
        max: 1,
        step: 0.01,
        hint: "Higher values soften bright reflections for a warmer sound.",
        unit: "%",
      },
      {
        value: "reverbWidth",
        label: "Stereo width",
        initial: 1,
        min: 0,
        max: 1,
        step: 0.01,
        hint: "Centered room sound to a wide stereo space.",
        unit: "%",
      },
    ],
    gate: [],
  };
  const controls = [
    { ...config, hint: config.hint, unit: effect === "gate" ? " dB" : "%" },
    ...extras[effect],
  ];
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
      <div className="effect-controls">
        {controls.map((control) => {
          const key = control.value as keyof Track;
          const value = (track[key] as number | undefined) ?? control.initial;
          const display = `${control.unit === "%" ? Math.round(value * 100) : value}${control.unit}`;
          return (
            <label className="effect-amount" key={key} title={control.hint}>
              <span>
                {control.label}
                <output>{display}</output>
              </span>
              <input
                type="range"
                aria-label={`${config.title} ${control.label.toLowerCase()}`}
                aria-valuetext={display}
                min={control.min}
                max={control.max}
                step={control.step}
                value={value}
                disabled={!enabled}
                onPointerDown={() => {
                  gesture.current = {
                    id: crypto.randomUUID(),
                    released: false,
                  };
                }}
                onPointerUp={() => {
                  if (gesture.current) gesture.current.released = true;
                }}
                onPointerCancel={() => {
                  gesture.current = undefined;
                }}
                onBlur={() => {
                  gesture.current = undefined;
                }}
                onKeyDown={() => {
                  if (gesture.current?.released) gesture.current = undefined;
                }}
                onChange={(e) => {
                  const current = gesture.current;
                  update(track, {
                    [key]: +e.target.value,
                    historyGroup: current?.id,
                  });
                }}
                onDoubleClick={() => update(track, { [key]: control.initial })}
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
