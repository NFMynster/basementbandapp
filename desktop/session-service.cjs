const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  CURRENT_SESSION_VERSION,
  sessionClips,
  validate,
  writeJsonAtomically,
} = require("./session-files.cjs");
const RECOVERY_FILE = "recovery.json";
const MAX_UNDO_STEPS = 30;
const NON_STATE_COMMANDS = new Set(["state", "devices", "snapshot"]);
const EDITABLE_COMMANDS = new Set([
  "editClip",
  "removeTrack",
  "removeClip",
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
]);
const CHECKPOINT_COMMANDS = new Set(["stop", "save", "new", "open"]);
const UNDOABLE_CLIP_ACTIONS = new Set(["move", "trim", "split", "copy"]);
const UNDOABLE_TRACK_SETTINGS = [
  "name",
  "color",
  "icon",
  "input",
  "midiDevice",
  "midiChannel",
  "armed",
  "monitor",
  "mute",
  "solo",
  "gain",
  "pan",
  "bypass",
  "pluginName",
];
function isUndoable(command) {
  return (
    command.op === "removeTrack" ||
    command.op === "removeClip" ||
    (command.op === "editClip" && UNDOABLE_CLIP_ACTIONS.has(command.action))
  );
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
          path.join(this.directory, RECOVERY_FILE),
          "utf8",
        );
        recoveryRead = true;
        const session = JSON.parse(raw);
        this.lastSnapshot = session;
        validate(session);
        for (const clip of sessionClips(session)) await fs.access(clip.path);
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
                path.join(this.directory, RECOVERY_FILE),
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
    if (this.recover && !this.lastSnapshot)
      this.lastSnapshot = await this.engine.request({ op: "snapshot" });
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
  async checkpoint(snapshot) {
    if (this.recoveryBlocked) throw new Error(this.recoveryError);
    snapshot ??= await this.engine.request({ op: "snapshot" });
    this.lastSnapshot = snapshot;
    if (!this.recover) return;
    snapshot.version = CURRENT_SESSION_VERSION;
    validate(snapshot);
    const target = path.join(this.directory, RECOVERY_FILE);
    await writeJsonAtomically(target, snapshot);
    this.recoveryError = "";
  }
  recoverySnapshot(result, before) {
    const allClips = new Map(
      before.tracks.flatMap((track) =>
        track.clips.map((clip) => [clip.id, clip]),
      ),
    );
    const previousTracks = new Map(
      before.tracks.map((track) => [track.id, track]),
    );
    return {
      ...before,
      ...result,
      tracks: result.tracks.map((track) => {
        const previous = previousTracks.get(track.id);
        const previousClips = new Map(
          previous?.clips.map((clip) => [clip.id, clip]) ?? [],
        );
        return {
          ...previous,
          ...track,
          effects: (track.effects ?? []).map((effect) => ({
            ...previous?.effects?.find((saved) => saved.id === effect.id),
            ...effect,
          })),
          clips: track.clips.map((clip) => ({
            ...(previousClips.get(clip.id) ?? allClips.get(clip.id)),
            ...clip,
          })),
        };
      }),
    };
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
    const historyGroup =
      typeof command.historyGroup === "string" &&
      ((command.op === "master" && typeof command.value === "number") ||
        (command.op === "track" &&
          ((typeof command.gain === "number" && command.gain !== undefined) ||
            (typeof command.pan === "number" && command.pan !== undefined))))
        ? command.op === "master"
          ? "master:" + command.historyGroup
          : command.track +
            ":" +
            ("gain" in command ? "gain:" : "pan:") +
            command.historyGroup
        : null;
    const continuesHistory =
      historyGroup && historyGroup === this.lastHistoryGroup;
    if (!NON_STATE_COMMANDS.has(command.op)) this.lastHistoryGroup = null;
    if (command.op === "play")
      this.lastSnapshot = await this.engine.request({ op: "snapshot" });
    if (command.op === "undo" || command.op === "redo") {
      const state = await this.engine.request({ op: "state" });
      if (state.playing) throw new Error("Stop playback before undo or redo");
      const from = command.op === "undo" ? this.undoStack : this.redoStack;
      const to = command.op === "undo" ? this.redoStack : this.undoStack;
      if (!from.length) return this.decorate(state);
      const metadata = await this.engine.request({
        op: "snapshot",
        metadataOnly: true,
      });
      const current = this.lastSnapshot
        ? this.recoverySnapshot(metadata, this.lastSnapshot)
        : metadata;
      const entry = from.at(-1);
      const source = command.op === "undo" ? entry.after : entry.before;
      const destination = command.op === "undo" ? entry.before : entry.after;
      const target = structuredClone(current);
      // Apply only this edit's region differences. Later imports, mix changes,
      // transport settings and newly added tracks survive undo/redo.
      const ids = new Set(
        [...source.tracks, ...destination.tracks].map((track) => track.id),
      );
      for (const id of ids) {
        const old = source.tracks.find((track) => track.id === id);
        const next = destination.tracks.find((track) => track.id === id);
        if (!next) {
          target.tracks = target.tracks.filter((track) => track.id !== id);
          continue;
        }
        if (!old) {
          target.tracks.splice(
            destination.tracks.indexOf(next),
            0,
            structuredClone(next),
          );
          continue;
        }
        const live = target.tracks.find((track) => track.id === id);
        if (!live) continue;
        const clipIds = new Set(
          [...old.clips, ...next.clips].map((clip) => clip.id),
        );
        for (const clipId of clipIds) {
          const a = old.clips.find((clip) => clip.id === clipId);
          const b = next.clips.find((clip) => clip.id === clipId);
          if (JSON.stringify(a) === JSON.stringify(b)) continue;
          live.clips = live.clips.filter((clip) => clip.id !== clipId);
          if (b)
            live.clips.splice(next.clips.indexOf(b), 0, structuredClone(b));
        }
      }
      // Structural undo must not roll back unrelated track settings changed
      // after the edit, such as volume, pan, icons, mute, or plug-in bypass.
      for (const track of target.tracks) {
        const live = current.tracks.find((t) => t.id === track.id);
        if (!live) continue;
        for (const key of UNDOABLE_TRACK_SETTINGS)
          if (live[key] !== undefined) track[key] = live[key];
        if (
          live.pluginPath === track.pluginPath &&
          live.pluginState !== undefined
        )
          track.pluginState = live.pluginState;
      }
      await this.engine.request({
        op: "restore",
        session: {
          ...target,
          tracks: target.tracks.map((track) =>
            current.tracks.some((live) => live.id === track.id)
              ? {
                  ...track,
                  pluginState: undefined,
                  effects: track.effects?.map((effect) => ({
                    ...effect,
                    state: undefined,
                  })),
                }
              : track,
          ),
        },
        folder: this.folder,
        preservePlugins: true,
      });
      const restored = await this.engine.request({
        op: "seek",
        position: current.position,
      });
      from.pop();
      to.push(entry);
      try {
        await this.checkpoint(this.recoverySnapshot(restored, target));
      } catch (error) {
        this.recoveryError = "Recovery could not be saved: " + error.message;
      }
      return this.decorate(restored);
    }
    const editable = EDITABLE_COMMANDS.has(command.op);
    const undoable = isUndoable(command);
    let before;
    if (undoable && !continuesHistory) {
      const state = await this.engine.request({ op: "state" });
      if (!state.recording) {
        const cachedBefore =
          command.op !== "removeTrack" && !state.playing && this.lastSnapshot;
        before =
          (cachedBefore
            ? { ...cachedBefore, position: state.position }
            : undefined) ||
          (await this.engine.request({
            op: "snapshot",
            metadataOnly: state.playing,
          }));
        if (!cachedBefore) {
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
    }
    const result = await this.executeRaw(command);
    if (historyGroup) this.lastHistoryGroup = historyGroup;
    if (before) {
      const after = await this.engine.request({
        op: "snapshot",
        metadataOnly: true,
      });
      this.undoStack.push({
        before,
        after: this.recoverySnapshot(after, before),
      });
      if (this.undoStack.length > MAX_UNDO_STEPS) this.undoStack.shift();
      this.redoStack = [];
    }
    if (command.op === "new" || command.op === "open") {
      this.undoStack = [];
      this.redoStack = [];
      this.recovered = false;
    }
    if (
      (editable || CHECKPOINT_COMMANDS.has(command.op)) &&
      !result?.playing &&
      !result?.recording
    ) {
      try {
        const recoveryBase = before || this.lastSnapshot;
        const canReuseMedia =
          recoveryBase &&
          (command.op === "addTrack" ||
            command.op === "removeTrack" ||
            command.op === "removeClip" ||
            command.op === "rename" ||
            command.op === "tempo" ||
            command.op === "master" ||
            command.op === "loop" ||
            command.op === "metronome" ||
            command.op === "countIn" ||
            command.op === "bypass" ||
            (command.op === "track" &&
              !Object.prototype.hasOwnProperty.call(command, "midiDevice")) ||
            (command.op === "editClip" &&
              (command.action === "move" ||
                command.action === "trim" ||
                command.action === "take")));
        await this.checkpoint(
          canReuseMedia
            ? this.recoverySnapshot(result, recoveryBase)
            : undefined,
        );
      } catch (error) {
        this.recoveryError = "Recovery could not be saved: " + error.message;
      }
    }
    return this.decorate(result);
  }
  async executeRaw(command) {
    if (command.op === "save") {
      const snapshot = await this.engine.request({ op: "snapshot" });
      snapshot.version = CURRENT_SESSION_VERSION;
      validate(snapshot);
      const target = path.resolve(command.path),
        assets = target + ".audio";
      await fs.mkdir(assets, { recursive: true });
      const copied = new Map();
      for (const clip of sessionClips(snapshot)) {
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
      await writeJsonAtomically(target, snapshot, 2);
      return { saved: target };
    }
    if (command.op === "open") {
      const target = path.resolve(command.path);
      const session = JSON.parse(await fs.readFile(target, "utf8"));
      validate(session);
      for (const clip of sessionClips(session)) {
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
