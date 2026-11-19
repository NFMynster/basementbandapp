import { useRef, useState } from "react";
import { Maximize2, Power, RotateCcw } from "lucide-react";
import type { Track, TrackPatch } from "../models";
import { ValueEntry, useValueEntry } from "./ValueEntry";

const bands = [
  {
    gain: "eqBass",
    frequency: "eqBassFrequency",
    name: "Bass",
    hint: "Warmth & weight",
    initial: 180,
    color: "#eab77b",
  },
  {
    gain: "eqMid",
    frequency: "eqMidFrequency",
    name: "Mids",
    hint: "Body & presence",
    initial: 1000,
    color: "#b3a6f5",
  },
  {
    gain: "eqTreble",
    frequency: "eqTrebleFrequency",
    name: "Treble",
    hint: "Detail & air",
    initial: 6000,
    color: "#8cced9",
  },
] as const;
const defaults = {
  eqBass: 0,
  eqMid: 0,
  eqTreble: 0,
  eqBassFrequency: 180,
  eqMidFrequency: 1000,
  eqTrebleFrequency: 6000,
  eqMidQ: 0.7,
  eqLowCut: 20,
};
const presets = [
  { name: "Flat", values: [0, 0, 0] },
  { name: "Warm", values: [3, 0, -2] },
  { name: "Bright", values: [-1, 1, 3] },
  { name: "Vocal clarity", values: [-3, 2, 2] },
  { name: "Bass boost", values: [5, 0, 0] },
];
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const xFor = (f: number) => 34 + (Math.log(f / 20) / Math.log(1000)) * 532;
const frequencyFor = (x: number) => 20 * 1000 ** clamp((x - 34) / 532, 0, 1);
const yFor = (db: number) => 102 - db * 6;
const hz = (f: number) =>
  f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`;

// Magnitude of the same biquad designs used by the native EQ.
function response(track: Track, frequency: number, rate: number) {
  const w = (2 * Math.PI * frequency) / rate;
  const magnitude = (b: number[], a: number[]) => {
    const power = (c: number[]) =>
      (c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w)) ** 2 +
      (c[1] * Math.sin(w) + c[2] * Math.sin(2 * w)) ** 2;
    return 10 * Math.log10(Math.max(1e-12, power(b) / power(a)));
  };
  let db = 0;
  bands.forEach((band, i) => {
    const A = 10 ** ((track[band.gain] ?? 0) / 40);
    const omega =
      (2 *
        Math.PI *
        Math.min(track[band.frequency] ?? band.initial, rate * 0.49)) /
      rate;
    const c = Math.cos(omega),
      alpha = Math.sin(omega) / (2 * (i === 1 ? (track.eqMidQ ?? 0.7) : 0.707));
    const t = 2 * Math.sqrt(A) * alpha;
    if (i === 1)
      db += magnitude(
        [1 + alpha * A, -2 * c, 1 - alpha * A],
        [1 + alpha / A, -2 * c, 1 - alpha / A],
      );
    else if (i === 0)
      db += magnitude(
        [
          A * (A + 1 - (A - 1) * c + t),
          2 * A * (A - 1 - (A + 1) * c),
          A * (A + 1 - (A - 1) * c - t),
        ],
        [
          A + 1 + (A - 1) * c + t,
          -2 * (A - 1 + (A + 1) * c),
          A + 1 + (A - 1) * c - t,
        ],
      );
    else
      db += magnitude(
        [
          A * (A + 1 + (A - 1) * c + t),
          -2 * A * (A - 1 + (A + 1) * c),
          A * (A + 1 + (A - 1) * c - t),
        ],
        [
          A + 1 - (A - 1) * c + t,
          2 * (A - 1 - (A + 1) * c),
          A + 1 - (A - 1) * c - t,
        ],
      );
  });
  if ((track.eqLowCut ?? 20) > 20) {
    const o = (2 * Math.PI * Math.min(track.eqLowCut!, rate * 0.49)) / rate,
      c = Math.cos(o),
      a = Math.sin(o) / (2 * 0.707);
    db += magnitude(
      [(1 + c) / 2, -(1 + c), (1 + c) / 2],
      [1 + a, -2 * c, 1 - a],
    );
  }
  return db;
}

export function TrackEqualizer({
  track,
  update,
  sampleRate = 44100,
  expanded = false,
  onExpand,
}: {
  track: Track;
  update: (track: Track, patch: TrackPatch) => unknown;
  sampleRate?: number;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const [selected, select] = useState(1);
  const gesture = useRef<string | undefined>(undefined);
  const drag = useRef<number | null>(null);
  const enabled = track.eqEnabled !== false;
  const band = bands[selected];
  const preset = presets.find(
    (p) =>
      bands.every(
        (b, i) =>
          (track[b.gain] ?? 0) === p.values[i] &&
          (track[b.frequency] ?? b.initial) === b.initial,
      ) &&
      Math.abs((track.eqMidQ ?? 0.7) - 0.7) < 0.0001 &&
      (track.eqLowCut ?? 20) === 20,
  );
  const entry = useValueEntry<keyof typeof defaults>();
  const change = (patch: TrackPatch) =>
    update(track, { ...patch, historyGroup: gesture.current });
  const curve = Array.from({ length: 220 }, (_, i) => {
    const x = 34 + (i / 219) * 532;
    return `${i ? "L" : "M"}${x.toFixed(2)},${clamp(yFor(enabled ? response(track, Math.min(frequencyFor(x), sampleRate * 0.49), sampleRate) : 0), 16, 188).toFixed(2)}`;
  }).join(" ");
  const finish = () => {
    drag.current = null;
    gesture.current = undefined;
  };
  function slider(
    label: string,
    key: keyof typeof defaults,
    min: number,
    max: number,
    step: number,
    display: string,
  ) {
    const logarithmic = key.endsWith("Frequency");
    const unit =
      logarithmic || key === "eqLowCut" ? "Hz" : key === "eqMidQ" ? "Q" : "dB";
    return (
      <label className="eq-detail">
        <span>
          {label}
          <output>{display}</output>
        </span>
        <input
          type="range"
          aria-label={label}
          aria-valuetext={display}
          min={logarithmic ? 0 : min}
          max={logarithmic ? 1000 : max}
          step={logarithmic ? 1 : step}
          value={
            logarithmic
              ? (Math.log((track[key] ?? defaults[key]) / min) /
                  Math.log(max / min)) *
                1000
              : (track[key] ?? defaults[key])
          }
          disabled={!enabled}
          title="Right-click to type a value"
          onContextMenu={entry.open(key)}
          onPointerDown={() => {
            gesture.current = crypto.randomUUID();
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onBlur={finish}
          onKeyDown={() => {
            gesture.current = undefined;
          }}
          onChange={(e) =>
            change({
              [key]: logarithmic
                ? Math.round(min * (max / min) ** (+e.target.value / 1000))
                : +e.target.value,
            })
          }
        />
        <ValueEntry
          label={
            key === "eqLowCut" ? label : `${band.name} ${label.toLowerCase()}`
          }
          value={track[key] ?? defaults[key]}
          unit={unit}
          min={min}
          max={max}
          decimals={step < 1 ? 1 : 0}
          step={unit === "Hz" ? 10 : step}
          reset={defaults[key]}
          resetLabel={key === "eqLowCut" ? "off" : undefined}
          anchor={entry.anchor(key)}
          onCommit={(value) => update(track, { [key]: value })}
          onClose={entry.close}
        />
      </label>
    );
  }
  return (
    <div
      className={`track-eq eq-editor ${expanded ? "eq-full" : "eq-compact"}`}
    >
      <div className="eq-summary">
        <strong>Equalizer</strong>
        <div className="eq-actions">
          <select
            aria-label="Equalizer preset"
            value={preset?.name ?? "Custom"}
            onChange={(e) => {
              const p = presets.find((p) => p.name === e.target.value);
              if (p)
                update(track, {
                  ...defaults,
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
            onClick={() => update(track, defaults)}
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <button
          aria-label="Enable equalizer"
          aria-pressed={enabled}
          className={enabled ? "enabled" : ""}
          onClick={() => update(track, { eqEnabled: !enabled })}
        >
          <Power size={15} />
        </button>
      </div>
      <div className={`eq-plot ${enabled ? "" : "is-bypassed"}`}>
        {!expanded && (
          <button
            className="eq-preview-open"
            onClick={onExpand}
            aria-label="Open equalizer editor"
          >
            <span>
              <Maximize2 size={14} /> Edit EQ
            </span>
          </button>
        )}
        <svg viewBox="0 0 600 220" aria-label="Equalizer frequency response">
          {[-12, -6, 0, 6, 12].map((db) => (
            <g key={db}>
              <line
                x1="34"
                x2="566"
                y1={yFor(db)}
                y2={yFor(db)}
                className={db === 0 ? "eq-zero" : "eq-grid"}
              />
              <text x="7" y={yFor(db) + 3}>
                {db > 0 ? "+" : ""}
                {db}
              </text>
            </g>
          ))}
          {[20, 100, 1000, 10000, 20000].map((f) => (
            <g key={f}>
              <line
                x1={xFor(f)}
                x2={xFor(f)}
                y1="16"
                y2="188"
                className="eq-grid"
              />
              <text textAnchor="middle" x={xFor(f)} y="208">
                {f >= 1000 ? `${f / 1000}k` : f}
              </text>
            </g>
          ))}
          <path d={`${curve} L566,102 L34,102 Z`} className="eq-fill" />
          <path d={curve} className="eq-curve" />
          {bands.map((b, i) => (
            <g
              key={b.gain}
              className="eq-node"
              style={{ color: b.color }}
              transform={`translate(${xFor(track[b.frequency] ?? b.initial)},${yFor(track[b.gain] ?? 0)})`}
            >
              <circle r={selected === i ? 15 : 11} className="eq-halo" />
              <circle r="5" fill="currentColor" />
              <circle
                r="21"
                fill="transparent"
                role="button"
                tabIndex={enabled && expanded ? 0 : -1}
                aria-label={`${b.name}: ${hz(track[b.frequency] ?? b.initial)}, ${track[b.gain] ?? 0} dB. Select to edit; arrow keys adjust.`}
                aria-disabled={!enabled}
                onFocus={() => select(i)}
                onDoubleClick={() => {
                  if (enabled) update(track, { [b.gain]: 0 });
                }}
                onKeyDown={(e) => {
                  if (
                    !enabled ||
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  update(
                    track,
                    e.key === "ArrowUp" || e.key === "ArrowDown"
                      ? {
                          [b.gain]: clamp(
                            (track[b.gain] ?? 0) +
                              (e.key === "ArrowUp" ? 0.5 : -0.5),
                            -12,
                            12,
                          ),
                        }
                      : {
                          [b.frequency]: clamp(
                            (track[b.frequency] ?? b.initial) *
                              (e.key === "ArrowRight" ? 1.05 : 1 / 1.05),
                            20,
                            20000,
                          ),
                        },
                  );
                }}
                onPointerDown={(e) => {
                  if (!enabled) return;
                  e.preventDefault();
                  select(i);
                  drag.current = e.pointerId;
                  gesture.current = crypto.randomUUID();
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (drag.current !== e.pointerId) return;
                  const svg = e.currentTarget.ownerSVGElement!;
                  const point = svg.createSVGPoint();
                  point.x = e.clientX;
                  point.y = e.clientY;
                  const local = point.matrixTransform(
                    svg.getScreenCTM()!.inverse(),
                  );
                  change({
                    [b.frequency]: Math.round(frequencyFor(local.x)),
                    [b.gain]:
                      Math.round(clamp((102 - local.y) / 6, -12, 12) * 2) / 2,
                  });
                }}
                onPointerUp={finish}
                onPointerCancel={finish}
                onLostPointerCapture={finish}
              />
            </g>
          ))}
        </svg>
      </div>
      {!expanded && (
        <span className="eq-preview-hint">
          Shape your sound. Click the curve to edit.
        </span>
      )}
      <div className="eq-band-tabs" aria-label="Equalizer bands">
        {bands.map((b, i) => (
          <button
            key={b.name}
            aria-pressed={selected === i}
            onClick={() => select(i)}
            style={{ "--band-color": b.color } as React.CSSProperties}
          >
            <i />
            {b.name}
            <span>
              {(track[b.gain] ?? 0) > 0 ? "+" : ""}
              {(track[b.gain] ?? 0).toFixed(1)} dB
            </span>
          </button>
        ))}
      </div>
      <div className="eq-selected" key={selected}>
        <div className="eq-description">
          <strong>{band.hint}</strong>
          <span>
            Drag left or right to find the sound. Up to boost, down to soften.
          </span>
        </div>
        <div className="eq-detail-grid">
          {slider(
            "Frequency",
            band.frequency,
            20,
            20000,
            1,
            hz(track[band.frequency] ?? band.initial),
          )}
          {slider(
            "Gain",
            band.gain,
            -12,
            12,
            0.5,
            `${(track[band.gain] ?? 0).toFixed(1)} dB`,
          )}
          {selected === 1 &&
            slider(
              "Bandwidth",
              "eqMidQ",
              0.2,
              10,
              0.1,
              `${(track.eqMidQ ?? 0.7).toFixed(1)} Q / ${(track.eqMidQ ?? 0.7) > 2 ? "Focused" : "Broad"}`,
            )}
        </div>
      </div>
      <details className="eq-more" open={expanded}>
        <summary>Rumble cut</summary>
        {slider(
          "Rumble cut",
          "eqLowCut",
          20,
          1000,
          1,
          (track.eqLowCut ?? 20) <= 20 ? "Off" : hz(track.eqLowCut!),
        )}
        <p>Removes sound below this frequency. Start low to keep the warmth.</p>
      </details>
    </div>
  );
}
