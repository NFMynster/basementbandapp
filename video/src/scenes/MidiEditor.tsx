import { AbsoluteFill, Easing } from "remotion";
import { AppFrame, Shot } from "../components/AppFrame";
import { Caption } from "../components/Caption";
import { Callout } from "../components/Pointer";
import { ramp, useTime } from "../time";
import { colors, layout, screen } from "../theme";

const { notes, draw } = layout.midi;
const roll = {
  left: notes.x - 4,
  top: notes.y - 6,
  bottom: notes.y + notes.height + 6,
};

// The maximised MIDI editor: the drum part plays in, then the Draw tool is pointed out.
export const MidiEditor = () => {
  const { t } = useTime();
  const head = ramp(
    t,
    [0.3, 3.2],
    [roll.left, screen.width],
    Easing.inOut(Easing.quad),
  );
  // Pinned to the left edge (the frame clamps x) so the Draw button and its label fit.
  const camera = {
    x: 0,
    y: (draw.y + roll.bottom) / 2 + 75,
    zoom: ramp(t, [0, 5.6], [1.6, 1.68]),
  };
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Caption
        title="A full MIDI editor."
        sub="Drums, synths, keys, you name it. Draw notes, set velocity and snap to the beat."
        style={{ marginTop: 46 }}
      />
      <AppFrame
        width={1240}
        os="windows"
        camera={camera}
        style={{ marginTop: 32 }}
      >
        <Shot name="midi-max-empty" />
        <Shot
          name="midi-max"
          style={{
            clipPath: `inset(${roll.top}px ${screen.width - head}px ${screen.height - roll.bottom}px ${roll.left}px)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: head - 1,
            top: roll.top - 8,
            width: 2,
            height: roll.bottom - roll.top + 8,
            backgroundColor: colors.amber,
            boxShadow: `0 0 10px ${colors.amber}`,
            opacity: ramp(t, [0.3, 0.5], [0, 1]) * ramp(t, [3.0, 3.3], [1, 0]),
          }}
        />
        <Callout
          x={draw.x + draw.width / 2}
          y={draw.y + draw.height}
          side="bottom"
          text="Draw notes with the mouse"
          from={3.3}
          to={6}
        />
      </AppFrame>
    </AbsoluteFill>
  );
};
