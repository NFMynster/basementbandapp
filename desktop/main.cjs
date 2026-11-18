const {
  app,
  BrowserWindow,
  dialog,
  Tray,
  Menu,
  nativeImage,
  net,
  shell,
  ipcMain,
} = require("electron");
const path = require("node:path");
const { mkdirSync } = require("node:fs");
const { startBackend } = require("./backend.cjs");
const { assertSender, registerIpc } = require("./ipc.cjs");
const { initializeLogging } = require("./logging.cjs");
const { microphoneAccess } = require("./permissions.cjs");
const {
  RELEASE_PAGE,
  checkForUpdate,
  startAutoUpdate,
} = require("./updates.cjs");
const smoke = process.env.BASEMENT_SMOKE === "1";
if (smoke) {
  const data = path.resolve("artifacts/smoke-user");
  mkdirSync(data, { recursive: true });
  app.setPath("userData", data);
}
/** @type {import("./session-service.cjs").SessionService | undefined} */
let backend;
let tray;
/** @type {unknown} */
let startupError;
/** @type {Promise<void>} */
let backendReady;
let updateCheck;
/** @type {ReturnType<typeof startAutoUpdate> | undefined} */
let autoUpdate;
/** @type {import("./types").Request} */
const request = (command) =>
  backendReady.then(() =>
    backend ? backend.request(command) : Promise.reject(startupError),
  );
app.whenReady().then(() => {
  app.setAppLogsPath(
    process.platform === "darwin"
      ? path.join(app.getPath("home"), "Library", "Logs", "Basement Band")
      : path.join(app.getPath("userData"), "logs"),
  );
  initializeLogging(app.getPath("logs"));
  backendReady = (async () => {
    try {
      const inputAllowed = await microphoneAccess();
      backend = startBackend(
        app.isPackaged ? process.resourcesPath : path.join(__dirname, ".."),
        path.join(app.getPath("userData"), "Sessions"),
        inputAllowed,
      );
    } catch (error) {
      startupError = error;
      console.error("Audio startup failed", error);
    }
  })();
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 940,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#191a1e",
    title: "Basement Band",
    icon: path.join(__dirname, "assets/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !smoke,
    },
  });
  if (!smoke) {
    const icon = nativeImage.createFromPath(
      path.join(__dirname, "assets/icon.png"),
    );
    if (!icon.isEmpty()) {
      tray = new Tray(icon.resize({ width: 24, height: 24 }));
      tray.setToolTip("Basement Band");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: "Open Basement Band",
            click: () => {
              win.show();
              win.focus();
            },
          },
          { label: "Quit", click: () => app.quit() },
        ]),
      );
      tray.on("click", () => {
        win.show();
        win.focus();
      });
    }
  }
  win.once("ready-to-show", () => {
    if (!smoke) win.show();
  });
  ipcMain.handle("window-visible", async (event) => {
    assertSender(event, win);
    if (smoke || win.isVisible()) return;
    await new Promise((resolve) => win.once("show", () => resolve(undefined)));
  });
  win.webContents.on("did-fail-load", (_event, code, description) => {
    if (code === -3) return;
    dialog.showErrorBox("Could not open Basement Band", description);
    app.quit();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("close", (event) => {
    if (!recoveryFlushed && backend) {
      event.preventDefault();
      app.quit();
    }
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  registerIpc(win, request);
  ipcMain.handle("website", (event) => {
    assertSender(event, win);
    return shell.openExternal("https://footstomp.studio/");
  });
  ipcMain.handle("check-update", (event) => {
    assertSender(event, win);
    if (smoke) return { available: false };
    if (app.isPackaged && process.platform === "win32") {
      autoUpdate ??= startAutoUpdate();
      return autoUpdate.status();
    }
    updateCheck ??= checkForUpdate(
      (url, options) => net.fetch(url, options),
      app.getVersion(),
    );
    return updateCheck;
  });
  ipcMain.handle("install-update", async (event) => {
    assertSender(event, win);
    if (autoUpdate?.status().state !== "ready") return;
    // Preserve the session through recovery first, exactly like a normal
    // quit, so the installer never interrupts the engine mid-write.
    if (backend && !recoveryFlushed) {
      await backend.close();
      recoveryFlushed = true;
    }
    autoUpdate.install();
  });
  ipcMain.handle("open-release", (event) => {
    assertSender(event, win);
    return shell.openExternal(RELEASE_PAGE);
  });
  ipcMain.handle("feedback", (event) => {
    assertSender(event, win);
    const subject = encodeURIComponent("Basement Band feedback");
    const body = encodeURIComponent(
      `Hi NFMynster,\n\n[Write your feedback, bug report, or suggestion here]\n\nWhat I was doing:\n\nWhat happened:\n\nWhat I expected:\n\n---\nBasement Band ${app.getVersion()} · ${process.platform}`,
    );
    return shell.openExternal(
      `mailto:nfmynster@footstomp.studio?subject=${subject}&body=${body}`,
    );
  });
  ipcMain.handle("logs", (event) => {
    assertSender(event, win);
    return shell.openPath(app.getPath("logs"));
  });
  ipcMain.handle("licenses", (event) => {
    assertSender(event, win);
    return shell.openPath(
      app.isPackaged
        ? path.join(process.resourcesPath, "licenses")
        : path.join(__dirname, "../artifacts/licenses"),
    );
  });
  ipcMain.handle("restart", (event) => {
    assertSender(event, win);
    app.relaunch();
    app.quit();
  });
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
let recoveryFlushed = false;
let quitPending = false;
app.on("before-quit", (event) => {
  if (recoveryFlushed || !backend) return;
  event.preventDefault();
  if (quitPending) return;
  quitPending = true;
  void backend
    .close()
    .then(() => {
      recoveryFlushed = true;
      app.quit();
    })
    .catch((/** @type {unknown} */ error) => {
      quitPending = false;
      console.error("Session recovery on exit failed", error);
      const choice = dialog.showMessageBoxSync({
        type: "error",
        buttons: ["Keep app open", "Quit without recovery"],
        defaultId: 0,
        cancelId: 0,
        message: "Your latest session could not be preserved.",
        detail: error instanceof Error ? error.message : String(error),
      });
      if (choice === 1) {
        backend?.engine.close();
        recoveryFlushed = true;
        app.quit();
      }
    });
});
