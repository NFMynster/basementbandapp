import type { CSSProperties } from "react";
import { interpolate } from "remotion";
import { ramp, useTime } from "../time";
import { colors, fontFamily } from "../theme";

// Rises in word by word.
export const Words = ({
  text,
  delay = 0,
  stagger = 0.06,
  style,
}: {
  text: string;
  delay?: number;
  stagger?: number;
  style?: CSSProperties;
}) => {
  const { springAt } = useTime();
  const words = text.split(" ");
  return (
    <span style={{ display: "inline-block", ...style }}>
      {words.map((word, i) => {
        const p = springAt(delay + i * stagger, { damping: 18, mass: 0.7 });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: interpolate(p, [0, 0.6], [0, 1], {
                extrapolateRight: "clamp",
              }),
              transform: `translateY(${(1 - p) * 0.6}em)`,
              filter: `blur(${(1 - Math.min(p, 1)) * 8}px)`,
            }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </span>
  );
};

// A headline with a plain-language line under it, held on screen for the whole scene.
export const Caption = ({
  title,
  sub,
  delay = 0.15,
  style,
}: {
  title: string;
  sub?: string;
  delay?: number;
  style?: CSSProperties;
}) => {
  const { t } = useTime();
  const subIn = ramp(t, [delay + 0.35, delay + 0.75], [0, 1]);
  return (
    <div
      style={{ fontFamily, textAlign: "center", color: colors.text, ...style }}
    >
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
        }}
      >
        <Words text={title} delay={delay} />
      </div>
      {sub && (
        <div
          style={{
            marginTop: 14,
            fontSize: 30,
            fontWeight: 400,
            color: colors.muted,
            opacity: subIn,
            transform: `translateY(${(1 - subIn) * 12}px)`,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};
