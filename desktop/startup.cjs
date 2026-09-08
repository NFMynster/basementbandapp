const { BrowserWindow } = require("electron");
const path = require("node:path");

function createSplash(hidden) {
  const splash = new BrowserWindow({
    width: 480,
    height: 320,
    show: false,
    resizable: false,
    maximizable: false,
    backgroundColor: "#191a1e",
    autoHideMenuBar: true,
    title: "Basement Band",
    icon: path.join(__dirname, "assets/icon.png"),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  splash.once("ready-to-show", () => {
    if (!hidden && !splash.isDestroyed()) splash.show();
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  return splash;
}

module.exports = { createSplash };
