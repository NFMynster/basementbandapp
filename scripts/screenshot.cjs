// Development-only visual smoke test. Runs in Electron, with no microphone capture.
const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "screenshot-preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.on("console-message", (_, level, message) => {
    if (level >= 2) console.error(message);
  });
  await win.loadFile(path.join(__dirname, "../dist/index.html"));
  await new Promise((r) => setTimeout(r, 600));
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
    `document.querySelector('[title="Audio setup"]').click()`,
  );
  await new Promise((r) => setTimeout(r, 200));
  writeFileSync(
    "artifacts/screenshots/setup.png",
    (await win.webContents.capturePage()).toPNG(),
  );
  win.destroy();
  app.quit();
});
