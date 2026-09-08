import { useLayoutEffect, useEffect, useRef } from "react";
import type { Session } from "../models";

export function useAnimatedPlayhead(
  session: Session,
  scale: number,
  drag: number | null,
) {
  const element = useRef<HTMLDivElement>(null);
  const anchor = useRef({ session, scale, drag, time: performance.now() });
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
      time: changed ? performance.now() : previous.time,
    };
  }, [session, scale, drag]);
  useEffect(() => {
    let frame: number;
    const draw = () => {
      const { session: s, scale, drag, time } = anchor.current;
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
      if (element.current)
        element.current.style.left = (drag ?? position) * scale + "px";
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return element;
}
