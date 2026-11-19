import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SessionService } from "../desktop/session-service.cjs";
import { loadAudioDevice, saveAudioDevice } from "../desktop/audio-device.cjs";

const remembered = {
  type: "ASIO",
  output: "USB Interface",
  input: "USB Interface",
  sampleRate: 48000,
  bufferSize: 128,
};
const launchDefault = {
  type: "Windows Audio",
  output: "Speakers",
  input: "",
  sampleRate: 48000,
  bufferSize: 480,
};

function folder() {
  mkdirSync("artifacts/test-sessions", { recursive: true });
  return mkdtempSync(resolve("artifacts/test-sessions/audio-device-"));
}

/** A service with only what restoreAudioDevice needs and a scripted engine. */
function serviceWith(deviceFile, available) {
  const service = Object.create(SessionService.prototype);
  service.deviceFile = deviceFile;
  service.requests = [];
  service.engine = {
    request: async (command) => {
      service.requests.push(command);
      if (command.op === "devices") return { ...launchDefault, types: [] };
      if (command.op === "configure" && !available(command))
        throw new Error("No such device");
      return command;
    },
  };
  return service;
}

test("the chosen audio device is saved as applied and validated on load", async () => {
  const file = resolve(folder(), "audio-device.json");
  assert.equal(await loadAudioDevice(file), null, "No file means defaults");
  await saveAudioDevice(file, { ...remembered, types: [], rates: [44100] });
  assert.deepEqual(await loadAudioDevice(file), remembered);
  assert.deepEqual(
    Object.keys(JSON.parse(readFileSync(file, "utf8"))).sort(),
    ["bufferSize", "input", "output", "sampleRate", "type"],
    "Only the configuration is stored, not device lists",
  );
  writeFileSync(file, "{ not json");
  assert.equal(await loadAudioDevice(file), null, "Damaged file is ignored");
  writeFileSync(file, JSON.stringify({ ...remembered, output: "" }));
  assert.equal(await loadAudioDevice(file), null, "Incomplete entry ignored");
});

test("launch reapplies the remembered device, drops a missing input, else keeps the default", async () => {
  const file = resolve(folder(), "audio-device.json");
  await saveAudioDevice(file, remembered);

  let service = serviceWith(file, () => true);
  await service.restoreAudioDevice();
  assert.deepEqual(service.requests.at(-1), { op: "configure", ...remembered });

  // Interface present but its input gone: keep the output choice.
  service = serviceWith(
    file,
    (c) => c.output === remembered.output && !c.input,
  );
  await service.restoreAudioDevice();
  assert.deepEqual(service.requests.at(-1), {
    op: "configure",
    ...remembered,
    input: "",
  });

  // Interface unplugged: reopen the device the engine started with.
  service = serviceWith(file, (c) => c.output === launchDefault.output);
  await service.restoreAudioDevice();
  assert.deepEqual(service.requests.at(-1), {
    op: "configure",
    ...launchDefault,
  });

  // Without a remembered device nothing is touched.
  service = serviceWith(resolve(folder(), "none.json"), () => true);
  await service.restoreAudioDevice();
  assert.deepEqual(service.requests, []);
});
