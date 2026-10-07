import test from "node:test";
import assert from "node:assert/strict";
import updates from "../desktop/updates.cjs";

const { checkForUpdate, isNewerVersion } = updates;

test("release versions are compared as semver", () => {
  assert.equal(isNewerVersion("v0.2.0", "0.1.9"), true);
  assert.equal(isNewerVersion("0.1.1", "0.1.0"), true);
  assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
  assert.equal(isNewerVersion("0.0.9", "0.1.0"), false);
  assert.equal(isNewerVersion("1.0.0", "1.0.0-beta.2"), true);
  assert.equal(isNewerVersion("1.0.0-beta.2", "1.0.0-beta.10"), false);
  assert.equal(isNewerVersion("latest", "0.1.0"), false);
});

test("published newer GitHub release produces a quiet update result", async () => {
  let request;
  const result = await checkForUpdate(async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({ tag_name: "v0.2.0" }),
    };
  }, "0.1.0");
  assert.deepEqual(result, { available: true, version: "0.2.0" });
  assert.match(request.url, /NFMynster\/basementbandapp\/releases\/latest$/);
  assert.equal(request.options.headers["User-Agent"], "Basement-Band/0.1.0");
});

test("missing or older releases do not show an update", async () => {
  assert.deepEqual(await checkForUpdate(async () => ({ ok: false }), "0.1.0"), {
    available: false,
  });
  assert.deepEqual(
    await checkForUpdate(
      async () => ({
        ok: true,
        json: async () => ({ tag_name: "v0.1.0" }),
      }),
      "0.1.0",
    ),
    { available: false },
  );
});
