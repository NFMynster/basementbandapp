const { app, BrowserWindow } = require("electron");
const { writeFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");
app
  .whenReady()
  .then(async () => {
    const w = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "screenshot-preload.cjs"),
        sandbox: true,
        backgroundThrottling: false,
        contextIsolation: true,
      },
    });
    await w.loadFile(path.join(__dirname, "../dist/index.html"));
    await new Promise((r) => setTimeout(r, 700));
    await w.webContents.executeJavaScript(
      `document.querySelector('.welcome-dialog .modal-close')?.click(); [...document.querySelectorAll('.tab')].find(b=>b.textContent==='EQ & Effects').click()`,
    );
    await new Promise((r) => setTimeout(r, 700));
    // Exercise both dividers with actual Electron pointer input.
    for (const [label, dx, dy] of [
      ["Track sidebar width", 80, 0],
      ["Properties panel height", 0, -60],
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
        throw new Error(`${label} did not resize: ${before.value} -> ${after}`);
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
    await new Promise((r) => setTimeout(r, 700));
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
      `document.querySelector('[aria-label="Restore MIDI editor"]').click()`,
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

    await w.webContents.executeJavaScript(
      `document.querySelector('.welcome-dialog .modal-close')?.click()`,
    );
    w.showInactive();
    await new Promise((r) => setTimeout(r, 250));
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
    writeFileSync(
      "artifacts/screenshots/startup-overlay.png",
      (await w.webContents.capturePage()).toPNG(),
    );
    await new Promise((r) => setTimeout(r, 1300));
    if (
      await w.webContents.executeJavaScript(
        `!!document.querySelector('[data-startup]') || document.querySelector('.app').inert`,
      )
    )
      throw new Error("Startup overlay did not release the app");
    console.log("Startup overlay and transition verified");
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
