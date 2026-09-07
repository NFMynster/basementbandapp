const { ipcMain, dialog, systemPreferences } = require("electron");
function registerIpc(win, request) {
  ipcMain.handle("command", async (event, cmd) => {
    if (event.sender !== win.webContents) throw new Error("Unknown window");
    const allowed = [
      "state",
      "devices",
      "configure",
      "track",
      "addTrack",
      "removeTrack",
      "play",
      "stop",
      "record",
      "seek",
      "loop",
      "tempo",
      "new",
      "rename",
      "removeClip",
      "removePlugin",
      "clearWarning",
      "bypass",
      "editor",
    ];
    if (!cmd || !allowed.includes(cmd.op)) throw new Error("Unknown command");
    if (
      cmd.op === "record" &&
      process.platform === "darwin" &&
      !(await systemPreferences.askForMediaAccess("microphone"))
    )
      throw new Error("Allow microphone access in System Settings to record.");
    return request(cmd);
  });
  ipcMain.handle("save", async (event) => {
    if (event.sender !== win.webContents) throw new Error("Unknown window");
    const r = await dialog.showSaveDialog(win, {
      title: "Save session",
      defaultPath: `${(await request({ op: "state" })).title.replace(/[<>:"/\\|?*]/g, "_") || "Untitled"}.basement`,
      filters: [{ name: "Basement Band session", extensions: ["basement"] }],
    });
    return r.canceled ? null : request({ op: "save", path: r.filePath });
  });
  ipcMain.handle("open", async (event) => {
    if (event.sender !== win.webContents) throw new Error("Unknown window");
    const r = await dialog.showOpenDialog(win, {
      filters: [{ name: "Basement Band session", extensions: ["basement"] }],
      properties: ["openFile"],
    });
    return r.canceled ? null : request({ op: "open", path: r.filePaths[0] });
  });
  ipcMain.handle("import", async (event, track) => {
    if (event.sender !== win.webContents) throw new Error("Unknown window");
    const r = await dialog.showOpenDialog(win, {
      filters: [
        { name: "Audio", extensions: ["wav", "aif", "aiff", "flac", "mp3"] },
      ],
      properties: ["openFile"],
    });
    return r.canceled
      ? null
      : request({ op: "import", track, path: r.filePaths[0] });
  });
  ipcMain.handle("plugin", async (event, track) => {
    if (event.sender !== win.webContents) throw new Error("Unknown window");
    const r = await dialog.showOpenDialog(win, {
      title: "Choose a VST3 plugin",
      defaultPath:
        process.platform === "win32"
          ? "C:\\Program Files\\Common Files\\VST3"
          : undefined,
      filters: [{ name: "VST3 plugin", extensions: ["vst3"] }],
      properties: [
        process.platform === "win32" || process.platform === "linux"
          ? "openDirectory"
          : "openFile",
      ],
    });
    return r.canceled
      ? null
      : request({ op: "plugin", track, path: r.filePaths[0] });
  });
  ipcMain.handle("export", async (event, options) => {
    if (event.sender !== win.webContents) throw new Error("Unknown window");
    if (
      !options ||
      !["separate", "mix"].includes(options.mode) ||
      (options.track !== undefined && typeof options.track !== "string")
    )
      throw new Error("Invalid export options");
    const r = await dialog.showOpenDialog(win, {
      title: "Choose export folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return r.canceled
      ? null
      : request({
          op: "export",
          path: r.filePaths[0],
          mode: options.mode,
          track: options.track,
        });
  });
}
module.exports = { registerIpc };
