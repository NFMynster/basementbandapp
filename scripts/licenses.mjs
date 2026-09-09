import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

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
// Renderer dependencies and Electron's own/Chromium notices.
for (const packageName of [
  "react",
  "react-dom",
  "scheduler",
  "lucide-react",
  "electron",
]) {
  const root = resolve("node_modules", packageName);
  for (const name of readdirSync(root)) {
    if (
      /^(licen[cs]e|copying|notice)/i.test(name) &&
      statSync(join(root, name)).isFile()
    )
      copy(join(root, name), join(destination, "npm", packageName, name));
  }
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
