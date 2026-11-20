// Packages the app for distribution: native engine, UI, desktop shell, then a
// Tauri bundle (Windows NSIS installer, or a signed and notarized macOS app
// in a DMG). Installers land in release/ under the names the website links
// to (releases/latest/download/<name>). With TAURI_SIGNING_PRIVATE_KEY set,
// the self-update files are signed too: the installer's .sig on Windows, the
// app archive and its .sig on macOS (see docs/BUILD.md, "Self-updates").
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { buildDesktop, run, runTool, withCargo } from "./build-tools.mjs";

const platform =
  process.argv[2] || (process.platform === "win32" ? "win" : "mac");
if (!["win", "mac"].includes(platform)) throw new Error("Choose win or mac");
if (process.platform !== (platform === "win" ? "win32" : "darwin"))
  throw new Error(
    "Build Windows on Windows and macOS on macOS: JUCE and plug-in hosting require the native platform SDK.",
  );
const env = {
  ...process.env,
  BASEMENT_ARCH: platform === "mac" ? "arm64" : "x64",
};

/** The Developer ID identity in the keychain, unless one is configured. */
function macSigningIdentity() {
  if (env.APPLE_SIGNING_IDENTITY) return env.APPLE_SIGNING_IDENTITY;
  const listed = spawnSync(
    "security",
    ["find-identity", "-v", "-p", "codesigning"],
    { encoding: "utf8" },
  ).stdout;
  return listed?.match(/"(Developer ID Application: [^"]+)"/)?.[1];
}

run(process.execPath, ["scripts/native.mjs"], env);
buildDesktop(env);

// The engine ships next to the app executable as a Tauri sidecar, which
// names it by target triple. Licenses ship as resources.
const triple =
  platform === "mac" ? "aarch64-apple-darwin" : "x86_64-pc-windows-msvc";
const exe = platform === "win" ? ".exe" : "";
const engine = resolve(`artifacts/native/BasementAudio${exe}`);
if (!existsSync(engine)) throw new Error("The audio engine was not built.");
mkdirSync("build/bundle", { recursive: true });
copyFileSync(engine, `build/bundle/BasementAudio-${triple}${exe}`);

const keychainNotary = platform === "mac" && !!env.APPLE_KEYCHAIN_PROFILE;
if (platform === "mac") {
  const identity = macSigningIdentity();
  if (identity) env.APPLE_SIGNING_IDENTITY = identity;
  else console.warn("No Developer ID identity found; the app is unsigned.");
  // electron-builder's variable names, as Tauri expects them.
  if (env.APPLE_APP_SPECIFIC_PASSWORD && !env.APPLE_PASSWORD)
    env.APPLE_PASSWORD = env.APPLE_APP_SPECIFIC_PASSWORD;
  if (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && !env.APPLE_API_KEY_PATH) {
    env.APPLE_API_KEY_PATH = env.APPLE_API_KEY;
    env.APPLE_API_KEY = env.APPLE_API_KEY_ID;
  }
  // A notarytool keychain profile is handled below; keep Tauri from also
  // trying with partial credentials.
  if (keychainNotary)
    for (const name of [
      "APPLE_ID",
      "APPLE_PASSWORD",
      "APPLE_API_KEY",
      "APPLE_API_KEY_PATH",
      "APPLE_API_ISSUER",
    ])
      delete env[name];
}
writeFileSync(
  "build/bundle/tauri.bundle.json",
  JSON.stringify(
    {
      bundle: {
        externalBin: ["../build/bundle/BasementAudio"],
        resources: { "../artifacts/licenses/": "licenses/" },
        targets: platform === "win" ? ["nsis"] : ["app", "dmg"],
        createUpdaterArtifacts: !!env.TAURI_SIGNING_PRIVATE_KEY,
      },
    },
    null,
    2,
  ),
);
runTool(
  "@tauri-apps/cli",
  ["build", "--config", "build/bundle/tauri.bundle.json"],
  withCargo(env),
  "tauri",
);

const bundles = resolve("desktop/target/release/bundle");
const only = (folder, extension) => {
  const found = readdirSync(join(bundles, folder)).filter((name) =>
    name.endsWith(extension),
  );
  if (found.length !== 1)
    throw new Error(`Expected one ${extension} in ${folder}: ${found}`);
  return join(bundles, folder, found[0]);
};
mkdirSync("release", { recursive: true });
if (platform === "win") {
  const installer = only("nsis", ".exe");
  copyFileSync(installer, "release/Basement-Band-Setup.exe");
  if (env.TAURI_SIGNING_PRIVATE_KEY)
    copyFileSync(`${installer}.sig`, "release/Basement-Band-Setup.exe.sig");
  console.log("Installer: release/Basement-Band-Setup.exe");
} else {
  // The update archive holds the signed app (notarized below or by Tauri;
  // the updater never sets the quarantine flag, so it needs no staple).
  if (env.TAURI_SIGNING_PRIVATE_KEY) {
    const archive = only("macos", ".app.tar.gz");
    copyFileSync(archive, "release/Basement-Band-arm64.app.tar.gz");
    copyFileSync(
      `${archive}.sig`,
      "release/Basement-Band-arm64.app.tar.gz.sig",
    );
  }
  const app = join(bundles, "macos", "Basement Band.app");
  const dmg = resolve("release/Basement-Band-arm64.dmg");
  if (keychainNotary) {
    // Notarize and staple the app, then wrap it in a fresh DMG that is
    // signed, notarized and stapled too.
    const profile = env.APPLE_KEYCHAIN_PROFILE;
    const zip = resolve("build/bundle/Basement Band.zip");
    rmSync(zip, { force: true });
    run("ditto", ["-c", "-k", "--keepParent", app, zip]);
    run("xcrun", [
      "notarytool",
      "submit",
      zip,
      "--keychain-profile",
      profile,
      "--wait",
    ]);
    run("xcrun", ["stapler", "staple", app]);
    const stage = resolve("build/bundle/dmg");
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    run("ditto", [app, join(stage, "Basement Band.app")]);
    symlinkSync("/Applications", join(stage, "Applications"));
    rmSync(dmg, { force: true });
    run("hdiutil", [
      "create",
      "-volname",
      "Basement Band",
      "-srcfolder",
      stage,
      "-ov",
      "-format",
      "UDZO",
      dmg,
    ]);
    if (env.APPLE_SIGNING_IDENTITY)
      run("codesign", [
        "--sign",
        env.APPLE_SIGNING_IDENTITY,
        "--timestamp",
        dmg,
      ]);
    run("xcrun", [
      "notarytool",
      "submit",
      dmg,
      "--keychain-profile",
      profile,
      "--wait",
    ]);
    run("xcrun", ["stapler", "staple", dmg]);
  } else copyFileSync(only("dmg", ".dmg"), dmg);
  console.log("App:", app);
  console.log("Disk image: release/Basement-Band-arm64.dmg");
}
