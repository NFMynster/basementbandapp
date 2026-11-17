const { contextBridge, ipcRenderer, webUtils } = require("electron");

/** @param {string} channel @param {unknown[]} args */
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

/** @type {import("../ui/models").DesktopApi} */
const api = {
  openLicenses: () => invoke("licenses"),
  openWebsite: () => invoke("website"),
  checkForUpdate: () => invoke("check-update"),
  openRelease: () => invoke("open-release"),
  openFeedback: () => invoke("feedback"),
  waitUntilVisible: () => invoke("window-visible"),
  openLogs: () => invoke("logs"),
  restart: () => invoke("restart"),
  soundLibrary: (command) => invoke("soundLibrary", command),
  command: (command) => invoke("command", command),
  save: () => invoke("save"),
  open: () => invoke("open"),
  importAudio: (track, position) => invoke("import", track, position),
  plugin: (track, bundle = false, append = false) =>
    invoke("plugin", track, bundle, append),
  exportAudio: (options) => invoke("export", options),
  dropFiles: (files, track, plugin = false) =>
    invoke(
      "drop",
      Array.from(files, (file) => webUtils.getPathForFile(file)),
      track,
      plugin,
    ),
};
contextBridge.exposeInMainWorld("basement", api);
