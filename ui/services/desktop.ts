import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Command,
  DesktopApi,
  EngineFrame,
  SoundLibrary,
  UpdateStatus,
} from "../models";

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

/** A shell event (`app.emit` in desktop/src); resolves to the unsubscribe. */
function on<T>(event: string, listener: (payload: T) => void) {
  if (!inDesktopApp()) return Promise.resolve(() => {});
  return listen<T>(event, ({ payload }) => listener(payload));
}

/** The desktop shell's commands (desktop/src/main.rs) and events. */
export const desktop: DesktopApi = {
  onSoundLibrary: (listener) => on<SoundLibrary>("sound-library", listener),
  onUpdateStatus: (listener) => on<UpdateStatus>("update-status", listener),
  watchEngine: (onFrame) => {
    const channel = new Channel<EngineFrame>();
    channel.onmessage = onFrame;
    return call("watch_engine", { channel });
  },
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
