// The command contract in one place. Each engine op names the native domain
// handler that owns it (native/Commands.cpp routes the same table), who may
// send it, and whether SessionService records it for undo:
//   renderer: allowed through IPC from the sandboxed UI and typed in ui/models.ts
//   desktop:  sent only by the main process, which validates paths itself
//   test:     accepted only by the engine's test device
//   undoable: true, or "by-action" when only some editClip actions are undoable
//   edits:    changes the session document, so recovery is written afterwards
//   gesture:  slider drags with a historyGroup collapse into one queued update
//   query:    reads state without changing it
// tests/command-contract.test.mjs fails when Commands.cpp or models.ts drift.

/** @typedef {"history" | "track" | "plugin" | "transport" | "region" | "session" | "device" | "test"} Domain */
/** @typedef {{ undoable?: true | "by-action", edits?: true, gesture?: true, query?: true }} CommandOptions */
/** @typedef {{ domain: Domain, sender: "renderer" | "desktop" | "test" } & CommandOptions} CommandRoute */

/** @param {Domain} domain @param {CommandOptions} [options] @returns {CommandRoute} */
const renderer = (domain, options = {}) => ({
  domain,
  sender: "renderer",
  ...options,
});
/** @param {Domain} domain @param {CommandOptions} [options] @returns {CommandRoute} */
const desktop = (domain, options = {}) => ({
  domain,
  sender: "desktop",
  ...options,
});
/** @param {Domain} domain @returns {CommandRoute} */
const test = (domain) => ({ domain, sender: "test" });
// Most edits are undoable and written to recovery.
const edit = /** @type {const} */ ({ undoable: true, edits: true });
const query = /** @type {const} */ ({ query: true });

/** @type {Record<string, CommandRoute>} */
const ENGINE_COMMANDS = {
  // SessionService applies history itself; these never reach the engine.
  undo: renderer("history"),
  redo: renderer("history"),

  addTrack: renderer("track", edit),
  duplicateTrack: renderer("track", edit),
  track: renderer("track", { ...edit, gesture: true }),
  reorderTrack: renderer("track", edit),
  removeTrack: renderer("track", edit),

  preset: renderer("plugin", edit),
  reorderEffect: renderer("plugin", edit),
  removePlugin: renderer("plugin", edit),
  bypass: renderer("plugin", edit),
  editor: renderer("plugin"),
  plugin: desktop("plugin", edit),
  scanPlugin: desktop("plugin"),

  play: renderer("transport"),
  stop: renderer("transport"),
  record: renderer("transport", { edits: true }),
  seek: renderer("transport"),
  loop: renderer("transport", { edits: true }),
  tempo: renderer("transport", edit),
  metronome: renderer("transport", edit),
  countIn: renderer("transport", edit),
  metronomeVolume: renderer("transport", { ...edit, gesture: true }),
  master: renderer("transport", { ...edit, gesture: true }),
  limiter: renderer("transport", edit),

  audition: renderer("region"),
  createMidi: renderer("region", edit),
  editRegions: renderer("region", edit),
  removeClip: renderer("region", edit),
  editClip: renderer("region", {
    undoable: "by-action",
    edits: true,
    gesture: true,
  }),
  import: desktop("region", edit),
  export: desktop("region"),

  state: renderer("session", query),
  new: renderer("session"),
  rename: renderer("session", edit),
  init: desktop("session"),
  restore: desktop("session"),
  snapshot: desktop("session", query),

  devices: renderer("device", query),
  configure: renderer("device"),
  tuner: renderer("device"),
  clearDiagnostics: renderer("device"),
  clearWarning: renderer("device"),

  testLatency: test("test"),
  testMidi: test("test"),
  pump: test("test"),
};

// Plug-in library actions, handled by PluginLibrary rather than the engine.
const LIBRARY_COMMANDS = [
  "list",
  "scan",
  "scanFolder",
  "favorite",
  "load",
  "savePreset",
  "applyPreset",
  "deletePreset",
];

const RENDERER_COMMANDS = new Set(
  Object.keys(ENGINE_COMMANDS).filter(
    (op) => ENGINE_COMMANDS[op].sender === "renderer",
  ),
);

module.exports = { ENGINE_COMMANDS, LIBRARY_COMMANDS, RENDERER_COMMANDS };
