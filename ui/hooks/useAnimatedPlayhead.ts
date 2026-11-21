import { useLayoutEffect, useEffect, useRef, useState } from "react";
import type { Session } from "../models";

const noInset = () => 0;

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
  // Pixels of the follow view covered by pinned content on its left.
  followInset: (view: HTMLElement) => number = noInset,
) {
  const element = useRef<HTMLDivElement>(null);
  // Schedules one frame when the loop is idle; set by the frame loop below.
  const wake = useRef<(() => void) | null>(null);
  // Read the clock once, on mount, rather than on every render.
  const [mountedAt] = useState(() => performance.now());
  const anchor = useRef({
    session,
    scale,
    drag,
    origin,
    duration,
    gutter,
    followEnabled,
    seekRevision,
    time: mountedAt,
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
    wake.current?.();
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
    let frame = 0;
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
      frame = 0;
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
          // The playhead in the view's scroll coordinates, and the visible
          // span right of any pinned content.
          const x =
            element.current.parentElement!.getBoundingClientRect().left -
            view.getBoundingClientRect().left -
            view.clientLeft +
            view.scrollLeft +
            gutter +
            relative * scale;
          const inset = followInset(view),
            width = view.clientWidth - inset;
          let target = view.scrollLeft;
          if (x < view.scrollLeft + inset + width * 0.25)
            target = Math.max(0, x - inset - width * 0.25);
          else if (x > view.scrollLeft + inset + width * 0.75)
            target = x - inset - width * 0.75;
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
      // Keep animating only while the playhead or the view is moving. A
      // stopped transport redraws once per change, from wake().
      if (s.playing || settling) frame = requestAnimationFrame(draw);
    };
    wake.current = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    wake.current();
    return () => {
      wake.current = null;
      cancelAnimationFrame(frame);
      view?.removeEventListener("wheel", cancelSettling);
      view?.removeEventListener("pointerdown", cancelSettling);
    };
  }, [follow, followInset]);
  return element;
}
