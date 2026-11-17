import { AbsoluteFill } from "remotion";
import { AppFrame, Highlight, Shot } from "../components/AppFrame";
import { Caption } from "../components/Caption";
import { Callout } from "../components/Pointer";
import { ramp, useTime, window01 } from "../time";
import { colors, layout } from "../theme";

const { device } = layout.midiInput;

// The MIDI track routing in Settings, with a drum pad assigned to the Drums track.
export const MidiPads = () => {
  const { t } = useTime();
  const zoom = ramp(t, [0, 5.2], [1.35, 1.5]);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Caption
        title="Bring your MIDI pads and keyboards."
        sub="Connect one to any MIDI track and play it straight in."
        style={{ marginTop: 46 }}
      />
      <AppFrame
        width={1240}
        os="mac"
        camera={{ x: device.x + device.width / 2 + 60, y: device.y - 40, zoom }}
        style={{ marginTop: 32 }}
      >
        <Shot name="midi-input" />
        <Highlight
          {...device}
          w={device.width}
          h={device.height}
          color={colors.sage}
          progress={window01(t, 0.9, 6)}
        />
        <Callout
          x={device.x + device.width / 2}
          y={device.y + device.height}
          side="bottom"
          text="Your drum pad, on its own track"
          from={1.1}
          to={6}
        />
      </AppFrame>
    </AbsoluteFill>
  );
};
