import { AbsoluteFill } from "remotion";
import { Logo } from "../components/Logo";
import { Wordmark } from "../components/Wordmark";
import { ramp, useTime } from "../time";
import { colors, fontFamily } from "../theme";

export const Outro = () => {
  const { t, springAt } = useTime();
  const pop = springAt(0, { damping: 14 });
  const line = (from: number) => ramp(t, [from, from + 0.45], [0, 1]);
  const scale = ramp(t, [0, 6], [0.96, 1.02]);
  const rise = (from: number) => ({
    opacity: line(from),
    transform: `translateY(${(1 - line(from)) * 14}px)`,
  });
  return (
    <AbsoluteFill
      style={{
        fontFamily,
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          transform: `scale(${0.5 + 0.5 * pop})`,
          opacity: Math.min(1, pop * 2),
        }}
      >
        <Logo size={170} settle={1.3} />
      </div>
      <div style={{ marginTop: 36 }}>
        <Wordmark size={110} delay={0.15} />
      </div>
      <div
        style={{
          marginTop: 22,
          fontSize: 38,
          color: colors.muted,
          ...rise(0.8),
        }}
      >
        Recording, made simple.
      </div>
      <div
        style={{
          marginTop: 50,
          fontSize: 32,
          fontWeight: 600,
          color: colors.text,
          ...rise(1.3),
        }}
      >
        Free for Windows, macOS and Linux
      </div>
      <div
        style={{
          marginTop: 30,
          display: "flex",
          gap: 18,
          alignItems: "center",
          fontSize: 26,
          fontWeight: 500,
          ...rise(1.8),
        }}
      >
        <span
          style={{
            padding: "12px 26px",
            borderRadius: 999,
            backgroundColor: colors.sage,
            color: colors.sageInk,
            fontWeight: 650,
          }}
        >
          footstomp.studio
        </span>
        <span style={{ color: colors.muted }}>
          Open source · Made by a musician, for musicians
        </span>
      </div>
    </AbsoluteFill>
  );
};
