import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const list = (folder) =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? list(join(folder, entry.name))
      : [join(folder, entry.name).replaceAll("/", "\\")],
  );

test("Visual Studio files have explicit, complete Solution Explorer groups", () => {
  for (const project of ["Desktop", "Audio"]) {
    const path = `BasementBand.${project}.vcxproj`;
    const xml = readFileSync(path, "utf8");
    const filters = readFileSync(path + ".filters", "utf8");
    const items = [
      ...xml.matchAll(/<(None|ClCompile|ClInclude) Include="([^"]+)"\s*\/>/g),
    ];
    const mappings = [
      ...filters.matchAll(
        /<(None|ClCompile|ClInclude) Include="([^"]+)"><Filter>([^<]+)<\/Filter><\/\1>/g,
      ),
    ];
    const groups = new Set(
      [...filters.matchAll(/<Filter Include="([^"]+)"/g)].map((m) => m[1]),
    );
    assert.equal(items.length, mappings.length, path);
    for (const [, type, file] of items) {
      assert.doesNotMatch(
        file,
        /[*;]/,
        "VS filter assignments must be explicit",
      );
      assert.ok(existsSync(file.replaceAll("\\", "/")), file);
      const matches = mappings.filter((m) => m[1] === type && m[2] === file);
      assert.equal(matches.length, 1, file + " must have exactly one group");
      assert.ok(groups.has(matches[0][3]), file + " has an undefined group");
    }
    const expected =
      project === "Desktop"
        ? ["ui", "desktop", "scripts", "docs"]
            .flatMap(list)
            .filter((p) =>
              /^(ui\\.*\.(tsx?|css)|desktop\\.*\.(cjs|html|plist|svg)|scripts\\.*\.(mjs|cjs)|docs\\.*\.md)$/.test(
                p,
              ),
            )
        : list("native").filter((p) => /\.(cpp|h)$/.test(p));
    const included = new Set(items.map((m) => m[2]));
    for (const file of expected)
      assert.ok(included.has(file), file + " missing from solution");
  }
});
