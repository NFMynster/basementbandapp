import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("CoreAudio patch applies to pinned JUCE, is repeatable and rejects changed upstream code", () => {
  const cmake =
    process.env.CMAKE ||
    [
      "C:/Program Files/Microsoft Visual Studio/18/Community/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe",
      "C:/Program Files/Microsoft Visual Studio/2022/Community/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe",
    ].find(existsSync) ||
    "cmake";
  const relative = "modules/juce_audio_devices/native/juce_CoreAudio_mac.cpp";
  const original = readFileSync(
    resolve("build/native/_deps/juce-src", relative),
    "utf8",
  );
  mkdirSync("artifacts/test-sessions", { recursive: true });
  const folder = mkdtempSync(
    resolve("artifacts/test-sessions/coreaudio-patch-"),
  );
  const file = resolve(folder, relative);
  mkdirSync(resolve(folder, "modules/juce_audio_devices/native"), {
    recursive: true,
  });
  writeFileSync(file, original);
  const apply = () =>
    spawnSync(
      cmake,
      [
        `-Djuce_SOURCE_DIR=${folder}`,
        "-P",
        resolve("native/PatchCoreAudio.cmake"),
      ],
      { encoding: "utf8", windowsHide: true },
    );
  const first = apply();
  assert.equal(first.status, 0, first.stdout + first.stderr);
  // VST3 fixture targets do not inherit BasementAudio's private include paths.
  // The injected quoted include must resolve beside the shared JUCE source.
  const adapter = resolve(
    folder,
    "modules/juce_audio_devices/native/CoreAudioAggregate.h",
  );
  assert.equal(
    readFileSync(adapter, "utf8"),
    readFileSync("native/CoreAudioAggregate.h", "utf8"),
  );
  const adapterModified = statSync(adapter).mtimeMs;
  const patched = readFileSync(file, "utf8"),
    modified = statSync(file).mtimeMs;
  assert.equal(patched.split('#include "CoreAudioAggregate.h"').length - 1, 1);
  assert.match(patched, /std::make_unique<BasementCoreAudioAggregate>/);
  assert.match(patched, /getNumChannels \(inputDeviceID, false\)/);
  assert.match(patched, /if \(in {2}== nullptr\) {2}return out.release\(\)/);
  assert.match(patched, /selected.findNextSetBit/);
  assert.equal(apply().status, 0);
  assert.equal(statSync(adapter).mtimeMs, adapterModified);
  assert.equal(readFileSync(file, "utf8"), patched);
  assert.equal(
    statSync(file).mtimeMs,
    modified,
    "Repeat builds must not recompile JUCE unnecessarily",
  );
  const changed = original.replaceAll(
    "class CoreAudioIODeviceType final : public AudioIODeviceType,",
    "class UpstreamChangedType : public AudioIODeviceType,",
  );
  // Remove the include too when the test is run against an already-patched Mac tree.
  const broken = changed.replace('#include "CoreAudioAggregate.h"', "");
  writeFileSync(file, broken);
  const rejected = apply();
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Recheck the CoreAudio aggregate patch/);
  assert.equal(
    readFileSync(file, "utf8"),
    broken,
    "Do not leave a partially patched upstream file",
  );
});
