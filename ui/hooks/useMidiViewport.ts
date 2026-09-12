import { useEffect, useMemo, useRef, useState } from "react";
import { useAnimatedPlayhead } from "./useAnimatedPlayhead";
import type { Clip, Session, Command, CommandResult } from "../models";
type Options = {
  clip: Clip | undefined;
  session: Session;
  busy: boolean;
  dragPosition: number | null;
  setDragPosition: (position: number | null) => void;
  run: <C extends Command>(
    command: C,
    change?: boolean,
  ) => Promise<CommandResult<C> | undefined>;
};
export function useMidiViewport({
  clip,
  session,
  busy,
  dragPosition,
  setDragPosition,
  run,
}: Options) {
  const notes = clip?.notes ?? [];
  const [division, setDivision] = useState(16),
    [snap, setSnap] = useState(true),
    [zoom, setZoom] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const [fullKeyboard, setFullKeyboard] = useState(false);
  const pitchRange = useMemo(
    () =>
      notes.length
        ? {
            high: Math.min(127, Math.max(...notes.map((n) => n.note)) + 2),
            low: Math.max(0, Math.min(...notes.map((n) => n.note)) - 2),
          }
        : { high: 84, low: 36 },
    [clip?.id],
  );
  const high = fullKeyboard
    ? 127
    : Math.max(pitchRange.high, ...notes.map((n) => n.note));
  const low = fullKeyboard
    ? 0
    : Math.min(pitchRange.low, ...notes.map((n) => n.note));
  const [viewportWidth, setViewportWidth] = useState(600);
  const step = 240 / session.tempo / division,
    px = Math.max(
      (viewportWidth - 60) / Math.max(0.001, clip?.duration ?? 1),
      zoom / (60 / session.tempo),
    ),
    row = 20;
  const playhead = useAnimatedPlayhead(
    session,
    px,
    dragPosition,
    clip?.start ?? 0,
    clip?.duration ?? 0,
    60,
  );
  const unavailable = session.recording || busy;
  const quantize = (v: number) => (snap ? Math.round(v / step) * step : v);
  const seekDrag = useRef<number | null>(null);
  function seekAt(clientX: number) {
    const left =
      scroll.current?.querySelector(".piano-grid")?.getBoundingClientRect()
        .left ?? 0;
    return (
      (clip?.start ?? 0) +
      Math.max(
        0,
        Math.min(clip?.duration ?? 0, quantize((clientX - left - 60) / px)),
      )
    );
  }
  function beginSeek(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.button !== 0 || unavailable || !clip) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    seekDrag.current = seekAt(e.clientX);
    setDragPosition(seekDrag.current);
  }
  function moveSeek(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.stopPropagation();
    seekDrag.current = seekAt(e.clientX);
    setDragPosition(seekDrag.current);
  }
  function endSeek(e: React.PointerEvent<HTMLDivElement>) {
    if (seekDrag.current === null) return;
    e.stopPropagation();
    const position = seekAt(e.clientX);
    seekDrag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    void run({ op: "seek", position }, false).finally(() =>
      setDragPosition(null),
    );
  }
  function cancelSeek() {
    if (seekDrag.current === null) return;
    seekDrag.current = null;
    setDragPosition(null);
  }
  useEffect(
    () => () => {
      if (seekDrag.current !== null) setDragPosition(null);
    },
    [clip?.id],
  );
  useEffect(() => {
    if (scroll.current)
      scroll.current.scrollTop = Math.max(
        0,
        (high - (notes[0]?.note ?? 60)) * row - 70,
      );
  }, [clip?.id, fullKeyboard]);
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setViewportWidth(node.clientWidth),
    );
    setViewportWidth(node.clientWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [clip?.id]);
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const x = event.clientX - node.getBoundingClientRect().left;
      const time = (node.scrollLeft + x - 60) / px;
      const nextPx = Math.max(
        (viewportWidth - 60) / Math.max(0.001, clip?.duration ?? 1),
        Math.min(
          640 / (60 / session.tempo),
          px * Math.exp(-event.deltaY * 0.008),
        ),
      );
      setZoom(
        nextPx <=
          (viewportWidth - 60) / Math.max(0.001, clip?.duration ?? 1) + 0.001
          ? 0
          : Math.min(640, nextPx * (60 / session.tempo)),
      );
      requestAnimationFrame(() => {
        node.scrollLeft = time * nextPx + 60 - x;
      });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [px, viewportWidth, clip?.duration, session.tempo]);
  function seekKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!clip) return;

    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (unavailable) return;
    const time =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? clip.duration
          : session.position -
            clip.start +
            (e.key === "ArrowLeft" ? -step : step);
    void run(
      {
        op: "seek",
        position: clip.start + Math.max(0, Math.min(clip.duration, time)),
      },
      false,
    );
  }
  return {
    tempo: session.tempo,
    position: session.position,
    seekKeyDown,
    division,
    setDivision,
    snap,
    setSnap,
    zoom,
    setZoom,
    scroll,
    fullKeyboard,
    setFullKeyboard,
    high,
    low,
    viewportWidth,
    step,
    px,
    row,
    playhead,
    quantize,
    beginSeek,
    moveSeek,
    endSeek,
    cancelSeek,
    unavailable,
  };
}
