import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

// Loads a desktop CommonJS module in a fresh context with selected requires
// replaced (typically electron). Every other require resolves from the module's
// own folder, so it sees its real siblings and Node built-ins.
export function loadDesktopModule(file, { stubs = {}, globals = {} } = {}) {
  const path = resolve(file);
  const realRequire = createRequire(path);
  const module = { exports: {} };
  runInNewContext(readFileSync(path, "utf8"), {
    module,
    exports: module.exports,
    process,
    console,
    ...globals,
    require: (name) => (name in stubs ? stubs[name] : realRequire(name)),
  });
  return module.exports;
}
