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
    const count = await w.webContents.executeJavaScript(
      `document.querySelectorAll('.piano-note').length`,
    );
    if (count !== 32) throw new Error("Missing editor notes: " + count);
    const layout = await w.webContents.executeJavaScript(`(() => {
      const tabs = [...document.querySelectorAll('.tab')];
      if (!tabs.filter(t => ['EQ & Effects', 'Notes'].includes(t.textContent.trim())).every(t => t.querySelector('svg'))) throw new Error('Missing tab icon');
      if (!document.querySelector('.align-notes').textContent.includes('(quantization)')) throw new Error('Missing beat alignment');
      return { width: document.querySelector('.track-sidebar').getBoundingClientRect().width, height: document.querySelector('.inspector').getBoundingClientRect().height };
    })()`);
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
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
