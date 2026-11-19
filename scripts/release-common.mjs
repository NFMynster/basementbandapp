import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
// Node refuses to spawn npm.cmd without a shell on Windows, so run npm's own
// script (provided by `npm run`) through Node instead.
const npmScript = process.env.npm_execpath;
// Git Bash puts GNU tar first on PATH, which reads C:\ paths as remote hosts;
// Windows' bsdtar handles drive paths.
const tar =
  process.platform === "win32"
    ? resolve(process.env.SystemRoot || "C:/Windows", "System32", "tar.exe")
    : "tar";
const expectedAppId = "com.footstompstudios.basementband";

function fail(message) {
  throw new Error(message);
}

function execute(
  executable,
  args,
  { allowFailure = false, capture = false, env } = {},
) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: capture ? "utf8" : undefined,
    env: env || process.env,
    shell: false,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) {
    if (result.error.code === "ENOENT")
      fail(`${executable} is not installed or is not available on PATH.`);
    throw result.error;
  }
  if (!allowFailure && result.status !== 0) {
    const detail = capture
      ? `\n${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}`
      : "";
    fail(
      `${executable} ${args.join(" ")} failed with exit code ${result.status}.${detail}`,
    );
  }
  return result;
}

/** @param {string[]} args */
function runNpm(args) {
  if (!npmScript)
    fail("Run the release through npm run release:win or release:mac.");
  return execute(process.execPath, [npmScript, ...args]);
}

function output(executable, args, options) {
  const result = execute(executable, args, { ...options, capture: true });
  return (result.stdout || "").trim();
}

function requireCleanTaggedCheckout(tag, version) {
  if (tag !== `v${version}`)
    fail(`Release tag ${tag} does not match package version ${version}.`);
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag))
    fail("Use a semantic version tag such as v0.1.0 or v0.1.0-beta.1.");

  const dirty = output("git", [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (dirty)
    fail(
      "The checkout has uncommitted files. Commit or remove them before releasing.",
    );

  const head = output("git", ["rev-parse", "HEAD"]);
  const tagged = output("git", ["rev-parse", `${tag}^{commit}`], {
    allowFailure: true,
  });
  if (!tagged || tagged !== head)
    fail(
      `Check out ${tag} before releasing; it must point to the current commit.`,
    );

  execute("git", ["fetch", "--quiet", "origin", `refs/tags/${tag}`]);
  const remote = output("git", ["rev-parse", "FETCH_HEAD^{commit}"]);
  if (remote !== head)
    fail(`The origin tag ${tag} does not point to the current commit.`);
}

function requireMacCredentials() {
  const profile = Boolean(process.env.APPLE_KEYCHAIN_PROFILE);
  const api = ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"].every(
    (name) => process.env[name],
  );
  const account = [
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ].every((name) => process.env[name]);
  if (!profile && !api && !account)
    fail(
      "Configure notarization first. The recommended local setup is APPLE_KEYCHAIN_PROFILE=basement-band-notary.",
    );
  const identities = output("security", [
    "find-identity",
    "-v",
    "-p",
    "codesigning",
  ]);
  if (!identities.includes("Developer ID Application:"))
    fail('Keychain has no valid "Developer ID Application" certificate.');
}

/**
 * Installers carry no version in their names (the website links to
 * releases/latest/download/<name>), so a leftover file from an earlier build
 * would look the same. Only accept one written by this run's packaging.
 * @param {string} name
 * @param {number} builtAfter
 */
function findArtifact(name, builtAfter) {
  const artifact = resolve(root, "release", name);
  if (!existsSync(artifact)) fail(`Packaged file not found: ${artifact}`);
  if (statSync(artifact).mtimeMs < builtAfter)
    fail(
      `${name} is older than this release run; packaging did not replace it.`,
    );
  return artifact;
}

/** @param {number} builtAfter */
function verifyMac(builtAfter) {
  const app = resolve(root, "release", "mac-arm64", "Basement Band.app");
  if (!existsSync(app)) fail(`Packaged app not found at ${app}.`);
  execute("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  const displayed = execute("codesign", ["--display", "--verbose=4", app], {
    capture: true,
  });
  // codesign writes display information to stderr even on success.
  const details = `${displayed.stdout || ""}\n${displayed.stderr || ""}`;
  if (!details.includes("Authority=Developer ID Application:"))
    fail("The app is not signed with a Developer ID Application certificate.");
  if (!details.includes(`Identifier=${expectedAppId}`))
    fail(`The signed app does not use bundle ID ${expectedAppId}.`);
  if (!/flags=.*runtime/.test(details))
    fail("Hardened runtime is not enabled.");
  execute("spctl", ["--assess", "--verbose=4", "--type", "exec", app]);
  execute("xcrun", ["stapler", "validate", app]);
  return findArtifact("Basement-Band-arm64.dmg", builtAfter);
}

/** @param {number} builtAfter */
function verifyWindows(builtAfter) {
  const installer = findArtifact("Basement-Band-Setup.exe", builtAfter);
  const escaped = installer.replaceAll("'", "''");
  // Started from PowerShell 7 (as on GitHub Actions), Windows PowerShell
  // inherits PS7's PSModulePath and cannot load its own Security module.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^psmodulepath$/i.test(key)),
  );
  const status = output(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-AuthenticodeSignature -LiteralPath '${escaped}').Status`,
    ],
    { env },
  );
  if (status === "NotSigned") {
    console.warn(
      "Windows installer is unsigned. Users may see an Unknown publisher or SmartScreen warning.",
    );
  } else if (status !== "Valid") {
    fail(
      `The Windows installer has an invalid Authenticode status: ${status || "unknown"}.`,
    );
  }
  return installer;
}

/**
 * Files electron-updater reads from the release: the update manifest and the
 * blockmap for differential downloads. The manifest must name the installer
 * exactly as uploaded.
 * @param {string} installer
 * @param {string} version
 * @param {number} builtAfter
 */
function windowsUpdateFiles(installer, version, builtAfter) {
  const manifest = findArtifact("latest.yml", builtAfter);
  const blockmap = findArtifact(`${basename(installer)}.blockmap`, builtAfter);
  const text = readFileSync(manifest, "utf8");
  if (
    !text.includes(`version: ${version}`) ||
    !text.includes(`path: ${basename(installer)}`)
  )
    fail("latest.yml does not describe this installer.");
  return [manifest, blockmap];
}

function copyDependency(source, destination) {
  if (!existsSync(source))
    fail(`Required dependency source is missing: ${source}`);
  cpSync(source, destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (path) => basename(path) !== ".git",
  });
}

function createSourceArchive(tag, version) {
  const releaseDirectory = resolve(root, "release");
  const staging = resolve(releaseDirectory, `.source-${version}`);
  const packageName = `Basement-Band-${version}-complete-source`;
  const packageDirectory = resolve(staging, packageName);
  const repositoryTar = resolve(staging, "repository.tar");
  const archive = resolve(releaseDirectory, `${packageName}.tar.gz`);
  if (
    !staging.startsWith(releaseDirectory + "/") &&
    !staging.startsWith(releaseDirectory + "\\")
  )
    fail("Invalid source staging path.");

  rmSync(staging, { recursive: true, force: true });
  mkdirSync(packageDirectory, { recursive: true });
  execute("git", ["archive", "--format=tar", `--output=${repositoryTar}`, tag]);
  execute(tar, ["-xf", repositoryTar, "-C", packageDirectory]);
  unlinkSync(repositoryTar);

  const dependencies = resolve(root, "build", "native", "_deps");
  const vendor = resolve(packageDirectory, "vendor");
  mkdirSync(vendor, { recursive: true });
  copyDependency(resolve(dependencies, "juce-src"), resolve(vendor, "JUCE"));
  copyDependency(
    resolve(dependencies, "signalsmith-linear-src"),
    resolve(vendor, "signalsmith-linear"),
  );
  copyDependency(
    resolve(dependencies, "signalsmith-stretch-src"),
    resolve(vendor, "signalsmith-stretch"),
  );
  for (const required of [
    resolve(vendor, "JUCE", "LICENSE.md"),
    resolve(vendor, "signalsmith-linear", "LICENSE.txt"),
    resolve(vendor, "signalsmith-stretch", "LICENSE.txt"),
  ])
    if (!existsSync(required)) fail(`Source bundle is missing ${required}.`);
  writeFileSync(
    resolve(packageDirectory, "SOURCE_CONTENTS.md"),
    `# Complete corresponding source\n\nThis archive matches Basement Band ${tag}. It contains the tagged application source, build scripts, lockfile, and the exact native dependency source fetched for this build under \`vendor/\`. Generated build products and npm packages are intentionally excluded; reproduce them with \`npm ci\` and the documented build commands.\n`,
  );

  rmSync(archive, { force: true });
  execute(tar, ["-czf", archive, "-C", staging, packageName]);
  rmSync(staging, { recursive: true, force: true });
  return archive;
}

function checksum(file) {
  const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
  const destination = `${file}.sha256`;
  writeFileSync(destination, `${digest}  ${basename(file)}\n`);
  return destination;
}

function ensureDraftRelease(tag, version) {
  const viewed = execute("gh", ["release", "view", tag, "--json", "isDraft"], {
    allowFailure: true,
    capture: true,
  });
  if (viewed.status !== 0) {
    execute("gh", [
      "release",
      "create",
      tag,
      "--draft",
      "--verify-tag",
      "--title",
      `Basement Band ${version}`,
      "--generate-notes",
    ]);
    return;
  }
  const release = JSON.parse(viewed.stdout);
  if (!release.isDraft)
    fail(
      `GitHub release ${tag} is already published; refusing to replace its assets.`,
    );
}

function uploadNewAssets(tag, platformArtifact, sourceArchive, extraFiles) {
  const assetJson = output("gh", ["release", "view", tag, "--json", "assets"]);
  const existing = new Set(
    JSON.parse(assetJson).assets.map((asset) => asset.name),
  );
  const platformFiles = [
    platformArtifact,
    checksum(platformArtifact),
    ...extraFiles,
  ];
  for (const file of platformFiles)
    if (existing.has(basename(file)))
      fail(
        `${basename(file)} already exists in the draft. Remove it there before retrying this platform.`,
      );

  const sourceChecksum = checksum(sourceArchive);
  const sourceNames = [basename(sourceArchive), basename(sourceChecksum)];
  const sourcePresence = sourceNames.map((name) => existing.has(name));
  if (sourcePresence[0] !== sourcePresence[1])
    fail(
      "The draft has an incomplete source-archive pair; remove it before retrying.",
    );
  const sourceFiles = sourcePresence[0] ? [] : [sourceArchive, sourceChecksum];
  if (sourcePresence[0])
    console.log("Keeping the existing complete-source archive and checksum.");
  execute("gh", ["release", "upload", tag, ...platformFiles, ...sourceFiles]);
}

export function printReleaseHelp(platform) {
  const command = platform === "mac" ? "release:mac" : "release:win";
  const verification =
    platform === "mac"
      ? "verifies signing and notarization"
      : "accepts an unsigned installer and rejects an invalid signature";
  const prerequisites =
    platform === "mac"
      ? 'GitHub CLI installed and authenticated with "gh auth login", plus Developer ID and notarization credentials.'
      : 'GitHub CLI installed and authenticated with "gh auth login". Windows code signing is optional.';
  console.log(`Usage: npm run ${command} -- v0.1.0

Builds the exact pushed tag on ${platform === "mac" ? "macOS arm64" : "Windows x64"}, ${verification}, runs checks and tests, creates a complete-source archive, and uploads new assets to a GitHub draft release.

Prerequisites: ${prerequisites}`);
}

export function release(platform, tag) {
  if (tag === "--help" || tag === "-h") return printReleaseHelp(platform);
  if (!tag) return printReleaseHelp(platform);
  const requiredOs = platform === "mac" ? "darwin" : "win32";
  if (process.platform !== requiredOs)
    fail(
      `Run the ${platform} release script on ${requiredOs === "darwin" ? "macOS" : "Windows"}.`,
    );

  const manifest = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  if (manifest.build?.appId !== expectedAppId)
    fail(`Set build.appId to ${expectedAppId} before releasing.`);
  requireCleanTaggedCheckout(tag, manifest.version);
  execute("gh", ["auth", "status"]);
  if (platform === "mac") requireMacCredentials();

  runNpm(["ci"]);
  runNpm(["run", "check"]);
  // Whole seconds: some file systems store coarse modification times.
  const packagedAfter = Math.floor(Date.now() / 1000) * 1000;
  runNpm(["run", platform === "mac" ? "package:mac" : "package:win"]);
  runNpm(["test"]);

  const platformArtifact =
    platform === "mac"
      ? verifyMac(packagedAfter)
      : verifyWindows(packagedAfter);
  const sourceArchive = createSourceArchive(tag, manifest.version);
  ensureDraftRelease(tag, manifest.version);
  uploadNewAssets(
    tag,
    platformArtifact,
    sourceArchive,
    platform === "win"
      ? windowsUpdateFiles(platformArtifact, manifest.version, packagedAfter)
      : [],
  );
  const url = output("gh", [
    "release",
    "view",
    tag,
    "--json",
    "url",
    "--jq",
    ".url",
  ]);
  console.log(
    `\nUploaded verified ${platform} assets to the draft release:\n${url}`,
  );
}
