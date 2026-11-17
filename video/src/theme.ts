import { loadFont } from "@remotion/google-fonts/Inter";
import layout from "./layout.json";

export const { fontFamily } = loadFont("normal", {
  weights: ["300", "400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

// Taken from the app's stylesheets so the video reads as the same product.
export const colors = {
  page: "#191a1e",
  panel: "#222328",
  border: "#3c3d43",
  text: "#e8e8ec",
  muted: "#b4b7c1",
  sage: "#b0c4a7",
  sageInk: "#233021",
  record: "#e57076",
  amber: "#dba466",
  eqBass: "#eab77b",
  eqMid: "#b3a6f5",
  eqTreble: "#8cced9",
};

export const fps = 60;
// The CSS viewport the screens were captured at (rendered at 2×); see capture.cjs.
export const screen = layout.viewport;
export { layout };
