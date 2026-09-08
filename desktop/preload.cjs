const { contextBridge, ipcRenderer, webUtils } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("basement", {
  openLicenses: () => invoke("licenses"),
  openLogs: () => invoke("logs"),
  restart: () => invoke("restart"),
  command: (command) => invoke("command", command),
  save: () => invoke("save"),
  open: () => invoke("open"),
  importAudio: (track, position) => invoke("import", track, position),
  plugin: (track, bundle = false) => invoke("plugin", track, bundle),
  exportAudio: (options) => invoke("export", options),
  dropFiles: (files, track, plugin = false) =>
    invoke(
      "drop",
      Array.from(files, (file) => webUtils.getPathForFile(file)),
      track,
      plugin,
    ),
});
