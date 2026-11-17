import { AbsoluteFill } from "remotion";
import { AppFrame, Highlight, Shot } from "../components/AppFrame";
import { Caption } from "../components/Caption";
import { Callout } from "../components/Pointer";
import { useTime, window01 } from "../time";
import { colors, layout } from "../theme";

const { loop, picker } = layout.takes;

// From the loop region over to the take picker.
export const Takes = () => {
  const { t, springAt } = useTime();
  const pan = springAt(2.3, { damping: 200 }, 0.9);
  const from = { x: loop.x + loop.width / 2, y: 260 };
  const to = { x: picker.x + picker.width / 2, y: 260 };
  const camera = {
    x: from.x + (to.x - from.x) * pan,
    y: from.y,
    zoom: 1.6 + 0.04 * Math.sin(t),
  };
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Caption
        title="Loop it until it feels right."
        sub="Every take is kept, so you can pick your favourite later."
        style={{ marginTop: 46 }}
      />
      <AppFrame
        width={1240}
        os="windows"
        camera={camera}
        style={{ marginTop: 32 }}
      >
        <Shot name="takes" />
        <Highlight
          {...loop}
          w={loop.width}
          h={loop.height}
          radius={4}
          color={colors.amber}
          progress={window01(t, 0.3, 2.4)}
        />
        <Highlight
          {...picker}
          w={picker.width}
          h={picker.height}
          color={colors.sage}
          progress={window01(t, 3.0, 6.5)}
        />
        <Callout
          x={loop.x + loop.width / 2}
          y={loop.y + loop.height}
          side="bottom"
          text="Loop a section"
          from={0.5}
          to={2.4}
        />
        <Callout
          x={picker.x + picker.width / 2}
          y={picker.y + picker.height}
          side="bottom"
          text="Pick your favourite take"
          from={3.1}
          to={6.5}
        />
      </AppFrame>
    </AbsoluteFill>
  );
};
