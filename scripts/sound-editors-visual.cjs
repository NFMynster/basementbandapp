const { launchDesktop } = require("./webview-driver.cjs");
const { writeFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");
(async () => {
  const { win: w, app } = await launchDesktop({
    fixture: true,
    width: 1200,
    height: 800,
  });
  w.showInactive();
  await new Promise((r) => setTimeout(r, 1100));
  await w.webContents.executeJavaScript(
    `document.querySelector('.welcome-dialog .modal-close')?.click(); [...document.querySelectorAll('.tab')].find(b=>b.textContent==='EQ & Effects').click()`,
  );
  await new Promise((r) => setTimeout(r, 1100));
  // Exercise both dividers with actual pointer input.
  await w.webContents.executeJavaScript(
    `document.querySelector('.metronome-control button').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))`,
  );
  await new Promise((r) => setTimeout(r, 80));
  await w.webContents.executeJavaScript(
    `(() => {const slider=document.querySelector('[aria-label="Metronome volume"][type="range"]'); if (!slider || getComputedStyle(slider).writingMode !== 'vertical-lr') throw new Error('Missing vertical click volume'); slider.focus(); })()`,
  );
  w.webContents.sendInputEvent({ type: "keyDown", keyCode: "Up" });
  w.webContents.sendInputEvent({ type: "keyUp", keyCode: "Up" });
  await new Promise((r) => setTimeout(r, 100));
  if (
    (await w.webContents.executeJavaScript(
      `document.querySelector('.metronome-volume output').textContent`,
    )) !== "105%"
  )
    throw new Error("Click volume did not increase");
  await w.webContents.executeJavaScript(
    `[...document.querySelectorAll('.metronome-sounds [role="radio"]')].find(b=>b.textContent==='Wood block').click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  if (
    (await w.webContents.executeJavaScript(
      `(() => {const tap=document.querySelector('.metronome-menu .tap-tempo'); const typed=document.querySelector('.metronome-menu input[aria-label="Tempo in BPM"]'); if (!typed || typed.value !== '120') return false; const picked=document.querySelector('.metronome-sounds [aria-checked="true"]'); const menu=document.querySelector('.metronome-menu').getBoundingClientRect(); return !!tap && !tap.disabled && picked?.textContent === 'Wood block' && menu.right <= innerWidth && menu.left >= 0;})()`,
    )) !== true
  )
    throw new Error("Metronome menu lacks tap tempo or sound choice");
  mkdirSync("artifacts/screenshots", { recursive: true });
  writeFileSync(
    "artifacts/screenshots/metronome-volume.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  w.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  w.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  for (const [label, dx, dy] of [
    ["Track sidebar width", 80, 0],
    ["Properties panel height", 0, 60],
  ]) {
    await w.webContents.executeJavaScript(
      `document.querySelector('[aria-label="${label}"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
    );
    await new Promise((r) => setTimeout(r, 80));
    const before = await w.webContents.executeJavaScript(
      `(() => { const e = document.querySelector('[aria-label="${label}"]'); const r = e.getBoundingClientRect(); return {x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), value: Number(e.getAttribute('aria-valuenow'))}; })()`,
    );
    w.webContents.sendInputEvent({
      type: "mouseDown",
      x: before.x,
      y: before.y,
      button: "left",
      clickCount: 1,
    });
    w.webContents.sendInputEvent({
      type: "mouseMove",
      x: before.x + dx,
      y: before.y + dy,
      button: "left",
    });
    w.webContents.sendInputEvent({
      type: "mouseUp",
      x: before.x + dx,
      y: before.y + dy,
      button: "left",
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 120));
    const after = await w.webContents.executeJavaScript(
      `Number(document.querySelector('[aria-label="${label}"]').getAttribute('aria-valuenow'))`,
    );
    if (after !== before.value + dx - dy)
      throw new Error(
        `${label} did not resize: ${before.value} -> ${after}; ` +
          (await w.webContents.executeJavaScript(
            `JSON.stringify({startup:document.querySelector('[data-startup]')?.outerHTML, app:document.querySelector('.app').className, opacity:getComputedStyle(document.querySelector('.app')).opacity})`,
          )),
      );
  }
  mkdirSync("artifacts/screenshots", { recursive: true });
  await w.webContents.capturePage();
  await new Promise((r) => setTimeout(r, 200));
  writeFileSync(
    "artifacts/screenshots/eq.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  await w.webContents.executeJavaScript(
    `document.querySelector('[data-clip="m1"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
  );
  await new Promise((r) => setTimeout(r, 1100));
  await w.webContents.capturePage();
  await new Promise((r) => setTimeout(r, 200));
  writeFileSync(
    "artifacts/screenshots/notes.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  await w.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Maximize MIDI editor"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 150));
  writeFileSync(
    "artifacts/screenshots/midi-maximized.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  await w.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Restore editor"]').click()`,
  );
  const count = await w.webContents.executeJavaScript(
    `document.querySelectorAll('.piano-note').length`,
  );
  if (count !== 32) throw new Error("Missing editor notes: " + count);
  const layout = await w.webContents.executeJavaScript(`(() => {
      const tabs = [...document.querySelectorAll('.tab')];
      if (!tabs.filter(t => ['EQ & Effects', 'MIDI'].includes(t.textContent.trim())).every(t => t.querySelector('svg'))) throw new Error('Missing tab icon');
      if (!document.querySelector('.align-notes').title.includes('Quantize:')) throw new Error('Missing beat alignment');
      return { width: document.querySelector('.track-sidebar').getBoundingClientRect().width, height: document.querySelector('.inspector').getBoundingClientRect().height };
    })()`);
  for (const width of [1100, 900]) {
    w.setSize(width, 800);
    await new Promise((r) => setTimeout(r, 200));
    await w.webContents.executeJavaScript(`(() => {
        const piano = document.querySelector('.piano-scroll');
        if (piano.scrollWidth > piano.clientWidth || piano.scrollHeight > piano.clientHeight) throw new Error('Fitted drum region should not need scrollbars');
        const labels = [...document.querySelectorAll('.note-ruler span')];
        if (labels.length > 1 && labels[1].getBoundingClientRect().left <= labels[0].getBoundingClientRect().right) throw new Error('Beat labels overlap');
        const toolbar = document.querySelector('.midi-tools');
        if (toolbar.scrollWidth > toolbar.clientWidth) throw new Error('MIDI toolbar overflows');
        const bounds = toolbar.getBoundingClientRect();
        for (const control of toolbar.querySelectorAll('button, select, input')) {
          const r = control.getBoundingClientRect();
          if (r.right > bounds.right || r.bottom > bounds.bottom) throw new Error('MIDI control clipped');
        }
        if (document.querySelector('.piano-scroll').clientHeight < 100) throw new Error('Piano roll too short');
      })()`);
    writeFileSync(
      `artifacts/screenshots/notes-${width}.png`,
      (await w.webContents.capturePage()).toPNG(),
    );
  }
  w.setSize(1200, 800);
  w.webContents.reload();
  await new Promise((r) => setTimeout(r, 800));
  const restored = await w.webContents.executeJavaScript(
    `({width: document.querySelector('.track-sidebar').getBoundingClientRect().width, height: document.querySelector('.inspector').getBoundingClientRect().height})`,
  );
  if (JSON.stringify(layout) !== JSON.stringify(restored))
    throw new Error("Panel sizes did not persist");
  console.log(
    "Resizable panels, persistence, tab icons and MIDI editor verified",
  );

  // The reloaded app shows its welcome again once startup finishes; wait for
  // it rather than racing it, so it cannot cover later pointer input.
  await w.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 60; i++) {
      const close = document.querySelector('.welcome-dialog .modal-close');
      if (close) { close.click(); return; }
      await new Promise((r) => setTimeout(r, 50));
    }
  })()`);
  w.showInactive();
  await new Promise((r) => setTimeout(r, 250));
  // The transport counter stays clear of the buttons beside it down to the
  // minimum window width (1050 px in desktop/src/main.rs).
  for (const width of [1440, 1200, 1050]) {
    w.setSize(width, 800);
    await new Promise((r) => setTimeout(r, 120));
    const clash = await w.webContents.executeJavaScript(`(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const lcd = box('.lcd'), left = box('.transport-left'), right = box('.transport-right'), bar = box('.transport');
        if (lcd.left < left.right || lcd.right > right.left) return 'counter overlaps the buttons';
        if (right.right > bar.right || left.left < bar.left) return 'controls overflow the bar';
        const footer = document.querySelector('footer');
        if (footer.scrollWidth > footer.clientWidth) return 'footer overflows';
        if ([...footer.children].some((item) => item.getBoundingClientRect().height > 24)) return 'footer text wraps';
        return '';
      })()`);
    if (clash) throw new Error(`Transport at ${width}px: ${clash}`);
    if (width === 1050)
      writeFileSync(
        "artifacts/screenshots/transport-1050.png",
        (await w.webContents.capturePage()).toPNG(),
      );
  }
  for (const width of [1440, 1100]) {
    w.setSize(width, 800);
    await w.webContents.executeJavaScript(
      `document.querySelector('[data-track-header="g"]').click(); [...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='EQ & Effects').click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    await w.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Enable compressor"]').click(); document.querySelector('[aria-label="Enable reverb"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    const fits = await w.webContents.executeJavaScript(`(() => {
        const panel = document.querySelector('.inspector-content');
        return panel.scrollWidth <= panel.clientWidth + 1 && [...document.querySelectorAll('.effect-amount input')].every(e => e.getBoundingClientRect().right <= innerWidth);
      })()`);
    if (!fits) throw new Error("Effects overflow at " + width);
    writeFileSync(
      "artifacts/screenshots/effects-" + width + ".png",
      (await w.webContents.capturePage()).toPNG(),
    );
    await w.webContents.executeJavaScript(
      `[...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='Recording').click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    if (
      !(await w.webContents.executeJavaScript(
        `!!document.querySelector('[aria-label="Enable noise gate"]')`,
      ))
    )
      throw new Error("Audio track is missing gate");
    writeFileSync(
      "artifacts/screenshots/gate-" + width + ".png",
      (await w.webContents.capturePage()).toPNG(),
    );
  }

  await w.webContents.executeJavaScript(
    `document.querySelector('[data-clip="clipg"]').dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))`,
  );
  await new Promise((r) => setTimeout(r, 150));
  await w.webContents.executeJavaScript(`(() => {
      if (document.querySelectorAll('.region-controls input').length !== 3) throw new Error('Missing region controls');
      if (document.querySelector('.fade-handle')) throw new Error('Timeline fade handles remain');
      const clip = document.querySelector('[data-clip="clipg"]'), r = clip.getBoundingClientRect();
      clip.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, clientX:r.right-2, clientY:r.top+4}));
      if (!clip.style.cursor.includes('data:image/svg+xml')) throw new Error('Missing loop cursor');
      clip.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, clientX:r.right-2, clientY:r.bottom-4}));
      if (clip.style.cursor !== 'ew-resize') throw new Error('Trim cursor changed');
    })()`);
  writeFileSync(
    "artifacts/screenshots/region-redesign.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  // Dragging the loop handle out and back to where it started is a change
  // of mind: the preview shows copies on the way, but no loop is created.
  // Dragging near the timeline's right edge scrolls it, so first bring the
  // region's end to the middle of the view and stay clear of that edge.
  const loopHandle = await w.webContents.executeJavaScript(`(() => {
      const view = document.querySelector('.arrangement-scroll');
      const clip = document.querySelector('[data-clip="clipg"]');
      const v = view.getBoundingClientRect();
      view.scrollLeft += clip.getBoundingClientRect().right - (v.left + v.width / 2);
      const r = clip.getBoundingClientRect();
      return {x: Math.round(r.right - 3), y: Math.round(r.top + 5), room: Math.round(v.right - 80 - r.right)};
    })()`);
  await new Promise((r) => setTimeout(r, 100));
  // Moves carry the held button, as real drags do; a move without it is
  // treated as a drag whose release was lost.
  const mouse = (type, x) =>
    w.webContents.sendInputEvent({
      type,
      x,
      y: loopHandle.y,
      button: "left",
      clickCount: 1,
      ...(type === "mouseMove" && { modifiers: ["leftButtonDown"] }),
    });
  // Input events and React renders land asynchronously; wait for the
  // preview to reach the expected state instead of a fixed delay.
  const previewShown = async (wanted) => {
    for (let attempt = 0; attempt < 40; ++attempt) {
      const shown = await w.webContents.executeJavaScript(
        `document.querySelectorAll('.clip.repeat-copy').length > 0`,
      );
      if (shown === wanted) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return false;
  };
  mouse("mouseDown", loopHandle.x);
  for (const step of [0.25, 0.6, 1].map((f) =>
    Math.round(f * loopHandle.room),
  )) {
    mouse("mouseMove", loopHandle.x + step);
    await new Promise((r) => setTimeout(r, 30));
  }
  if (!(await previewShown(true)))
    throw new Error("Loop drag shows no repeat preview");
  for (const step of [0.6, 0.25, 0].map((f) =>
    Math.round(f * loopHandle.room),
  )) {
    mouse("mouseMove", loopHandle.x + step);
    await new Promise((r) => setTimeout(r, 30));
  }
  if (!(await previewShown(false)))
    throw new Error("Loop preview remains after dragging back");
  mouse("mouseUp", loopHandle.x);
  await new Promise((r) => setTimeout(r, 200));
  if (
    await w.webContents.executeJavaScript(
      `!!document.querySelector('[data-clip="loop-marker"]')`,
    )
  )
    throw new Error("Loop drag back to the start still created a loop");
  const load = await w.webContents.executeJavaScript(`(async () => {
      const output = document.querySelector('.audio-cpu output');
      let changes = 0;
      const observer = new MutationObserver(() => changes++);
      observer.observe(output, {childList:true,characterData:true,subtree:true});
      let high = false;
      const timer = setInterval(() => window.basement.command({op:'testAudioLoad',value:(high = !high) ? 1.2 : 1.8}), 50);
      await new Promise(r => setTimeout(r, 3200));
      clearInterval(timer);
      observer.disconnect();
      return {changes, value:parseFloat(output.textContent), warning:document.querySelector('.audio-cpu').classList.contains('needs-attention'), tagline:!!document.querySelector('.inspector-hint')};
    })()`);
  if (
    load.changes > 4 ||
    load.value < 1.2 ||
    load.value > 1.9 ||
    load.warning ||
    load.tagline
  )
    throw new Error(
      "Audio averaging or footer state is incorrect: " + JSON.stringify(load),
    );
  await w.webContents.executeJavaScript(
    `document.querySelector('[data-track-header="m"]').click(); [...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='Plug-ins').click()`,
  );
  await new Promise((r) => setTimeout(r, 150));
  writeFileSync(
    "artifacts/screenshots/plugins-redesign.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  // Holding a loop drag at the timeline's right edge scrolls the timeline
  // and keeps extending the loop past what was visible.
  // Measure the handle again once the layout has settled after the tab
  // change, and only press while the region is the element under it.
  Object.assign(
    loopHandle,
    await w.webContents.executeJavaScript(`(async () => {
      const clip = document.querySelector('[data-clip="clipg"]');
      let previous = null;
      for (let attempt = 0; attempt < 60; attempt++) {
        const r = clip.getBoundingClientRect();
        const point = {x: Math.round(r.right - 3), y: Math.round(r.top + 5)};
        const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-clip="clipg"]');
        if (hit && previous && previous.x === point.x && previous.y === point.y) return point;
        previous = point;
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 16)));
      }
      throw new Error('Loop handle never settled under the pointer');
    })()`),
  );
  const edge = await w.webContents.executeJavaScript(`(() => {
      const view = document.querySelector('.arrangement-scroll');
      const r = view.getBoundingClientRect();
      return {x: Math.round(r.right - 8), start: view.scrollLeft};
    })()`);
  mouse("mouseDown", loopHandle.x);
  for (const x of [loopHandle.x + 40, edge.x])
    (mouse("mouseMove", x), await new Promise((r) => setTimeout(r, 30)));
  await new Promise((r) => setTimeout(r, 600));
  const edgeScrolled = await w.webContents.executeJavaScript(
    `({left: document.querySelector('.arrangement-scroll').scrollLeft, copies: document.querySelectorAll('.clip.repeat-copy').length})`,
  );
  // Cancel the drag (button up elsewhere) and put the view back.
  w.webContents.sendInputEvent({
    type: "mouseMove",
    x: edge.x - 1,
    y: loopHandle.y,
  });
  mouse("mouseUp", edge.x - 1);
  await new Promise((r) => setTimeout(r, 150));
  await w.webContents.executeJavaScript(
    `document.querySelector('.arrangement-scroll').scrollLeft = 0`,
  );
  if (edgeScrolled.left - edge.start < 100 || edgeScrolled.copies < 2)
    throw new Error(
      "Loop drag at the edge does not scroll the timeline: " +
        JSON.stringify(edgeScrolled),
    );
  // A region drag whose release never arrives (Alt+Tab, then letting go in
  // another window) must not leave the region floating between lanes.
  // Wait until the scroll reset has settled and the region itself is under
  // the point, so the press cannot land on a moving target.
  const region = await w.webContents.executeJavaScript(`(async () => {
      const clip = document.querySelector('[data-clip="clipg"]');
      let previous = null;
      for (let attempt = 0; attempt < 60; attempt++) {
        const r = clip.getBoundingClientRect();
        const point = {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), left: r.left, top: r.top};
        const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-clip="clipg"]');
        if (hit && previous && previous.left === point.left && previous.top === point.top) return point;
        previous = point;
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 16)));
      }
      throw new Error('Region never settled under the pointer');
    })()`);
  const regionRect = () =>
    w.webContents.executeJavaScript(
      `(() => { const r = document.querySelector('[data-clip="clipg"]').getBoundingClientRect(); return {left: r.left, top: r.top}; })()`,
    );
  w.webContents.sendInputEvent({
    type: "mouseDown",
    x: region.x,
    y: region.y,
    button: "left",
    clickCount: 1,
  });
  for (const step of [20, 60, 120]) {
    w.webContents.sendInputEvent({
      type: "mouseMove",
      x: region.x + step,
      y: region.y, // sideways only: no vertical edge scroll
      modifiers: ["leftButtonDown"],
    });
    await new Promise((r) => setTimeout(r, 30));
  }
  let regionDragged = false;
  for (let attempt = 0; attempt < 40 && !regionDragged; ++attempt) {
    const now = await regionRect();
    regionDragged = now.left !== region.left || now.top !== region.top;
    if (!regionDragged) await new Promise((r) => setTimeout(r, 25));
  }
  if (!regionDragged) throw new Error("Region drag shows no preview");
  // The button is no longer held: the release happened elsewhere.
  w.webContents.sendInputEvent({
    type: "mouseMove",
    x: region.x + 130,
    y: region.y,
  });
  let regionRestored = false;
  for (let attempt = 0; attempt < 40 && !regionRestored; ++attempt) {
    const now = await regionRect();
    regionRestored = now.left === region.left && now.top === region.top;
    if (!regionRestored) await new Promise((r) => setTimeout(r, 25));
  }
  // Let Chromium's own button state go too, or later clicks in this script
  // would be read as a continuing drag.
  w.webContents.sendInputEvent({
    type: "mouseUp",
    x: region.x + 130,
    y: region.y,
    button: "left",
    clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 100));
  if (!regionRestored)
    throw new Error("Region stays stuck after its drag release was lost");
  const regionAfter = await regionRect();
  if (regionAfter.left !== region.left || regionAfter.top !== region.top)
    throw new Error("A cancelled region drag must not move the region");
  // Switching windows mid-drag cancels the drag without a dragend on the
  // page; the drop gap must not stay behind.
  await w.webContents.executeJavaScript(`(async () => {
      const source = document.querySelector('[data-track-header="g"] .track-number');
      const target = document.querySelector('[data-track-header="m"]');
      target.scrollIntoView({block: 'nearest'});
      // A drag only starts while the app is idle; retry past a busy moment.
      let shown = false;
      for (let attempt = 0; attempt < 20 && !shown; attempt++) {
        const s = source.getBoundingClientRect(), r = target.getBoundingClientRect();
        source.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, button: 0, buttons: 1, clientX: s.left + 4, clientY: s.top + 4}));
        window.dispatchEvent(new PointerEvent('pointermove', {bubbles: true, buttons: 1, clientX: r.left + 20, clientY: r.bottom - 4}));
        shown = target.classList.contains('reorder-target');
        if (!shown) {
          window.dispatchEvent(new PointerEvent('pointercancel', {bubbles: true}));
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      if (!shown) throw new Error('Track drag shows no drop position');
      window.dispatchEvent(new Event('blur'));
      if (document.querySelector('.reorder-target, .reorder-ghost')) throw new Error('Track drop gap stays after the window loses focus mid-drag');
    })()`);
  // MIDI tracks are always live: no monitor button in the header and no
  // monitor switch in the Recording tab.
  const midiHeader = await w.webContents.executeJavaScript(`(() => {
      const header = document.querySelector('[data-track-header="m"]');
      header.scrollIntoView({block: 'center'});
      if (header.querySelector('[aria-label^="Monitor"]')) throw new Error('MIDI track still has a monitor button');
      const r = header.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height)};
    })()`);
  await new Promise((r) => setTimeout(r, 100));
  writeFileSync(
    "artifacts/screenshots/midi-track-header.png",
    (await w.webContents.capturePage(midiHeader)).toPNG(),
  );
  await w.webContents.executeJavaScript(`(() => {
      [...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='Recording').click();
      if (document.querySelector('.monitor-control')) throw new Error('MIDI Recording tab still has a monitor switch');
      [...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='Plug-ins').click();
    })()`);
  await w.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Audio status"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  writeFileSync(
    "artifacts/screenshots/audio-status.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  await w.webContents.executeJavaScript(
    `document.querySelector('.modal-close').click(); document.querySelector('[data-track-header="m"]').dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,clientX:120,clientY:300}))`,
  );
  await new Promise((r) => setTimeout(r, 100));
  await w.webContents.executeJavaScript(
    `[...document.querySelectorAll('[role="menuitem"]')].find(b=>b.textContent.includes('Export track')).click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  const opened = await w.webContents.executeJavaScript(
    `!!document.querySelector('.midi-export-dialog') && document.querySelector('.export-choices button').getAttribute('aria-pressed') === 'true'`,
  );
  if (!opened)
    throw new Error("MIDI export did not default to instrument audio");
  writeFileSync(
    "artifacts/screenshots/midi-export.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  await w.webContents.executeJavaScript(
    `document.querySelectorAll('.export-choices button')[1].click()`,
  );
  await new Promise((r) => setTimeout(r, 50));
  await w.webContents.executeJavaScript(
    `document.querySelector('.midi-export-dialog .primary').click()`,
  );
  await new Promise((r) => setTimeout(r, 100));
  const canceled = await w.webContents.executeJavaScript(
    `!!document.querySelector('.midi-export-dialog') && !document.querySelector('.export-wait') && !!document.activeElement.closest('.midi-export-dialog')`,
  );
  if (!canceled)
    throw new Error(
      "Canceling folder picker must preserve MIDI dialog and keyboard focus",
    );
  w.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  w.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await new Promise((r) => setTimeout(r, 100));
  if (
    await w.webContents.executeJavaScript(
      `!!document.querySelector('.midi-export-dialog')`,
    )
  )
    throw new Error("Escape did not close MIDI export");
  console.log(
    "Effects, gate, diagnostics and MIDI export verified at desktop and small widths",
  );
  await w.webContents.executeJavaScript(
    `document.querySelector('[title="Quick guide"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 200));
  if (
    !(await w.webContents.executeJavaScript(
      `document.querySelector('.help-modal').textContent.includes('@nfmynster') && [...document.querySelectorAll('.help-links button')].some((b) => b.textContent.includes('footstomp.studio'))`,
    ))
  )
    throw new Error("Missing guide credit or website");
  writeFileSync(
    "artifacts/screenshots/quick-guide.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  await w.webContents.executeJavaScript(
    `document.querySelector('.help-modal .modal-close').click()`,
  );

  await w.webContents.executeJavaScript(
    `document.querySelector('.arrangement-scroll').scrollLeft=0; document.querySelector('.arrangement-scroll').scrollTop=0`,
  );
  await new Promise((r) => setTimeout(r, 80));
  const box = await w.webContents.executeJavaScript(
    `(() => { const a=document.querySelector('[data-lane="g"]').getBoundingClientRect(), b=document.querySelector('[data-lane="b"]').getBoundingClientRect(); return {x:Math.round(a.left+10),y:Math.round(a.top+2),endX:Math.round(a.left+180),endY:Math.round(b.top+85)}; })()`,
  );
  w.webContents.sendInputEvent({
    type: "mouseDown",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 40));
  w.webContents.sendInputEvent({
    type: "mouseMove",
    x: box.endX,
    y: box.endY,
    modifiers: ["leftButtonDown"],
  });
  await new Promise((r) => setTimeout(r, 80));
  await w.webContents.capturePage();
  if (
    !(await w.webContents.executeJavaScript(
      `document.querySelectorAll('.clip.chosen').length === 2 && !!document.querySelector('.region-marquee')`,
    ))
  )
    throw new Error("Drag box did not select two regions");
  w.webContents.sendInputEvent({
    type: "mouseUp",
    x: box.endX,
    y: box.endY,
    button: "left",
    clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 80));
  await w.webContents.executeJavaScript(
    `document.querySelector('[data-clip="clipg"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`,
  );
  if (
    (await w.webContents.executeJavaScript(
      `document.querySelectorAll('.clip.chosen').length`,
    )) !== 1
  )
    throw new Error("Shift click did not toggle region selection");
  await w.webContents.executeJavaScript(
    `document.querySelector('.add-track').click()`,
  );
  await new Promise((r) => setTimeout(r, 180));
  const dialogHeight = await w.webContents.executeJavaScript(
    `document.querySelector('.create-track-dialog').getBoundingClientRect().height`,
  );
  await w.webContents.executeJavaScript(
    `document.querySelectorAll('.track-types button')[1].click()`,
  );
  if (
    (await w.webContents.executeJavaScript(
      `document.querySelector('.create-track-dialog').getBoundingClientRect().height`,
    )) !== dialogHeight
  )
    throw new Error("New track dialog changes height");
  await w.webContents.executeJavaScript(
    `document.querySelector('.create-track-dialog .modal-close').click(); window.basement.command({op:'testTakes'})`,
  );
  await new Promise((r) => setTimeout(r, 150));
  await w.webContents.executeJavaScript(
    `document.querySelector('[data-clip="clipb"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
  );
  await new Promise((r) => setTimeout(r, 150));
  if (
    (await w.webContents.executeJavaScript(
      `document.querySelectorAll('#region-take option').length`,
    )) !== 2
  )
    throw new Error("Region panel is missing takes");
  writeFileSync(
    "artifacts/screenshots/region-takes.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  await w.webContents.executeJavaScript(
    `document.querySelector('[data-clip="clipb"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:300}))`,
  );
  if (
    await w.webContents.executeJavaScript(
      `!!document.querySelector('[role="menuitemradio"]')`,
    )
  )
    throw new Error("Old take context menu remains");
  w.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  w.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  console.log(
    "Region box selection, Shift selection, stable creation dialog and take panel verified",
  );
  await w.webContents.executeJavaScript(
    `window.basement.command({op:'testAddTrack'})`,
  );
  await new Promise((r) => setTimeout(r, 90));
  if (
    !(await w.webContents.executeJavaScript(
      `document.querySelector('[data-track-header="animated"]').getAnimations().length > 0`,
    ))
  )
    throw new Error("Track insertion is not animated");
  await new Promise((r) => setTimeout(r, 220));
  await w.webContents.executeJavaScript(
    `window.basement.command({op:'testRemoveTrack'})`,
  );
  await new Promise((r) => setTimeout(r, 90));
  if (
    !(await w.webContents.executeJavaScript(
      `['[data-track-header="b"]', '[data-lane="b"]'].every(selector => { const animation = document.querySelector(selector).getAnimations()[0]; return animation?.effect.getTiming().delay === 130 && animation.effect.getTiming().fill === 'backwards'; })`,
    ))
  )
    throw new Error("Track removal did not animate both columns");
  await new Promise((r) => setTimeout(r, 220));
  if (
    await w.webContents.executeJavaScript(
      `!!document.querySelector('.track-header[aria-hidden="true"]')`,
    )
  )
    throw new Error("Deleted track ghost was not removed");
  console.log("Track insertion and removal transitions verified");
  await w.loadFile(path.join(__dirname, "../dist/index.html"), {
    query: { startup: "slow" },
  });
  await new Promise((r) => setTimeout(r, 150));
  if (
    !(await w.webContents.executeJavaScript(
      `!!document.querySelector('[data-startup]') && document.querySelector('.app').inert`,
    ))
  )
    throw new Error("Missing blocking startup overlay");
  await w.webContents.executeJavaScript(`(() => {
      window.initialTracksAnimated = false;
      window.startupTracksFlashed = false;
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-startup]')) {
          window.startupTracksFlashed ||= [...document.querySelectorAll('[data-track-header], [data-lane]')].some(n => getComputedStyle(n).visibility !== 'hidden');
        }
        if (!document.querySelector('[data-startup]')) {
          window.initialTracksAnimated = [...document.querySelectorAll('[data-track-header]')].every(n => n.getAnimations().length > 0);
          const headers = [...document.querySelectorAll('[data-track-header]')];
          const lanes = [...document.querySelectorAll('[data-lane]')];
          window.initialTracksStaggered = headers.length > 1 && headers.every((node, index) => {
            const timing = node.getAnimations()[0]?.effect.getTiming();
            const laneTiming = lanes[index]?.getAnimations()[0]?.effect.getTiming();
            return timing?.fill === 'backwards' && timing.delay === laneTiming?.delay &&
              (index === 0 || timing.delay > headers[index - 1].getAnimations()[0].effect.getTiming().delay);
          });
          observer.disconnect();
        }
      });
      observer.observe(document.body,{childList:true,subtree:true});
    })()`);
  writeFileSync(
    "artifacts/screenshots/startup-overlay.png",
    (await w.webContents.capturePage()).toPNG(),
  );
  await new Promise((r) => setTimeout(r, 1800));
  if (
    await w.webContents.executeJavaScript(
      `!!document.querySelector('[data-startup]') || document.querySelector('.app').inert`,
    )
  )
    throw new Error("Startup overlay did not release the app");
  if (
    !(await w.webContents.executeJavaScript(
      `window.initialTracksAnimated && window.initialTracksStaggered && !window.startupTracksFlashed`,
    ))
  )
    throw new Error("Initial track entrance was hidden behind startup");
  console.log("Startup overlay and track entrance verified");
  app.quit();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
