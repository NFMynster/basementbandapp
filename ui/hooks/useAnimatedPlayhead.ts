import { useLayoutEffect, useEffect, useRef } from "react";
import type { Session } from "../models";

export function useAnimatedPlayhead(
  session: Session,
  scale: number,
  drag: number | null,
  origin = 0,
  duration = Infinity,
  gutter = 0,
  follow?: React.RefObject<HTMLDivElement | null>,
) {
  const element = useRef<HTMLDivElement>(null);
  const anchor = useRef({
    session,
    scale,
    drag,
    origin,
    duration,
    gutter,
    time: performance.now(),
  });
  useLayoutEffect(() => {
    const previous = anchor.current;
    const changed =
      session.position !== previous.session.position ||
      session.playing !== previous.session.playing ||
      session.countdown !== previous.session.countdown;
    anchor.current = {
      session,
      scale,
      drag,
      origin,
      duration,
      gutter,
      time: changed ? performance.now() : previous.time,
    };
  }, [session, scale, drag, origin, duration, gutter]);
  useEffect(() => {
    let frame: number;
    let lastFrame = performance.now();
    let lastPosition = anchor.current.session.position;
    let settling = false;
    const draw = () => {
      const {
        session: s,
        scale,
        drag,
        time,
        origin,
        duration,
        gutter,
      } = anchor.current;
      // Predict only between fresh engine updates; never run indefinitely after a stalled engine.
      let position = s.position;
      if (s.playing && !s.countdown)
        position += Math.min(0.15, (performance.now() - time) / 1000);
      if (
        s.playing &&
        s.looping &&
        s.loopEnd > s.loopStart &&
        position >= s.loopEnd
      )
        position =
          s.loopStart + ((position - s.loopStart) % (s.loopEnd - s.loopStart));
      const elapsed = Math.min(64, performance.now() - lastFrame);
      lastFrame = performance.now();
      if (s.position !== lastPosition) {
        settling = true;
        lastPosition = s.position;
      }
      if (element.current) {
        const relative = (drag ?? position) - origin;
        const view = follow?.current;
        if (view && (s.playing || settling) && drag === null) {
          const x = gutter + relative * scale;
          let target = view.scrollLeft;
          if (x < view.scrollLeft + 24) target = Math.max(0, x - 24);
          else if (x > view.scrollLeft + view.clientWidth * 0.75)
            target = x - view.clientWidth * 0.75;
          const reduced = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          const delta = target - view.scrollLeft;
          view.scrollLeft +=
            reduced || Math.abs(delta) < 1
              ? delta
              : delta * (1 - Math.exp(-elapsed / 85));
          if (Math.abs(delta) < 1) settling = false;
        }
        element.current.style.left = gutter + relative * scale + "px";
        element.current.style.visibility =
          relative < 0 || relative > duration ? "hidden" : "visible";
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return element;
}
