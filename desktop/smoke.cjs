const { app, dialog } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
function verifyDesktop(win, request) {
  win.webContents.once("did-finish-load", async () => {
    try {
      const state = await request({ op: "state" });
      if (state.tracks.length !== 2) throw new Error("Default tracks missing");
      await new Promise((r) => setTimeout(r, 500));
      const rendered = await win.webContents.executeJavaScript(
        `({tracks:document.querySelectorAll('.track-header').length,welcome:!!document.querySelector('.welcome'),starting:!!document.querySelector('[data-startup]')})`,
      );
      if (rendered.tracks !== 2 || !rendered.welcome || rendered.starting)
        throw new Error("Workspace did not render");
      mkdirSync("artifacts/screenshots", { recursive: true });
      writeFileSync(
        "artifacts/screenshots/desktop-startup.png",
        (await win.webContents.capturePage()).toPNG(),
      );
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Arm Guitar"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 250));
      if (!(await request({ op: "state" })).tracks[0].armed)
        throw new Error("UI did not arm native track");
      // Cancel an actual close request. The service must still answer afterward.
      const showMessageBox = dialog.showMessageBoxSync;
      try {
        dialog.showMessageBoxSync = () => 0;
        app.quit();
        await new Promise((r) => setTimeout(r, 250));
        if (win.isDestroyed())
          throw new Error("Cancelling close destroyed the window");
        await request({ op: "state" });
      } finally {
        dialog.showMessageBoxSync = showMessageBox;
      }
      await win.webContents.executeJavaScript(
        `document.querySelector('[title="Quick guide"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "R" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "R" });
      await new Promise((r) => setTimeout(r, 100));
      if ((await request({ op: "state" })).recording)
        throw new Error("A dialog allowed a transport shortcut");
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      await new Promise((r) => setTimeout(r, 100));
      if (
        await win.webContents.executeJavaScript(
          `!!document.querySelector('[role="dialog"]')`,
        )
      )
        throw new Error("Escape did not close the dialog");
      console.log(
        "Desktop smoke passed: UI-to-JUCE commands, cancelled close preserves service, dialog shortcuts and Escape.",
      );
      win.destroy();
      app.quit();
    } catch (e) {
      console.error(e);
      win.destroy();
      app.exit(1);
    }
  });
}
module.exports = { verifyDesktop };
