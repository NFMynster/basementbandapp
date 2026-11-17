const { contextBridge } = require("electron");
// Demo session for the product video; never used by the app or its audio engine.
// Mirrors the bridge in scripts/screenshot-preload.cjs with a fuller rehearsal.
const rng = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
// Peaks at 25 per second: a beat-synced envelope with some noise on top.
const peaks = (seconds, seed, { level = 0.6, attack = 4, decay = 9 } = {}) => {
  const random = rng(seed);
  return Array.from({ length: Math.round(seconds * 25) }, (_, i) => {
    const beat = i % 12.5;
    const envelope = beat < attack ? beat / attack : Math.exp(-(beat - attack) / decay);
    const swell = 0.75 + 0.25 * Math.sin(i / 37);
    return Math.min(0.95, 0.06 + level * swell * (0.35 + 0.65 * envelope) * (0.7 + 0.3 * random()));
  });
};
const audio = (id, name, color, icon, input, clips) => ({
  id,
  name,
  color,
  icon,
  input,
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
  clips,
});
const clip = (id, name, start, duration, data, extra = {}) => ({
  id,
  kind: "audio",
  active: true,
  position: 0,
  name,
  start,
  duration,
  peaks: data,
  ...extra,
});
const groove = [];
for (let bar = 0; bar < 14; ++bar) {
  const t = bar * 2;
  for (let i = 0; i < 8; ++i)
    groove.push({ start: t + i * 0.25, duration: 0.1, note: 42, velocity: i % 2 ? 70 : 100 });
  for (const k of [0, 1, 1.25]) groove.push({ start: t + k, duration: 0.15, note: 36, velocity: 115 });
  for (const s of [0.5, 1.5]) groove.push({ start: t + s, duration: 0.15, note: 38, velocity: 110 });
}
groove.sort((a, b) => a.start - b.start).forEach((n, i) => (n.event = i));
const state = {
  title: "Friday night",
  tracks: [
    {
      ...audio("g", "Guitar", "#58a9e8", "guitar", 0, [
        clip("g1", "Guitar · take 1", 0, 28, peaks(28, 7, { level: 0.62, attack: 1, decay: 14 })),
      ]),
      eqBass: 2.5,
      eqMid: -3,
      eqMidFrequency: 700,
      eqTreble: 4,
      eqLowCut: 80,
    },
    audio("b", "Bass", "#c093eb", "bass", 1, [
      clip("b1", "Bass · take 2", 0, 28, peaks(28, 11, { level: 0.55, attack: 1, decay: 6 }), {
        takeGroup: "bass-takes",
        take: 2,
      }),
      clip("b0", "Bass · take 1", 0, 28, peaks(28, 5, { level: 0.5, attack: 1, decay: 6 }), {
        takeGroup: "bass-takes",
        take: 1,
        active: false,
      }),
    ]),
    audio("v", "Vocals", "#ed8f94", "mic", 2, [
      clip("v1", "Vocals · take 1", 4, 24, peaks(24, 3, { level: 0.7, attack: 6, decay: 20 })),
    ]),
    {
      ...audio("m", "Drums", "#b0c4a7", "drums", 0, []),
      kind: "midi",
      midiDevice: "pad",
      midiChannel: 10,
      pluginName: "Drum kit",
      effects: [
        { id: "reverb", name: "Room reverb", bypass: false },
        { id: "compressor", name: "Bus compressor", bypass: false },
      ],
      clips: [
        { id: "m1", name: "Drums take", kind: "midi", start: 0, duration: 28, peaks: [], active: true, notes: groove },
      ],
    },
  ],
  position: 0,
  playing: false,
  recording: false,
  // Only the loop-takes shot turns the loop on (demoLoop).
  looping: false,
  loopStart: 0,
  loopEnd: 0,
  tempo: 120,
  sampleRate: 48000,
  bufferSize: 64,
  device: "Audio interface",
  deviceError: "",
  diskOverrun: false,
  audioCpu: 3.2,
  limiterEnabled: true,
  inputLatencySamples: 64,
  outputLatencySamples: 64,
  deviceDropouts: 0,
  processingDropouts: 0,
  recordingDropouts: 0,
};
const plugins = [
  ["Drum Kit", true],
  ["Grand Piano", true],
  ["Electric Piano", true],
  ["Synth Bass", true],
  ["String Ensemble", true],
  ["Analog Pad", true],
  ["Tape Delay", false],
  ["Plate Reverb", false],
  ["Amp Simulator", false],
].map(([name, instrument], i) => ({
  id: "p" + i,
  name,
  manufacturer: "Example plug-in",
  path: "",
  instrument,
  favorite: i === 0,
  recent: 0,
}));
const devices = {
  midiInputs: [{ id: "pad", name: "USB drum pad" }],
  types: [{ name: "ASIO", inputs: ["Audio interface"], outputs: ["Audio interface"] }],
  type: "ASIO",
  input: "Audio interface",
  output: "Audio interface",
  channels: ["Input 1", "Input 2", "Input 3", "Input 4"],
  rates: [44100, 48000],
  buffers: [64, 128, 256, 512],
  sampleRate: 48000,
  bufferSize: 64,
};
contextBridge.exposeInMainWorld("basement", {
  // Placeholder names standing in for whatever VST3 plug-ins a user has installed.
  soundLibrary: async () => ({ plugins, presets: [], scanning: false, progress: "", errors: [] }),
  command: async (c) => {
    if (c.op === "editClip" && c.action === "take") {
      const t = state.tracks.find((t) => t.id === c.track);
      for (const clip of t.clips) clip.active = clip.id === c.clip;
    }
    if (c.op === "devices") return devices;
    if (c.op === "metronomeVolume") state.metronomeGain = c.value;
    if (c.op === "tuner") {
      state.tunerTrack = c.track ?? "";
      // A touch flat of low E so the needle sits just left of centre.
      state.tunerFrequency = c.track ? 82.2 : 0;
    }
    if (c.op === "configure") return Object.assign(devices, c);
    if (c.op === "track") Object.assign(state.tracks.find((t) => t.id === c.track), c);
    if (c.op === "limiter") state.limiterEnabled = c.value;
    return state;
  },
  save: async () => null,
  open: async () => null,
  plugin: async () => null,
  importAudio: async () => null,
  exportAudio: async () => null,
  checkForUpdate: async () => ({ available: false }),
  // Lets the capture script sweep the tuner needle.
  demoTuner: (hz) => (state.tunerFrequency = hz),
  demoLoop: (on) => Object.assign(state, { looping: on, loopStart: 0, loopEnd: on ? 8 : 0 }),
  // A fresh session with every track armed, before anything is recorded.
  demoClear: () => {
    for (const t of state.tracks) t.clips = [];
    Object.assign(state, { position: 0, tunerTrack: "", tunerFrequency: 0 });
  },
  // An empty take mid-recording, to reveal the finished clips over it.
  demoRecord: () => {
    for (const t of state.tracks) t.clips = [];
    Object.assign(state, { recording: true, playing: true, position: 0, tunerTrack: "", tunerFrequency: 0 });
  },
  openRelease: async () => undefined,
  openFeedback: async () => undefined,
});
