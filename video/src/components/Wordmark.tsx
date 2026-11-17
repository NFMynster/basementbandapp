import { interpolate } from "remotion";
import { useTime } from "../time";
import { colors, fontFamily } from "../theme";

// "basement" bold and "band" light, as in the app's title bar; letters rise in turn.
export const Wordmark = ({
  size,
  delay = 0,
}: {
  size: number;
  delay?: number;
}) => {
  const { springAt } = useTime();
  const letters: [string, number][] = [
    ...[..."basement"].map((c): [string, number] => [c, 750]),
    ...[..."band"].map((c): [string, number] => [c, 300]),
  ];
  return (
    <div
      style={{
        fontFamily,
        fontSize: size,
        letterSpacing: "-0.035em",
        color: colors.text,
        display: "flex",
      }}
    >
      {letters.map(([c, weight], i) => {
        const p = springAt(delay + i * 0.05, { damping: 16, mass: 0.6 });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              fontWeight: weight,
              color: weight === 300 ? "#a5a8b3" : colors.text,
              opacity: interpolate(p, [0, 0.5], [0, 1], {
                extrapolateRight: "clamp",
              }),
              transform: `translateY(${(1 - p) * 0.5}em)`,
            }}
          >
            {c}
          </span>
        );
      })}
    </div>
  );
};
