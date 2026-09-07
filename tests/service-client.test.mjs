import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { ServiceClient } from "../desktop/service-client.cjs";

function start(timeout) {
  const child = spawn(process.execPath, ["tests/fixtures/service.mjs"], {
    windowsHide: true,
  });
  const client = new ServiceClient(child, timeout);
  const exited = new Promise((r) => child.once("close", r));
  return {
    client,
    async close() {
      client.close();
      const timer = setTimeout(() => child.kill(), 1000);
      await exited;
      clearTimeout(timer);
    },
  };
}
test("desktop service correlates out-of-order replies", async () => {
  const { client, close } = start(1000);
  try {
    assert.deepEqual(
      await Promise.all([
        client.request({ value: 1, delay: 30 }),
        client.request({ value: 2 }),
      ]),
      [1, 2],
    );
  } finally {
    await close();
  }
});
for (const op of ["exit", "invalid", "hang"])
  test(`desktop service rejects pending and future requests after ${op}`, async () => {
    const { client, close } = start(100);
    try {
      const result = await Promise.allSettled([
        client.request({ op: "hang" }),
        client.request({ op }),
      ]);
      assert.ok(result.every((r) => r.status === "rejected"));
      await assert.rejects(client.request({ value: "late" }));
    } finally {
      await close();
    }
  });
