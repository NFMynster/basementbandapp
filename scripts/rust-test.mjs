// The desktop shell's Rust checks. Default: unit tests. `--check`: rustfmt
// and clippy with warnings as errors, as part of `npm run check`.
import { cargo, run, withCargo } from "./build-tools.mjs";
const manifest = ["--manifest-path", "desktop/Cargo.toml"];
const env = withCargo();
if (process.argv.includes("--check")) {
  run(cargo(), ["fmt", ...manifest, "--check"], env);
  run(
    cargo(),
    [
      "clippy",
      ...manifest,
      "--all-targets",
      "--features",
      "session-host",
      "--",
      "-D",
      "warnings",
    ],
    env,
  );
} else run(cargo(), ["test", ...manifest, "--lib", "--quiet"], env);
