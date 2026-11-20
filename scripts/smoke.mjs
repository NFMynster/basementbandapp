// Desktop smoke run: starts the built app on the engine's test device and
// walks the workflows in desktop/smoke/ through the real UI and shell.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { launchDesktop } = require("./webview-driver.cjs");
const { verifyStartup } = require("../desktop/smoke/startup.cjs");
const {
  verifyMidiRouting,
  verifyProjectCreation,
} = require("../desktop/smoke/midi-routing.cjs");
const {
  verifyRegionDrag,
  verifyRecordingControls,
  verifyRegionTrim,
  verifyLoopTakes,
} = require("../desktop/smoke/recording.cjs");
const {
  verifyArrangementSettings,
  verifyLoopControls,
  verifyTrackOrdering,
} = require("../desktop/smoke/arrangement.cjs");
const { verifyExportAndShortcuts } = require("../desktop/smoke/export.cjs");
const { verifyMidiEditing } = require("../desktop/smoke/midi-editing.cjs");
const {
  verifyMidiNavigation,
} = require("../desktop/smoke/midi-navigation.cjs");
const { verifySoundControls } = require("../desktop/smoke/sound.cjs");

const timeout = setTimeout(() => {
  console.error("Desktop smoke test timed out");
  process.exit(1);
}, 120000);
const { win, request, app } = await launchDesktop();
try {
  // Workflows run in order against one app and engine. Returned fixtures
  // make dependencies explicit.
  await verifyStartup(win, request);
  await verifyMidiRouting(win, request);
  await verifyRegionDrag(win, request);
  await verifyArrangementSettings(win, request);
  await verifyRecordingControls(win, request);
  await verifyLoopControls(win, request);
  await verifyRegionTrim(win, request);
  const { takeChoice } = await verifyLoopTakes(win, request);
  await verifyExportAndShortcuts(win, request, takeChoice);
  await verifyProjectCreation(win, request);
  await verifyMidiEditing(win, request);
  await verifyMidiNavigation(win, request);
  await verifySoundControls(win, request);
  await verifyTrackOrdering(win, request);
  console.log("Desktop smoke workflows passed.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  await app.quit();
}
