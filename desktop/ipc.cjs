const { ipcMain, dialog } = require("electron");
const { microphoneAccess } = require("./permissions.cjs");
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
      "editClip",
      "metronome",
      "countIn",
      "master",
    ];
    if (!cmd || !allowed.includes(cmd.op)) throw new Error("Unknown command");
    if (
      process.platform === "darwin" &&
      (cmd.op === "record" || cmd.op === "configure")
    ) {
      const needsInput =
        cmd.op === "configure"
          ? !!cmd.input
          : (await request({ op: "state" })).tracks.some(
              (t) => t.armed && t.kind !== "midi",
            );
      if (needsInput && !(await microphoneAccess()))
        throw new Error(
          "Allow microphone access in System Settings, then restart the app to record audio.",
        );
    }
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
  ipcMain.handle("import", async (event, track, position) => {
    if (event.sender !== win.webContents) throw new Error("Unknown window");
    const state = await request({ op: "state" });
    if (state.recording) throw new Error("Stop recording before importing");
    if (track !== undefined && !state.tracks.some((t) => t.id === track))
      throw new Error("Track no longer exists");
    if (position !== undefined && (!Number.isFinite(position) || position < 0))
      throw new Error("Invalid import position");
    const midi = state.tracks.find((t) => t.id === track)?.kind === "midi";
    const r = await dialog.showOpenDialog(win, {
      filters: midi
        ? [{ name: "MIDI", extensions: ["mid", "midi"] }]
        : [
            {
              name: "Audio",
              extensions: ["wav", "aif", "aiff", "flac", "mp3"],
            },
          ],
      properties: ["openFile"],
    });
    if (r.canceled) return null;
    const created = track === undefined;
    if (created) {
      const next = await request({ op: "addTrack", kind: "audio" });
      track = next.tracks.at(-1).id;
    }
    try {
      if (created)
        await request({
          op: "track",
          track,
          name: require("node:path").parse(r.filePaths[0]).name,
        });
      return await request({
        op: "import",
        track,
        path: r.filePaths[0],
        position,
      });
    } catch (error) {
      if (created && !state.playing)
        await request({ op: "removeTrack", track });
      throw error;
    }
  });
  ipcMain.handle("plugin", async (event, track, bundle = false) => {
    if (event.sender !== win.webContents) throw new Error("Unknown window");
    const r = await dialog.showOpenDialog(win, {
      title: bundle ? "Choose a VST3 bundle folder" : "Choose a VST3 plugin",
      defaultPath:
        process.platform === "win32"
          ? "C:\\Program Files\\Common Files\\VST3"
          : undefined,
      filters: [{ name: "VST3 plugin", extensions: ["vst3"] }],
      properties: [bundle ? "openDirectory" : "openFile"],
    });
    return r.canceled
      ? null
      : request({ op: "plugin", track, path: r.filePaths[0] });
  });
  ipcMain.handle("drop", async (event, paths, track, plugin) => {
    if (event.sender !== win.webContents) throw new Error("Unknown window");
    if (
      !Array.isArray(paths) ||
      paths.length < 1 ||
      paths.length > 32 ||
      paths.some(
        (p) => typeof p !== "string" || !require("node:path").isAbsolute(p),
      )
    )
      throw new Error("Invalid dropped files");
    if (plugin) {
      if (paths.length !== 1 || !/\.vst3$/i.test(paths[0]))
        throw new Error("Drop one VST3 file or bundle here");
      return request({ op: "plugin", track, path: paths[0] });
    }
    let state = await request({ op: "state" });
    if (state.recording) throw new Error("Stop recording before importing");
    if (track !== undefined && !state.tracks.some((t) => t.id === track))
      throw new Error("Track no longer exists");
    for (const file of paths) {
      if (!/\.(wav|aif|aiff|flac|mp3|mid|midi)$/i.test(file))
        throw new Error(
          "Drop audio or MIDI files on the arrangement; VST3 plug-ins belong in Plug-ins",
        );
      const kind = /\.midi?$/i.test(file) ? "midi" : "audio";
      let target = state.tracks.find((t) => t.id === track);
      if (target && (target.kind || "audio") !== kind)
        throw new Error("Drop this file on a matching audio or MIDI track");
      const created = !target;
      if (created) {
        state = await request({ op: "addTrack", kind });
        target = state.tracks.at(-1);
        await request({
          op: "track",
          track: target.id,
          name: require("node:path").parse(file).name,
        });
      }
      try {
        state = await request({ op: "import", track: target.id, path: file });
      } catch (error) {
        if (created && !state.playing)
          await request({ op: "removeTrack", track: target.id });
        throw error;
      }
    }
    return state;
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
