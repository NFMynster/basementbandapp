const { saveSession, readSession } = require("./session-storage.cjs");
const {
  UNDOABLE_TRACK_SETTINGS,
  PLUGIN_SETTINGS,
  PRESET_SOUND_SETTINGS,
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
const { ENGINE_COMMANDS } = require("./commands.cjs");
/** @param {string} op */
const policy = (op) => ENGINE_COMMANDS[op] ?? {};
// Lifecycle moments that always refresh recovery, including desktop-only
// save/open, which never reach the engine as commands.
const CHECKPOINT_COMMANDS = new Set(["stop", "save", "new", "open"]);
/**
 * @typedef {import("./types").Snapshot} Snapshot
 * @typedef {import("./types").EngineCommand} EngineCommand
 * @typedef {import("./types").HistoryEntry} HistoryEntry
 * @typedef {{ key: string | null, command: EngineCommand, result: Promise<any> | null }} PendingGesture
 */
class SessionService {
  /**
   * @param {import("./native-client.cjs").NativeClient} engine
   * @param {string} directory
   */
  constructor(engine, directory, { recover = true } = {}) {
    this.engine = engine;
    this.directory = directory;
    this.recover = recover;
    /** @type {HistoryEntry[]} */
    this.undoStack = [];
    /** @type {HistoryEntry[]} */
    this.redoStack = [];
    /** @type {string | undefined} Working folder for the open session's new media. */
    this.folder = undefined;
    /** @type {Snapshot | undefined} Latest full snapshot, the base for recovery. */
    this.lastSnapshot = undefined;
    this.recovered = false;
    this.recoveryError = "";
    this.recoveryBlocked = false;
    /** @type {PendingGesture | null} */
    this.pendingGesture = null;
    /** @type {string | null} */
    this.lastHistoryGroup = null;
    /** @type {Promise<void> | null} */
    this.closing = null;
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
      } catch (caught) {
        const error = /** @type {Error & { code?: string }} */ (caught);
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
  /** @param {any} result An engine reply; session-shaped replies gain history flags. */
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
  /** @param {Snapshot} [snapshot] */
  async checkpoint(snapshot) {
    if (this.recoveryBlocked) throw new Error(this.recoveryError);
    /** @type {Snapshot} */
    const current = snapshot ?? (await this.engine.request({ op: "snapshot" }));
    this.lastSnapshot = current;
    if (!this.recover) return;
    current.version = CURRENT_SESSION_VERSION;
    validate(current);
    const target = path.join(this.directory, RECOVERY_FILE);
    await writeJsonAtomically(target, current);
    this.recoveryError = "";
  }
  /**
   * Fills a metadata-only reply with the media and plug-in state it omits.
   * @param {Snapshot} result
   * @param {Snapshot} before
   * @returns {Snapshot}
   */
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
  /** @param {EngineCommand} command @returns {Promise<any>} */
  request(command) {
    // Keep only the newest waiting value in a continuous slider gesture.
    // Commands already executing finish normally; other edits remain barriers.
    const key =
      typeof command.historyGroup === "string" && policy(command.op).gesture
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
      return /** @type {Promise<any>} */ (this.pendingGesture.result);
    }
    /** @type {PendingGesture} */
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
  /** @param {EngineCommand} command */
  async execute(command) {
    const historyGroup =
      typeof command.historyGroup === "string" && policy(command.op).gesture
        ? `${command.op}:${command.track || ""}:${command.clip || ""}:${command.historyGroup}`
        : null;
    const continuesHistory =
      historyGroup && historyGroup === this.lastHistoryGroup;
    if (!policy(command.op).query) this.lastHistoryGroup = null;
    if (command.op === "play")
      this.lastSnapshot = await this.engine.request({ op: "snapshot" });
    if (command.op === "undo" || command.op === "redo") {
      const state = await this.engine.request({ op: "state" });
      if (state.playing) throw new Error("Stop playback before undo or redo");
      const from = command.op === "undo" ? this.undoStack : this.redoStack;
      const to = command.op === "undo" ? this.redoStack : this.undoStack;
      if (!from.length) return this.decorate(state);
      /** @type {Snapshot} */
      const metadata = await this.engine.request({
        op: "snapshot",
        metadataOnly: true,
      });
      const current = this.lastSnapshot
        ? this.recoverySnapshot(metadata, this.lastSnapshot)
        : metadata;
      const entry = from[from.length - 1];
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
        this.recoveryError =
          "Recovery could not be saved: " +
          /** @type {Error} */ (error).message;
      }
      return {
        ...this.decorate(restored),
        historyNotice: `${command.op === "undo" ? "Undo" : "Redo"} ${entry.description}`,
      };
    }
    const editable = !!policy(command.op).edits;
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
                    ...PLUGIN_SETTINGS,
                    "pluginName",
                    ...(command.op === "preset" ? PRESET_SOUND_SETTINGS : []),
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
      const latest = this.undoStack[this.undoStack.length - 1];
      latest.after = this.recoverySnapshot(after, latest.after);
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
            command.op === "metronomeSound" ||
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
        this.recoveryError =
          "Recovery could not be saved: " +
          /** @type {Error} */ (error).message;
      }
    }
    return this.decorate(result);
  }
  /** @param {EngineCommand} command */
  async executeRaw(command) {
    if (command.op === "save") {
      return saveSession(
        /** @type {string} */ (command.path),
        await this.engine.request({ op: "snapshot" }),
      );
    }
    if (command.op === "open") {
      const session = await readSession(/** @type {string} */ (command.path));
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
