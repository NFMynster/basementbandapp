import test from "node:test";
import assert from "node:assert/strict";
import { loadDesktopModule } from "./helpers/desktop-module.mjs";

test("macOS microphone access prompts only when undetermined; denial supports output-only startup", async () => {
  for (const [status, answer, expected, asks] of [
    ["not-determined", true, true, 1],
    ["not-determined", false, false, 1],
    ["granted", false, true, 0],
    ["denied", true, false, 0],
    ["restricted", true, false, 0],
  ]) {
    let called = 0;
    const { microphoneAccess } = loadDesktopModule("desktop/permissions.cjs", {
      stubs: {
        electron: {
          systemPreferences: {
            getMediaAccessStatus: () => status,
            askForMediaAccess: async (kind) => {
              assert.equal(kind, "microphone");
              called++;
              return answer;
            },
          },
        },
      },
      globals: {
        process: { platform: "darwin", env: {} },
        console: { log() {} },
      },
    });
    assert.equal(await microphoneAccess(), expected);
    assert.equal(called, asks);
  }
});
