const { mkdirSync, writeFileSync } = require("node:fs");
/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyStartup(win, request) {
  const state = await request({ op: "state" });
  if (state.tracks.length !== 2) throw new Error("Default tracks missing");
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 50));
    if (
      !(await win.webContents.executeJavaScript(
        `!!document.querySelector('[data-startup]')`,
      ))
    )
      break;
  }
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
  await win.webContents.executeJavaScript(
    `document.querySelector('[title="Quick guide"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 50));
  const guide = await win.webContents.executeJavaScript(
    `document.querySelector('.help-modal')?.textContent`,
  );
  if (
    !guide?.includes("on-screen R control") ||
    !guide.includes("Feedback, bugs & suggestions")
  )
    throw new Error("Quick guide wording or feedback link is missing");
  await win.webContents.executeJavaScript(
    `document.querySelector('.help-feedback').click()`,
  );
  await new Promise((r) => setTimeout(r, 50));
  const feedback = await win.webContents.executeJavaScript(
    `document.querySelector('.feedback-dialog')?.textContent`,
  );
  if (
    !feedback?.includes("comes straight to me") ||
    !feedback.includes("nfmynster@footstomp.studio")
  )
    throw new Error("Personal feedback dialog is missing");
  if (
    await win.webContents.executeJavaScript(
      `!!document.querySelector('.update-available')`,
    )
  )
    throw new Error("Smoke mode unexpectedly reported an update");
  await win.webContents.executeJavaScript(
    `document.querySelector('.feedback-dialog .modal-close').click()`,
  );
  await new Promise((r) => setTimeout(r, 50));
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
    )) !== 5
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
  // The playhead animates back to the start; press only once it has settled
  // and is the element under the point.
  const head = await win.webContents.executeJavaScript(`(async () => {
      let previous = null;
      for (let attempt = 0; attempt < 60; attempt++) {
        const r = document.querySelector('.playhead > span').getBoundingClientRect();
        const point = { x: Math.round(r.x + r.width / 2 + 3), y: Math.round(r.y + 4) };
        const hit = document.elementFromPoint(point.x, point.y)?.closest('.playhead');
        if (hit && previous && previous.x === point.x && previous.y === point.y) return point;
        previous = point;
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 16)));
      }
      throw new Error('Playhead never settled under the pointer');
    })()`);
  win.webContents.sendInputEvent({
    type: "mouseDown",
    ...head,
    button: "left",
    clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 50));
  win.webContents.sendInputEvent({
    type: "mouseMove",
    modifiers: ["leftbuttondown"],
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
  let seeked = false;
  for (let attempt = 0; attempt < 20 && !seeked; attempt++) {
    await new Promise((r) => setTimeout(r, 50));
    seeked = (await request({ op: "state" })).position >= 2;
  }
  if (!seeked) throw new Error("Dragging the playhead did not seek");
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
      modifiers: ["leftbuttondown"],
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
      throw new Error("Ruler zone changed the wrong transport state: " + zone);
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
  // Nothing polls: changes made outside the UI reach the screen through the
  // engine's live stream, the session (a rename) and the transport (a seek).
  const title = (await request({ op: "state" })).title;
  await request({ op: "rename", title: "Pushed by the engine" });
  await request({ op: "seek", position: 4 });
  let pushed = { name: "", playhead: "" };
  for (let i = 0; i < 40; i++) {
    pushed = await win.webContents.executeJavaScript(
      `({ name: document.querySelector('[aria-label="Session name"]').value, playhead: document.querySelector('.playhead').getAttribute('aria-valuenow') })`,
    );
    if (pushed.name === "Pushed by the engine" && pushed.playhead === "4.00")
      break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (pushed.name !== "Pushed by the engine" || pushed.playhead !== "4.00")
    throw new Error(
      "The live stream did not bring engine changes to the UI: " +
        JSON.stringify(pushed),
    );
  await request({ op: "rename", title });
  await request({ op: "seek", position: 0 });
  console.log(
    "Desktop smoke passed: UI-to-JUCE commands, dialog shortcuts and Escape.",
  );
}
module.exports = { verifyStartup };
