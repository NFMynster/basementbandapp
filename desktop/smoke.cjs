const { app } = require("electron");
const { verifyStartup } = require("./smoke/startup.cjs");
const {
  verifyMidiRouting,
  verifyProjectCreation,
} = require("./smoke/midi-routing.cjs");
const {
  verifyRegionDrag,
  verifyRecordingControls,
  verifyRegionTrim,
  verifyLoopTakes,
} = require("./smoke/recording.cjs");
const {
  verifyArrangementSettings,
  verifyLoopControls,
  verifyTrackOrdering,
} = require("./smoke/arrangement.cjs");
const { verifyExportAndShortcuts } = require("./smoke/export.cjs");
const { verifyMidiEditing } = require("./smoke/midi-editing.cjs");
const { verifyMidiNavigation } = require("./smoke/midi-navigation.cjs");
const { verifySoundControls } = require("./smoke/sound.cjs");
// Workflows run in order against one app and engine. Returned fixtures make dependencies explicit.
function verifyDesktop(win, request) {
  win.webContents.once("did-finish-load", async () => {
    try {
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
      win.destroy();
      app.quit();
    } catch (error) {
      console.error(error);
      win.destroy();
      app.exit(1);
    }
  });
}
module.exports = { verifyDesktop };
