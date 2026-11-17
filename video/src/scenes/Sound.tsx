import { AbsoluteFill } from "remotion";
import { AppFrame, Shot } from "../components/AppFrame";
import { Caption } from "../components/Caption";
import { type Eq, EqCurve, eqPoint } from "../components/EqCurve";
import { Callout, Cursor, type Keyframe } from "../components/Pointer";
import { ramp, useTime } from "../time";
import { layout } from "../theme";

const { plot } = layout.eq;
// Ends on the settings in the captured side panel (capture-preload.cjs).
const drags: Record<"bass" | "mid" | "treble", [number, number]> = {
  bass: [0.9, 1.8],
  mid: [2.3, 3.3],
  treble: [3.8, 4.7],
};

// The cursor drags each handle in turn and the real response curve follows.
export const Sound = () => {
  const { t } = useTime();
  const eq: Eq = {
    bass: ramp(t, drags.bass, [0, 2.5]),
    mid: ramp(t, drags.mid, [0, -3]),
    midFrequency: ramp(t, drags.mid, [1000, 700]),
    treble: ramp(t, drags.treble, [0, 4]),
    lowCut: ramp(t, [4.9, 5.4], [20, 80]),
  };
  const grab = (f: number, gain: number, at: number): Keyframe => ({
    t: at,
    ...eqPoint(f, gain),
  });
  const rest = eqPoint(6000, 4);
  const path: Keyframe[] = [
    { t: 0.4, x: plot.x + plot.width * 0.7, y: plot.y + plot.height + 120 },
    grab(180, 0, drags.bass[0] - 0.05),
    grab(180, 2.5, drags.bass[1]),
    grab(1000, 0, drags.mid[0] - 0.05),
    grab(700, -3, drags.mid[1]),
    grab(6000, 0, drags.treble[0] - 0.05),
    grab(6000, 4, drags.treble[1]),
    { t: 5.3, x: rest.x + 120, y: rest.y + 140 },
  ];
  const zoom = ramp(t, [0, 6.2], [1.15, 1.27]);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Caption
        title="Shape your sound."
        sub="Simple EQ, compressor and reverb. Your original recording is always kept."
        style={{ marginTop: 46 }}
      />
      <AppFrame
        width={1240}
        os="linux"
        camera={{
          x: plot.x + plot.width / 2 + 120,
          y: plot.y + plot.height / 2 + 40,
          zoom,
        }}
        style={{ marginTop: 32 }}
      >
        <Shot name="eq-blank" />
        <EqCurve eq={eq} />
        <Callout
          x={plot.x + plot.width / 2}
          y={plot.y + 30}
          side="top"
          text="Drag the points to shape the sound"
          from={0.5}
          to={3.0}
          dot={false}
        />
        <Cursor path={path} drags={Object.values(drags)} />
      </AppFrame>
    </AbsoluteFill>
  );
};
