import { resolve } from "node:path";
import { startRpc } from "../tests/helpers/process.mjs";
const path = process.argv[2];
if (!path)
  throw new Error("Usage: node scripts/check-plugin.mjs <plugin.vst3>");
const rpc = startRpc(
  resolve(
    "artifacts/native/BasementAudio" +
      (process.platform === "win32" ? ".exe" : ""),
  ),
  ["--test-device"],
  { framed: true },
);
try {
  const state = await rpc.send({ op: "addTrack", kind: "midi" });
  const result = await rpc.send({
    op: "plugin",
    track: state.tracks[0].id,
    path: resolve(path),
  });
  if (result.error) throw new Error(result.error);
  console.log("Loaded MIDI instrument:", result.tracks[0].pluginName);
} finally {
  await rpc.close();
}
