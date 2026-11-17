import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
} from "react";
import { Img, staticFile } from "remotion";
import { colors, fontFamily, screen } from "../theme";
import { Logo } from "./Logo";

export type Camera = { x: number; y: number; zoom: number };
export type Os = "mac" | "windows" | "linux";

// How many output pixels one screen pixel takes up inside the current frame.
const FrameScale = createContext(1);
export const useFrameScale = () => useContext(FrameScale);

const chromeHeight = { mac: 38, windows: 36, linux: 44 };
const radius = { mac: 12, windows: 8, linux: 14 };

// The native title bar Electron gets on each platform, drawn generically.
const Chrome = ({ os, u, title }: { os: Os; u: number; title: string }) => {
  const h = chromeHeight[os] * u;
  const label = (
    <span
      style={{
        fontFamily,
        fontSize: (os === "windows" ? 13 : 14) * u,
        fontWeight: os === "linux" ? 700 : 500,
        color: "#d4d5da",
      }}
    >
      {title}
    </span>
  );
  const bar: CSSProperties = {
    position: "relative",
    height: h,
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    borderBottom: `${Math.max(1, u)}px solid #111214`,
  };
  if (os === "mac")
    return (
      <div
        style={{
          ...bar,
          justifyContent: "center",
          background: "linear-gradient(#34353a, #2a2b30)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 14 * u,
            display: "flex",
            gap: 8 * u,
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div
              key={c}
              style={{
                width: 13 * u,
                height: 13 * u,
                borderRadius: "50%",
                backgroundColor: c,
              }}
            />
          ))}
        </div>
        {label}
      </div>
    );
  if (os === "windows") {
    const stroke = { stroke: "#d4d5da", strokeWidth: 1, fill: "none" };
    const button = (icon: ReactNode, bg = "transparent") => (
      <div
        style={{
          width: 46 * u,
          height: h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
        }}
      >
        <svg width={10 * u} height={10 * u} viewBox="0 0 10 10">
          {icon}
        </svg>
      </div>
    );
    return (
      <div
        style={{
          ...bar,
          background: "#202124",
          paddingLeft: 12 * u,
          gap: 10 * u,
        }}
      >
        <Logo size={16 * u} settle={0} />
        {label}
        <div style={{ marginLeft: "auto", display: "flex" }}>
          {button(<line x1="0" y1="5" x2="10" y2="5" {...stroke} />)}
          {button(<rect x="0.5" y="0.5" width="9" height="9" {...stroke} />)}
          {button(<path d="M0 0L10 10M10 0L0 10" {...stroke} />)}
        </div>
      </div>
    );
  }
  const round = (icon: ReactNode) => (
    <div
      style={{
        width: 24 * u,
        height: 24 * u,
        borderRadius: "50%",
        backgroundColor: "#ffffff1c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={10 * u}
        height={10 * u}
        viewBox="0 0 10 10"
        stroke="#e4e4e8"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      >
        {icon}
      </svg>
    </div>
  );
  return (
    <div style={{ ...bar, justifyContent: "center", background: "#2e2e33" }}>
      {label}
      <div
        style={{
          position: "absolute",
          right: 10 * u,
          display: "flex",
          gap: 10 * u,
        }}
      >
        {round(<line x1="2" y1="7" x2="8" y2="7" />)}
        {round(<rect x="2" y="2" width="6" height="6" />)}
        {round(<path d="M2 2L8 8M8 2L2 8" />)}
      </div>
    </div>
  );
};

// A window onto the captured app. Children are laid out in screen (1600×1000)
// coordinates; the camera centres on (x, y) and zooms relative to fitting the width.
export const AppFrame = ({
  width,
  height = (width * screen.height) / screen.width,
  camera = { x: screen.width / 2, y: screen.height / 2, zoom: 1 },
  os,
  title = "Basement Band — Friday night",
  style,
  children,
}: {
  width: number;
  height?: number;
  camera?: Camera;
  os?: Os;
  title?: string;
  style?: CSSProperties;
  children: ReactNode;
}) => {
  const u = width / 1240;
  const k = (width / screen.width) * camera.zoom;
  const halfW = width / 2 / k;
  const halfH = height / 2 / k;
  const x = Math.min(Math.max(camera.x, halfW), screen.width - halfW);
  const y = Math.min(Math.max(camera.y, halfH), screen.height - halfH);
  return (
    <div
      style={{
        position: "relative",
        width,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: (os ? radius[os] : 18) * Math.max(u, 0.5),
        backgroundColor: colors.page,
        boxShadow: `0 0 0 1px #4a4b52, 0 ${40 * u}px ${120 * u}px -${20 * u}px #000d`,
        ...style,
      }}
    >
      {os && <Chrome os={os} u={u} title={title} />}
      <div style={{ position: "relative", width, height, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            width: screen.width,
            height: screen.height,
            transformOrigin: "0 0",
            transform: `scale(${k}) translate(${halfW - x}px, ${halfH - y}px)`,
          }}
        >
          <FrameScale.Provider value={k}>{children}</FrameScale.Provider>
        </div>
      </div>
    </div>
  );
};

export const Shot = ({
  name,
  style,
}: {
  name: string;
  style?: CSSProperties;
}) => (
  <Img
    src={staticFile(`shots/${name}.png`)}
    style={{
      position: "absolute",
      inset: 0,
      width: screen.width,
      height: screen.height,
      ...style,
    }}
  />
);

// A soft glowing outline that points at part of the screen.
export const Highlight = ({
  x,
  y,
  w,
  h,
  color,
  progress,
  radius = 8,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  progress: number;
  radius?: number;
}) => {
  const grow = 4 + 6 * (1 - progress);
  return (
    <div
      style={{
        position: "absolute",
        left: x - grow,
        top: y - grow,
        width: w + grow * 2,
        height: h + grow * 2,
        borderRadius: radius + grow,
        border: `2px solid ${color}`,
        boxShadow: `0 0 24px ${color}88, inset 0 0 18px ${color}33`,
        opacity: progress,
      }}
    />
  );
};
