const { contextBridge } = require("electron");
// Explicit visual fixture; never used by the app or its audio engine.
// The bridge is checked against DesktopApi so it cannot drift from the real one.
/**
 * @typedef {import("../ui/models").Session} Session
 * @typedef {import("../ui/models").Track} Track
 * @typedef {import("../ui/models").Command
 *   | { op: "testAddTrack" | "testRemoveTrack" | "testTakes" }
 *   | { op: "testAudioLoad", value: number }} MockCommand
 *   Real commands plus fixture-only ops the visual scripts send.
 */
/**
 * @param {string} id
 * @param {string} name
 * @param {string} color
 * @param {number} input
 * @returns {Track}
 */
const track = (id, name, color, input) => ({
  id,
  name,
  color,
  input,
  icon: "guitar",
  kind: "audio",
  monitor: false,
  armed: true,
  mute: false,
  solo: false,
  gain: 0.8,
  pan: 0,
  peak: 0,
  pluginName: "",
  bypass: false,
  midiDevice: "",
  midiChannel: 0,
  recordStart: 0,
  clips: [
    {
      id: "clip" + id,
      kind: "audio",
      active: true,
      name: name + " · take 1",
      start: 0,
      duration: 16,
      offset: 0,
      sourceStart: 0,
      sourceEnd: 16,
      takeGroup: "",
      take: 0,
      peaks: Array.from(
        { length: 400 },
        (_, i) =>
          0.1 + 0.65 * Math.abs(Math.sin(i * 0.137)) * Math.exp(-(i % 25) / 17),
      ),
    },
  ],
});
/** @type {Session} */
const state = {
  title: "Friday night",
  tracks: [
    track("g", "Guitar", "#58a9e8", 0),
    track("b", "Bass", "#c093eb", 1),
    {
      ...track("m", "Drums", "#b0c4a7", 0),
      kind: "midi",
      midiDevice: "pad",
      midiChannel: 10,
      pluginName: "Drum instrument (fixture)",
      effects: [
        { id: "reverb", name: "Room reverb (fixture)", bypass: false },
        { id: "compressor", name: "Stereo compressor (fixture)", bypass: true },
      ],
      clips: [
        {
          id: "m1",
          name: "Drums take",
          kind: "midi",
          start: 0,
          duration: 16,
          offset: 0,
          sourceStart: 0,
          sourceEnd: 16,
          takeGroup: "",
          take: 0,
          peaks: [],
          active: true,
          notes: Array.from({ length: 32 }, (_, i) => ({
            event: i * 2,
            start: i * 0.5,
            duration: 0.15,
            note: i % 2 ? 38 : 36,
          })),
        },
      ],
    },
  ],
  position: 3,
  playing: false,
  recording: false,
  looping: true,
  loopStart: 0,
  loopEnd: 8,
  tempo: 120,
  sampleRate: 48000,
  bufferSize: 256,
  device: "Audio interface (visual fixture)",
  deviceError: "",
  diskOverrun: false,
  audioCpu: 3.2,
  limiterEnabled: true,
  inputLatencySamples: 128,
  outputLatencySamples: 256,
  deviceDropouts: 0,
  processingDropouts: 0,
  recordingDropouts: 0,
};
const devices = {
  midiInputs: [{ id: "pad", name: "USB drum pad (fixture)" }],
  types: [
    {
      name: "WASAPI",
      inputs: ["Audio interface"],
      outputs: ["Audio interface", "Headphones", "Unavailable"],
    },
  ],
  type: "WASAPI",
  input: "Audio interface",
  output: "Audio interface",
  channels: ["Input 1", "Input 2"],
  rates: [44100, 48000],
  buffers: [128, 256, 512],
  sampleRate: 48000,
  bufferSize: 256,
};
let startupDelayed = false;
/** @param {string | undefined} id */
const fixtureTrack = (id) => {
  const found = state.tracks.find((t) => t.id === id);
  if (!found) throw new Error("Unknown fixture track " + id);
  return found;
};
/** @param {MockCommand} c */
async function mockCommand(c) {
  if (
    c.op === "state" &&
    location.search.includes("startup=slow") &&
    !startupDelayed
  ) {
    startupDelayed = true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (c.op === "testAddTrack")
    state.tracks.push({
      ...track("animated", "New track", "#b0c4a7", 0),
      clips: [],
    });
  if (c.op === "testRemoveTrack")
    state.tracks = state.tracks.filter((t) => t.id !== "g");
  if (c.op === "testTakes") {
    const t = fixtureTrack("b");
    Object.assign(t.clips[0], { takeGroup: "bass-takes", take: 1 });
    t.clips.push({
      ...t.clips[0],
      id: "bass-take-2",
      take: 2,
      active: false,
    });
  }
  if (c.op === "editClip" && c.action === "take") {
    const t = fixtureTrack(c.track);
    for (const clip of t.clips) clip.active = clip.id === c.clip;
  }
  if (c.op === "devices") return devices;
  if (c.op === "metronomeVolume") state.metronomeGain = c.value;
  if (c.op === "metronomeSound") state.metronomeSound = c.value;
  if (c.op === "testAudioLoad") {
    state.audioCpu = c.value;
    state.processingDropouts = 2;
  }
  if (c.op === "tuner") {
    state.tunerTrack = c.track ?? "";
    state.tunerFrequency = c.track ? 82.41 : 0;
  }
  if (c.op === "configure") {
    if (c.output === "Unavailable") throw new Error("Test output unavailable");
    Object.assign(devices, c);
    return devices;
  }
  if (c.op === "track") Object.assign(fixtureTrack(c.track), c);
  if (c.op === "limiter") state.limiterEnabled = c.value;
  return state;
}
/** @type {import("../ui/models").DesktopApi} */
const api = {
  soundLibrary: async (c) => {
    const library = {
      plugins: [],
      presets: [],
      starters: ["clean", "crunch", "lead", "bass"].map((character) => ({
        id: "starter-" + character,
        name: character,
        hint: "",
      })),
      scanning: false,
      progress: "",
      errors: [],
    };
    if (c?.op !== "applyPreset") return library;
    const t = fixtureTrack(c.track);
    Object.assign(t, {
      ampCharacter: /** @type {import("../ui/models").AmpCharacter} */ (
        String(c.id).replace("starter-", "")
      ),
      ampBypass: false,
    });
    return { ...library, session: structuredClone(state) };
  },
  // The mock also accepts fixture-only ops, so its own signature is wider.
  command: /** @type {import("../ui/models").DesktopApi["command"]} */ (
    /** @type {unknown} */ (mockCommand)
  ),
  save: async () => null,
  open: async () => null,
  plugin: async () => null,
  importAudio: async () => null,
  exportAudio: async () => null,
  checkForUpdate: async () => ({ available: true, version: "0.2.0" }),
  installUpdate: async () => undefined,
  openRelease: async () => undefined,
  openFeedback: async () => undefined,
  openLicenses: async () => "",
  openLogs: async () => "",
  openWebsite: async () => undefined,
  restart: async () => undefined,
  dropFiles: async () => state,
};
contextBridge.exposeInMainWorld("basement", api);
