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
        return { centered: Math.abs((welcome.left + welcome.right) / 2 - innerWidth / 2) < 2, noTagline: !document.querySelector('.track-list-bottom') };
      })()`);
      if (!layout.centered || !layout.noTagline)
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
      await request({ op: "seek", position: 12 });
      await win.webContents.executeJavaScript(
        `document.querySelector('.track-header').focus()`,
      );
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
      await new Promise((r) => setTimeout(r, 150));
      if ((await request({ op: "state" })).position !== 0)
        throw new Error("Enter on a focused track did not return to start");
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Output volume"]').focus()`,
      );
      await request({ op: "seek", position: 12 });
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
      await new Promise((r) => setTimeout(r, 150));
      if ((await request({ op: "state" })).position !== 0)
        throw new Error("Enter on a focused slider did not return to start");
      await win.webContents.executeJavaScript(`document.activeElement.blur()`);
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
        "Desktop smoke passed: UI-to-JUCE commands, dialog shortcuts and Escape.",
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
          `document.querySelector('.footer-right').textContent.includes('F6') && !!document.querySelector('.transport [title="Back to start · F6"]')`,
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
      await win.webContents.capturePage();
      if (
        !(await win.webContents.executeJavaScript(
          `(() => { const r = document.querySelector('.clip.moving')?.getBoundingClientRect(); return r && Math.abs(r.top + 40 - ${region.y + 112}) < 4; })()`,
        ))
      )
        throw new Error(
          "Region drag preview did not follow the pointer vertically",
        );
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
          `document.querySelector('[aria-label="Track appearance"]')?.tagName === 'BUTTON'`,
        ))
      )
        throw new Error("Track appearance button missing");
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Track appearance"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 80));
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="drums icon"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      for (let attempt = 0; attempt < 20; attempt++) {
        if ((await request({ op: "state" })).tracks[0].icon === "drums") break;
        await new Promise((r) => setTimeout(r, 50));
      }
      if ((await request({ op: "state" })).tracks[0].icon !== "drums")
        throw new Error("Icon popover did not update native track");
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Audio timing settings"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      if (
        !(await win.webContents.executeJavaScript(
          `document.querySelector('.settings-tabs [aria-selected="true"]')?.textContent.includes('Audio')`,
        ))
      )
        throw new Error("Footer timing did not open audio settings");
      await win.webContents.executeJavaScript(
        `document.querySelector('.modal-close').click()`,
      );
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
      await request({ op: "seek", position: 12 });
      await request({ op: "play" });
      await new Promise((r) => setTimeout(r, 70));
      await win.webContents.capturePage();
      const beforeAnimation = await win.webContents.executeJavaScript(
        `parseFloat(document.querySelector('.playhead').style.left)`,
      );
      await new Promise((r) => setTimeout(r, 25));
      await win.webContents.capturePage();
      const afterAnimation = await win.webContents.executeJavaScript(
        `parseFloat(document.querySelector('.playhead').style.left)`,
      );
      if (!(afterAnimation > beforeAnimation))
        throw new Error("Playhead did not animate between native updates");
      await request({ op: "stop" });
      console.log(
        "New controls passed: selector, monitor, output gain, menus, bidirectional vertical alignment and recording scroll.",
      );
      for (const value of ["1", "12", "120"]) {
        await win.webContents.executeJavaScript(`(() => {
          const input = document.querySelector('[aria-label="Tempo"]');
          input.focus();
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${value}');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
        await new Promise((r) => setTimeout(r, 80));
        if (
          (await win.webContents.executeJavaScript(
            `document.querySelector('[aria-label="Tempo"]').value`,
          )) !== value
        )
          throw new Error("Tempo draft was overwritten by engine polling");
      }
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
      await new Promise((r) => setTimeout(r, 150));
      if ((await request({ op: "state" })).tempo !== 120)
        throw new Error("Tempo did not commit");
      await win.webContents.executeJavaScript(`(() => {
        document.querySelector('.timeline-scroll').scrollLeft = 0;
        document.querySelector('.timeline-scroll').scrollTop = 0;
        document.querySelector('.clip').click();
      })()`);
      await new Promise((r) => setTimeout(r, 80));
      await win.webContents.executeJavaScript(
        `document.querySelector('.lane').click()`,
      );
      await new Promise((r) => setTimeout(r, 80));
      if (
        await win.webContents.executeJavaScript(
          `!!document.querySelector('.clip.chosen')`,
        )
      )
        throw new Error("Empty lane click did not clear region selection");
      await request({ op: "loop", start: 0, end: 2, enabled: true });
      await new Promise((r) => setTimeout(r, 100));
      await win.webContents.capturePage();
      const cyclePoint = await win.webContents.executeJavaScript(`(() => {
        const r = document.querySelector('.ruler-loop').getBoundingClientRect();
        return { x: Math.round(r.left + 30), y: Math.round(r.top + 10) };
      })()`);
      for (const enabled of [false, true]) {
        win.webContents.sendInputEvent({
          type: "mouseDown",
          ...cyclePoint,
          button: "left",
          clickCount: 1,
        });
        win.webContents.sendInputEvent({
          type: "mouseUp",
          ...cyclePoint,
          button: "left",
          clickCount: 1,
        });
        await new Promise((r) => setTimeout(r, 120));
        const cycle = await request({ op: "state" });
        if (
          cycle.looping !== enabled ||
          cycle.loopStart !== 0 ||
          cycle.loopEnd !== 2
        )
          throw new Error("Clicking a loop must toggle without moving it");
        if (
          !(await win.webContents.executeJavaScript(
            `!!document.querySelector('.cycle-region${enabled ? "" : ".inactive"}')`,
          ))
        )
          throw new Error("Disabled loop disappeared");
      }
      console.log(
        "Tempo drafts, empty-space deselection and loop toggling passed.",
      );
      const trimState = await request({ op: "state" });
      const trimTrack = trimState.tracks.find((t) =>
        t.clips.some((c) => c.active !== false && c.duration > 0.4),
      );
      const trimClip = trimTrack.clips.find(
        (c) => c.active !== false && c.duration > 0.4,
      );
      await win.webContents.capturePage();
      const edge = await win.webContents.executeJavaScript(`(() => {
        const r = document.querySelector('[data-clip="${trimClip.id}"]').getBoundingClientRect();
        return { x: Math.round(r.left + 2), y: Math.round(r.top + r.height / 2) };
      })()`);
      win.webContents.sendInputEvent({ type: "mouseMove", ...edge });
      await win.webContents.capturePage();
      await new Promise((r) => setTimeout(r, 100));
      if (
        !(await win.webContents.executeJavaScript(
          `document.querySelector('[data-clip="${trimClip.id}"]').style.cursor === 'ew-resize'`,
        ))
      )
        throw new Error("Region edge did not show a trim cursor");
      win.webContents.sendInputEvent({
        type: "mouseDown",
        ...edge,
        button: "left",
        clickCount: 1,
      });
      win.webContents.sendInputEvent({
        type: "mouseMove",
        x: edge.x + 8,
        y: edge.y,
        modifiers: ["leftButtonDown"],
      });
      await win.webContents.capturePage();
      win.webContents.sendInputEvent({
        type: "mouseUp",
        x: edge.x + 8,
        y: edge.y,
        button: "left",
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 150));
      const trimmed = (await request({ op: "state" })).tracks
        .find((t) => t.id === trimTrack.id)
        .clips.find((c) => c.id === trimClip.id);
      if (!(
        trimmed.start > trimClip.start &&
        trimmed.duration < trimClip.duration &&
        Math.abs(
          trimmed.start + trimmed.duration - trimClip.start - trimClip.duration,
        ) < 0.001
      ))
        throw new Error("Dragging left edge did not trim in place");
      console.log("Region edge cursor and live trim gesture passed.");
      await request({ op: "loop", start: 0, end: 0.05, enabled: true });
      await request({ op: "record" });
      await request({ op: "pump", frames: 8192, left: 0.2 });
      const takeState = await request({ op: "stop" });
      const takeTrack = takeState.tracks.find((t) =>
        t.clips.some((c) => c.takeGroup),
      );
      if (!takeTrack) throw new Error("Loop capture did not create takes");
      await new Promise((r) => setTimeout(r, 150));
      await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('[data-lane="${takeTrack.id}"] .clip')].at(-1).click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      const takeChoice = await win.webContents.executeJavaScript(`(() => {
        const select = document.querySelector('[aria-label="Selected region take"]');
        if (!select || select.options.length < 2 || select.getBoundingClientRect().width < 100) throw new Error('Short takes need a full-size selector');
        select.value = select.options[0].value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return select.value;
      })()`);
      await new Promise((r) => setTimeout(r, 150));
      if (
        !(await request({ op: "state" })).tracks
          .find((t) => t.id === takeTrack.id)
          .clips.find((c) => c.id === takeChoice)?.active
      )
        throw new Error("Toolbar take selection did not reach the engine");
      console.log("Short loop takes remain selectable without zooming.");
      await win.webContents.executeJavaScript(
        `document.activeElement?.blur(); document.querySelector('[data-clip="${takeChoice}"]').click()`,
      );
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
      await new Promise((r) => setTimeout(r, 150));
      if (
        (await request({ op: "state" })).tracks.some((t) =>
          t.clips.some((c) => c.id === takeChoice),
        )
      )
        throw new Error("Backspace did not delete the selected region");
      win.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: "Z",
        modifiers: ["control"],
      });
      win.webContents.sendInputEvent({
        type: "keyUp",
        keyCode: "Z",
        modifiers: ["control"],
      });
      await new Promise((r) => setTimeout(r, 180));
      if (
        !(await request({ op: "state" })).tracks.some((t) =>
          t.clips.some((c) => c.id === takeChoice),
        )
      )
        throw new Error("Undo shortcut did not restore the deleted region");
      const zoomBefore = await win.webContents.executeJavaScript(
        `Number(document.querySelector('[aria-label="Timeline zoom"]').value)`,
      );
      await win.webContents.executeJavaScript(
        `document.querySelector('.timeline-scroll').dispatchEvent(new WheelEvent('wheel', { deltaY: -50, ctrlKey: true, clientX: 650, bubbles: true, cancelable: true }))`,
      );
      await new Promise((r) => setTimeout(r, 100));
      if (
        (await win.webContents.executeJavaScript(
          `Number(document.querySelector('[aria-label="Timeline zoom"]').value)`,
        )) <= zoomBefore
      )
        throw new Error("Ctrl-wheel/pinch zoom did not change timeline scale");
      const originalPicker = dialog.showOpenDialog;
      let pickerCalled = false;
      let cancelExport;
      try {
        dialog.showOpenDialog = async () => {
          pickerCalled = true;
          return new Promise((resolve) => {
            cancelExport = () => resolve({ canceled: true, filePaths: [] });
          });
        };
        await win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.file-actions button')].find(b => b.textContent.trim() === 'Export').click()`,
        );
        await new Promise((r) => setTimeout(r, 100));
        if (
          !pickerCalled ||
          !(await win.webContents.executeJavaScript(
            `!!document.querySelector('.export-wait') && !document.querySelector('.modal[aria-label="Export audio"]')`,
          ))
        )
          throw new Error(
            "Export must open picker directly with waiting UI, not a settings dialog",
          );
        cancelExport();
        await new Promise((r) => setTimeout(r, 100));
        if (
          await win.webContents.executeJavaScript(
            `!!document.querySelector('.export-wait')`,
          )
        )
          throw new Error("Cancelled export did not dismiss waiting UI");
        await win.webContents.executeJavaScript(
          `document.querySelector('[aria-label="Audio timing settings"]').click()`,
        );
        await new Promise((r) => setTimeout(r, 100));
        await win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.settings-tabs button')].find(b=>b.textContent.includes('Export')).click()`,
        );
        await new Promise((r) => setTimeout(r, 60));
        await win.webContents.executeJavaScript(
          `document.querySelector('.export-settings button').click();document.activeElement.blur()`,
        );
        await new Promise((r) => setTimeout(r, 100));
        cancelExport();
        await new Promise((r) => setTimeout(r, 150));
        if (
          !(await win.webContents.executeJavaScript(
            `!!document.activeElement.closest('.modal')`,
          ))
        )
          throw new Error(
            "Export settings did not regain keyboard focus: " +
              (await win.webContents.executeJavaScript(
                `JSON.stringify({active:document.activeElement.tagName, waiting:!!document.querySelector(".export-wait"),disabled:document.querySelector(".export-settings button")?.disabled})`,
              )),
          );
        win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
        win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
        await new Promise((r) => setTimeout(r, 100));
        if (
          await win.webContents.executeJavaScript(
            `!!document.querySelector('.modal')`,
          )
        )
          throw new Error("Escape did not close export settings after export");
      } finally {
        dialog.showOpenDialog = originalPicker;
        cancelExport?.();
      }
      console.log(
        "Direct export, delete/undo shortcuts and Ctrl-wheel zoom passed.",
      );
      // Regression: native dropdowns must remain usable after New and MIDI creation.
      await win.webContents.executeJavaScript(
        `window.confirm = () => { throw new Error('Blocking browser confirmation used'); }; document.querySelector('[title="New session"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      if (
        !(await win.webContents.executeJavaScript(
          `!!document.querySelector('.confirmation-dialog')`,
        ))
      )
        throw new Error("Unsaved changes need an in-app confirmation");
      await win.webContents.executeJavaScript(
        `document.querySelector('.confirmation-dialog .primary').click()`,
      );
      await new Promise((r) => setTimeout(r, 200));
      if ((await request({ op: "state" })).tracks.length !== 2)
        throw new Error("New session failed");
      if (
        !(await win.webContents.executeJavaScript(`(() => {
        if(document.querySelector('.modal-backdrop,.menu-shield')) return false;
        if([...document.querySelectorAll('.inspector .tab')].some(t => t.textContent.includes('Export'))) return false;
        return ['Session name','Track name'].every(label => getComputedStyle(document.querySelector('[aria-label="'+label+'"]')).backgroundImage === 'none');
      })()`))
      )
        throw new Error(
          "Stale overlay, Export tab or incorrect name-field styling",
        );
      await win.webContents.executeJavaScript(
        `document.activeElement?.blur(); window.previousNotice = document.querySelector('.toast.notice');`,
      );
      win.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: "Z",
        modifiers: ["control"],
      });
      win.webContents.sendInputEvent({
        type: "keyUp",
        keyCode: "Z",
        modifiers: ["control"],
      });
      await new Promise((r) => setTimeout(r, 120));
      if (
        !(await win.webContents.executeJavaScript(
          `document.querySelector('.toast.notice') === window.previousNotice`,
        ))
      )
        throw new Error("Empty undo created a notice");
      await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.tab')].find(t => t.textContent.includes('Plug-ins')).click()`,
      );
      await new Promise((r) => setTimeout(r, 60));
      if (
        (await win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.plugin-chain button')].filter(b => b.textContent.includes('Add VST3')).length`,
        )) !== 1
      )
        throw new Error("Empty track has duplicate add-plugin controls");
      const verifyDropdown = async () => {
        await win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.tab')].find(t => t.textContent.trim()==='EQ & Effects').click()`,
        );
        await new Promise((r) => setTimeout(r, 80));
        const bounds = await win.webContents.executeJavaScript(
          `(() => { const e=document.querySelector('[aria-label="Equalizer preset"]'); const r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`,
        );
        win.webContents.sendInputEvent({
          type: "mouseDown",
          ...bounds,
          button: "left",
          clickCount: 1,
        });
        win.webContents.sendInputEvent({
          type: "mouseUp",
          ...bounds,
          button: "left",
          clickCount: 1,
        });
        await new Promise((r) => setTimeout(r, 100));
        win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Down" });
        win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Down" });
        win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
        win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
        await new Promise((r) => setTimeout(r, 200));
        if (
          !(await win.webContents.executeJavaScript(
            `document.querySelector('[aria-label="Equalizer preset"]').value === 'Warm'`,
          ))
        )
          throw new Error("Dropdown failed after creating a session/track");
      };
      await verifyDropdown();
      await win.webContents.executeJavaScript(
        `document.querySelector('[title="Add track"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      await win.webContents.executeJavaScript(
        `document.querySelectorAll('.track-types button')[1].click()`,
      );
      await new Promise((r) => setTimeout(r, 80));
      await win.webContents.executeJavaScript(
        `document.querySelector('.create-track-dialog .primary').click()`,
      );
      await new Promise((r) => setTimeout(r, 250));
      if ((await request({ op: "state" })).tracks.at(-1).kind !== "midi")
        throw new Error("MIDI creation failed");
      await verifyDropdown();
      console.log(
        "Dropdowns work after New and MIDI creation; name fields and properties tabs verified.",
      );
      await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.tab')].find(t=>t.textContent.trim()==='MIDI').click()`,
      );
      await new Promise((r) => setTimeout(r, 60));
      await win.webContents.executeJavaScript(
        `document.querySelector('.new-midi-region').click()`,
      );
      await new Promise((r) => setTimeout(r, 180));
      for (let i = 0; i < 2; i++) {
        await win.webContents.executeJavaScript(
          `(() => {const grid=document.querySelector('.piano-grid'), rect=grid.getBoundingClientRect();grid.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:rect.left+100+${i}*80,clientY:rect.top+24+(84-60+${i})*20+10}));})()`,
        );
        await new Promise((r) => setTimeout(r, 120));
      }
      if (
        (await request({ op: "state" })).tracks.at(-1).clips.at(-1).notes
          .length !== 2
      )
        throw new Error("Drawing MIDI notes failed");
      await win.webContents.executeJavaScript(
        `document.querySelector('.piano-grid').focus()`,
      );
      for (const key of ["A", "C", "V"]) {
        win.webContents.sendInputEvent({
          type: "keyDown",
          keyCode: key,
          modifiers: ["control"],
        });
        win.webContents.sendInputEvent({
          type: "keyUp",
          keyCode: key,
          modifiers: ["control"],
        });
        await new Promise((r) => setTimeout(r, 100));
      }
      if (
        (await request({ op: "state" })).tracks.at(-1).clips.at(-1).notes
          .length !== 4
      )
        throw new Error("Multiple-note copy/paste failed");
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Delete notes"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 120));
      if (
        (await request({ op: "state" })).tracks.at(-1).clips.at(-1).notes
          .length !== 2
      )
        throw new Error("Selected-note delete failed");
      await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.tab')].find(t=>t.textContent.includes('Plug-ins')).click()`,
      );
      await new Promise((r) => setTimeout(r, 60));
      await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.plugin-chain button')].find(b=>b.textContent.includes('Add VST3')).click()`,
      );
      await new Promise((r) => setTimeout(r, 150));
      if (
        !(await win.webContents.executeJavaScript(
          `!!document.querySelector('[aria-label="Search plug-ins"]')`,
        ))
      )
        throw new Error("Plug-in browser did not open");
      await win.webContents.executeJavaScript(
        `document.querySelector('.sound-browser .modal-close').click()`,
      );
      console.log(
        "MIDI draw, multiple selection, copy/paste, delete and plug-in browser passed.",
      );

      await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.tab')].find(t=>t.textContent.trim()==='MIDI').click()`,
      );
      await new Promise((r) => setTimeout(r, 80));
      const editorHeight = await win.webContents.executeJavaScript(
        `document.querySelector('.piano-scroll').clientHeight`,
      );
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Maximize MIDI editor"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 80));
      if (
        (await win.webContents.executeJavaScript(
          `document.querySelector('.piano-scroll').clientHeight`,
        )) <= editorHeight
      )
        throw new Error("MIDI maximize did not expand piano roll");
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Restore MIDI editor"]').click()`,
      );
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Play region"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 70));
      if (!(await request({ op: "state" })).playing)
        throw new Error("Play region did not start transport");
      await win.webContents.capturePage();
      const midiHeadBefore = await win.webContents.executeJavaScript(
        `parseFloat(document.querySelector('.midi-playhead').style.left)`,
      );
      await new Promise((r) => setTimeout(r, 25));
      await win.webContents.capturePage();
      if (
        (await win.webContents.executeJavaScript(
          `parseFloat(document.querySelector('.midi-playhead').style.left)`,
        )) <= midiHeadBefore
      )
        throw new Error("MIDI playhead is not moving");
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Stop playback"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 80));
      await win.webContents.executeJavaScript(
        `document.querySelector('.note-ruler').dispatchEvent(new KeyboardEvent('keydown', {key:'Home',bubbles:true}))`,
      );
      await new Promise((r) => setTimeout(r, 80));
      const midiOrigin = (await request({ op: "state" })).position;
      await win.webContents.executeJavaScript(
        `document.querySelector('.note-ruler').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}))`,
      );
      await new Promise((r) => setTimeout(r, 80));
      if ((await request({ op: "state" })).position <= midiOrigin)
        throw new Error("MIDI ruler did not seek");
      const midiWidth = await win.webContents.executeJavaScript(
        `document.querySelector('.piano-grid').getBoundingClientRect().width`,
      );
      if (
        !(await win.webContents.executeJavaScript(
          `document.querySelector('.piano-grid').clientWidth >= document.querySelector('.piano-scroll').clientWidth`,
        ))
      )
        throw new Error("MIDI region does not fill editor width");
      await win.webContents.executeJavaScript(
        `(() => { const e=document.querySelector('.piano-scroll'),r=e.getBoundingClientRect();e.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-100,clientX:r.left+200,bubbles:true,cancelable:true})); })()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      if (
        (await win.webContents.executeJavaScript(
          `document.querySelector('.piano-grid').getBoundingClientRect().width`,
        )) <= midiWidth
      )
        throw new Error("MIDI pinch/Ctrl-wheel zoom did not work");

      await win.webContents.executeJavaScript(
        `(() => { const slider=document.querySelector('[aria-label="Timeline zoom"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,'60'); slider.dispatchEvent(new Event('input',{bubbles:true})); })()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      await win.webContents.executeJavaScript(
        `document.querySelector('.clip.chosen').scrollIntoView({block:'center',inline:'center'})`,
      );
      await new Promise((r) => setTimeout(r, 80));
      await win.webContents.capturePage();
      const loopRegion = await win.webContents.executeJavaScript(
        `(() => {const r=document.querySelector('.clip.chosen').getBoundingClientRect();return {x:Math.round(r.right-2), y:Math.round(r.top+10), width:r.width,hit:document.elementFromPoint(Math.round(r.right-2),Math.round(r.top+10))?.outerHTML.slice(0,180)};})()`,
      );
      win.webContents.sendInputEvent({
        type: "mouseMove",
        x: loopRegion.x,
        y: loopRegion.y,
      });
      await win.webContents.capturePage();
      win.webContents.sendInputEvent({
        type: "mouseDown",
        x: loopRegion.x,
        y: loopRegion.y,
        button: "left",
        clickCount: 1,
      });
      win.webContents.sendInputEvent({
        type: "mouseMove",
        x: Math.round(loopRegion.x + loopRegion.width * 1.5),
        y: loopRegion.y,
        modifiers: ["leftButtonDown"],
      });
      await new Promise((r) => setTimeout(r, 80));
      win.webContents.sendInputEvent({
        type: "mouseUp",
        x: Math.round(loopRegion.x + loopRegion.width * 1.5),
        y: loopRegion.y,
        button: "left",
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 180));
      const looped = (await request({ op: "state" })).tracks.at(-1).clips;
      if (looped.length < 2)
        throw new Error(
          "Upper right region drag did not create loops: " +
            JSON.stringify(loopRegion),
        );
      for (let i = 1; i < looped.length; i++)
        if (
          Math.abs(
            looped[i].start - looped[i - 1].start - looped[i - 1].duration,
          ) > 0.001
        )
          throw new Error("Loop copies overlap or leave gaps");
      await win.webContents.executeJavaScript(
        `document.querySelector('.track-header input[type="range"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
      );
      await new Promise((r) => setTimeout(r, 150));
      if ((await request({ op: "state" })).tracks[0].gain !== 1)
        throw new Error("Level reset did not restore unity gain");
      await win.webContents.executeJavaScript(`document.activeElement.blur()`);
      win.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: "N",
        modifiers: ["shift"],
      });
      win.webContents.sendInputEvent({
        type: "keyUp",
        keyCode: "N",
        modifiers: ["shift"],
      });
      await new Promise((r) => setTimeout(r, 100));
      if (
        !(await win.webContents.executeJavaScript(
          `!!document.querySelector('.create-track-dialog')`,
        ))
      )
        throw new Error("Shift+N did not open New track");
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
      await new Promise((r) => setTimeout(r, 60));
      win.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: "N",
        modifiers: ["control"],
      });
      win.webContents.sendInputEvent({
        type: "keyUp",
        keyCode: "N",
        modifiers: ["control"],
      });
      await new Promise((r) => setTimeout(r, 100));
      if (
        !(await win.webContents.executeJavaScript(
          `!!document.querySelector('.confirmation-dialog')`,
        ))
      )
        throw new Error("Ctrl+N did not request New project");
      console.log(
        "Export focus, MIDI gesture zoom, fill width, level reset and creation shortcuts passed.",
      );

      await win.webContents.executeJavaScript(
        `document.querySelector('.confirmation-dialog .modal-close')?.click(); [...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='EQ & Effects').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Enable compressor"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 120));
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Enable reverb"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 120));
      const soundState = await request({ op: "state" });
      if (
        !soundState.tracks.some((t) => t.compressorEnabled && t.reverbEnabled)
      )
        throw new Error("Built-in effect switches did not reach engine");
      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Audio status"]').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      if (
        !(await win.webContents.executeJavaScript(
          `document.querySelector('.audio-diagnostics').textContent.includes('Estimated monitoring delay')`,
        ))
      )
        throw new Error("Diagnostics missing");
      if (
        await win.webContents.executeJavaScript(
          `!!document.querySelector('.audio-diagnostics input[type="checkbox"]')`,
        )
      )
        throw new Error("Diagnostics should not contain export settings");
      console.log(
        "Built-in effects and audio diagnostics verified through UI-to-engine commands.",
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
