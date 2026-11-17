import { colors, layout } from "../theme";

// Same plot mapping and biquad maths as ui/components/TrackEqualizer.tsx, so the
// curve drawn here lines up with the captured editor's plot.
const plot = layout.eq.plot;
export type Eq = {
  bass: number;
  mid: number;
  midFrequency: number;
  treble: number;
  lowCut: number;
};

const rate = 48000;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const xFor = (f: number) => 34 + (Math.log(f / 20) / Math.log(1000)) * 532;
const frequencyFor = (x: number) => 20 * 1000 ** clamp((x - 34) / 532, 0, 1);
const yFor = (db: number) => 102 - db * 6;

// Where a band's handle sits, in screen coordinates.
export const eqPoint = (frequency: number, gain: number) => ({
  x: plot.x + (xFor(frequency) / 600) * plot.width,
  y: plot.y + (yFor(gain) / 220) * plot.height,
});

function response(eq: Eq, frequency: number) {
  const w = (2 * Math.PI * frequency) / rate;
  const magnitude = (b: number[], a: number[]) => {
    const power = (c: number[]) =>
      (c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w)) ** 2 +
      (c[1] * Math.sin(w) + c[2] * Math.sin(2 * w)) ** 2;
    return 10 * Math.log10(Math.max(1e-12, power(b) / power(a)));
  };
  const bands: [number, number, number][] = [
    [eq.bass, 180, 0.707],
    [eq.mid, eq.midFrequency, 0.7],
    [eq.treble, 6000, 0.707],
  ];
  let db = 0;
  bands.forEach(([gain, f, q], i) => {
    const A = 10 ** (gain / 40);
    const omega = (2 * Math.PI * f) / rate;
    const c = Math.cos(omega);
    const alpha = Math.sin(omega) / (2 * q);
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
  if (eq.lowCut > 20.5) {
    const o = (2 * Math.PI * eq.lowCut) / rate;
    const c = Math.cos(o);
    const a = Math.sin(o) / (2 * 0.707);
    db += magnitude(
      [(1 + c) / 2, -(1 + c), (1 + c) / 2],
      [1 + a, -2 * c, 1 - a],
    );
  }
  return db;
}

export const EqCurve = ({ eq }: { eq: Eq }) => {
  const curve = Array.from({ length: 220 }, (_, i) => {
    const x = 34 + (i / 219) * 532;
    return `${i ? "L" : "M"}${x.toFixed(2)},${clamp(yFor(response(eq, frequencyFor(x))), 16, 188).toFixed(2)}`;
  }).join(" ");
  const nodes: [number, number, string, boolean][] = [
    [180, eq.bass, colors.eqBass, false],
    [eq.midFrequency, eq.mid, colors.eqMid, true],
    [6000, eq.treble, colors.eqTreble, false],
  ];
  return (
    <svg
      viewBox="0 0 600 220"
      style={{
        position: "absolute",
        left: plot.x,
        top: plot.y,
        width: plot.width,
        height: plot.height,
        overflow: "visible",
      }}
    >
      <path d={`${curve} L566,102 L34,102 Z`} fill="#a5c8f318" />
      <path
        d={curve}
        fill="none"
        stroke="#c2d9f4"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 4px #c2d9f480)" }}
      />
      {nodes.map(([f, gain, color, selected]) => (
        <g key={color} transform={`translate(${xFor(f)},${yFor(gain)})`}>
          <circle r={selected ? 15 : 11} fill={color} opacity={0.14} />
          <circle r={5} fill={color} />
        </g>
      ))}
    </svg>
  );
};
