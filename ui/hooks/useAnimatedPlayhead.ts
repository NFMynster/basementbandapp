import { useLayoutEffect, useEffect, useRef, useState } from "react";
import type { Session } from "../models";
import { getLive, subscribeLive } from "../services/liveState";

const noInset = () => 0;

export type PlayheadOptions = {
  /** Pixels per second. */
  scale: number;
  /** A position being dragged, shown instead of the transport's. */
  drag: number | null;
  /** The timeline position at the element's left edge. */
  origin?: number;
  /** Seconds after `origin` where the playhead is shown. */
  duration?: number;
  /** Pixels between the element's container and `origin`. */
  gutter?: number;
  /** A scroller that keeps the playhead in view while playing. */
  follow?: React.RefObject<HTMLDivElement | null>;
  followEnabled?: boolean;
  /** Counts seeks; the follow view scrolls to each new one. */
  seekRevision?: number;
  /** Pixels of the follow view covered by pinned content on its left. */
  followInset?: (view: HTMLElement) => number;
  /** The slider whose aria-valuenow reports the position after `origin`
   * (the playhead element itself when omitted). */
  slider?: React.RefObject<HTMLElement | null>;
};

/**
 * Moves a playhead element with the transport outside React: it reads the
 * live store, predicts between engine updates while playing, and writes the
 * element's position (and its slider's value) directly.
 */
export function useAnimatedPlayhead(
  session: Session,
  {
    scale,
    drag,
    origin = 0,
    duration = Infinity,
    gutter = 0,
    follow,
    followEnabled = true,
    seekRevision = 0,
    followInset = noInset,
    slider,
  }: PlayheadOptions,
) {
  const element = useRef<HTMLDivElement>(null);
  // Schedules one frame when the loop is idle; set by the frame loop below.
  const wake = useRef<(() => void) | null>(null);
  // Read the clock once, on mount, rather than on every render.
  const [mountedAt] = useState(() => performance.now());
  const settings = useRef({
    session,
    scale,
    drag,
    origin,
    duration,
    gutter,
    followEnabled,
    seekRevision,
  });
  // The engine position the prediction starts from, and when it applied.
  const anchor = useRef({ position: getLive().position, time: mountedAt });
  useLayoutEffect(() => {
    const previous = settings.current.session;
    if (
      session.playing !== previous.playing ||
      session.countdown !== previous.countdown
    )
      anchor.current = { ...anchor.current, time: performance.now() };
    settings.current = {
      session,
      scale,
      drag,
      origin,
      duration,
      gutter,
      followEnabled,
      seekRevision,
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
  useEffect(
    () =>
      subscribeLive(() => {
        const { position } = getLive();
        if (position === anchor.current.position) return;
        anchor.current = { position, time: performance.now() };
        wake.current?.();
      }),
    [],
  );
  useEffect(() => {
    let frame = 0;
    let lastFrame = performance.now();
    let lastSeek = settings.current.seekRevision;
    let settling = false;
    let reported = "";
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
        origin,
        duration,
        gutter,
        followEnabled,
        seekRevision,
      } = settings.current;
      const { time } = anchor.current;
      // Predict only between fresh engine updates; never run indefinitely after a stalled engine.
      let position = anchor.current.position;
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
        const value = Math.max(0, Math.min(duration, relative)).toFixed(2);
        if (value !== reported) {
          reported = value;
          (slider?.current ?? element.current).setAttribute(
            "aria-valuenow",
            value,
          );
        }
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
  }, [follow, followInset, slider]);
  return element;
}
