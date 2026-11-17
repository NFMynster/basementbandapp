import { useEffect, useRef, useState } from "react";
import type { Session } from "../../models";

/** Arrangement geometry: zoom, scale, length, position readout and scroll refs. */
export function useTimeline(s: Session) {
  const [zoom, setZoom] = useState(88);
  const trackList = useRef<HTMLElement>(null),
    timelineScroll = useRef<HTMLDivElement>(null);
  const secondsPerBar = 240 / s.tempo,
    pxPerSecond = zoom / secondsPerBar;
  const end = Math.max(
      32 * secondsPerBar,
      s.recording ? s.position + 8 * secondsPerBar : 0,
      ...s.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration + 8)),
    ),
    width = Math.ceil(end / secondsPerBar) * zoom;
  const bar = Math.floor(s.position / secondsPerBar) + 1,
    beat = (Math.floor(s.position / (60 / s.tempo)) % 4) + 1;

  // Bring the playhead into view when recording starts off-screen.
  const wasRecording = useRef(false);
  useEffect(() => {
    const timeline = timelineScroll.current;
    if (s.recording && !wasRecording.current && timeline) {
      const x = s.position * pxPerSecond;
      if (
        x < timeline.scrollLeft + 24 ||
        x > timeline.scrollLeft + timeline.clientWidth - 64
      )
        timeline.scrollTo({
          left: Math.max(0, x - timeline.clientWidth * 0.2),
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
    }
    wasRecording.current = s.recording;
  }, [s.recording, s.position, pxPerSecond]);

  return {
    zoom,
    setZoom,
    trackList,
    timelineScroll,
    secondsPerBar,
    pxPerSecond,
    width,
    bar,
    beat,
  };
}

export type Timeline = ReturnType<typeof useTimeline>;
