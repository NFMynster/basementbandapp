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
    win.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
