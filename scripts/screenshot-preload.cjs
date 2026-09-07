const { contextBridge } = require("electron");
// Explicit visual fixture; never used by the app or its audio engine.
const track = (id, name, color, input) => ({
  id,
  name,
  color,
  input,
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
};
contextBridge.exposeInMainWorld("basement", {
  command: async (c) =>
    c.op === "devices"
      ? {
          types: [
            {
              name: "WASAPI",
              inputs: ["Audio interface"],
              outputs: ["Audio interface"],
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
        }
      : state,
  save: async () => null,
  open: async () => null,
  plugin: async () => null,
  importAudio: async () => null,
});
