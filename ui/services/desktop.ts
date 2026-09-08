import type { DesktopApi } from "../models";
function bridge(): DesktopApi {
  if (!window.basement)
    throw new Error(
      "Open the desktop app to use audio. Run npm start after building.",
    );
  return window.basement;
}
export const desktop: DesktopApi = {
  openLicenses: () => bridge().openLicenses(),
  openLogs: () => bridge().openLogs(),
  restart: () => bridge().restart(),
  dropFiles: (files, track, plugin) => bridge().dropFiles(files, track, plugin),
  command: (c) => bridge().command(c),
  save: () => bridge().save(),
  open: () => bridge().open(),
  importAudio: (t, position) => bridge().importAudio(t, position),
  plugin: (t, bundle) => bridge().plugin(t, bundle),
  exportAudio: (options) => bridge().exportAudio(options),
};
