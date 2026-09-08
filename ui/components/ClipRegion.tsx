import { useRef, useState, useCallback, type CSSProperties } from "react";
import type { Clip, Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { Waveform } from "./Waveform";
import { MidiNotes } from "./MidiNotes";
import { ContextMenu } from "./ContextMenu";
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
    } | null>(null),
    [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const drag = useRef<{
    x: number;
    y: number;
    scrollX: number;
    scrollY: number;
    moved: boolean;
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
  return (
    <>
      <div
        className={
          "clip " +
          (w.clipId === c.id ? "chosen " : "") +
          (preview !== null ? "moving" : "")
        }
        style={
          {
            left: (preview?.position ?? c.start) * w.pxPerSecond,
            transform: preview ? `translateY(${preview.y}px)` : undefined,
            width: Math.max(12, c.duration * w.pxPerSecond),
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
        onDoubleClick={() =>
          w.run({
            op: "loop",
            start: c.start,
            end: c.start + c.duration,
            enabled: true,
          })
        }
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
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            scrollX: w.timelineScroll.current?.scrollLeft ?? 0,
            scrollY: w.timelineScroll.current?.scrollTop ?? 0,
            moved: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          if (
            Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) >
            4
          )
            drag.current.moved = true;
          if (drag.current.moved)
            setPreview({
              position: position(e.clientX),
              y:
                e.clientY -
                drag.current.y +
                (w.timelineScroll.current?.scrollTop ?? 0) -
                drag.current.scrollY,
            });
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const at = position(e.clientX),
            moved = drag.current.moved;
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (!moved) {
            setPreview(null);
            return;
          }
          const target =
            document
              .elementFromPoint(e.clientX, e.clientY)
              ?.closest<HTMLElement>("[data-lane]")?.dataset.lane || t.id;
          if (
            w.s.tracks.find((track) => track.id === target)?.kind !== t.kind
          ) {
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
              target,
            })
            .finally(() => setPreview(null));
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
        }}
      >
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
          <MidiNotes clip={c} />
        ) : (
          <Waveform peaks={c.peaks} />
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
