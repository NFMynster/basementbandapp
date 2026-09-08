const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const clips = (session) => session.tracks.flatMap((track) => track.clips);
function validate(session) {
  const assertValid = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const number = (value, min, max) =>
    assertValid(
      Number.isFinite(value) && value >= min && value <= max,
      "Invalid numeric session field",
    );
  const text = (value, length) =>
    assertValid(
      typeof value === "string" && value.length <= length,
      "Invalid text session field",
    );
  const ids = new Set();
  const id = (value) => {
    const canonical =
      typeof value === "string" ? value.replaceAll("-", "").toLowerCase() : "";
    assertValid(
      typeof value === "string" &&
        /^(?:[\da-f]{32}|[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i.test(
          value,
        ) &&
        !ids.has(canonical),
      "Session IDs must be valid and unique",
    );
    ids.add(canonical);
  };
  assertValid(
    [1, 2, 3].includes(session?.version),
    "Unsupported session version",
  );
  for (const key of ["countIn", "metronome"])
    if (session[key] !== undefined)
      assertValid(
        typeof session[key] === "boolean",
        "Invalid transport setting",
      );
  text(session.title, 100);
  number(session.tempo, 40, 240);
  if (session.masterGain !== undefined) number(session.masterGain, 0, 2);
  number(session.loopStart, 0, Number.MAX_VALUE);
  number(session.loopEnd, session.loopStart, Number.MAX_VALUE);
  assertValid(
    session.loopEnd > session.loopStart && typeof session.looping === "boolean",
    "Invalid loop",
  );
  assertValid(
    Array.isArray(session.tracks) && session.tracks.length <= 32,
    "Invalid session tracks",
  );
  for (const track of session.tracks) {
    id(track.id);
    text(track.name, 80);
    if (track.monitor !== undefined)
      assertValid(
        typeof track.monitor === "boolean",
        "Invalid monitor setting",
      );
    if (track.icon !== undefined)
      assertValid(
        ["guitar", "bass", "drums", "keys", "mic", "audio"].includes(
          track.icon,
        ),
        "Invalid track icon",
      );
    assertValid(
      track.kind === undefined || ["audio", "midi"].includes(track.kind),
      "Invalid track kind",
    );
    assertValid(/^#[\da-f]{6}$/i.test(track.color), "Invalid track color");
    number(track.input, 0, 127);
    assertValid(Number.isInteger(track.input), "Invalid input channel");
    number(track.gain, 0, 1.5);
    number(track.pan, -1, 1);
    for (const key of ["armed", "mute", "solo", "bypass"])
      assertValid(typeof track[key] === "boolean", "Invalid track switch");
    if (track.midiDevice !== undefined) text(track.midiDevice, 4096);
    if (track.midiChannel !== undefined) {
      number(track.midiChannel, 0, 16);
      assertValid(Number.isInteger(track.midiChannel), "Invalid MIDI channel");
    }
    assertValid(Array.isArray(track.clips), "Invalid regions");
    for (const clip of track.clips) {
      id(clip.id);
      text(clip.name, 1024);
      text(clip.path, 32768);
      number(clip.start, 0, Number.MAX_VALUE);
      if (clip.offset !== undefined) number(clip.offset, 0, 1200);
      if (clip.sourceStart !== undefined) number(clip.sourceStart, 0, 1200);
      if (clip.sourceEnd !== undefined)
        number(clip.sourceEnd, clip.sourceStart ?? 0, 1200);
      if (clip.length !== undefined) {
        number(clip.length, -1, 1200);
        assertValid(
          clip.length === -1 || clip.length > 0,
          "Invalid region length",
        );
      }
      if (clip.active !== undefined)
        assertValid(typeof clip.active === "boolean", "Invalid take selection");
      if (clip.takeGroup !== undefined) text(clip.takeGroup, 64);
      if (clip.take !== undefined) {
        number(clip.take, 0, 24000);
        assertValid(Number.isInteger(clip.take), "Invalid take number");
      }
    }
  }
}
class SessionService {
  constructor(engine, directory, { recover = true } = {}) {
    this.engine = engine;
    this.directory = directory;
    this.recover = recover;
    this.undoStack = [];
    this.redoStack = [];
    this.ready = this.initialize();
    this.ready.catch(() => {});
    this.queue = Promise.resolve();
  }
  async initialize() {
    this.folder = await this.workingDirectory();
    let state = await this.engine.request({ op: "init", folder: this.folder });
    if (this.recover) {
      let recoveryRead = false;
      try {
        const raw = await fs.readFile(
          path.join(this.directory, "recovery.json"),
          "utf8",
        );
        recoveryRead = true;
        const session = JSON.parse(raw);
        this.lastSnapshot = session;
        validate(session);
        for (const clip of clips(session)) await fs.access(clip.path);
        state = await this.engine.request({
          op: "restore",
          session,
          folder: this.folder,
        });
        this.recovered = true;
        if (Number.isFinite(session.position) && session.position >= 0)
          state = await this.engine.request({
            op: "seek",
            position: session.position,
          });
      } catch (error) {
        this.lastSnapshot = undefined;
        if (recoveryRead || error.code !== "ENOENT") {
          this.recoveryError =
            "Previous session could not be restored: " + error.message;
          if (recoveryRead) {
            const backup = path.join(
              this.directory,
              "recovery-unreadable-" + randomUUID() + ".json",
            );
            try {
              await fs.copyFile(
                path.join(this.directory, "recovery.json"),
                backup,
              );
              this.recoveryError +=
                ". Original recovery preserved at " + backup;
            } catch {
              this.recoveryBlocked = true;
              this.recoveryError +=
                ". Recovery writes disabled to preserve the original file.";
            }
          }
        }
      }
    }
    return state;
  }
  decorate(result) {
    return result?.tracks
      ? {
          ...result,
          canUndo: !!this.undoStack.length,
          canRedo: !!this.redoStack.length,
          recovered: !!this.recovered,
          recoveryError: this.recoveryError || "",
        }
      : result;
  }
  async checkpoint() {
    if (this.recoveryBlocked) throw new Error(this.recoveryError);
    const snapshot = await this.engine.request({ op: "snapshot" });
    this.lastSnapshot = snapshot;
    if (!this.recover) return;
    snapshot.version = 3;
    validate(snapshot);
    const target = path.join(this.directory, "recovery.json");
    const temporary = target + "." + randomUUID() + ".tmp";
    try {
      await fs.writeFile(temporary, JSON.stringify(snapshot));
      await fs.rename(temporary, target);
      this.recoveryError = "";
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async workingDirectory() {
    const folder = path.join(this.directory, randomUUID());
    await fs.mkdir(folder, { recursive: true });
    return folder;
  }
  request(command) {
    const result = this.queue
      .then(() => this.ready)
      .then(() => this.execute(command));
    this.queue = result.catch(() => {});
    return result;
  }
  async execute(command) {
    if (command.op === "play")
      this.lastSnapshot = await this.engine.request({ op: "snapshot" });
    if (command.op === "undo" || command.op === "redo") {
      const state = await this.engine.request({ op: "state" });
      if (state.playing) throw new Error("Stop playback before undo or redo");
      const from = command.op === "undo" ? this.undoStack : this.redoStack;
      const to = command.op === "undo" ? this.redoStack : this.undoStack;
      if (!from.length) return this.decorate(state);
      const current = await this.engine.request({ op: "snapshot" });
      const target = structuredClone(from.at(-1));
      // Region/track edits do not undo parameter tweaks on surviving plug-ins.
      for (const track of target.tracks) {
        const live = current.tracks.find(
          (t) => t.id === track.id && t.pluginPath === track.pluginPath,
        );
        if (live?.pluginState !== undefined)
          track.pluginState = live.pluginState;
      }
      await this.engine.request({
        op: "restore",
        session: target,
        folder: this.folder,
      });
      const restored = await this.engine.request({
        op: "seek",
        position: current.position,
      });
      from.pop();
      to.push(current);
      try {
        await this.checkpoint();
      } catch (error) {
        this.recoveryError = "Recovery could not be saved: " + error.message;
      }
      return this.decorate(restored);
    }
    const editable = [
      "editClip",
      "removeClip",
      "removeTrack",
      "addTrack",
      "import",
      "track",
      "rename",
      "tempo",
      "record",
      "master",
      "loop",
      "metronome",
      "countIn",
      "bypass",
      "plugin",
      "removePlugin",
    ].includes(command.op);
    let before;
    if (editable) {
      const state = await this.engine.request({ op: "state" });
      if (!state.recording) {
        before = await this.engine.request({
          op: "snapshot",
          metadataOnly: state.playing,
        });
        for (const track of before.tracks) {
          const saved = this.lastSnapshot?.tracks.find(
            (t) => t.id === track.id && t.pluginPath === track.pluginPath,
          );
          if (
            track.pluginState === undefined &&
            saved?.pluginState !== undefined
          )
            track.pluginState = saved.pluginState;
        }
      }
    }
    const result = await this.executeRaw(command);
    if (before) {
      this.undoStack.push(before);
      if (this.undoStack.length > 30) this.undoStack.shift();
      this.redoStack = [];
    }
    if (["new", "open"].includes(command.op)) {
      this.undoStack = [];
      this.redoStack = [];
      this.recovered = false;
    }
    if (
      (editable ||
        [
          "stop",
          "save",
          "new",
          "open",
          "loop",
          "master",
          "plugin",
          "removePlugin",
          "bypass",
          "metronome",
          "countIn",
        ].includes(command.op)) &&
      !result?.playing &&
      !result?.recording
    ) {
      try {
        await this.checkpoint();
      } catch (error) {
        this.recoveryError = "Recovery could not be saved: " + error.message;
      }
    }
    return this.decorate(result);
  }
  async executeRaw(command) {
    if (command.op === "save") {
      const snapshot = await this.engine.request({ op: "snapshot" });
      snapshot.version = clips(snapshot).some(
        (c) => c.offset > 0 || c.length >= 0 || c.takeGroup,
      )
        ? 3
        : snapshot.tracks.some((t) => t.kind === "midi")
          ? 2
          : 1;
      validate(snapshot);
      const target = path.resolve(command.path),
        assets = target + ".audio";
      await fs.mkdir(assets, { recursive: true });
      const copied = new Map();
      for (const clip of clips(snapshot)) {
        const source = path.resolve(clip.path),
          key = process.platform === "win32" ? source.toLowerCase() : source;
        let destination = copied.get(key);
        if (!destination) {
          destination =
            path.dirname(source) === assets
              ? source
              : path.join(assets, randomUUID() + path.extname(source));
          if (source !== destination) await fs.copyFile(source, destination);
          copied.set(key, destination);
        }
        clip.path = path.relative(path.dirname(target), destination);
        delete clip.peaks;
        delete clip.notes;
      }
      for (const key of [
        "position",
        "playing",
        "recording",
        "device",
        "deviceError",
        "diskOverrun",
        "sampleRate",
        "bufferSize",
        "inputLatencySamples",
        "outputLatencySamples",
        "countdown",
      ])
        delete snapshot[key];
      for (const track of snapshot.tracks)
        for (const key of ["peak", "recordStart", "latencySamples"])
          delete track[key];
      const temporary = target + "." + randomUUID() + ".tmp";
      try {
        await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2));
        await fs.rename(temporary, target);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      return { saved: target };
    }
    if (command.op === "open") {
      const target = path.resolve(command.path);
      const session = JSON.parse(await fs.readFile(target, "utf8"));
      validate(session);
      for (const clip of clips(session)) {
        clip.path = path.resolve(path.dirname(target), clip.path);
        await fs.access(clip.path);
      }
      this.folder = await this.workingDirectory();
      return this.engine.request({
        op: "restore",
        session,
        folder: this.folder,
      });
    }
    if (command.op === "new") {
      this.folder = await this.workingDirectory();
      command = { ...command, folder: this.folder };
    }
    return this.engine.request(command);
  }
  close() {
    if (!this.closing) {
      this.closing = this.request({ op: "stop" })
        .then(() => this.checkpoint())
        .then(() => this.engine.close())
        .catch((error) => {
          this.closing = null;
          throw error;
        });
      this.closing.catch(() => {});
    }
    return this.closing;
  }
}
module.exports = { SessionService, validate };
