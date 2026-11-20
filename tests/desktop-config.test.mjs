import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("the desktop crate, Tauri config and package agree on version and identity", () => {
  const pkg = JSON.parse(read("package.json"));
  const tauri = JSON.parse(read("desktop/tauri.conf.json"));
  const crate = read("desktop/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1];
  assert.equal(crate, pkg.version, "desktop/Cargo.toml version");
  assert.equal(
    tauri.version,
    "../package.json",
    "the app reports package.json's version",
  );
  assert.equal(tauri.identifier, "com.footstompstudios.basementband");
});

test("self-updates come signed from the latest published release", () => {
  const updater = JSON.parse(read("desktop/tauri.conf.json")).plugins.updater;
  assert.deepEqual(updater.endpoints, [
    "https://github.com/NFMynster/basementbandapp/releases/latest/download/latest.json",
  ]);
  assert.equal(updater.requireSignedVersion, true, "no downgrade attacks");
  assert.equal(typeof updater.pubkey, "string");
});

test("the window may use core events and the app's own commands only", () => {
  const capability = JSON.parse(read("desktop/capabilities/main.json"));
  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(capability.permissions, ["core:default"]);
  const tauri = JSON.parse(read("desktop/tauri.conf.json"));
  assert.deepEqual(tauri.app.security.capabilities, ["main"]);
  assert.match(tauri.app.security.csp, /script-src 'self'(;|$)/);
  assert.equal(tauri.app.withGlobalTauri, false);
  const cargo = read("desktop/Cargo.toml");
  for (const plugin of [
    "tauri-plugin-fs",
    "tauri-plugin-shell",
    "tauri-plugin-http",
  ])
    assert.ok(!cargo.includes(plugin), `${plugin} would widen renderer access`);
});
