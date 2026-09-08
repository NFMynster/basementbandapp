import { useRef, useState, useCallback, type CSSProperties } from "react";
import type { Clip, Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { Waveform } from "./Waveform";
import { MidiNotes } from "./MidiNotes";
import { ContextMenu } from "./ContextMenu";
import { ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
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
    } | null>(null),
    [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const drag = useRef<{
    x: number;
    y: number;
    scrollX: number;
    scrollY: number;
    moved: boolean;
    mode: "move" | "left" | "right";
  } | null>(null);
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
                ...[c, ...takes].map((take) => take.sourceStart - take.offset),
              ),
              delta,
            ),
            Math.max(0, shortest - 2 / w.s.sampleRate),
          )
        : Math.max(
            Math.min(c.sourceEnd - c.offset - c.duration, delta),
            -c.duration + 2 / w.s.sampleRate,
          );
    return drag.current!.mode === "left"
      ? { position: c.start + cut, duration: c.duration - cut, y: 0 }
      : { position: c.start, duration: c.duration + cut, y: 0 };
  };
  const cutStart =
    preview?.duration === undefined ? 0 : preview.position - c.start;
  const previewDuration = preview?.duration ?? c.duration;
  const displayedClip =
    preview?.duration === undefined
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
          ((preview?.duration ?? c.duration) * w.pxPerSecond < 72
            ? "compact "
            : "") +
          (w.clipId === c.id ? "chosen " : "") +
          (preview !== null
            ? preview.duration === undefined
              ? "moving"
              : "trimming"
            : "")
        }
        style={
          {
            left: (preview?.position ?? c.start) * w.pxPerSecond,
            transform: preview ? `translateY(${preview.y}px)` : undefined,
            width: Math.max(
              12,
              (preview?.duration ?? c.duration) * w.pxPerSecond,
            ),
            "--clip-color": t.color,
          } as CSSProperties
        }
        tabIndex={0}
        role="button"
        aria-label={`${c.name}, ${c.duration.toFixed(1)} seconds. Drag to move. Right click for edits.`}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          select();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          return w.run({
            op: "loop",
            start: c.start,
            end: c.start + c.duration,
            enabled: true,
          });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          select();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
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
            (e.target as HTMLElement).closest("select")
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          select();
          const bounds = e.currentTarget.getBoundingClientRect();
          const edge = Math.min(10, bounds.width / 3);
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
                  ? "right"
                  : "move",
          };
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
            e.currentTarget.style.cursor =
              !w.s.recording &&
              Math.min(left, right) <= Math.min(10, bounds.width / 3)
                ? "ew-resize"
                : "";
            return;
          }
          if (
            Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) >
            4
          )
            drag.current.moved = true;
          if (drag.current.moved)
            setPreview(
              drag.current.mode !== "move"
                ? trimAt(e.clientX)
                : {
                    position: position(e.clientX),
                    y:
                      e.clientY -
                      drag.current.y +
                      (w.timelineScroll.current?.scrollTop ?? 0) -
                      drag.current.scrollY,
                  },
            );
        }}
        onPointerUp={async (e) => {
          if (!drag.current) return;
          if (drag.current.mode !== "move") {
            const trim = trimAt(e.clientX),
              moved = drag.current.moved;
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            if (moved) {
              setPreview(trim);
              void w
                .run({
                  op: "editClip",
                  action: "trim",
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
            w.setNotice("Move regions to a matching audio or MIDI track.");
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
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
        }}
        onPointerLeave={(e) => {
          e.currentTarget.style.setProperty("--trim-left", "0");
          e.currentTarget.style.setProperty("--trim-right", "0");
        }}
      >
        <span className="trim-handle left" aria-hidden="true">
          <ArrowRightToLine size={14} />
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
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onChange={(e) => {
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
      {menu && (
        <ContextMenu
          label="Region edits"
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
        >
          {takes.length > 1 &&
            takes.map((take) => (
              <button
                key={take.id}
                role="menuitemradio"
                aria-checked={take.id === c.id}
                disabled={w.s.recording}
                onClick={() => {
                  w.setClipId(take.id);
                  w.run({
                    op: "editClip",
                    track: t.id,
                    clip: take.id,
                    action: "take",
                  });
                  setMenu(null);
                }}
              >
                {take.id === c.id ? "✓ " : ""}Take {take.take}
              </button>
            ))}
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
              w.clipboard.current = { track: t.id, clip: c.id };
              w.setNotice("Region copied. Paste at the playhead.");
              setMenu(null);
            }}
          >
            Copy
          </button>
          <button
            role="menuitem"
            disabled={w.s.recording || !w.clipboard.current}
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
              w.run({ op: "removeClip", track: t.id, clip: c.id });
              setMenu(null);
            }}
          >
            Delete region
          </button>
        </ContextMenu>
      )}
    </>
  );
}
