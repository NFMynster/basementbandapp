import { Easing, interpolate } from "remotion";
import { useTime } from "../time";
import { colors, fontFamily } from "../theme";
import { useFrameScale } from "./AppFrame";

// Both live inside an AppFrame, anchored in screen coordinates but drawn at a
// constant on-screen size however far the camera zooms.
const Anchor = ({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
}) => {
  const k = useFrameScale();
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 0,
        height: 0,
        transform: `scale(${1 / k})`,
        transformOrigin: "0 0",
      }}
    >
      {children}
    </div>
  );
};

export type Side = "top" | "bottom" | "left" | "right";

// A small label with a leader line to the thing it describes.
export const Callout = ({
  x,
  y,
  text,
  side = "bottom",
  from,
  to,
  dot = true,
}: {
  x: number;
  y: number;
  text: string;
  side?: Side;
  from: number;
  to: number;
  dot?: boolean;
}) => {
  const { t } = useTime();
  const p = interpolate(t, [from, from + 0.3, to - 0.25, to], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  if (p <= 0) return null;
  const gap = 34;
  const slide = (1 - p) * 10;
  const place = {
    top: { left: 0, top: -gap - slide, transform: "translate(-50%, -100%)" },
    bottom: { left: 0, top: gap + slide, transform: "translate(-50%, 0)" },
    left: { left: -gap - slide, top: 0, transform: "translate(-100%, -50%)" },
    right: { left: gap + slide, top: 0, transform: "translate(0, -50%)" },
  }[side];
  const vertical = side === "top" || side === "bottom";
  const leader = {
    top: { left: -0.75, top: -gap, width: 1.5, height: gap },
    bottom: { left: -0.75, top: 0, width: 1.5, height: gap },
    left: { left: -gap, top: -0.75, width: gap, height: 1.5 },
    right: { left: 0, top: -0.75, width: gap, height: 1.5 },
  }[side];
  return (
    <Anchor x={x} y={y}>
      <div style={{ position: "absolute", opacity: p }}>
        {dot && (
          <>
            <div
              style={{
                position: "absolute",
                ...leader,
                backgroundColor: colors.sage,
                opacity: 0.8,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: -5,
                top: -5,
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: colors.sage,
                boxShadow: `0 0 0 4px ${colors.sage}33`,
              }}
            />
          </>
        )}
        <div style={{ position: "absolute", ...place }}>
          <div
            style={{
              fontFamily,
              fontSize: 23,
              fontWeight: 600,
              whiteSpace: "nowrap",
              color: colors.text,
              backgroundColor: "#1d1e22f2",
              border: "1px solid #4a4b52",
              borderLeft: vertical
                ? "1px solid #4a4b52"
                : `3px solid ${colors.sage}`,
              borderTop: vertical
                ? `3px solid ${colors.sage}`
                : "1px solid #4a4b52",
              padding: "10px 16px",
              borderRadius: 6,
              boxShadow: "0 12px 30px #0009",
            }}
          >
            {text}
          </div>
        </div>
      </div>
    </Anchor>
  );
};

export type Keyframe = { t: number; x: number; y: number };

// Where a cursor following `path` is at time t.
export const along = (path: Keyframe[], t: number) => {
  const i = path.findIndex((k) => k.t > t);
  if (i === -1) return path[path.length - 1];
  if (i === 0) return path[0];
  const a = path[i - 1];
  const b = path[i];
  const p = Easing.inOut(Easing.cubic)((t - a.t) / (b.t - a.t));
  return { t, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
};

// A mouse pointer that glides along `path`, pressing down around each click time.
export const Cursor = ({
  path,
  clicks = [],
  drags = [],
}: {
  path: Keyframe[];
  clicks?: number[];
  drags?: [number, number][];
}) => {
  const { t } = useTime();
  const { x, y } = along(path, t);
  const visible = interpolate(
    t,
    [
      path[0].t,
      path[0].t + 0.2,
      path[path.length - 1].t + 0.4,
      path[path.length - 1].t + 0.6,
    ],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const down =
    clicks.some((c) => t >= c && t < c + 0.15) ||
    drags.some(([a, b]) => t >= a && t < b);
  const ripple = clicks.map((c) => (t - c) / 0.5).find((r) => r >= 0 && r < 1);
  return (
    <Anchor x={x} y={y}>
      {ripple !== undefined && (
        <div
          style={{
            position: "absolute",
            left: -30,
            top: -30,
            width: 60,
            height: 60,
            borderRadius: "50%",
            border: "3px solid #fff",
            transform: `scale(${0.3 + ripple})`,
            opacity: 1 - ripple,
          }}
        />
      )}
      <svg
        width={34}
        height={44}
        viewBox="0 0 17 22"
        style={{
          position: "absolute",
          left: -2,
          top: -1,
          opacity: visible,
          transform: `scale(${down ? 0.86 : 1})`,
          transformOrigin: "2px 1px",
          filter: "drop-shadow(0 4px 6px #0009)",
        }}
      >
        <path
          d="M1 1 L1 17 L5 13 L8 20 L11 18.7 L8 12 L14 12 Z"
          fill="#fff"
          stroke="#111"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </svg>
    </Anchor>
  );
};
