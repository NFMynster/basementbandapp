import { Channel, invoke } from "@tauri-apps/api/core";
import type { Command, DesktopApi } from "../models";

/** True inside the desktop app (not a plain browser tab). */
export function inDesktopApp() {
  return "__TAURI_INTERNALS__" in window;
}

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!inDesktopApp())
    return Promise.reject(
      new Error(
        "Open the desktop app to use audio. Run npm start after building.",
      ),
    );
  // The shell reports failures as plain messages; the UI expects Errors.
  return invoke<T>(command, args).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  });
}

/**
 * Session commands reply on a channel: the shell queues each one the moment
 * it arrives, so rapid slider updates keep their order.
 */
function command(cmd: Command): Promise<never> {
  return new Promise((resolve, reject) => {
    const reply = new Channel<{ ok?: unknown; error?: string }>();
    reply.onmessage = (message) => {
      if (message.error !== undefined) reject(new Error(message.error));
      else resolve(message.ok as never);
    };
    call("command", { command: cmd, reply }).catch(reject);
  });
}

const shell: DesktopApi = {
  soundLibrary: (c) => call("sound_library", { command: c }),
  openLicenses: () => call("open_licenses"),
  openWebsite: () => call("open_website"),
  checkForUpdate: () => call("check_update"),
  installUpdate: () => call("install_update"),
  openRelease: () => call("open_release"),
  openFeedback: () => call("open_feedback"),
  waitUntilVisible: () => call("window_visible"),
  openLogs: () => call("open_logs"),
  restart: () => call("restart"),
  dropFiles: (paths, track, plugin = false) =>
    call("drop_files", { paths, track, plugin }),
  command,
  save: () => call("save"),
  open: () => call("open"),
  importAudio: (track, position) => call("import_audio", { track, position }),
  plugin: (track, bundle = false, append = false) =>
    call("plugin", { track, bundle, append }),
  exportAudio: (options) => call("export_audio", { options }),
};

// Visual tests install a fixture bridge as `window.basement` before the UI
// loads; the app itself always talks to the shell.
function bridge(): DesktopApi {
  return window.basement ?? shell;
}

export const desktop: DesktopApi = {
  soundLibrary: (command) => bridge().soundLibrary(command),
  openLicenses: () => bridge().openLicenses(),
  openWebsite: () => bridge().openWebsite(),
  checkForUpdate: () => bridge().checkForUpdate(),
  installUpdate: () => bridge().installUpdate(),
  openRelease: () => bridge().openRelease(),
  openFeedback: () => bridge().openFeedback(),
  waitUntilVisible: () => bridge().waitUntilVisible?.() ?? Promise.resolve(),
  openLogs: () => bridge().openLogs(),
  restart: () => bridge().restart(),
  dropFiles: (paths, track, plugin) => bridge().dropFiles(paths, track, plugin),
  command: (c) => bridge().command(c),
  save: () => bridge().save(),
  open: () => bridge().open(),
  importAudio: (t, position) => bridge().importAudio(t, position),
  plugin: (t, bundle, append) => bridge().plugin(t, bundle, append),
  exportAudio: (options) => bridge().exportAudio(options),
};
