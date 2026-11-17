/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyArrangementSettings(win, request) {
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
}

/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyLoopControls(win, request) {
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
}

/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyTrackOrdering(win, request) {
  await win.webContents.executeJavaScript(
    `document.querySelector('.audio-diagnostics .modal-close').click()`,
  );
  const orderBefore = (await request({ op: "state" })).tracks.map((t) => t.id);
  await win.webContents.executeJavaScript(
    `(() => {const headers=document.querySelectorAll('[data-track-header]'), dt=new DataTransfer();dt.setData('application/x-basement-track',headers[headers.length-1].dataset.trackHeader);headers[0].dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));})()`,
  );
  await new Promise((r) => setTimeout(r, 250));
  if ((await request({ op: "state" })).tracks[0].id !== orderBefore.at(-1))
    throw new Error("Track drop did not reorder");
  const openTrackMenu = async () => {
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-track-header]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:250}))`,
    );
    await new Promise((r) => setTimeout(r, 80));
  };
  await openTrackMenu();
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('[role="menuitem"]')].find(b=>b.textContent.trim()==='Delete track').click()`,
  );
  await new Promise((r) => setTimeout(r, 80));
  if (
    !(await win.webContents.executeJavaScript(
      `document.querySelector('.confirmation-dialog').textContent.includes('Shift')`,
    ))
  )
    throw new Error("Missing shift-delete hint");
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.confirmation-dialog button')].find(b=>b.textContent==='Cancel').click()`,
  );
  await openTrackMenu();
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('[role="menuitem"]')].find(b=>b.textContent.trim()==='Delete track').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`,
  );
  await new Promise((r) => setTimeout(r, 250));
  if (
    (await request({ op: "state" })).tracks.length !== orderBefore.length - 1 ||
    (await win.webContents.executeJavaScript(
      `!!document.querySelector('.confirmation-dialog')`,
    ))
  )
    throw new Error("Shift-delete did not bypass confirmation");
  console.log(
    "Shared playhead drags, track reordering and Shift-delete verified",
  );
}
module.exports = {
  verifyArrangementSettings,
  verifyLoopControls,
  verifyTrackOrdering,
};
