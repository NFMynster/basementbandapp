import { useState } from "react";
import type { EngineSession } from "./useEngineSession";

/**
 * Tempo edits apply directly to an empty session. Once regions exist, the new
 * tempo waits in `pendingTempo` until the user picks how regions follow it.
 */
export function useTempoChange({
  s,
  busy,
  run,
  withBusy,
}: Pick<EngineSession, "s" | "busy" | "run" | "withBusy">) {
  const [pendingTempo, setPendingTempo] = useState<number | null>(null);
  async function requestTempo(value: number) {
    if (busy || s.recording || value === s.tempo) return;
    if (s.tracks.some((t) => t.clips.length)) setPendingTempo(value);
    else await run({ op: "tempo", value });
  }
  async function applyTempo(match: "none" | "midi" | "all") {
    if (pendingTempo === null || busy) return;
    await withBusy(async () => {
      if (s.playing && match !== "none") await run({ op: "stop" }, false);
      await run({ op: "tempo", value: pendingTempo, match });
    });
    setPendingTempo(null);
  }
  return { pendingTempo, setPendingTempo, requestTempo, applyTempo };
}
