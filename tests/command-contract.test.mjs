import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  ENGINE_COMMANDS,
  LIBRARY_COMMANDS,
  RENDERER_COMMANDS,
} = require("../desktop/commands.cjs");

const sorted = (values) => [...values].sort();

// Collects every string literal used as an `op` within one exported type.
function typedOps(source, typeName) {
  const start = source.indexOf(`export type ${typeName} =`);
  assert.notEqual(start, -1, `ui/models.ts declares ${typeName}`);
  const end = source.indexOf("\nexport type ", start + 1);
  const block = source.slice(start, end === -1 ? undefined : end);
  const ops = new Set();
  for (const match of block.matchAll(/op:\s*((?:\s*\|?\s*"\w+")+)/g))
    for (const literal of match[1].matchAll(/"(\w+)"/g)) ops.add(literal[1]);
  return ops;
}

test("native router handles exactly the registered engine commands", () => {
  const source = readFileSync("native/Commands.cpp", "utf8");
  const routes = Object.fromEntries(
    [...source.matchAll(/\{"(\w+)",\s*&Engine::handle(\w+)Command\}/g)].map(
      ([, op, domain]) => [op, domain.toLowerCase()],
    ),
  );
  const expected = Object.fromEntries(
    Object.entries(ENGINE_COMMANDS)
      .filter(([, command]) => command.domain !== "history")
      .map(([op, command]) => [op, command.domain]),
  );
  assert.deepEqual(routes, expected);
});

test("renderer contract types exactly the commands IPC allows", () => {
  const models = readFileSync("ui/models.ts", "utf8");
  const typed = new Set([
    ...typedOps(models, "SessionCommand"),
    ...typedOps(models, "DeviceCommand"),
  ]);
  assert.deepEqual(sorted(typed), sorted(RENDERER_COMMANDS));
  assert.deepEqual(
    sorted(typedOps(models, "LibraryCommand")),
    sorted(LIBRARY_COMMANDS),
  );
});

test("every engine command names a known domain and sender", () => {
  const domains = [
    "history",
    "track",
    "plugin",
    "transport",
    "region",
    "session",
    "device",
    "test",
  ];
  for (const [op, { domain, sender }] of Object.entries(ENGINE_COMMANDS)) {
    assert.ok(domains.includes(domain), `${op} has a known domain`);
    assert.ok(
      ["renderer", "desktop", "test"].includes(sender),
      `${op} has a known sender`,
    );
    assert.equal(sender === "test", domain === "test", `${op} test scope`);
  }
});
