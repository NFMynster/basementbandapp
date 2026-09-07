import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("file dialogs validate the sender and forward chosen paths, including VST3 and export", async () => {
  const handlers = new Map(),
    commands = [];
  const sender = {};
  let canceled = false,
    dialogs = 0;
  const electron = {
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: {
      showOpenDialog: async () => {
        dialogs++;
        return { canceled, filePaths: ["chosen-path"] };
      },
    },
  };
  const module = { exports: {} };
  runInNewContext(readFileSync("desktop/ipc.cjs", "utf8"), {
    require: () => electron,
    module,
    process,
  });
  module.exports.registerIpc({ webContents: sender }, async (c) => {
    commands.push(c);
    return c;
  });
  const event = { sender };
  for (const name of ["open", "plugin", "import", "export"]) {
    const options = name === "export" ? { mode: "separate", track: "g" } : "g";
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
  canceled = true;
  assert.equal(await handlers.get("plugin")(event, "g"), null);
  assert.equal(commands.length, 4);
});
