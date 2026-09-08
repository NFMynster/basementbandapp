const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 1024,
      useContentSize: true,
      transparent: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
        offscreen: true,
      },
    });
    try {
      const svg = fs.readFileSync(
        path.join(__dirname, "../desktop/assets/icon.svg"),
        "utf8",
      );
      await win.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<style>html,body{margin:0;width:1024px;height:1024px;overflow:hidden}svg{display:block}</style>${svg}`,
          ),
      );
      await win.webContents.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      const image = await win.webContents.capturePage();
      fs.writeFileSync(
        "desktop/assets/icon.png",
        image.resize({ width: 1024, height: 1024 }).toPNG(),
      );
      const png = image.resize({ width: 256, height: 256 }).toPNG();
      const header = Buffer.alloc(22);
      header.writeUInt16LE(1, 2);
      header.writeUInt16LE(1, 4);
      header.writeUInt16LE(1, 10);
      header.writeUInt16LE(32, 12);
      header.writeUInt32LE(png.length, 14);
      header.writeUInt32LE(22, 18);
      fs.writeFileSync("desktop/assets/icon.ico", Buffer.concat([header, png]));
    } finally {
      win.destroy();
      app.quit();
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
