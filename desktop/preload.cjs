const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("basement", {
  command: (command) => ipcRenderer.invoke("command", command),
  save: () => ipcRenderer.invoke("save"),
  open: () => ipcRenderer.invoke("open"),
  importAudio: (track) => ipcRenderer.invoke("import", track),
  plugin: (track, bundle = false) =>
    ipcRenderer.invoke("plugin", track, bundle),
  exportAudio: (options) => ipcRenderer.invoke("export", options),
  dropFiles: (files, track, plugin = false) =>
    ipcRenderer.invoke(
      "drop",
      Array.from(files, (file) => webUtils.getPathForFile(file)),
      track,
      plugin,
    ),
});
