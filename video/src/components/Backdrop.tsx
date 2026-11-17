import { AbsoluteFill } from "remotion";
import { useTime } from "../time";
import { colors } from "../theme";

// A slow-moving sage glow over the app's page colour, so nothing is ever flat black.
export const Backdrop = () => {
  const { t } = useTime();
  const x = 50 + 18 * Math.sin(t / 4.7);
  const y = 18 + 8 * Math.cos(t / 5.7);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.page,
        backgroundImage: [
          `radial-gradient(1100px 700px at ${x}% ${y}%, #b0c4a71c, transparent 70%)`,
          `radial-gradient(900px 600px at ${100 - x}% 105%, #58a9e812, transparent 70%)`,
          "radial-gradient(ellipse at center, transparent 55%, #0e0f12 100%)",
        ].join(","),
      }}
    />
  );
};
