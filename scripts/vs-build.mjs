import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const commands = [
  [
    process.execPath,
    [
      "scripts/native.mjs",
      ...(process.argv[2] === "Debug" ? ["--debug"] : []),
      "--engine-only",
    ],
  ],
  ["npm.cmd", ["run", "build:licenses"]],
  ["npm.cmd", ["run", "build:icons"]],
  ["npm.cmd", ["run", "build"]],
];
for (const [executable, args] of commands) {
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    shell: executable.endsWith(".cmd"),
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
