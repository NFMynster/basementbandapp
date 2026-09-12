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
  followEnabled = true,
  seekRevision = 0,
) {
  const element = useRef<HTMLDivElement>(null);
  const anchor = useRef({
    session,
    scale,
    drag,
    origin,
    duration,
    gutter,
    followEnabled,
    seekRevision,
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
      followEnabled,
      seekRevision,
      time: changed ? performance.now() : previous.time,
    };
  }, [
    session,
    scale,
    drag,
    origin,
    duration,
    gutter,
    followEnabled,
    seekRevision,
  ]);
  useEffect(() => {
    let frame: number;
    let lastFrame = performance.now();
    let lastSeek = anchor.current.seekRevision;
    let settling = false;
    const cancelSettling = () => {
      settling = false;
    };
    const view = follow?.current;
    view?.addEventListener("wheel", cancelSettling, { passive: true });
    view?.addEventListener("pointerdown", cancelSettling);
    const draw = () => {
      const {
        session: s,
        scale,
        drag,
        time,
        origin,
        duration,
        gutter,
        followEnabled,
        seekRevision,
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
      if (seekRevision !== lastSeek) {
        settling = true;
        lastSeek = seekRevision;
      }
      if (element.current) {
        const relative = (drag ?? position) - origin;
        const view = follow?.current;
        if (
          view &&
          ((s.playing && followEnabled) || settling) &&
          drag === null
        ) {
          const x =
            element.current.parentElement!.offsetLeft +
            gutter +
            relative * scale;
          let target = view.scrollLeft;
          if (x < view.scrollLeft + view.clientWidth * 0.25)
            target = Math.max(0, x - view.clientWidth * 0.25);
          else if (x > view.scrollLeft + view.clientWidth * 0.75)
            target = x - view.clientWidth * 0.75;
          target = Math.min(
            target,
            Math.max(0, view.scrollWidth - view.clientWidth),
          );
          const reduced = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          const delta = target - view.scrollLeft;
          view.scrollLeft +=
            reduced || Math.abs(delta) < 2
              ? delta
              : Math.sign(delta) *
                Math.max(1, Math.abs(delta) * (1 - Math.exp(-elapsed / 85)));
          if (Math.abs(delta) < 2) settling = false;
        }
        element.current.style.left = gutter + relative * scale + "px";
        element.current.style.visibility =
          relative < 0 || relative > duration ? "hidden" : "visible";
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      view?.removeEventListener("wheel", cancelSettling);
      view?.removeEventListener("pointerdown", cancelSettling);
    };
  }, []);
  return element;
}
