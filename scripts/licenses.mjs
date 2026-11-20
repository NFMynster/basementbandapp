import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Keep the upstream text intact, including notices embedded in source headers.
// This collects notices, not the corresponding source required for distribution.
const arch = process.env.BASEMENT_ARCH || process.arch;
const build = arch === process.arch ? "build/native" : `build/native-${arch}`;
const juce = resolve(build, "_deps/juce-src");
const destination = resolve("artifacts/licenses");
if (!existsSync(join(juce, "LICENSE.md")))
  throw new Error("Build the native engine before collecting licenses.");
// Start clean so notices of dependencies that are gone do not linger.
rmSync(destination, { recursive: true, force: true });
const copy = (source, target) => {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
};
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
  copy(name, join(destination, name));
copy("licenses/GPL-3.0.txt", join(destination, "GPL-3.0.txt"));
copy("docs/LICENSING.md", join(destination, "RELEASE-CHECKLIST.md"));
const upstream = readFileSync(join(juce, "LICENSE.md"), "utf8");
copy(join(juce, "LICENSE.md"), join(destination, "JUCE/LICENSE.md"));
for (const match of upstream.matchAll(/\]\((modules\/[^)]+)\)/g)) {
  const relative = decodeURIComponent(match[1]);
  const source = resolve(juce, relative);
  if (!source.startsWith(juce + "/") && !source.startsWith(juce + "\\"))
    throw new Error("Invalid upstream notice path");
  if (existsSync(source) && statSync(source).isFile())
    copy(source, join(destination, "JUCE", relative));
}
for (const name of ["signalsmith-stretch", "signalsmith-linear"]) {
  copy(
    resolve(build, "_deps", name + "-src", "LICENSE.txt"),
    join(destination, name, "LICENSE.txt"),
  );
}

const NOTICE = /^(licen[cs]e|copying|notice|copyright)/i;
const noticesIn = (folder) =>
  readdirSync(folder).filter(
    (name) => NOTICE.test(name) && statSync(join(folder, name)).isFile(),
  );

// Every npm package bundled into the UI (the production dependency tree).
// `npm run` provides npm's own script path, which avoids spawning npm.cmd
// through a shell on Windows.
const npmArgs = ["ls", "--omit=dev", "--all", "--parseable"];
const listed = process.env.npm_execpath
  ? spawnSync(process.execPath, [process.env.npm_execpath, ...npmArgs], {
      encoding: "utf8",
    })
  : spawnSync("npm", npmArgs, { encoding: "utf8" });
if (listed.status !== 0)
  throw new Error(`npm ls failed: ${listed.stderr || listed.stdout}`);
const packageRoots = [
  ...new Set(
    listed.stdout
      .split(/\r?\n/)
      .filter((line) => line.includes("node_modules")),
  ),
];
for (const root of packageRoots) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const notices = noticesIn(root);
  if (!notices.length) {
    // A few packages publish only a license field; record what they declare.
    if (typeof manifest.license !== "string")
      throw new Error(`${manifest.name} declares no license`);
    const author =
      typeof manifest.author === "string"
        ? manifest.author
        : manifest.author?.name || "its authors";
    mkdirSync(join(destination, "npm", manifest.name), { recursive: true });
    writeFileSync(
      join(destination, "npm", manifest.name, "LICENSE-DECLARED.txt"),
      `${manifest.name} ${manifest.version}\nLicense: ${manifest.license}\nCopyright ${author}\n\nThe package ships no license file; this records the license declared in its package.json.\n`,
    );
  }
  for (const name of notices)
    copy(join(root, name), join(destination, "npm", manifest.name, name));
}

// Every Rust crate linked into the desktop shell on this platform: the
// normal (not build- or dev-only) dependency graph of desktop/Cargo.toml.
const toolchain = (tool) => {
  const exe = process.platform === "win32" ? `${tool}.exe` : tool;
  if (!spawnSync(exe, ["--version"], { stdio: "ignore" }).error) return exe;
  return join(homedir(), ".cargo", "bin", exe);
};
const host = spawnSync(toolchain("rustc"), ["-vV"], {
  encoding: "utf8",
}).stdout?.match(/^host: (.+)$/m)?.[1];
if (!host) throw new Error("Install Rust (https://rustup.rs) first.");
const metadata = spawnSync(
  toolchain("cargo"),
  [
    "metadata",
    "--format-version",
    "1",
    "--manifest-path",
    "desktop/Cargo.toml",
    "--filter-platform",
    host,
    "--locked",
  ],
  { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
);
if (metadata.status !== 0)
  throw new Error(`cargo metadata failed: ${metadata.stderr}`);
const { packages, resolve: graph } = JSON.parse(metadata.stdout);
const crates = new Map(packages.map((p) => [p.id, p]));
const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
const shipped = new Set();
const pending = [graph.root];
while (pending.length) {
  const id = pending.pop();
  if (shipped.has(id)) continue;
  shipped.add(id);
  for (const dep of nodes.get(id)?.deps ?? [])
    if (dep.dep_kinds.some((kind) => kind.kind === null)) pending.push(dep.pkg);
}
shipped.delete(graph.root);
for (const id of shipped) {
  const crate = crates.get(id);
  const folder = dirname(crate.manifest_path);
  const target = join(destination, "rust", `${crate.name}-${crate.version}`);
  const notices = noticesIn(folder);
  for (const name of notices) copy(join(folder, name), join(target, name));
  if (!notices.length) {
    if (!crate.license && !crate.license_file)
      throw new Error(`${crate.name} declares no license`);
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(target, "LICENSE-DECLARED.txt"),
      `${crate.name} ${crate.version}\nLicense: ${crate.license || crate.license_file}\nAuthors: ${(crate.authors || []).join(", ") || "its authors"}\n\nThe crate ships no license file; this records the license declared in its Cargo.toml.\n`,
    );
  }
}
console.log("License notices collected in", destination);
