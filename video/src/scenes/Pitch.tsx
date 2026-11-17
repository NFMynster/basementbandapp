import { AbsoluteFill } from "remotion";
import { Words } from "../components/Caption";
import { ramp, useTime } from "../time";
import { colors, fontFamily } from "../theme";

// "Plug in. Press record." with the transport's red record button pulsing beside it.
export const Pitch = () => {
  const { t, springAt } = useTime();
  const dot = springAt(0.9, { damping: 10 });
  const ring = Math.max(0, t - 1.1) % 1;
  const subIn = ramp(t, [1.6, 2.1], [0, 1]);
  const line = {
    fontSize: 140,
    fontWeight: 800,
    letterSpacing: "-0.045em",
    lineHeight: 1.05,
  };
  return (
    <AbsoluteFill
      style={{
        fontFamily,
        color: colors.text,
        justifyContent: "center",
        paddingLeft: 260,
      }}
    >
      <div style={line}>
        <Words text="Plug in." delay={0.05} stagger={0.15} />
      </div>
      <div style={{ ...line, display: "flex", alignItems: "center" }}>
        <Words text="Press record." delay={0.55} stagger={0.15} />
        <div
          style={{
            position: "relative",
            width: 110,
            height: 110,
            marginLeft: 44,
          }}
        >
          {t > 1.1 &&
            [0, 0.5].map((offset) => {
              const r = (ring + offset) % 1;
              return (
                <div
                  key={offset}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    border: `3px solid ${colors.record}`,
                    transform: `scale(${1 + r * 1.2})`,
                    opacity: (1 - r) * 0.7,
                  }}
                />
              );
            })}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              backgroundColor: colors.record,
              transform: `scale(${dot})`,
              boxShadow: `0 0 60px ${colors.record}aa`,
            }}
          />
        </div>
      </div>
      <div
        style={{
          marginTop: 40,
          fontSize: 38,
          color: colors.muted,
          opacity: subIn,
          transform: `translateY(${(1 - subIn) * 16}px)`,
        }}
      >
        Designed from the ground up to be easy to use.
      </div>
    </AbsoluteFill>
  );
};
