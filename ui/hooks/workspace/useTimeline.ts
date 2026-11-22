import { useEffect, useRef, useState } from "react";
import type { Session } from "../../models";
import { getLive, useLive } from "../../services/liveState";

/** Width of the track sidebar pinned over the left of the arrangement scroller. */
export function timelineInset(view: HTMLElement) {
  return view.querySelector<HTMLElement>(".track-sidebar")?.offsetWidth ?? 0;
}

/**
 * The part of the arrangement scroller that shows the timeline, right of the
 * pinned track sidebar. `left` and `right` are client coordinates; the
 * scroller's scrollLeft maps to timeline pixels as if the sidebar were absent.
 */
export function timelineViewport(view: HTMLElement) {
  const inset = timelineInset(view),
    start = view.getBoundingClientRect().left + view.clientLeft;
  return {
    left: start + inset,
    right: start + view.clientWidth,
    width: view.clientWidth - inset,
  };
}

/** Arrangement geometry: zoom, scale, length and scroll refs. */
export function useTimeline(s: Session) {
  const [zoom, setZoom] = useState(88);
  // One scroller holds the track headers and the lanes, so both move together
  // natively; the headers stay pinned on the left with position: sticky.
  const timelineScroll = useRef<HTMLDivElement>(null);
  const secondsPerBar = 240 / s.tempo,
    pxPerSecond = zoom / secondsPerBar;
  // A recording grows the arrangement bar by bar, so this re-renders once a
  // bar rather than on every live frame.
  const recordingBar = useLive((live) =>
    s.recording ? Math.floor(live.position / secondsPerBar) : 0,
  );
  const end = Math.max(
      32 * secondsPerBar,
      s.recording ? (recordingBar + 9) * secondsPerBar : 0,
      ...s.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration + 8)),
    ),
    width = Math.ceil(end / secondsPerBar) * zoom;

  // Bring the playhead into view when recording starts off-screen.
  const wasRecording = useRef(false);
  useEffect(() => {
    const timeline = timelineScroll.current;
    if (s.recording && !wasRecording.current && timeline) {
      const x = getLive().position * pxPerSecond,
        { width } = timelineViewport(timeline);
      if (x < timeline.scrollLeft + 24 || x > timeline.scrollLeft + width - 64)
        timeline.scrollTo({
          left: Math.max(0, x - width * 0.2),
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
    }
    wasRecording.current = s.recording;
  }, [s.recording, pxPerSecond]);

  return {
    zoom,
    setZoom,
    timelineScroll,
    secondsPerBar,
    pxPerSecond,
    width,
  };
}

export type Timeline = ReturnType<typeof useTimeline>;
