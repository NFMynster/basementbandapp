import { useRef, useState, type CSSProperties } from "react";
import type { Clip, Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { Waveform } from "./Waveform";
import { MidiNotes } from "./MidiNotes";
import { Modal } from "./Modal";
export function ClipRegion({
  clip: c,
  track: t,
  controller: w,
}: {
  clip: Clip;
  track: Track;
  controller: WorkspaceController;
}) {
  const [preview, setPreview] = useState<number | null>(null),
    [menu, setMenu] = useState(false);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const select = () => {
    w.setSelected(t.id);
    w.setClipId(c.id);
  };
  const position = (x: number) =>
    Math.max(
      0,
      Math.round(
        (c.start + (x - drag.current!.x) / w.pxPerSecond) / (60 / w.s.tempo),
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
            left: (preview ?? c.start) * w.pxPerSecond,
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
          setMenu(true);
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
          drag.current = { x: e.clientX, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          if (Math.abs(e.clientX - drag.current.x) > 4)
            drag.current.moved = true;
          if (drag.current.moved) setPreview(position(e.clientX));
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
        <Modal
          title="Region edits"
          className="region-edits"
          onClose={() => setMenu(false)}
        >
          <h2>{c.name}</h2>
          <p>
            Edits are non-destructive. The last moved region plays on top of
            overlaps.
          </p>
          <div className="region-actions">
            <button
              disabled={w.s.recording}
              onClick={() => {
                w.run({
                  op: "editClip",
                  track: t.id,
                  clip: c.id,
                  action: "split",
                  position: w.s.position,
                });
                setMenu(false);
              }}
            >
              Split at playhead
            </button>
            <button
              onClick={() => {
                w.clipboard.current = { track: t.id, clip: c.id };
                w.setNotice("Region copied. Paste at the playhead.");
                setMenu(false);
              }}
            >
              Copy
            </button>
            <button
              disabled={w.s.recording || !w.clipboard.current}
              onClick={() => {
                w.editSelected("copy");
                setMenu(false);
              }}
            >
              Paste at playhead
            </button>
            <button
              disabled={w.s.recording}
              onClick={() => {
                w.run({ op: "removeClip", track: t.id, clip: c.id });
                setMenu(false);
              }}
            >
              Delete region
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
