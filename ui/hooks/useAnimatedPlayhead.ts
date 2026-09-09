import { useLayoutEffect, useEffect, useRef } from "react";
import type { Session } from "../models";

export function useAnimatedPlayhead(
  session: Session,
  scale: number,
  drag: number | null,
  origin = 0,
  duration = Infinity,
  gutter = 0,
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
      if (element.current) {
        const relative = (drag ?? position) - origin;
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
