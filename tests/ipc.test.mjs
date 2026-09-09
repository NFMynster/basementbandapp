import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

for (const platform of ["win32", "darwin"])
  test(`file dialogs validate sender, paths and VST defaults on ${platform}`, async () => {
    const handlers = new Map(),
      commands = [];
    const sender = {};
    let canceled = false,
      dialogs = 0;
    const electron = {
      app: {
        getPath: (name) => {
          assert.equal(name, "home");
          return "user-home";
        },
      },
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      dialog: {
        showOpenDialog: async (_win, options) => {
          if (options.title?.includes("VST3"))
            assert.equal(
              options.defaultPath,
              platform === "darwin"
                ? "/Library/Audio/Plug-Ins/VST3"
                : "user-home",
            );
          dialogs++;
          return { canceled, filePaths: ["chosen-path"] };
        },
      },
    };
    const module = { exports: {} };
    runInNewContext(readFileSync("desktop/ipc.cjs", "utf8"), {
      require: (name) =>
        name === "electron" ? electron : { microphoneAccess: async () => true },
      module,
      process: { ...process, platform },
    });
    module.exports.registerIpc({ webContents: sender }, async (c) => {
      if (c.op === "state") return { tracks: [{ id: "g", kind: "audio" }] };
      commands.push(c);
      return c;
    });
    const event = { sender };
    for (const name of ["open", "plugin", "import", "export"]) {
      const options =
        name === "export" ? { mode: "separate", track: "g" } : "g";
      await assert.rejects(
        handlers.get(name)({ sender: {} }, options),
        /Unknown window/,
      );
      const result = await handlers.get(name)(event, options);
      assert.equal(result.op, name);
      assert.equal(result.path, "chosen-path");
    }
    assert.equal(dialogs, 4);
    await assert.rejects(
      handlers.get("export")(event, { mode: "invalid" }),
      /Invalid export/,
    );
    await assert.rejects(
      handlers.get("export")(event, { mode: "separate", midi: "invalid" }),
      /Invalid export/,
    );
    const midiExport = await handlers.get("export")(event, {
      mode: "separate",
      midi: "midi",
      track: "g",
    });
    assert.equal(midiExport.midi, "midi");
    canceled = true;
    assert.equal(await handlers.get("plugin")(event, "g"), null);
    assert.equal(commands.length, 5);
  });
