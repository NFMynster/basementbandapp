const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("basement", {
  command: (command) => ipcRenderer.invoke("command", command),
  save: () => ipcRenderer.invoke("save"),
  open: () => ipcRenderer.invoke("open"),
  importAudio: (track) => ipcRenderer.invoke("import", track),
  plugin: (track) => ipcRenderer.invoke("plugin", track),
  exportAudio: (options) => ipcRenderer.invoke("export", options),
});
