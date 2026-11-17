import { AbsoluteFill, Easing } from "remotion";
import { AppFrame, Shot } from "../components/AppFrame";
import { Caption } from "../components/Caption";
import { Callout, Cursor } from "../components/Pointer";
import { ramp, useTime } from "../time";
import { colors, layout, screen } from "../theme";

const { record: button, lanes: allLanes, timeline, ruler } = layout.workspace;
// The visible part of the track lanes, less the timeline's scrollbars.
const lanes = {
  left: allLanes.x,
  right: timeline.x + timeline.width - 10,
  top: allLanes.y,
  bottom: timeline.y + timeline.height - 10,
};
const playheadTop = ruler.y + 25;
const record = {
  x: button.x + button.width / 2,
  y: button.y + button.height / 2,
};
const click = 1.9;

// The cursor presses record, then a follow-cam rides the playhead while every track records.
export const Record = () => {
  const { t, springAt } = useTime();
  const land = springAt(0, { damping: 20, mass: 1.1 });
  const head = ramp(
    t,
    [2.3, 6.4],
    [lanes.left, lanes.right],
    Easing.bezier(0.45, 0, 0.6, 1),
  );
  const a =
    springAt(2.1, { damping: 200 }, 0.7) - springAt(6.4, { damping: 200 }, 0.7);
  const middle = (lanes.top + lanes.bottom) / 2;
  const camera = {
    x: screen.width / 2 + (head + 140 - screen.width / 2) * a,
    y: screen.height / 2 + (middle - screen.height / 2) * a,
    zoom: 1 + 0.5 * a,
  };
  const recording = ramp(t, [click, click + 0.12], [0, 1]);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Caption
        title="Record the whole band at once."
        sub="Everyone gets their own track. Just press record and play."
        style={{ marginTop: 46 }}
      />
      <div style={{ perspective: 2200, marginTop: 32 }}>
        <AppFrame
          width={1240}
          os="mac"
          camera={camera}
          style={{
            transform: `translateY(${(1 - land) * 240}px) rotateX(${(1 - land) * 24}deg) scale(${0.9 + 0.1 * land})`,
            opacity: Math.min(1, land * 1.6),
          }}
        >
          <Shot name="empty" />
          <Shot name="recording" style={{ opacity: recording }} />
          <Shot
            name="workspace"
            style={{
              clipPath: `inset(${lanes.top}px ${screen.width - head}px ${screen.height - lanes.bottom}px ${lanes.left}px)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: head - 70,
              top: lanes.top,
              width: 70,
              height: lanes.bottom - lanes.top,
              background: `linear-gradient(to right, transparent, ${colors.record}30)`,
              opacity: t > 2.3 && t < 6.4 ? 1 : 0,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: head - 1,
              top: playheadTop,
              width: 2,
              height: lanes.bottom - playheadTop,
              backgroundColor: colors.record,
              boxShadow: `0 0 10px ${colors.record}`,
              opacity: recording,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: head - 7,
              top: playheadTop - 2,
              width: 14,
              height: 16,
              borderRadius: "3px 3px 7px 7px",
              backgroundColor: colors.record,
              opacity: recording,
            }}
          />
          <Callout
            x={record.x + 24}
            y={record.y}
            side="right"
            text="Press record"
            from={0.8}
            to={click + 0.1}
          />
          <Callout
            x={head + 12}
            y={middle}
            side="right"
            text="Every track records at once"
            from={2.8}
            to={5.4}
          />
          <Cursor
            path={[
              { t: 0.8, x: 1000, y: 700 },
              { t: 1.7, x: record.x + 2, y: record.y + 2 },
              { t: click + 0.1, x: record.x + 2, y: record.y + 2 },
              { t: 2.6, x: record.x + 160, y: record.y + 90 },
            ]}
            clicks={[click]}
          />
        </AppFrame>
      </div>
    </AbsoluteFill>
  );
};
