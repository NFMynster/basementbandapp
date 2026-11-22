// Visual fixture: stands in for the desktop shell in the visual runs.
// scripts/webview-driver.cjs opens the built UI in Microsoft Edge and installs
// this page script first; it provides the Tauri internals the UI calls (like
// @tauri-apps/api's mockIPC) and answers the shell's commands with canned
// state. Never shipped or used by the app or its audio engine.
(() => {
  /**
   * @typedef {import("../ui/models").EngineState} EngineState
   * @typedef {EngineState["tracks"][number]} Track
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
            0.1 +
            0.65 * Math.abs(Math.sin(i * 0.137)) * Math.exp(-(i % 25) / 17),
        ),
      },
    ],
  });
  /** The fixture engine, with its live values. @type {EngineState} */
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
          {
            id: "compressor",
            name: "Stereo compressor (fixture)",
            bypass: true,
          },
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
    // A marker region lets the visual test see that a loop drag reached the engine.
    if (c.op === "editClip" && c.action === "repeat") {
      const t = fixtureTrack(c.track);
      const source = t.clips.find((clip) => clip.id === c.clip);
      if (source)
        t.clips.push({
          ...source,
          id: "loop-marker",
          start: source.start + source.duration,
        });
    }
    if (c.op === "editClip" && c.action === "take") {
      const t = fixtureTrack(c.track);
      for (const clip of t.clips) clip.active = clip.id === c.clip;
    }
    if (c.op === "devices") return devices;
    if (c.op === "metronomeVolume") state.metronomeGain = c.value;
    if (c.op === "metronomeSound") state.metronomeSound = c.value;
    if (c.op === "removePlugin" && !c.effect)
      Object.assign(fixtureTrack(c.track), { pluginName: "", effects: [] });
    if (c.op === "testAudioLoad") {
      state.audioCpu = c.value;
      state.processingDropouts = 2;
    }
    if (c.op === "tuner") {
      state.tunerTrack = c.track ?? "";
      state.tunerFrequency = c.track ? 82.41 : 0;
    }
    if (c.op === "configure") {
      if (c.output === "Unavailable")
        throw new Error("Test output unavailable");
      Object.assign(devices, c);
      return devices;
    }
    if (c.op === "track") Object.assign(fixtureTrack(c.track), c);
    if (c.op === "limiter") state.limiterEnabled = c.value;
    return state;
  }
  // Like the engine, number every state handed out, and stream live frames
  // with the session to a watching window.
  let revision = 0;
  /** @type {{ onmessage: (frame: unknown) => void } | null} */
  let watcher = null;
  /** The state as a command reply. @returns {EngineState} */
  const engineState = () => ({
    ...structuredClone(state),
    revision: ++revision,
  });
  /** Streams the current state, as the engine does after a change. */
  function streamState() {
    const {
      position,
      audioCpu,
      tunerFrequency,
      masterPeak,
      tracks,
      ...session
    } = engineState();
    watcher?.onmessage({
      event: "state",
      live: {
        position,
        audioCpu: audioCpu ?? 0,
        tunerFrequency: tunerFrequency ?? 0,
        masterPeak: masterPeak ?? 0,
        tracks: Object.fromEntries(tracks.map((t) => [t.id, { peak: t.peak }])),
      },
      revision: session.revision,
      session: { ...session, tracks: tracks.map(({ peak: _peak, ...t }) => t) },
    });
  }

  /** @param {{ op?: string, track?: string, id?: string }} c */
  async function soundLibrary(c) {
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
    return { ...library, session: engineState() };
  }

  /**
   * The desktop shell's Tauri commands (desktop/src/main.rs `generate_handler!`)
   * by name, plus the event plug-in calls the UI makes for file drops.
   * @type {Record<string, (args: any) => unknown>}
   */
  const commands = {
    // Session commands reply on their channel, as in the shell.
    command: ({ command, reply }) => {
      mockCommand(command).then(
        (ok) =>
          reply.onmessage({
            ok: ok === state ? engineState() : structuredClone(ok),
          }),
        (/** @type {Error} */ error) =>
          reply.onmessage({ error: error.message ?? String(error) }),
      );
    },
    sound_library: ({ command }) => soundLibrary(command),
    save: () => null,
    open: () => null,
    plugin: () => null,
    import_audio: () => null,
    export_audio: () => null,
    drop_files: () => engineState(),
    watch_engine: ({ channel }) => {
      watcher = channel;
    },
    check_update: () => ({ available: true, version: "0.2.0" }),
    install_update: () => undefined,
    open_release: () => undefined,
    open_feedback: () => undefined,
    open_licenses: () => "",
    open_logs: () => "",
    open_website: () => undefined,
    restart: () => undefined,
    window_visible: () => undefined,
    "plugin:event|listen": () => 0,
    "plugin:event|unlisten": () => undefined,
  };

  // The Tauri internals @tauri-apps/api calls into, as its mockIPC provides
  // them. Replies are copies, as from the real IPC: the UI must never share
  // (or be handed back) the fixture's own objects.
  /** @type {Map<number, (data: unknown) => void>} */
  const callbacks = new Map();
  let nextCallback = 1;
  Object.assign(window, {
    __TAURI_INTERNALS__: {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { windowLabel: "main", label: "main" },
      },
      callbacks,
      /** @param {(data: unknown) => void} callback @param {boolean} once */
      transformCallback(callback, once = false) {
        const id = nextCallback++;
        callbacks.set(id, (data) => {
          if (once) callbacks.delete(id);
          callback?.(data);
        });
        return id;
      },
      /** @param {number} id */
      unregisterCallback: (id) => callbacks.delete(id),
      /** @param {number} id @param {unknown} data */
      runCallback: (id, data) => callbacks.get(id)?.(data),
      /** @param {string} name @param {Record<string, unknown>} [args] */
      async invoke(name, args = {}) {
        const handler = commands[name];
        if (!handler) throw new Error(`The visual fixture has no ${name}`);
        return structuredClone(await handler(args));
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
    // Fixture-only ops for the visual scripts (testAddTrack, testTakes...).
    visualFixture: {
      /** @param {MockCommand} c */
      command: async (c) => {
        const result = structuredClone(await mockCommand(c));
        streamState();
        return result;
      },
    },
  });
})();
