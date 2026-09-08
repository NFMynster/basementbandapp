import type { DesktopApi } from "../models";
function bridge(): DesktopApi {
  if (!window.basement)
    throw new Error(
      "Open the desktop app to use audio. Run npm start after building.",
    );
  return window.basement;
}
export const desktop: DesktopApi = {
  dropFiles: (files, track, plugin) => bridge().dropFiles(files, track, plugin),
  command: (c) => bridge().command(c),
  save: () => bridge().save(),
  open: () => bridge().open(),
  importAudio: (t) => bridge().importAudio(t),
  plugin: (t, bundle) => bridge().plugin(t, bundle),
  exportAudio: (options) => bridge().exportAudio(options),
};
