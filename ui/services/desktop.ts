import type { DesktopApi } from "../models";
function bridge(): DesktopApi {
  if (!window.basement)
    throw new Error(
      "Open the desktop app to use audio. Run npm start after building.",
    );
  return window.basement;
}
export const desktop: DesktopApi = {
  soundLibrary: (command) => bridge().soundLibrary(command),
  openLicenses: () => bridge().openLicenses(),
  openWebsite: () => bridge().openWebsite(),
  waitUntilVisible: () => bridge().waitUntilVisible?.() ?? Promise.resolve(),
  openLogs: () => bridge().openLogs(),
  restart: () => bridge().restart(),
  dropFiles: (files, track, plugin) => bridge().dropFiles(files, track, plugin),
  command: (c) => bridge().command(c),
  save: () => bridge().save(),
  open: () => bridge().open(),
  importAudio: (t, position) => bridge().importAudio(t, position),
  plugin: (t, bundle, append) => bridge().plugin(t, bundle, append),
  exportAudio: (options) => bridge().exportAudio(options),
};
