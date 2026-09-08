import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { NativeClient } from "../desktop/native-client.cjs";

function start(timeout) {
  const child = spawn(process.execPath, ["tests/fixtures/service.mjs"], {
    windowsHide: true,
  });
  const client = new NativeClient(child, timeout);
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
test("desktop service serializes native replies", async () => {
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
test("closing drains the active reply and rejects queued requests without writing after EOF", async () => {
  const { client, close } = start(1000);
  try {
    const first = client.request({ value: "active", delay: 100 });
    const queued = client.request({ value: "queued" });
    const settled = Promise.allSettled([first, queued]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    client.close();
    const results = await settled;
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[0].value, "active");
    assert.equal(results[1].status, "rejected");
    await assert.rejects(client.request({ value: "after close" }), /closing/);
  } finally {
    await close();
  }
});
for (const op of ["exit", "invalid", "hang"])
  test(`desktop service rejects pending and future requests after ${op}`, async () => {
    const { client, close } = start(100);
    try {
      const result = await Promise.allSettled([
        client.request({ op }),
        client.request({ value: "queued" }),
      ]);
      assert.ok(result.every((r) => r.status === "rejected"));
      await assert.rejects(client.request({ value: "late" }));
    } finally {
      await close();
    }
  });
