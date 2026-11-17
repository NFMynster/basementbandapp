// The command contract in one place. Each engine op names the native domain
// handler that owns it (native/Commands.cpp routes the same table) and who may
// send it:
//   renderer: allowed through IPC from the sandboxed UI and typed in ui/models.ts
//   desktop:  sent only by the main process, which validates paths itself
//   test:     accepted only by the engine's test device
// tests/command-contract.test.mjs fails when Commands.cpp or models.ts drift.
const renderer = (domain) => ({ domain, sender: "renderer" });
const desktop = (domain) => ({ domain, sender: "desktop" });
const test = (domain) => ({ domain, sender: "test" });

const ENGINE_COMMANDS = {
  // SessionService applies history itself; these never reach the engine.
  undo: renderer("history"),
  redo: renderer("history"),

  addTrack: renderer("track"),
  duplicateTrack: renderer("track"),
  track: renderer("track"),
  reorderTrack: renderer("track"),
  removeTrack: renderer("track"),

  preset: renderer("plugin"),
  reorderEffect: renderer("plugin"),
  removePlugin: renderer("plugin"),
  bypass: renderer("plugin"),
  editor: renderer("plugin"),
  plugin: desktop("plugin"),
  scanPlugin: desktop("plugin"),

  play: renderer("transport"),
  stop: renderer("transport"),
  record: renderer("transport"),
  seek: renderer("transport"),
  loop: renderer("transport"),
  tempo: renderer("transport"),
  metronome: renderer("transport"),
  countIn: renderer("transport"),
  metronomeVolume: renderer("transport"),
  master: renderer("transport"),
  limiter: renderer("transport"),

  audition: renderer("region"),
  createMidi: renderer("region"),
  editRegions: renderer("region"),
  removeClip: renderer("region"),
  editClip: renderer("region"),
  import: desktop("region"),
  export: desktop("region"),

  state: renderer("session"),
  new: renderer("session"),
  rename: renderer("session"),
  init: desktop("session"),
  restore: desktop("session"),
  snapshot: desktop("session"),

  devices: renderer("device"),
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
