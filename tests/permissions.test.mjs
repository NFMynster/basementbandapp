import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("macOS microphone access prompts only when undetermined; denial supports output-only startup", async () => {
  for (const [status, answer, expected, asks] of [
    ["not-determined", true, true, 1],
    ["not-determined", false, false, 1],
    ["granted", false, true, 0],
    ["denied", true, false, 0],
    ["restricted", true, false, 0],
  ]) {
    const module = { exports: {} };
    let called = 0;
    runInNewContext(readFileSync("desktop/permissions.cjs", "utf8"), {
      module,
      process: { platform: "darwin", env: {} },
      console: { log() {} },
      require: () => ({
        systemPreferences: {
          getMediaAccessStatus: () => status,
          askForMediaAccess: async (kind) => {
            assert.equal(kind, "microphone");
            called++;
            return answer;
          },
        },
      }),
    });
    assert.equal(await module.exports.microphoneAccess(), expected);
    assert.equal(called, asks);
  }
});
