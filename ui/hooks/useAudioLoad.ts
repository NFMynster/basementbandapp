import { useEffect, useEffectEvent, useState } from "react";

/** Two-second average, published once a second instead of at the engine poll rate. */
export function useAudioLoad(value: number | undefined) {
  const load = Number.isFinite(value) ? Math.max(0, value!) : 0;
  const latest = useEffectEvent(() => load);
  const [display, setDisplay] = useState(load);
  useEffect(() => {
    const samples: number[] = [];
    let ticks = 0;
    const timer = setInterval(() => {
      samples.push(latest());
      if (samples.length > 20) samples.shift();
      if (++ticks % 10 === 0)
        setDisplay(
          samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
        );
    }, 100);
    return () => clearInterval(timer);
  }, []);
  return display;
}
