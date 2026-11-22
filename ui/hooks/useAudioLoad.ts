import { useEffect, useState } from "react";
import { getLive, subscribeLive } from "../services/liveState";

/** The engine's audio load averaged over two seconds, shown once a second. */
export function useAudioLoad() {
  const [display, setDisplay] = useState(() => getLive().audioCpu);
  useEffect(() => {
    let samples: { time: number; load: number }[] = [];
    let shown = performance.now();
    return subscribeLive(() => {
      const now = performance.now();
      const load = getLive().audioCpu;
      samples.push({ time: now, load: Number.isFinite(load) ? load : 0 });
      samples = samples.filter((sample) => now - sample.time <= 2000);
      if (now - shown < 1000) return;
      shown = now;
      setDisplay(
        samples.reduce((sum, sample) => sum + Math.max(0, sample.load), 0) /
          samples.length,
      );
    });
  }, []);
  return display;
}
