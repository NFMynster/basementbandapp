import { useRef, useState, type PointerEvent } from "react";
import type { Session, Command, CommandResult } from "../models";
const RULER_SNAP_DIVISIONS = 4;
const RULER_DRAG_THRESHOLD = 4;
function rulerPosition(
  clientX: number,
  rect: DOMRect,
  zoom: number,
  secondsPerBar: number,
) {
  const bars = (clientX - rect.left) / zoom;
  return Math.max(
    0,
    (Math.round(bars * RULER_SNAP_DIVISIONS) / RULER_SNAP_DIVISIONS) *
      secondsPerBar,
  );
}

type Options = {
  session: Pick<Session, "recording" | "loopStart" | "loopEnd" | "looping">;
  zoom: number;
  secondsPerBar: number;
  run: <C extends Command>(
    command: C,
    change?: boolean,
  ) => Promise<CommandResult<C> | undefined>;
};
export function useRulerGesture({
  session: s,
  zoom,
  secondsPerBar,
  run,
}: Options) {
  const pxPerSecond = zoom / secondsPerBar;
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const rulerRevision = useRef(0);
  const rulerGesture = useRef<{
    mode: "seek" | "loop";
    start: number;
    x: number;
    inside: boolean;
  } | null>(null);
  function rulerDown(e: PointerEvent) {
    if (s.recording || e.button !== 0) return;
    ++rulerRevision.current;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const start = rulerPosition(e.clientX, rect, zoom, secondsPerBar);
    const mode =
      (e.target as HTMLElement).closest<HTMLElement>("[data-ruler-zone]")
        ?.dataset.rulerZone === "seek"
        ? "seek"
        : "loop";
    const raw = (e.clientX - rect.left) / pxPerSecond;
    rulerGesture.current = {
      mode,
      start,
      x: e.clientX,
      inside: raw >= s.loopStart && raw <= s.loopEnd,
    };
    if (mode === "seek") {
      setSelection(null);
      setDragPosition(start);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function rulerMove(e: PointerEvent) {
    const gesture = rulerGesture.current;
    if (!gesture || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const end = rulerPosition(e.clientX, rect, zoom, secondsPerBar);
    if (gesture.mode === "seek") setDragPosition(end);
    else if (Math.abs(e.clientX - gesture.x) > RULER_DRAG_THRESHOLD)
      setSelection({ start: gesture.start, end });
  }
  function rulerUp(e: PointerEvent) {
    const gesture = rulerGesture.current;
    if (!gesture) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const end = rulerPosition(e.clientX, rect, zoom, secondsPerBar);
    rulerGesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const a = Math.min(gesture.start, end),
      b = Math.max(gesture.start, end);
    if (gesture.mode === "seek")
      void run({ op: "seek", position: end }, false).finally(() =>
        setDragPosition(null),
      );
    else if (
      Math.abs(e.clientX - gesture.x) <= RULER_DRAG_THRESHOLD &&
      gesture.inside
    ) {
      void run({
        op: "loop",
        start: s.loopStart,
        end: s.loopEnd,
        enabled: !s.looping,
      });
      setSelection(null);
    } else if (b - a >= 0.05) {
      const revision = rulerRevision.current;
      setSelection({ start: a, end: b });
      // Keep the final preview until the native reply replaces the old range.
      void run({ op: "loop", start: a, end: b, enabled: true }).finally(() => {
        if (revision === rulerRevision.current) setSelection(null);
      });
    } else setSelection(null);
  }
  function rulerCancel() {
    ++rulerRevision.current;
    rulerGesture.current = null;
    setSelection(null);
    setDragPosition(null);
  }

  return {
    selection,
    setSelection,
    dragPosition,
    setDragPosition,
    rulerDown,
    rulerMove,
    rulerUp,
    rulerCancel,
  };
}
