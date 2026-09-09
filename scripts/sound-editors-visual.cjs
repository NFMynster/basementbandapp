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
      `document.querySelector('.welcome-dialog .modal-close')?.click(); [...document.querySelectorAll('.tab')].find(b=>b.textContent==='EQ').click()`,
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
      if (!tabs.filter(t => ['Export', 'EQ', 'Notes'].includes(t.textContent.trim())).every(t => t.querySelector('svg'))) throw new Error('Missing tab icon');
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
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
