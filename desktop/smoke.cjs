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
      win.setSize(1920, 1080);
      await new Promise((r) => setTimeout(r, 150));
      const layout = await win.webContents.executeJavaScript(`(() => {
        const welcome = document.querySelector('.welcome').getBoundingClientRect();
        const timeline = document.querySelector('.timeline-scroll').getBoundingClientRect();
        const footer = document.querySelector('.track-list-bottom').getBoundingClientRect();
        const sidebar = document.querySelector('.track-list').getBoundingClientRect();
        return { centered: Math.abs((welcome.left + welcome.right) / 2 - (timeline.left + timeline.right) / 2) < 2, bottom: Math.abs(footer.bottom - sidebar.bottom) < 2 };
      })()`);
      if (!layout.centered || !layout.bottom)
        throw new Error("Large-window layout is misaligned");
      if (
        !(await win.webContents.executeJavaScript(`(() => {
        const name = document.querySelector('[aria-label="Session name"]').getBoundingClientRect();
        const sidebar = document.querySelector('.track-list').getBoundingClientRect();
        return name.left >= sidebar.left && name.right <= sidebar.right;
      })()`))
      )
        throw new Error("Project name extends beyond sidebar");
      await win.webContents.executeJavaScript(`(() => {
        [...document.querySelectorAll('.tab')].find(b => b.textContent.includes('Plug-ins')).click();
      })()`);
      await new Promise((r) => setTimeout(r, 50));
      await win.webContents.executeJavaScript(
        `document.querySelector('.track-header').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
      );
      await new Promise((r) => setTimeout(r, 50));
      if (
        !(await win.webContents.executeJavaScript(
          `!!document.querySelector('[aria-label="Track name"]')`,
        ))
      )
        throw new Error("Double click did not open recording properties");
      await win.webContents.executeJavaScript(
        `document.querySelector('.track-header').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 220 }))`,
      );
      await new Promise((r) => setTimeout(r, 50));
      if (
        (await win.webContents.executeJavaScript(
          `document.querySelectorAll('[role="menuitem"]').length`,
        )) !== 3
      )
        throw new Error("Track actions missing");
      await win.webContents.executeJavaScript(
        `window.previousPing = document.querySelector('.properties-ping'); document.querySelector('[role="menuitem"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 50));
      if (
        !(await win.webContents.executeJavaScript(
          `!!document.querySelector('.properties-ping') && document.querySelector('.properties-ping') !== window.previousPing`,
        ))
      )
        throw new Error("Properties did not retrigger inspector feedback");
      const head = await win.webContents.executeJavaScript(
        `(() => { const r = document.querySelector('.playhead > span').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2 + 3), y: Math.round(r.y + 4) }; })()`,
      );
      win.webContents.sendInputEvent({
        type: "mouseDown",
        ...head,
        button: "left",
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 50));
      win.webContents.sendInputEvent({
        type: "mouseMove",
        modifiers: ["leftButtonDown"],
        x: head.x + 132,
        y: head.y,
        button: "left",
      });
      await new Promise((r) => setTimeout(r, 50));
      win.webContents.sendInputEvent({
        type: "mouseUp",
        x: head.x + 132,
        y: head.y,
        button: "left",
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 150));
      if ((await request({ op: "state" })).position < 2)
        throw new Error("Dragging the playhead did not seek");
      for (const zone of ["loop", "seek"]) {
        const point = await win.webContents.executeJavaScript(
          `(() => { const r = document.querySelector('[data-ruler-zone="${zone}"]').getBoundingClientRect(); return { x: Math.round(r.left + 220), y: Math.round(r.top + r.height / 2) }; })()`,
        );
        const before = await request({ op: "state" });
        win.webContents.sendInputEvent({
          type: "mouseDown",
          ...point,
          button: "left",
          clickCount: 1,
        });
        await new Promise((r) => setTimeout(r, 30));
        win.webContents.sendInputEvent({
          type: "mouseMove",
          x: point.x + 88,
          y: point.y,
          modifiers: ["leftButtonDown"],
        });
        await new Promise((r) => setTimeout(r, 30));
        win.webContents.sendInputEvent({
          type: "mouseUp",
          x: point.x + 88,
          y: point.y,
          button: "left",
          clickCount: 1,
        });
        await new Promise((r) => setTimeout(r, 100));
        const after = await request({ op: "state" });
        if (
          zone === "loop"
            ? !after.looping ||
              Math.abs(after.loopStart - 5) > 0.01 ||
              Math.abs(after.loopEnd - 7) > 0.01 ||
              after.position !== before.position
            : Math.abs(after.position - 7) > 0.01 ||
              after.loopStart !== before.loopStart ||
              after.loopEnd !== before.loopEnd
        )
          throw new Error(
            "Ruler zone changed the wrong transport state: " + zone,
          );
      }
      mkdirSync("artifacts/screenshots", { recursive: true });
      writeFileSync(
        "artifacts/screenshots/desktop-startup.png",
        (await win.webContents.capturePage()).toPNG(),
      );
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Mark Guitar for recording"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 250));
      if (!(await request({ op: "state" })).tracks[0].armed)
        throw new Error("UI did not mark native track for recording");
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
      await win.webContents.executeJavaScript(
        `([...document.querySelectorAll('button')].find(b => b.textContent.includes('Add MIDI track'))).click()`,
      );
      await new Promise((r) => setTimeout(r, 250));
      if ((await request({ op: "state" })).tracks.at(-1).kind !== "midi")
        throw new Error("UI did not create a MIDI track");
      if (
        !(await win.webContents.executeJavaScript(
          `document.querySelector('.plugin-slot').textContent.includes('Add VST3 instrument')`,
        ))
      )
        throw new Error("New MIDI track did not show instrument setup");
      await win.webContents.executeJavaScript(
        `document.querySelector('[title="Input settings"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 200));
      if (
        !(await win.webContents.executeJavaScript(
          `!!document.querySelector('[aria-label="MIDI 3 MIDI device"]')`,
        ))
      )
        throw new Error("MIDI device routing was not exposed");
      console.log(
        "MIDI desktop check passed: add track, instrument setup and device routing.",
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
