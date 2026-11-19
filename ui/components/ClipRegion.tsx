import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Clip, Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { Waveform } from "./Waveform";
import { MidiNotes } from "./MidiNotes";
import { ContextMenu } from "./ContextMenu";
import { ArrowLeftToLine, ArrowRightToLine, Repeat2 } from "lucide-react";
const loopCursor = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M19 8a8 8 0 1 0 1 8M19 3v6h-6" fill="none" stroke="black" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 8a8 8 0 1 0 1 8M19 3v6h-6" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>')}") 12 12, crosshair`;

/**
 * One edge-scroll step for a drag held near the timeline's edge: up to 18 px
 * sideways (and 12 px vertically when `vertical`), faster nearer the edge.
 * With `grow`, the timeline gains temporary room at its end (cleared by the
 * region once its preview is gone). Returns whether anything scrolled.
 */
function scrollTowardsEdge(
  view: HTMLElement,
  at: { x: number; y: number },
  vertical: boolean,
  grow: boolean,
) {
  const bounds = view.getBoundingClientRect(),
    zone = 48;
  const speed = (towardsStart: number, towardsEnd: number) =>
    towardsEnd > 0
      ? Math.min(1, towardsEnd / zone)
      : towardsStart > 0
        ? -Math.min(1, towardsStart / zone)
        : 0;
  const dx = speed(bounds.left + zone - at.x, at.x - (bounds.right - zone));
  const dy = vertical
    ? speed(bounds.top + zone - at.y, at.y - (bounds.bottom - zone))
    : 0;
  const left = view.scrollLeft,
    top = view.scrollTop;
  if (grow && dx > 0 && left >= view.scrollWidth - view.clientWidth - 1)
    view
      .querySelector<HTMLElement>(".timeline")
      ?.style.setProperty("min-width", `${view.scrollWidth + 240}px`);
  view.scrollLeft += Math.round(dx * 18);
  view.scrollTop += Math.round(dy * 12);
  return view.scrollLeft !== left || view.scrollTop !== top;
}

export function ClipRegion({
  clip: c,
  track: t,
  controller: w,
}: {
  clip: Clip;
  track: Track;
  controller: WorkspaceController;
}) {
  const [preview, setPreview] = useState<{
      position: number;
      y: number;
      duration?: number;
      // Repeat drags preview looped peaks instead of a trimmed window.
      repeat?: boolean;
    } | null>(null),
    [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const drag = useRef<{
    x: number;
    y: number;
    scrollX: number;
    scrollY: number;
    moved: boolean;
    mode: "move" | "left" | "right" | "repeat";
  } | null>(null);
  // Last pointer position of the active drag, and the edge-scroll frame.
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const edgeScroll = useRef<number | null>(null);
  const stopEdgeScroll = () => {
    if (edgeScroll.current !== null) cancelAnimationFrame(edgeScroll.current);
    edgeScroll.current = null;
  };
  useEffect(() => stopEdgeScroll, []);
  // Room added while edge-scrolling is dropped once the drag preview is gone:
  // after a commit the timeline has grown to fit the edited region itself.
  useEffect(() => {
    if (!preview)
      w.timelineScroll.current
        ?.querySelector<HTMLElement>(".timeline")
        ?.style.removeProperty("min-width");
  }, [preview, w.timelineScroll]);
  // Abandons an unfinished drag: nothing is committed, previews disappear.
  const cancelDrag = () => {
    stopEdgeScroll();
    if (!drag.current) return;
    drag.current = null;
    w.setRegionMove(null);
    setPreview(null);
  };
  const select = () => {
    w.setSelected(t.id);
    w.setClipId(c.id);
  };
  const position = (x: number) =>
    Math.max(
      0,
      Math.round(
        (c.start +
          (x -
            drag.current!.x +
            (w.timelineScroll.current?.scrollLeft ?? 0) -
            drag.current!.scrollX) /
            w.pxPerSecond) /
          (60 / w.s.tempo),
      ) *
        (60 / w.s.tempo),
    );
  const takes = t.clips.filter(
    (other) => !!c.takeGroup && other.takeGroup === c.takeGroup,
  );
  const trimAt = (x: number) => {
    const delta =
      (x -
        drag.current!.x +
        (w.timelineScroll.current?.scrollLeft ?? 0) -
        drag.current!.scrollX) /
      w.pxPerSecond;
    if (drag.current!.mode === "repeat") {
      // Near a whole number of copies the loop end snaps there instead of to
      // the beat, so dragging back to the region's own end adds nothing even
      // when the region doesn't end on a beat.
      const dragged = c.duration + delta;
      const copies = Math.max(1, Math.round(dragged / c.duration));
      const length =
        Math.abs(dragged - copies * c.duration) * w.pxPerSecond <= 12
          ? copies * c.duration
          : Math.round((c.start + dragged) / (60 / w.s.tempo)) *
              (60 / w.s.tempo) -
            c.start;
      return {
        position: c.start,
        duration: Math.max(c.duration, Math.min(1200, length)),
        y: 0,
        repeat: true,
      };
    }
    const minimum = Math.min(c.duration, 12 / w.pxPerSecond);
    const shortest = Math.min(
      c.duration,
      ...takes.map((take) => take.duration),
    );
    const cut =
      drag.current!.mode === "left"
        ? Math.min(
            Math.max(
              Math.max(
                -c.start,
                ...(c.kind === "midi"
                  ? [c.duration - 1200]
                  : [c, ...takes].map(
                      (take) => take.sourceStart - take.offset,
                    )),
              ),
              delta,
            ),
            Math.max(0, shortest - Math.min(shortest, minimum)),
          )
        : Math.max(
            Math.min(
              c.kind === "midi"
                ? 1200 - c.duration
                : c.sourceEnd - c.offset - c.duration,
              delta,
            ),
            -c.duration + minimum,
          );
    return drag.current!.mode === "left"
      ? { position: c.start + cut, duration: c.duration - cut, y: 0 }
      : { position: c.start, duration: c.duration + cut, y: 0 };
  };
  // Draws the drag at a pointer position; position() and trimAt() already
  // account for how far the timeline scrolled since the drag began.
  const showDrag = (x: number, y: number) => {
    if (!drag.current?.moved) return;
    if (drag.current.mode === "move" && w.selectedRegions.length > 1) {
      w.setRegionMove(
        Math.max(
          -Math.min(...w.selectedRegions.map((c) => c.start)),
          position(x) - c.start,
        ),
      );
      return;
    }
    setPreview(
      drag.current.mode !== "move"
        ? trimAt(x)
        : {
            position: position(x),
            y:
              y -
              drag.current.y +
              (w.timelineScroll.current?.scrollTop ?? 0) -
              drag.current.scrollY,
          },
    );
  };
  // Holding a drag near the timeline's edge scrolls it, faster the closer
  // the pointer is, so handles and regions can go past the visible area.
  // Moving a region also scrolls vertically towards other tracks.
  const scrollAtEdge = () => {
    edgeScroll.current = null;
    const view = w.timelineScroll.current,
      at = pointer.current;
    if (!drag.current || !view || !at) return;
    const moving = drag.current.mode === "move";
    // A single-region drag may push the timeline past its end; several
    // regions move by a shared delta and stay within it.
    if (
      !scrollTowardsEdge(
        view,
        at,
        moving,
        !(moving && w.selectedRegions.length > 1),
      )
    )
      return;
    showDrag(at.x, at.y);
    edgeScroll.current = requestAnimationFrame(scrollAtEdge);
  };
  const cutStart =
    preview?.duration === undefined ? 0 : preview.position - c.start;
  const previewDuration = preview?.duration ?? c.duration;
  // A loop drag keeps the source region as is and previews each repeat as
  // its own region, matching the separate copies the engine creates.
  const shownDuration = preview?.repeat ? c.duration : previewDuration;
  const repeatCopies: { start: number; duration: number }[] = [];
  if (preview?.repeat)
    for (
      let at = c.duration;
      at < previewDuration - 1e-6 && repeatCopies.length < 2048;
      at += c.duration
    )
      repeatCopies.push({
        start: c.start + at,
        duration: Math.min(c.duration, previewDuration - at),
      });
  const displayedClip =
    preview?.duration === undefined || preview.repeat
      ? c
      : {
          ...c,
          duration: preview.duration,
          peaks: c.peaks.slice(
            Math.max(0, Math.floor((cutStart / c.duration) * c.peaks.length)),
            Math.max(
              1,
              Math.ceil(
                ((cutStart + previewDuration) / c.duration) * c.peaks.length,
              ),
            ),
          ),
          notes: c.notes
            ?.filter(
              (note) =>
                note.start + note.duration > cutStart &&
                note.start < cutStart + previewDuration,
            )
            .map((note) => ({
              ...note,
              start: Math.max(0, note.start - cutStart),
              duration:
                Math.min(
                  note.start + note.duration,
                  cutStart + previewDuration,
                ) - Math.max(note.start, cutStart),
            })),
        };
  return (
    <>
      <div
        data-clip={c.id}
        className={
          "clip " +
          (shownDuration * w.pxPerSecond < 72 ? "compact " : "") +
          (w.regionIds.includes(c.id) ? "chosen " : "") +
          (preview !== null
            ? preview.duration === undefined
              ? "moving"
              : preview.repeat
                ? "trimming repeating"
                : "trimming"
            : "")
        }
        style={
          {
            left:
              (w.regionMove !== null && w.regionIds.includes(c.id)
                ? c.start + w.regionMove
                : (preview?.position ?? c.start)) * w.pxPerSecond,
            transform: preview ? `translateY(${preview.y}px)` : undefined,
            width: Math.max(1, shownDuration * w.pxPerSecond),
            "--clip-color": t.color,
          } as CSSProperties
        }
        tabIndex={0}
        role="button"
        aria-pressed={w.regionIds.includes(c.id)}
        aria-label={`${c.name}, ${c.duration.toFixed(1)} seconds. Drag to move. Right click for edits.`}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          if (e.detail === 0)
            w.selectRegion(c.id, e.shiftKey || e.ctrlKey || e.metaKey);
        }}
        onDoubleClick={() => {
          select();
          w.setPanel(c.kind === "midi" ? "notes" : "region");
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!w.regionIds.includes(c.id)) select();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            w.selectRegion(c.id, e.shiftKey || e.ctrlKey || e.metaKey);
          }
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            e.stopPropagation();
            select();
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left + 20, y: r.top + 20 });
          }
        }}
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            w.s.recording ||
            w.busy ||
            (e.target as HTMLElement).closest("select")
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            w.selectRegion(c.id, true);
            return;
          }
          if (!w.regionIds.includes(c.id)) select();
          const bounds = e.currentTarget.getBoundingClientRect();
          const edge = Math.min(18, bounds.width / 3);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            scrollX: w.timelineScroll.current?.scrollLeft ?? 0,
            scrollY: w.timelineScroll.current?.scrollTop ?? 0,
            moved: false,
            mode:
              e.clientX - bounds.left <= edge
                ? "left"
                : bounds.right - e.clientX <= edge
                  ? e.clientY < bounds.top + bounds.height / 2
                    ? "repeat"
                    : "right"
                  : "move",
          };
          if (drag.current.mode === "repeat")
            e.currentTarget.style.cursor = loopCursor;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) {
            const bounds = e.currentTarget.getBoundingClientRect();
            const left = e.clientX - bounds.left,
              right = bounds.right - e.clientX;
            e.currentTarget.style.setProperty(
              "--trim-left",
              String(w.s.recording ? 0 : Math.max(0, 1 - left / 36)),
            );
            e.currentTarget.style.setProperty(
              "--trim-right",
              String(w.s.recording ? 0 : Math.max(0, 1 - right / 36)),
            );
            e.currentTarget.title =
              right <= 18
                ? e.clientY < bounds.top + bounds.height / 2
                  ? "Drag to loop this region"
                  : "Drag to trim the end"
                : left <= 18
                  ? "Drag to trim the start"
                  : "";
            e.currentTarget.style.cursor =
              !w.s.recording &&
              Math.min(left, right) <= Math.min(18, bounds.width / 3)
                ? right <= Math.min(18, bounds.width / 3) &&
                  e.clientY < bounds.top + bounds.height / 2
                  ? loopCursor
                  : "ew-resize"
                : "";
            return;
          }
          // No button held means the release never reached us (focus moved
          // away mid-drag); treat it as cancelled rather than keep dragging.
          if (e.buttons === 0) {
            cancelDrag();
            return;
          }
          if (
            Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) >
            4
          )
            drag.current.moved = true;
          pointer.current = { x: e.clientX, y: e.clientY };
          showDrag(e.clientX, e.clientY);
          if (drag.current.moved && edgeScroll.current === null)
            edgeScroll.current = requestAnimationFrame(scrollAtEdge);
        }}
        onPointerUp={async (e) => {
          stopEdgeScroll();
          if (!drag.current) return;
          if (drag.current.mode === "move" && w.selectedRegions.length > 1) {
            const moved = drag.current.moved;
            const delta = Math.max(
              -Math.min(...w.selectedRegions.map((c) => c.start)),
              position(e.clientX) - c.start,
            );
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            if (moved) void w.moveRegions(delta);
            return;
          }
          if (drag.current.mode !== "move") {
            const trim = trimAt(e.clientX),
              action = drag.current.mode === "repeat" ? "repeat" : "trim",
              // A loop drag released at the region's own end is a change of
              // mind, not a loop.
              moved =
                drag.current.moved &&
                (action !== "repeat" || trim.duration > c.duration + 1e-6);
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            if (moved) {
              setPreview(trim);
              void w
                .run({
                  op: "editClip",
                  action,
                  track: t.id,
                  clip: c.id,
                  position: trim.position,
                  length: trim.duration,
                })
                .finally(() => setPreview(null));
            } else setPreview(null);
            return;
          }
          const at = position(e.clientX),
            moved = drag.current.moved;
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (!moved) {
            setPreview(null);
            return;
          }
          const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
          const emptyGrid =
            dropTarget?.closest<HTMLElement>("[data-empty-grid]");
          const lane = dropTarget?.closest<HTMLElement>("[data-lane]");
          const target = emptyGrid
            ? await w.createTrackLike(t)
            : lane
              ? w.s.tracks.find((track) => track.id === lane.dataset.lane)
              : t;
          const targetId = target?.id ?? t.id;
          if (!target || target.kind !== t.kind) {
            setPreview(null);
            w.setNotice(
              "Move regions to a matching audio or MIDI track.",
              "warning",
            );
            return;
          }
          void w
            .run({
              op: "editClip",
              track: t.id,
              clip: c.id,
              action: "move",
              position: at,
              target: targetId,
            })
            .finally(() => setPreview(null));
        }}
        onPointerCancel={cancelDrag}
        // Alt+Tab or another window taking the mouse mid-drag ends capture
        // without a pointerup; the region goes back where it was. After a
        // normal release drag.current is already cleared, so this is a no-op.
        onLostPointerCapture={cancelDrag}
        onPointerLeave={(e) => {
          e.currentTarget.style.setProperty("--trim-left", "0");
          e.currentTarget.style.setProperty("--trim-right", "0");
        }}
      >
        <span className="trim-handle left" aria-hidden="true">
          <ArrowRightToLine size={14} />
        </span>
        <span className="trim-handle right repeat" aria-hidden="true">
          <Repeat2 size={14} />
        </span>
        <span className="trim-handle right" aria-hidden="true">
          <ArrowLeftToLine size={14} />
        </span>
        <div className="clip-title">
          <span>{c.name}</span>
          {takes.length > 1 && (
            <select
              aria-label={`Take for ${t.name}`}
              value={c.id}
              disabled={w.s.recording || w.busy}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.currentTarget.blur();
                w.setClipId(e.target.value);
                w.run({
                  op: "editClip",
                  track: t.id,
                  clip: e.target.value,
                  action: "take",
                });
              }}
            >
              {takes.map((take) => (
                <option key={take.id} value={take.id}>
                  Take {take.take}
                </option>
              ))}
            </select>
          )}
        </div>
        {c.kind === "midi" ? (
          <MidiNotes clip={displayedClip} />
        ) : (
          <Waveform peaks={displayedClip.peaks} />
        )}
      </div>
      {repeatCopies.map((copy, i) => {
        const fraction = copy.duration / c.duration,
          last = i === repeatCopies.length - 1;
        return (
          <div
            key={i}
            className={
              "clip repeat-copy" +
              (copy.duration * w.pxPerSecond < 72 ? " compact" : "")
            }
            aria-hidden="true"
            style={
              {
                left: copy.start * w.pxPerSecond,
                width: Math.max(1, copy.duration * w.pxPerSecond),
                "--clip-color": t.color,
                "--trim-right": last ? 1 : 0,
              } as CSSProperties
            }
          >
            {last && (
              <span className="trim-handle right repeat">
                <Repeat2 size={14} />
              </span>
            )}
            <div className="clip-title">
              <span>{c.name}</span>
            </div>
            {c.kind === "midi" ? (
              <MidiNotes
                clip={{
                  duration: copy.duration,
                  notes: c.notes?.filter((n) => n.start < copy.duration),
                }}
              />
            ) : (
              <Waveform
                peaks={c.peaks.slice(
                  0,
                  Math.max(1, Math.ceil(fraction * c.peaks.length)),
                )}
              />
            )}
          </div>
        );
      })}
      {menu && (
        <ContextMenu
          label="Region edits"
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
        >
          <button
            role="menuitem"
            disabled={
              w.s.recording ||
              w.s.position <= c.start ||
              w.s.position >= c.start + c.duration
            }
            onClick={() => {
              w.run({
                op: "editClip",
                track: t.id,
                clip: c.id,
                action: "split",
                position: w.s.position,
              });
              setMenu(null);
            }}
          >
            Split at playhead
          </button>
          <button
            role="menuitem"
            onClick={() => {
              w.copyRegion(t.id, c.id);
              setMenu(null);
            }}
          >
            Copy
          </button>
          <button
            role="menuitem"
            disabled={w.s.recording || !w.clipboard}
            onClick={() => {
              w.editSelected("copy");
              setMenu(null);
            }}
          >
            Paste at playhead
          </button>
          <button
            role="menuitem"
            disabled={w.s.recording}
            onClick={() => {
              if (w.selectedRegions.length > 1) void w.deleteRegions();
              else void w.removeClip(t, c);
              setMenu(null);
            }}
          >
            {w.selectedRegions.length > 1
              ? `Delete ${w.selectedRegions.length} regions`
              : "Delete region"}
          </button>
        </ContextMenu>
      )}
    </>
  );
}
