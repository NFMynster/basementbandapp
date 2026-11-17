import { AbsoluteFill } from "remotion";
import { Logo } from "../components/Logo";
import { Wordmark } from "../components/Wordmark";
import { ramp, useTime } from "../time";
import { colors, fontFamily } from "../theme";

export const Intro = () => {
  const { t, springAt } = useTime();
  const pop = springAt(0, { damping: 12, mass: 0.8 });
  const drift = ramp(t, [0, 3.6], [1, 1.04]);
  const tagline = ramp(t, [1.3, 1.9], [0, 1]);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${drift})`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
        <div
          style={{
            transform: `scale(${0.4 + 0.6 * pop}) rotate(${(1 - pop) * -12}deg)`,
            opacity: Math.min(1, pop * 2),
          }}
        >
          <Logo size={200} settle={2} />
        </div>
        <Wordmark size={150} delay={0.3} />
      </div>
      <div
        style={{
          marginTop: 44,
          fontFamily,
          fontSize: 44,
          fontWeight: 400,
          letterSpacing: "-0.01em",
          color: colors.muted,
          opacity: tagline,
          transform: `translateY(${(1 - tagline) * 14}px)`,
        }}
      >
        Recording, made simple.
      </div>
    </AbsoluteFill>
  );
};
