import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
// Every shipped npm package (the production dependency tree, which includes
// the auto-updater) plus Electron itself, with its own and Chromium notices.
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
  resolve("node_modules", "electron"),
];
for (const root of packageRoots) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const notices = readdirSync(root).filter(
    (name) =>
      /^(licen[cs]e|copying|notice)/i.test(name) &&
      statSync(join(root, name)).isFile(),
  );
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
const electronDist = resolve("node_modules/electron/dist");
for (const name of ["LICENSE", "LICENSES.chromium.html"])
  if (existsSync(join(electronDist, name)))
    copy(join(electronDist, name), join(destination, "Electron", name));
console.log("License notices collected in", destination);

for (const name of ["signalsmith-stretch", "signalsmith-linear"]) {
  copy(
    resolve(build, "_deps", name + "-src", "LICENSE.txt"),
    join(destination, name, "LICENSE.txt"),
  );
}
