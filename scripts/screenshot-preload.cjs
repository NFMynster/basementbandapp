const { contextBridge } = require("electron");
// Explicit visual fixture; never used by the app or its audio engine.
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
  clips: [
    {
      id: "clip" + id,
      kind: "audio",
      active: true,
      position: 0,
      name: name + " · take 1",
      start: 0,
      duration: 16,
      peaks: Array.from(
        { length: 400 },
        (_, i) =>
          0.1 + 0.65 * Math.abs(Math.sin(i * 0.137)) * Math.exp(-(i % 25) / 17),
      ),
    },
  ],
});
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
contextBridge.exposeInMainWorld("basement", {
  soundLibrary: async () => ({
    plugins: [],
    presets: [],
    scanning: false,
    progress: "",
    errors: [],
  }),
  command: async (c) => {
    if (c.op === "devices") return devices;
    if (c.op === "testAudioLoad") {
      state.audioCpu = c.value;
      state.processingDropouts = 2;
    }
    if (c.op === "configure") {
      if (c.output === "Unavailable")
        throw new Error("Test output unavailable");
      Object.assign(devices, c);
      return devices;
    }
    if (c.op === "track")
      Object.assign(
        state.tracks.find((t) => t.id === c.track),
        c,
      );
    if (c.op === "limiter") state.limiterEnabled = c.value;
    return state;
  },
  save: async () => null,
  open: async () => null,
  plugin: async () => null,
  importAudio: async () => null,
  exportAudio: async () => null,
});
