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
    console.log("EQ and MIDI editor rendered; 32 notes present");
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
