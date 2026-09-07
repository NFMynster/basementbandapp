const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const { mkdirSync } = require("node:fs");
const { startBackend } = require("./backend.cjs");
const { registerIpc } = require("./ipc.cjs");
const smoke = process.env.BASEMENT_SMOKE === "1";
if (smoke) {
  const data = path.resolve("artifacts/smoke-user");
  mkdirSync(data, { recursive: true });
  app.setPath("userData", data);
}
let backend;
let startupError;
const request = (command) =>
  backend ? backend.request(command) : Promise.reject(startupError);
app.whenReady().then(() => {
  try {
    backend = startBackend(
      app.isPackaged ? process.resourcesPath : path.join(__dirname, ".."),
      path.join(app.getPath("userData"), "Sessions"),
    );
  } catch (error) {
    startupError = error;
  }
  const win = new BrowserWindow({
    show: !smoke,
    width: 1440,
    height: 940,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#191a1e",
    title: "Basement Band",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "question",
      buttons: ["Keep working", "Close without saving"],
      defaultId: 0,
      cancelId: 0,
      title: "Unsaved session",
      message: "Close this session without saving your latest edits?",
      detail:
        "Recording will stop. Captured WAV files remain in the local session folder.",
    });
    if (choice === 1) event.preventDefault();
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  registerIpc(win, request);
  if (smoke) require("./smoke.cjs").verifyDesktop(win, request);
  if (process.env.BASEMENT_DEV === "1") {
    const url = new URL(
      process.env.BASEMENT_DEV_URL || "http://127.0.0.1:5173",
    );
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
      throw new Error("The development UI must use loopback HTTP");
    win.loadURL(url.href);
  } else win.loadFile(path.join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => backend?.close());
