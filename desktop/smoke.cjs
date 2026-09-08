const { app, dialog } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
function verifyDesktop(win, request) {
  win.webContents.once("did-finish-load", async () => {
    try {
      const state = await request({ op: "state" });
      if (state.tracks.length !== 2) throw new Error("Default tracks missing");
      await new Promise((r) => setTimeout(r, 500));
      const rendered = await win.webContents.executeJavaScript(
        `({tracks:document.querySelectorAll('.track-header').length,welcome:!!document.querySelector('.welcome-dialog'),starting:!!document.querySelector('[data-startup]')})`,
      );
      if (rendered.tracks !== 2 || !rendered.welcome || rendered.starting)
        throw new Error("Workspace did not render");
      win.setSize(1920, 1080);
      await new Promise((r) => setTimeout(r, 150));
      const layout = await win.webContents.executeJavaScript(`(() => {
        const welcome = document.querySelector('.welcome-dialog').getBoundingClientRect();
        const footer = document.querySelector('.track-list-bottom').getBoundingClientRect();
        const sidebar = document.querySelector('.track-sidebar').getBoundingClientRect();
        return { centered: Math.abs((welcome.left + welcome.right) / 2 - innerWidth / 2) < 2, bottom: Math.abs(footer.bottom - sidebar.bottom) <= 10 };
      })()`);
      if (!layout.centered || !layout.bottom)
        throw new Error("Large-window layout is misaligned");
      await win.webContents.executeJavaScript(
        `document.querySelector('.welcome-dialog .modal-close').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
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
        )) !== 4
      )
        throw new Error("Track actions missing");
      await win.webContents.executeJavaScript(
        `window.previousPing = document.querySelector('.properties-ping'); [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.trim() === 'Properties').click()`,
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
        `document.querySelector('[title="Add track"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      await win.webContents.executeJavaScript(
        `document.querySelectorAll('.track-types button')[1].click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      await win.webContents.executeJavaScript(
        `document.querySelector('.create-track-dialog .primary').click()`,
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
      await win.webContents.executeJavaScript(
        `document.querySelectorAll('.settings-tabs button')[2].click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.shortcut-row')].find(r => r.textContent.includes('Back to start')).querySelector('button').click()`,
      );
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "F6" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "F6" });
      await new Promise((r) => setTimeout(r, 100));
      if (
        !(await win.webContents.executeJavaScript(
          `document.querySelector('.footer-right').textContent.includes('F6')`,
        ))
      )
        throw new Error("Rebinding did not update shortcut labels");
      await win.webContents.executeJavaScript(
        `document.querySelector('.modal-close').click(); document.activeElement?.blur()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      await request({ op: "seek", position: 12 });
      await new Promise((r) => setTimeout(r, 150));
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "F6" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "F6" });
      await new Promise((r) => setTimeout(r, 100));
      if ((await request({ op: "state" })).position !== 0)
        throw new Error("Rebound shortcut did not seek to start");
      await win.webContents.executeJavaScript(
        `localStorage.removeItem('basement.shortcuts')`,
      );
      await request({ op: "loop", start: 0, end: 8, enabled: false });
      await request({ op: "record" });
      for (let i = 0; i < 6; ++i)
        await request({ op: "pump", frames: 8192, left: 0.25 });
      await request({ op: "stop" });
      await new Promise((r) => setTimeout(r, 200));
      const region = await win.webContents.executeJavaScript(
        `(() => { const r = document.querySelector('.clip').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 40) }; })()`,
      );
      win.webContents.sendInputEvent({
        type: "mouseDown",
        ...region,
        button: "left",
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 50));
      win.webContents.sendInputEvent({
        type: "mouseMove",
        x: region.x + 88,
        y: region.y + 112,
        modifiers: ["leftButtonDown"],
      });
      await new Promise((r) => setTimeout(r, 50));
      win.webContents.sendInputEvent({
        type: "mouseUp",
        x: region.x + 88,
        y: region.y + 112,
        button: "left",
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 150));
      const moved = await request({ op: "state" });
      if (
        moved.tracks[0].clips.length ||
        moved.tracks[1].clips.length !== 1 ||
        Math.abs(moved.tracks[1].clips[0].start - 2) > 0.01
      )
        throw new Error(
          "Dragging a recorded region did not move it to the destination track and beat",
        );
      console.log(
        "Region drag check passed: native recording moved between audio tracks on the beat grid.",
      );
      for (let i = 0; i < 9; ++i) await request({ op: "addTrack" });
      await new Promise((r) => setTimeout(r, 700));
      if (
        !(await win.webContents.executeJavaScript(`(() => {
        const viewport = document.querySelector('.timeline-scroll').getBoundingClientRect();
        const ruler = document.querySelector('.ruler').getBoundingClientRect();
        const last = [...document.querySelectorAll('.track-header')].at(-1).getBoundingClientRect();
        return Math.abs(ruler.top - viewport.top) < 2 && last.top >= ruler.bottom && last.bottom <= viewport.bottom;
      })()`))
      )
        throw new Error(
          "Adding tracks did not scroll to them with a pinned ruler: " +
            JSON.stringify(
              await win.webContents.executeJavaScript(
                `Object.fromEntries(['.timeline-scroll','.ruler','.track-header:last-of-type','.track-list'].map(selector => { const e=document.querySelector(selector),r=e?.getBoundingClientRect(); return [selector,{top:r?.top,bottom:r?.bottom,scroll:e?.scrollTop}]; }))`,
              ),
            ),
        );
      if (
        await win.webContents.executeJavaScript(
          `!!document.querySelector('.welcome-dialog')`,
        )
      )
        throw new Error("Welcome returned after editing");
      console.log(
        "Settings and arrangement check passed: rebind, footer labels, return to start, auto-scroll and sticky ruler.",
      );
      // Compact selector and native monitor/master controls.
      await win.webContents.executeJavaScript(
        `document.querySelector('.track-header').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
      );
      await new Promise((r) => setTimeout(r, 100));
      if (
        !(await win.webContents.executeJavaScript(
          `document.querySelector('[aria-label="Track icon"]')?.tagName === 'SELECT'`,
        ))
      )
        throw new Error("Track icon is not a selector");
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Monitor Guitar"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 150));
      if (!(await request({ op: "state" })).tracks[0].monitor)
        throw new Error("Monitor button did not update native state");
      await win.webContents.executeJavaScript(`(() => {
        const slider = document.querySelector('[aria-label="Output volume"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, '0.35');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await new Promise((r) => setTimeout(r, 150));
      if (Math.abs((await request({ op: "state" })).masterGain - 0.35) > 0.001)
        throw new Error("Master slider did not update native state");
      // Both scroll endpoints and intermediate window heights must stay aligned.
      for (const height of [700, 810, 1080]) {
        win.setSize(1280, height);
        await new Promise((r) => setTimeout(r, 100));
        for (const selector of [".timeline-scroll", ".track-list"]) {
          for (const top of [99999, 240, 0]) {
            await win.webContents.executeJavaScript(
              `document.querySelector('${selector}').scrollTop = ${top}`,
            );
            await win.webContents.capturePage(); // Flush a compositor frame in the hidden smoke window.
            await new Promise((r) => setTimeout(r, 100));
            const offsets = await win.webContents.executeJavaScript(`(() => {
              const sidebar = document.querySelector('.track-list'), timeline = document.querySelector('.timeline-scroll');
              return { height: innerHeight, sidebarHeight: sidebar.clientHeight, timelineHeight: timeline.clientHeight, sidebarContent: sidebar.scrollHeight, timelineContent: timeline.scrollHeight, sidebar: sidebar.scrollTop, timeline: timeline.scrollTop,
                difference: document.querySelector('.track-header').getBoundingClientRect().top -
                  document.querySelector('.lane').getBoundingClientRect().top };
            })()`);
            if (Math.abs(offsets.difference) > 1)
              throw new Error(
                "Track/lane scroll mismatch: " + JSON.stringify(offsets),
              );
          }
        }
      }
      // Region actions are an anchored menu, not a modal.
      await win.webContents.executeJavaScript(
        `document.querySelector('.clip').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 350 }))`,
      );
      await new Promise((r) => setTimeout(r, 100));
      if (
        !(await win.webContents.executeJavaScript(
          `!!document.querySelector('[role="menu"][aria-label="Region edits"]') && !document.querySelector('[role="dialog"]')`,
        ))
      )
        throw new Error("Region edits did not open a context menu");
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      await new Promise((r) => setTimeout(r, 50));
      await win.webContents.executeJavaScript(
        `document.querySelector('.empty-grid').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 800, clientY: 500 }))`,
      );
      await new Promise((r) => setTimeout(r, 50));
      if (
        !(await win.webContents.executeJavaScript(
          `document.querySelector('[role="menu"][aria-label="Timeline actions"]')?.textContent.includes('Add audio file')`,
        ))
      )
        throw new Error("Timeline import context menu missing");
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      await request({ op: "loop", start: 0, end: 8, enabled: false });
      await request({ op: "seek", position: 48 });
      await new Promise((r) => setTimeout(r, 150));
      await win.webContents.executeJavaScript(
        `document.querySelector('.timeline-scroll').scrollLeft = 0`,
      );
      await request({ op: "record" });
      for (let frame = 0; frame < 10; ++frame) {
        await win.webContents.capturePage();
        await new Promise((r) => setTimeout(r, 100));
      }
      if (
        !(await win.webContents.executeJavaScript(`(() => {
        const view = document.querySelector('.timeline-scroll').getBoundingClientRect();
        const head = document.querySelector('.playhead').getBoundingClientRect();
        return head.left >= view.left && head.left <= view.right && document.querySelector('.timeline-scroll').scrollLeft > 0;
      })()`))
      )
        throw new Error("Recording did not reveal the playhead");
      await request({ op: "stop" });
      console.log(
        "New controls passed: selector, monitor, output gain, menus, bidirectional vertical alignment and recording scroll.",
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
