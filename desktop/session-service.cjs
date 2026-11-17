const { saveSession, readSession } = require("./session-storage.cjs");
const {
  UNDOABLE_TRACK_SETTINGS,
  GLOBAL_EDITS,
  historyFingerprint,
  editDescription,
  isUndoable,
  applyHistoryEntry,
} = require("./session-history.cjs");
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
  "createMidi",
  "reorderEffect",
  "preset",
  "removeTrack",
  "reorderTrack",
  "removeClip",
  "editRegions",
  "addTrack",
  "duplicateTrack",
  "import",
  "track",
  "rename",
  "tempo",
  "record",
  "master",
  "limiter",
  "loop",
  "metronome",
  "metronomeVolume",
  "countIn",
  "bypass",
  "plugin",
  "removePlugin",
]);
const CHECKPOINT_COMMANDS = new Set(["stop", "save", "new", "open"]);
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
        // Device fallback can route a saved input to speakers on this machine.
        for (const track of session.tracks) track.monitor = false;
        for (const clip of sessionClips(session)) await fs.access(clip.path);
        state = await this.engine.request({
          op: "restore",
          session,
          folder: this.folder,
        });
        this.recovered = true;
        // Restore the project, but always begin at the start of its timeline.
        // Native restore also resets transport for explicitly opened projects.
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
    // Keep only the newest waiting value in a continuous slider gesture.
    // Commands already executing finish normally; other edits remain barriers.
    const key =
      typeof command.historyGroup === "string" &&
      ["track", "master", "metronomeVolume", "editClip"].includes(command.op)
        ? JSON.stringify([
            command.op,
            command.track,
            command.clip,
            command.action,
            command.historyGroup,
            Object.keys(command).sort(),
          ])
        : null;
    if (key && this.pendingGesture?.key === key) {
      this.pendingGesture.command = command;
      return this.pendingGesture.result;
    }
    const pending = { key, command, result: null };
    this.pendingGesture = key ? pending : null;
    const result = this.queue
      .then(() => this.ready)
      .then(() => {
        if (this.pendingGesture === pending) this.pendingGesture = null;
        return this.execute(pending.command);
      });
    pending.result = result;
    this.queue = result.catch(() => {});
    return result;
  }
  async execute(command) {
    const historyGroup =
      typeof command.historyGroup === "string" &&
      ["track", "master", "editClip", "metronomeVolume"].includes(command.op)
        ? `${command.op}:${command.track || ""}:${command.clip || ""}:${command.historyGroup}`
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
      const target = applyHistoryEntry(current, entry, command.op);
      await this.engine.request({
        op: "restore",
        session: {
          ...target,
          tracks: target.tracks.map((track) =>
            !(entry.reloadPlugins && track.id === entry.trackId) &&
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
        replacePlugins: entry.reloadPlugins ? [entry.trackId] : [],
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
      return {
        ...this.decorate(restored),
        historyNotice: `${command.op === "undo" ? "Undo" : "Redo"} ${entry.description}`,
      };
    }
    const editable = EDITABLE_COMMANDS.has(command.op);
    const undoable = isUndoable(command);
    let before;
    if (undoable && !continuesHistory) {
      const state = await this.engine.request({ op: "state" });
      if (!state.recording) {
        const cachedBefore =
          ![
            "removeTrack",
            "reorderTrack",
            "plugin",
            "removePlugin",
            "preset",
            "reorderEffect",
            "duplicateTrack",
          ].includes(command.op) &&
          !state.playing &&
          this.lastSnapshot;
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
        metadataOnly: ![
          "plugin",
          "removePlugin",
          "preset",
          "reorderEffect",
          "duplicateTrack",
        ].includes(command.op),
      });
      const recoveredAfter = this.recoverySnapshot(after, before);
      if (historyFingerprint(before) !== historyFingerprint(recoveredAfter)) {
        this.undoStack.push({
          description: editDescription(command),
          trackId: command.track,
          trackOrder: command.op === "reorderTrack",
          globalKeys: GLOBAL_EDITS[command.op]
            ? [
                GLOBAL_EDITS[command.op],
                ...(command.op === "tempo" ? ["loopStart", "loopEnd"] : []),
              ]
            : [],
          trackKeys:
            command.op === "track"
              ? Object.keys(command).filter((k) =>
                  UNDOABLE_TRACK_SETTINGS.includes(k),
                )
              : ["plugin", "removePlugin", "preset", "reorderEffect"].includes(
                    command.op,
                  )
                ? [
                    "pluginPath",
                    "pluginUid",
                    "pluginState",
                    "pluginName",
                    "effects",
                    "bypass",
                    ...(command.op === "preset"
                      ? [
                          "gain",
                          "pan",
                          "eqBass",
                          "eqMid",
                          "eqTreble",
                          "eqBassFrequency",
                          "eqMidFrequency",
                          "eqTrebleFrequency",
                          "eqMidQ",
                          "eqLowCut",

                          "compressorEnabled",
                          "compressorAmount",
                          "compressorAttack",
                          "compressorRelease",
                          "reverbEnabled",
                          "reverbAmount",
                          "reverbSize",
                          "reverbDamping",
                          "reverbWidth",
                          "gateEnabled",
                          "gateThreshold",
                          "ampCharacter",
                          "ampBypass",
                          "eqEnabled",
                        ]
                      : []),
                  ]
                : command.op === "bypass"
                  ? command.effect
                    ? ["effects"]
                    : ["bypass"]
                  : command.op === "reorderEffect"
                    ? ["effects"]
                    : [],
          reloadPlugins: [
            "plugin",
            "removePlugin",
            "preset",
            "reorderEffect",
          ].includes(command.op),
          before,
          after: recoveredAfter,
        });
        if (this.undoStack.length > MAX_UNDO_STEPS) this.undoStack.shift();
        this.redoStack = [];
      } else this.lastHistoryGroup = null;
    }
    if (
      undoable &&
      continuesHistory &&
      this.undoStack.length &&
      !result.recording
    ) {
      const after = await this.engine.request({
        op: "snapshot",
        metadataOnly: true,
      });
      this.undoStack.at(-1).after = this.recoverySnapshot(
        after,
        this.undoStack.at(-1).after,
      );
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
            (command.op === "tempo" &&
              (!command.match || command.match === "none")) ||
            command.op === "master" ||
            command.op === "limiter" ||
            command.op === "loop" ||
            command.op === "metronome" ||
            command.op === "metronomeVolume" ||
            command.op === "countIn" ||
            command.op === "bypass" ||
            (command.op === "track" &&
              !Object.prototype.hasOwnProperty.call(command, "midiDevice")) ||
            (command.op === "editClip" &&
              (command.action === "move" || command.action === "take")));
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
      return saveSession(
        command.path,
        await this.engine.request({ op: "snapshot" }),
      );
    }
    if (command.op === "open") {
      const session = await readSession(command.path);
      const folder = await this.workingDirectory();
      const result = await this.engine.request({
        op: "restore",
        session,
        folder,
      });
      this.folder = folder;
      return result;
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
