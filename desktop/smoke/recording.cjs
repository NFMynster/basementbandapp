const { required } = require("./required.cjs");
/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyRegionDrag(win, request) {
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
    modifiers: ["leftbuttondown"],
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
}

/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyRecordingControls(win, request) {
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
  const masterGain = required(
    (await request({ op: "state" })).masterGain,
    "master volume",
  );
  if (Math.abs(masterGain - 0.35) > 0.001)
    throw new Error("Master slider did not update native state");
  for (const height of [700, 810, 1080]) {
    win.setSize(1280, height);
    await new Promise((r) => setTimeout(r, 100));
    for (const selector of [".arrangement-scroll"]) {
      for (const top of [99999, 240, 0]) {
        await win.webContents.executeJavaScript(
          `document.querySelector('${selector}').scrollTop = ${top}`,
        );
        await win.webContents.capturePage(); // Flush a compositor frame in the hidden smoke window.
        await new Promise((r) => setTimeout(r, 100));
        const offsets = await win.webContents.executeJavaScript(`(() => {
              const sidebar = document.querySelector('.track-list'), timeline = document.querySelector('.arrangement-scroll');
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
    `document.querySelector('.arrangement-scroll').scrollLeft = 0`,
  );
  await request({ op: "record" });
  for (let frame = 0; frame < 10; ++frame) {
    await win.webContents.capturePage();
    await new Promise((r) => setTimeout(r, 100));
  }
  if (
    !(await win.webContents.executeJavaScript(`(() => {
        const view = document.querySelector('.arrangement-scroll').getBoundingClientRect();
        const head = document.querySelector('.playhead').getBoundingClientRect();
        const sidebar = document.querySelector('.track-sidebar').getBoundingClientRect();
        return head.left >= sidebar.right && head.left <= view.right && document.querySelector('.arrangement-scroll').scrollLeft > 0;
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
}

/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyRegionTrim(win, request) {
  const trimState = await request({ op: "state" });
  const trimTrack = required(
    trimState.tracks.find((t) =>
      t.clips.some((c) => c.active !== false && c.duration > 0.4),
    ),
    "a track with a trimmable region",
  );
  const trimClip = required(
    trimTrack.clips.find((c) => c.active !== false && c.duration > 0.4),
    "a trimmable region",
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
    modifiers: ["leftbuttondown"],
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
  const trimmed = required(
    (await request({ op: "state" })).tracks
      .find((t) => t.id === trimTrack.id)
      ?.clips.find((c) => c.id === trimClip.id),
    "the trimmed region",
  );
  if (!(
    trimmed.start > trimClip.start &&
    trimmed.duration < trimClip.duration &&
    Math.abs(
      trimmed.start + trimmed.duration - trimClip.start - trimClip.duration,
    ) < 0.001
  ))
    throw new Error("Dragging left edge did not trim in place");
  console.log("Region edge cursor and live trim gesture passed.");
}

/** @param {import("../types").Window} win @param {import("../types").Request} request */
async function verifyLoopTakes(win, request) {
  await request({ op: "loop", start: 0, end: 0.05, enabled: true });
  await request({ op: "record" });
  await request({ op: "pump", frames: 8192, left: 0.2 });
  /** @type {import("../types").Snapshot} */
  const takeState = await request({ op: "stop" });
  const takeTrack = required(
    takeState.tracks.find((t) => t.clips.some((c) => c.takeGroup)),
    "a track with loop takes",
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
      ?.clips.find((c) => c.id === takeChoice)?.active
  )
    throw new Error("Toolbar take selection did not reach the engine");
  console.log("Short loop takes remain selectable without zooming.");
  return { takeChoice };
}
module.exports = {
  verifyRegionDrag,
  verifyRecordingControls,
  verifyRegionTrim,
  verifyLoopTakes,
};
