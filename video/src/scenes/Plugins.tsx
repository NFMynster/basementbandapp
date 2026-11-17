import { AbsoluteFill } from "remotion";
import { AppFrame, Shot } from "../components/AppFrame";
import { Caption } from "../components/Caption";
import { Callout, Cursor } from "../components/Pointer";
import { ramp, useTime } from "../time";
import { layout } from "../theme";

const { chain, replace } = layout.plugins;
const { dialog } = layout.browser;
const click = 2.2;

// The track's plug-in chain, then the cursor opens the instrument browser.
export const Plugins = () => {
  const { t, springAt } = useTime();
  const browser = ramp(t, [click + 0.1, click + 0.35], [0, 1]);
  const move = springAt(click + 0.1, { damping: 200 }, 0.8);
  // Starts on the instrument slot and its Replace button.
  const from = {
    x: replace.x + 320,
    y: chain.y + chain.height / 2,
    zoom: 1.8,
  };
  const to = {
    x: dialog.x + dialog.width / 2,
    y: dialog.y + dialog.height / 2,
    zoom: 1.35,
  };
  const camera = {
    x: from.x + (to.x - from.x) * move,
    y: from.y + (to.y - from.y) * move,
    zoom: from.zoom + (to.zoom - from.zoom) * move,
  };
  const target = {
    x: replace.x + replace.width / 2,
    y: replace.y + replace.height / 2,
  };
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Caption
        title="Bring in your VST3 plug-ins."
        sub="Load other instruments, or add effects to fine-tune your sound."
        style={{ marginTop: 46 }}
      />
      <AppFrame
        width={1240}
        os="linux"
        camera={camera}
        style={{ marginTop: 32 }}
      >
        <Shot name="plugins" />
        <Shot name="browser" style={{ opacity: browser }} />
        <Callout
          x={chain.x + chain.width / 2}
          y={chain.y}
          side="top"
          text="Instrument and effects, in order"
          from={0.4}
          to={click}
        />
        <Cursor
          path={[
            { t: 0.9, x: target.x + 260, y: target.y + 120 },
            { t: 1.9, x: target.x, y: target.y },
            { t: click + 0.1, x: target.x, y: target.y },
          ]}
          clicks={[click]}
        />
        <Callout
          x={dialog.x + dialog.width / 2}
          y={dialog.y + dialog.height}
          side="bottom"
          text="Your installed VST3 plug-ins"
          from={click + 0.9}
          to={7}
          dot={false}
        />
      </AppFrame>
    </AbsoluteFill>
  );
};
