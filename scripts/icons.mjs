// Regenerates the app icons in desktop/icons from desktop/assets/icon.svg
// (Windows .ico, macOS .icns and the PNG sizes the bundles use). The icons
// are checked in; run this after the SVG changes.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runTool, withCargo } from "./build-tools.mjs";

const output = "desktop/icons";
runTool(
  "@tauri-apps/cli",
  ["icon", "desktop/assets/icon.svg", "--output", output],
  withCargo(),
  "tauri",
);
// Keep only what the desktop bundles reference (see tauri.conf.json).
const keep = new Set([
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.png",
  "icon.ico",
  "icon.icns",
]);
for (const name of readdirSync(output))
  if (!keep.has(name))
    rmSync(join(output, name), { recursive: true, force: true });
