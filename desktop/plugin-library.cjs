const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { NativeClient } = require("./native-client.cjs");
const { writeJsonAtomically } = require("./session-files.cjs");
const { STARTER_SOUNDS } = require("./starter-sounds.cjs");
const {
  PLUGIN_SETTINGS,
  PRESET_SOUND_SETTINGS,
} = require("./session-history.cjs");

/** @typedef {import("./types").PluginEntry} PluginEntry */
/** @typedef {import("./types").TrackPreset} TrackPreset */
/** @typedef {Error & { code?: string }} SystemError */

class PluginLibrary {
  /**
   * @param {string} directory
   * @param {string} executable
   * @param {string[]} roots
   */
  constructor(directory, executable, roots) {
    this.file = path.join(directory, "sound-library.json");
    this.executable = executable;
    this.roots = roots;
    /** @type {{ plugins: PluginEntry[], presets: TrackPreset[] }} */
    this.data = { plugins: [], presets: [] };
    this.scanning = false;
    this.progress = "";
    /** @type {string[]} */
    this.errors = [];
    this.writes = Promise.resolve();
    this.ready = fs
      .readFile(this.file, "utf8")
      .then((raw) => {
        const data = JSON.parse(raw);
        if (!Array.isArray(data.plugins) || !Array.isArray(data.presets))
          throw new Error("Invalid sound library");
        this.data = data;
      })
      .catch((/** @type {SystemError} */ error) => {
        if (error.code !== "ENOENT")
          this.errors.push("Could not read saved library: " + error.message);
      });
  }
  /** @param {import("./types").Snapshot} [session] */
  view(session) {
    return {
      plugins: this.data.plugins,
      presets: this.data.presets.map(({ id, name, kind }) => ({
        id,
        name,
        kind,
      })),
      starters: STARTER_SOUNDS.map(({ id, name, hint }) => ({
        id,
        name,
        hint,
      })),
      scanning: this.scanning,
      progress: this.progress,
      errors: this.errors,
      ...(session ? { session } : {}),
    };
  }
  save() {
    const data = structuredClone(this.data);
    const result = this.writes.then(() => writeJsonAtomically(this.file, data));
    this.writes = result.catch(() => {});
    return result;
  }
  /** @param {string} [extraRoot] */
  async scan(extraRoot) {
    if (this.scanning) return;
    this.scanning = true;
    this.errors = [];
    try {
      /** @type {Set<string>} */
      const files = new Set();
      /** @param {string} folder */
      const walk = async (folder, depth = 0) => {
        if (depth > 12 || files.size >= 4096) return;
        let entries;
        try {
          entries = await fs.readdir(folder, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (e.isSymbolicLink()) continue;
          const file = path.join(folder, e.name);
          if (/\.vst3$/i.test(e.name)) files.add(file);
          else if (e.isDirectory()) await walk(file, depth + 1);
        }
      };
      for (const root of [...this.roots, ...(extraRoot ? [extraRoot] : [])])
        await walk(root);
      let count = 0;
      for (const file of files) {
        this.progress = `${++count}/${files.size}: ${path.basename(file)}`;
        const stamp = (await fs.stat(file)).mtimeMs;
        if (this.data.plugins.some((p) => p.path === file && p.stamp === stamp))
          continue;
        // A faulty scan must never take down the active recording engine.
        const child = spawn(this.executable, ["--test-device"], {
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const client = new NativeClient(child, 15000);
        try {
          /** @type {PluginEntry[]} */
          const result = await client.request({ op: "scanPlugin", path: file });
          const previous = this.data.plugins.filter((p) => p.path === file);
          this.data.plugins = this.data.plugins.filter((p) => p.path !== file);
          for (const plugin of result) {
            const id = `${file}:${plugin.uid}`;
            const old = previous.find((p) => p.id === id);
            this.data.plugins.push({
              ...plugin,
              id,
              stamp,
              favorite: old?.favorite ?? false,
              recent: old?.recent ?? 0,
            });
          }
        } catch (error) {
          this.errors.push(
            `${path.basename(file)}: ${/** @type {Error} */ (error).message}`,
          );
        } finally {
          client.close();
          child.kill();
        }
      }
      await this.save();
    } catch (error) {
      this.errors.push(/** @type {Error} */ (error).message);
    } finally {
      this.scanning = false;
      this.progress = "";
    }
  }
  /**
   * @param {import("../ui/models").LibraryCommand & { folder?: string }} c
   *   `folder` is set only by IPC from the native folder picker, never by the renderer.
   * @param {import("./types").Request} request
   */
  async command(c, request) {
    await this.ready;
    if (c.op === "list") return this.view();
    if (c.op === "scan") {
      void this.scan(c.folder);
      return this.view();
    }
    if (c.op === "favorite") {
      const plugin = this.data.plugins.find((p) => p.id === c.id);
      if (!plugin) throw new Error("Plug-in no longer exists");
      plugin.favorite = !plugin.favorite;
      await this.save();
      return this.view();
    }
    if (c.op === "load") {
      const plugin = this.data.plugins.find((p) => p.id === c.id);
      if (!plugin) throw new Error("Plug-in no longer exists");
      const session = await request({
        op: "plugin",
        track: c.track,
        path: plugin.path,
        uid: plugin.uid,
        append: !!c.append,
      });
      plugin.recent = Date.now();
      await this.save();
      return this.view(session);
    }
    if (c.op === "savePreset") {
      /** @type {import("./types").Snapshot} */
      const snapshot = await request({ op: "snapshot" });
      const track = snapshot.tracks.find((t) => t.id === c.track);
      if (!track) throw new Error("Track no longer exists");
      const name = typeof c.name === "string" ? c.name.trim().slice(0, 80) : "";
      if (!name) throw new Error("Name your preset first");
      const settings = Object.fromEntries(
        ["kind", ...PLUGIN_SETTINGS, ...PRESET_SOUND_SETTINGS].map((key) => [
          key,
          track[key],
        ]),
      );
      this.data.presets.push({
        id: randomUUID(),
        name,
        kind: track.kind,
        settings,
      });
      await this.save();
      return this.view();
    }
    if (c.op === "applyPreset") {
      const preset =
        STARTER_SOUNDS.find((p) => p.id === c.id) ??
        this.data.presets.find((p) => p.id === c.id);
      if (!preset) throw new Error("Preset no longer exists");
      const session = await request({
        op: "preset",
        track: c.track,
        preset: JSON.stringify(preset.settings),
      });
      return this.view(session);
    }
    if (c.op === "deletePreset") {
      this.data.presets = this.data.presets.filter((p) => p.id !== c.id);
      await this.save();
      return this.view();
    }
    throw new Error("Unknown library action");
  }
}
module.exports = { PluginLibrary };
