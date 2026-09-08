// Development-only visual smoke test. Runs in Electron, with no microphone capture.
const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1440,
      height: 960,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "screenshot-preload.cjs"),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    win.webContents.on("console-message", (_, level, message) => {
      if (level >= 2) console.error(message);
    });
    await win.loadFile(path.join(__dirname, "../dist/index.html"));
    await win.webContents.insertCSS(
      "*, *::before, *::after { animation: none !important; transition: none !important; }",
    );
    await new Promise((r) => setTimeout(r, 600));
    await win.webContents.executeJavaScript(
      `document.querySelector('.welcome-dialog .modal-close')?.click()`,
    );
    await new Promise((r) => setTimeout(r, 100));
    mkdirSync("artifacts/screenshots", { recursive: true });
    writeFileSync(
      "artifacts/screenshots/workspace.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Track appearance"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 80));
    const meterStyle = await win.webContents.insertCSS(
      ".level-slider { --signal: 62% !important; }",
    );
    await new Promise((r) => setTimeout(r, 100));
    console.log(
      await win.webContents.executeJavaScript(
        `(() => { const e = document.querySelector('.level-slider-trough i'); const s = getComputedStyle(e); return { level: getComputedStyle(e.parentElement.parentElement).getPropertyValue('--signal'), width: s.width, height: s.height, background: s.backgroundImage }; })()`,
      ),
    );
    writeFileSync(
      "artifacts/screenshots/appearance.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.removeInsertedCSS(meterStyle);
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    await new Promise((r) => setTimeout(r, 50));
    const result = await win.webContents.executeJavaScript(
      `({title:document.title,tracks:document.querySelectorAll('.track-header').length,clips:document.querySelectorAll('.clip').length,overflow:document.documentElement.scrollWidth>window.innerWidth})`,
    );
    console.log(JSON.stringify(result));
    await win.webContents.executeJavaScript(
      `document.querySelector('[title="Input settings"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 200));
    writeFileSync(
      "artifacts/screenshots/setup.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    win.setSize(1100, 700);
    await win.webContents.capturePage();
    for (const scroll of [0, 100000]) {
      await win.webContents.executeJavaScript(
        `document.querySelector('.modal-scroll').scrollTop = ${scroll}`,
      );
      await win.webContents.capturePage();
      const visible = await win.webContents.executeJavaScript(`(() => {
        const panel = document.querySelector('.modal');
        const body = document.querySelector('.modal-scroll');
        const button = document.querySelector('.modal-fixed-footer .primary').getBoundingClientRect();
        return button.top >= 0 && button.bottom <= innerHeight && getComputedStyle(panel).overflow === 'hidden'
          && body.getBoundingClientRect().bottom <= button.top;
      })()`);
      if (!visible)
        throw new Error(
          "Settings Done must remain visible outside the clipped scrolling body",
        );
    }
    writeFileSync(
      "artifacts/screenshots/setup-small.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    for (const output of ["Unavailable", "Headphones"]) {
      await win.webContents.executeJavaScript(`(() => {
      const select = [...document.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Output device')).querySelector('select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(output)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
      await new Promise((r) => setTimeout(r, 100));
      await win.webContents.executeJavaScript(
        `document.querySelector('.modal-bottom .primary').click()`,
      );
      await new Promise((r) => setTimeout(r, 100));
      const result = await win.webContents.executeJavaScript(
        `(async () => ({open:!!document.querySelector('[role="dialog"]'), error:!!document.querySelector('[role="alert"]'), output:(await window.basement.command({op:'devices'})).output}))()`,
      );
      if (
        output === "Unavailable"
          ? !result.open || !result.error
          : result.open || result.output !== "Headphones"
      )
        throw new Error(
          "Done did not apply audio settings safely: " + JSON.stringify(result),
        );
    }
    console.log(
      "Audio setup: Done applies changes; failures keep the dialog open.",
    );
    await win.webContents.executeJavaScript(`(() => {
      document.querySelector('.modal-close')?.click();
      document.querySelector('.toast.error button[title="Dismiss"]')?.click();
      document.querySelector('[data-track-header="m"]').click();
      [...document.querySelectorAll('.tabs button')].find(b => b.textContent.includes('Plug-ins')).click();
    })()`);
    await new Promise((r) => setTimeout(r, 100));
    const chain = await win.webContents.executeJavaScript(`(() => {
      const slots = document.querySelectorAll('.plugin-slot');
      const button = [...document.querySelectorAll('.plugin-details button')].find(b => b.textContent.includes('Add VST3 effect'));
      button.scrollIntoView({ block: 'nearest' });
      return slots.length;
    })()`);
    if (chain !== 3)
      throw new Error("Instrument and both effect slots must render");
    win.showInactive();
    await new Promise((r) => setTimeout(r, 250));
    writeFileSync(
      "artifacts/screenshots/plugin-chain.png",
      (await win.webContents.capturePage()).toPNG(),
    );
    win.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
