import { AbsoluteFill } from "remotion";
import { ramp, useTime } from "../time";
import { colors, fontFamily } from "../theme";

const lines = ["No cloud.", "No subscriptions.", "No logins."];

// Three "no"s, then "Completely free." lands already highlighted, with a note under it.
export const Values = () => {
  const { t, springAt } = useTime();
  const dim = ramp(t, [2.0, 2.4], [1, 0.32]);
  const free = springAt(2.1, { damping: 14 });
  const note = ramp(t, [3.1, 3.6], [0, 1]);
  const big = {
    fontSize: 104,
    fontWeight: 800,
    letterSpacing: "-0.045em",
    lineHeight: 1.08,
  };
  return (
    <AbsoluteFill
      style={{ fontFamily, justifyContent: "center", paddingLeft: 260 }}
    >
      {lines.map((text, i) => {
        const p = springAt(0.1 + i * 0.4, { damping: 16, mass: 0.7 });
        return (
          <div
            key={text}
            style={{
              ...big,
              color: colors.text,
              opacity: Math.min(1, p * 1.5) * dim,
              transform: `translateX(${(1 - p) * -80}px)`,
              filter: `blur(${(1 - Math.min(1, p)) * 10}px)`,
            }}
          >
            {text}
          </div>
        );
      })}
      <div
        style={{
          ...big,
          fontSize: 124,
          alignSelf: "flex-start",
          marginTop: 36,
          marginLeft: -24,
          padding: "4px 24px 12px",
          borderRadius: 14,
          color: colors.sageInk,
          backgroundColor: colors.sage,
          boxShadow: `0 0 60px ${colors.sage}55`,
          opacity: Math.min(1, free * 1.5),
          transform: `translateY(${(1 - free) * 40}px) scale(${0.94 + 0.06 * free})`,
          transformOrigin: "left center",
        }}
      >
        Completely free.
      </div>
      <div
        style={{
          marginTop: 30,
          fontSize: 38,
          fontWeight: 400,
          color: colors.muted,
          opacity: note,
          transform: `translateY(${(1 - note) * 14}px)`,
        }}
      >
        No strings attached. Seriously, jamming with your band should be free.
      </div>
    </AbsoluteFill>
  );
};
