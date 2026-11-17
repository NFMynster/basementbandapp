import { useTime, ramp } from "../time";
import { colors } from "../theme";

// The six bars from desktop/assets/icon.svg: x position and resting top/bottom.
const bars = [
  [225, 460, 564],
  [340, 350, 674],
  [455, 235, 789],
  [570, 405, 619],
  [685, 305, 719],
  [800, 460, 564],
];

// The app icon, with its bars bouncing like a level meter until `settle` seconds.
export const Logo = ({
  size,
  settle = 1.5,
}: {
  size: number;
  settle?: number;
}) => {
  const { t } = useTime();
  const calm = ramp(t, [settle - 0.5, settle], [1, 0]);
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="surface" x2="0" y2="1">
          <stop stopColor="#373f38" />
          <stop offset="1" stopColor="#202723" />
        </linearGradient>
      </defs>
      <rect
        x="28"
        y="28"
        width="968"
        height="968"
        rx="240"
        fill="url(#surface)"
        stroke="#74816d"
        strokeWidth="8"
      />
      {bars.map(([x, top, bottom], i) => {
        const rest = (bottom - top) / 2;
        const level =
          0.35 +
          0.65 * Math.abs(Math.sin(t * 7.1 + i * 1.7) * Math.cos(t * 3.3 + i));
        const half = rest + (Math.min(277, rest * 2.2) * level - rest) * calm;
        return (
          <line
            key={x}
            x1={x}
            x2={x}
            y1={512 - half}
            y2={512 + half}
            stroke={colors.sage}
            strokeWidth={57}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};
