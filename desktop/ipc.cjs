const { ipcMain, dialog, app } = require("electron");
const path = require("node:path");
const { microphoneAccess } = require("./permissions.cjs");
const { LIBRARY_COMMANDS, RENDERER_COMMANDS } = require("./commands.cjs");

const AUDIO_EXTENSIONS = /\.(wav|aif|aiff|flac|mp3)$/i;
const MIDI_EXTENSIONS = /\.(mid|midi)$/i;
const VST3_EXTENSION = /\.vst3$/i;

/**
 * @typedef {import("./types").Snapshot} Snapshot
 * @typedef {import("./types").SnapshotTrack} SnapshotTrack
 * @typedef {import("./types").Request} Request
 */

/** @param {import("electron").IpcMainInvokeEvent} event @param {import("./types").Window} win */
function assertSender(event, win) {
  if (event.sender !== win.webContents) throw new Error("Unknown window");
}

/** @param {Snapshot} state @param {string | undefined} id */
function requireTrack(state, id) {
  const track = state.tracks.find((candidate) => candidate.id === id);
  if (id !== undefined && !track) throw new Error("Track no longer exists");
  return track;
}

/** @param {unknown} position */
function validateImportPosition(position) {
  if (
    position !== undefined &&
    (typeof position !== "number" || !Number.isFinite(position) || position < 0)
  )
    throw new Error("Invalid import position");
}

/** @param {string} file @returns {"audio" | "midi"} */
function mediaKind(file) {
  if (MIDI_EXTENSIONS.test(file)) return "midi";
  if (AUDIO_EXTENSIONS.test(file)) return "audio";
  throw new Error(
    "Drop audio or MIDI files on the arrangement; VST3 plug-ins belong in Plug-ins",
  );
}

/** @param {SnapshotTrack | undefined} track @param {"audio" | "midi"} kind */
function matchesTrackKind(track, kind) {
  return !track || (track.kind || "audio") === kind;
}

/** @param {Request} request @param {string | undefined} trackId @param {Snapshot} state */
async function removeCreatedTrack(request, trackId, state) {
  if (trackId && !state.playing)
    await request({ op: "removeTrack", track: trackId });
}

/** @param {import("./types").Window} win @param {Request} request */
function registerIpc(win, request) {
  /** @type {import("./plugin-library.cjs").PluginLibrary | undefined} */
  let library;
  ipcMain.handle("soundLibrary", async (event, command) => {
    assertSender(event, win);
    if (!command || !LIBRARY_COMMANDS.includes(command.op))
      throw new Error("Unknown library action");
    if (!library) {
      const { PluginLibrary } = require("./plugin-library.cjs");
      const home = app.getPath("home");
      const roots =
        process.platform === "win32"
          ? [
              path.join(
                process.env.CommonProgramFiles ||
                  "C:/Program Files/Common Files",
                "VST3",
              ),
              path.join(
                process.env.LOCALAPPDATA || home,
                "Programs/Common/VST3",
              ),
            ]
          : process.platform === "darwin"
            ? [
                "/Library/Audio/Plug-Ins/VST3",
                path.join(home, "Library/Audio/Plug-Ins/VST3"),
              ]
            : [
                "/usr/lib/vst3",
                "/usr/local/lib/vst3",
                path.join(home, ".vst3"),
              ];
      const root = app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, "..");
      library = new PluginLibrary(
        app.getPath("userData"),
        path.join(
          root,
          "artifacts/native",
          process.platform === "win32" ? "BasementAudio.exe" : "BasementAudio",
        ),
        roots,
      );
    }
    if (command.op === "scanFolder") {
      const result = await dialog.showOpenDialog(win, {
        title: "Scan plug-in folder",
        properties: ["openDirectory"],
      });
      if (result.canceled) return library.command({ op: "list" }, request);
      return library.command(
        { op: "scan", folder: result.filePaths[0] },
        request,
      );
    }
    // Scan paths come only from the system locations or the native folder picker.
    return library.command({ ...command, folder: undefined }, request);
  });
  ipcMain.handle("command", async (event, cmd) => {
    assertSender(event, win);
    if (!cmd || !RENDERER_COMMANDS.has(cmd.op))
      throw new Error("Unknown command");
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
    assertSender(event, win);
    const state = await request({ op: "state" });
    const r = await dialog.showSaveDialog(win, {
      title: "Save session",
      defaultPath: `${state.title.replace(/[<>:"/\\|?*]/g, "_") || "Untitled"}.basement`,
      filters: [{ name: "Basement Band session", extensions: ["basement"] }],
    });
    return r.canceled ? null : request({ op: "save", path: r.filePath });
  });
  ipcMain.handle("open", async (event) => {
    assertSender(event, win);
    const r = await dialog.showOpenDialog(win, {
      filters: [{ name: "Basement Band session", extensions: ["basement"] }],
      properties: ["openFile"],
    });
    return r.canceled ? null : request({ op: "open", path: r.filePaths[0] });
  });
  ipcMain.handle("import", async (event, track, position) => {
    assertSender(event, win);
    const state = await request({ op: "state" });
    if (state.recording) throw new Error("Stop recording before importing");
    const target = requireTrack(state, track);
    validateImportPosition(position);
    const midi = target?.kind === "midi";
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
    let createdTrack;
    if (created) {
      const next = await request({ op: "addTrack", kind: "audio" });
      createdTrack = next.tracks.at(-1);
      track = createdTrack.id;
    }
    try {
      if (created)
        await request({
          op: "track",
          track,
          name: path.parse(r.filePaths[0]).name,
        });
      return await request({
        op: "import",
        track,
        path: r.filePaths[0],
        position,
      });
    } catch (error) {
      await removeCreatedTrack(request, createdTrack?.id, state);
      throw error;
    }
  });
  ipcMain.handle(
    "plugin",
    async (event, track, bundle = false, append = false) => {
      assertSender(event, win);
      const r = await dialog.showOpenDialog(win, {
        title: bundle ? "Choose a VST3 bundle folder" : "Choose a VST3 plugin",
        defaultPath:
          process.platform === "darwin"
            ? "/Library/Audio/Plug-Ins/VST3"
            : app.getPath("home"),
        filters: [{ name: "VST3 plugin", extensions: ["vst3"] }],
        properties: [bundle ? "openDirectory" : "openFile"],
      });
      return r.canceled
        ? null
        : request({
            op: "plugin",
            track,
            path: r.filePaths[0],
            ...(append ? { append: true } : {}),
          });
    },
  );
  ipcMain.handle("drop", async (event, paths, track, plugin) => {
    assertSender(event, win);
    if (
      !Array.isArray(paths) ||
      paths.length < 1 ||
      paths.length > 32 ||
      paths.some((p) => typeof p !== "string" || !path.isAbsolute(p))
    )
      throw new Error("Invalid dropped files");
    if (plugin) {
      if (paths.length !== 1 || !VST3_EXTENSION.test(paths[0]))
        throw new Error("Drop one VST3 file or bundle here");
      const state = await request({ op: "state" });
      const target = requireTrack(state, track);
      return request({
        op: "plugin",
        track,
        path: paths[0],
        ...(target?.pluginName ? { append: true } : {}),
      });
    }
    /** @type {Snapshot} */
    let state = await request({ op: "state" });
    if (state.recording) throw new Error("Stop recording before importing");
    requireTrack(state, track);
    for (const file of paths) {
      const kind = mediaKind(file);
      let target = state.tracks.find((t) => t.id === track);
      if (!matchesTrackKind(target, kind))
        throw new Error("Drop this file on a matching audio or MIDI track");
      const created = !target;
      if (!target) {
        state = await request({ op: "addTrack", kind });
        target = state.tracks.at(-1);
        if (!target) throw new Error("The new track could not be created");
        await request({
          op: "track",
          track: target.id,
          name: path.parse(file).name,
        });
      }
      const trackId = target.id;
      try {
        state = await request({ op: "import", track: trackId, path: file });
      } catch (error) {
        await removeCreatedTrack(request, created ? trackId : undefined, state);
        throw error;
      }
    }
    return state;
  });
  ipcMain.handle("export", async (event, options) => {
    assertSender(event, win);
    if (
      !options ||
      !["separate", "mix"].includes(options.mode) ||
      (options.format !== undefined &&
        !["wav", "flac"].includes(options.format)) ||
      (options.midi !== undefined &&
        !["audio", "midi"].includes(options.midi)) ||
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
          format: options.format || "wav",
          midi: options.midi || "audio",
          track: options.track,
        });
  });
}
module.exports = { assertSender, registerIpc };
