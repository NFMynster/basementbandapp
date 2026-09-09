import { useEffect, useRef, useState } from "react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import type { Clip } from "../models";

type Note = NonNullable<Clip["notes"]>[number];
const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const name = (n: number) => `${names[n % 12]}${Math.floor(n / 12) - 1}`;
export function MidiEditor({
  controller: w,
}: {
  controller: WorkspaceController;
}) {
  const clip = w.track?.clips.find(
    (c) => c.id === w.clipId && c.kind === "midi" && c.active,
  );
  const [division, setDivision] = useState(16);
  const [snap, setSnap] = useState(true),
    [zoom, setZoom] = useState(100),
    [selected, setSelected] = useState<number>();
  const [preview, setPreview] = useState<Note | null>(null),
    [pending, setPending] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    note: Note;
    resize: boolean;
  } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const notes = clip?.notes ?? [];
  const high = Math.min(127, Math.max(72, ...notes.map((n) => n.note + 4)));
  const low = Math.max(0, Math.min(48, ...notes.map((n) => n.note - 4)));
  const step = 240 / w.s.tempo / division,
    px = zoom / (60 / w.s.tempo),
    row = 20;
  useEffect(() => {
    if (scroll.current && notes.length)
      scroll.current.scrollTop = Math.max(0, (high - notes[0].note) * row - 80);
  }, [clip?.id]);
  const disabled = pending || w.s.recording || w.busy;
  async function commit(note: Note) {
    if (!clip || note.event === undefined) return;
    setPending(true);
    await w.run({
      op: "editClip",
      action: "note",
      track: w.track.id,
      clip: clip.id,
      event: note.event,
      position: note.start,
      length: note.duration,
      pitch: note.note,
    });
    setPending(false);
    setPreview(null);
    setSelected(undefined);
  }
  async function alignNotes() {
    if (!clip || disabled) return;
    setPending(true);
    const result = await w.run({
      op: "editClip",
      action: "quantize",
      track: w.track.id,
      clip: clip.id,
      division,
    });
    setPending(false);
    setPreview(null);
    setSelected(undefined);
    if (result)
      w.setNotice(
        `Aligned notes to the 1/${division} beat grid. Undo is available when playback is stopped.`,
      );
  }
  return (
    <div
      className="midi-editor"
      onKeyDown={(e) => {
        if (["Delete", "Backspace"].includes(e.key)) e.stopPropagation();
      }}
    >
      <div className="midi-align-tools">
        <button
          className="align-notes"
          disabled={disabled || !notes.length}
          onClick={() => void alignNotes()}
          title="Move note starts in this region to the nearest beat grid. Keeps note lengths; notes crossing trimmed edges stay in place."
        >
          Align to beat <span>(quantization)</span>
        </button>
        <select
          aria-label="Beat alignment grid"
          value={division}
          disabled={disabled}
          onChange={(e) => setDivision(+e.target.value)}
        >
          {[4, 8, 16, 32].map((value) => (
            <option key={value} value={value}>
              1/{value}
              {value === 4
                ? " - Quarter notes"
                : value === 8
                  ? " - Eighth notes"
                  : value === 16
                    ? " - Sixteenth notes"
                    : " - Thirty-second notes"}
            </option>
          ))}
        </select>
        <span>Selected region; keeps note lengths</span>
      </div>
      <div className="midi-tools">
        <strong>{clip?.name ?? "Note editor"}</strong>
        <span>
          Drag to move · drag right edge to resize · arrow keys to nudge
        </span>
        <label>
          <input
            type="checkbox"
            checked={snap}
            onChange={(e) => setSnap(e.target.checked)}
          />{" "}
          Snap 1/{division}
        </label>
        <label>
          Zoom
          <input
            aria-label="Note editor zoom"
            type="range"
            min={30}
            max={160}
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          />
        </label>
      </div>
      {!clip ? (
        <div className="notes-empty">
          Select a MIDI region to edit its notes. Double-click a region to open
          it here.
        </div>
      ) : !notes.length ? (
        <div className="notes-empty">
          This region has no notes. Record or import MIDI to get started.
        </div>
      ) : (
        <div className="piano-scroll" ref={scroll}>
          <div
            className="piano-grid"
            style={{
              width: Math.max(600, clip.duration * px + 60),
              height: (high - low + 1) * row + 24,
            }}
          >
            <div className="note-ruler">
              {Array.from(
                { length: Math.ceil(clip.duration / (60 / w.s.tempo)) },
                (_, i) => (
                  <span key={i} style={{ left: 60 + i * zoom }}>
                    {Math.floor(i / 4) + 1}.{(i % 4) + 1}
                  </span>
                ),
              )}
            </div>
            {Array.from({ length: high - low + 1 }, (_, i) => (
              <div
                className={`piano-row ${[1, 3, 6, 8, 10].includes((high - i) % 12) ? "black-key" : ""}`}
                key={i}
                style={{ top: i * row + 24, backgroundSize: `${zoom}px 100%` }}
              >
                <span>{name(high - i)}</span>
              </div>
            ))}
            {notes.map((n) => {
              const current =
                preview && preview.event === n.event ? preview : n;
              return (
                <button
                  key={n.event}
                  className={`piano-note ${selected === n.event ? "selected" : ""}`}
                  disabled={disabled || n.event === undefined}
                  aria-label={`${name(current.note)}, ${current.start.toFixed(2)} seconds, duration ${current.duration.toFixed(2)} seconds`}
                  style={{
                    left: 60 + current.start * px,
                    top: 25 + (high - current.note) * row,
                    width: Math.max(8, current.duration * px),
                    height: row - 2,
                  }}
                  onKeyDown={(e) => {
                    if (!e.key.startsWith("Arrow") || disabled) return;
                    e.preventDefault();
                    const next = { ...n };
                    if (e.key === "ArrowUp")
                      next.note = Math.min(127, n.note + 1);
                    if (e.key === "ArrowDown")
                      next.note = Math.max(0, n.note - 1);
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight")
                      next.start = Math.max(
                        0,
                        Math.min(
                          clip.duration - n.duration,
                          n.start +
                            (e.key === "ArrowLeft" ? -1 : 1) *
                              (snap ? step : 0.01),
                        ),
                      );
                    void commit(next);
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || disabled) return;
                    e.preventDefault();
                    e.currentTarget.focus();
                    setSelected(n.event);
                    drag.current = {
                      x: e.clientX,
                      y: e.clientY,
                      note: n,
                      resize:
                        e.currentTarget.getBoundingClientRect().right -
                          e.clientX <
                        9,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d || d.note.event !== n.event) return;
                    const delta = (e.clientX - d.x) / px;
                    const quantize = (v: number) =>
                      snap ? Math.round(v / step) * step : v;
                    setPreview({
                      ...d.note,
                      ...(d.resize
                        ? {
                            duration: Math.max(
                              0.001,
                              Math.min(
                                clip.duration - d.note.start,
                                quantize(d.note.duration + delta),
                              ),
                            ),
                          }
                        : {
                            start: Math.max(
                              0,
                              Math.min(
                                clip.duration - d.note.duration,
                                quantize(d.note.start + delta),
                              ),
                            ),
                            note: Math.max(
                              low,
                              Math.min(
                                high,
                                d.note.note -
                                  Math.round((e.clientY - d.y) / row),
                              ),
                            ),
                          }),
                    });
                  }}
                  onPointerUp={(e) => {
                    if (!drag.current) return;
                    drag.current = null;
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    if (
                      preview &&
                      (preview.start !== n.start ||
                        preview.duration !== n.duration ||
                        preview.note !== n.note)
                    )
                      void commit(preview);
                    else setPreview(null);
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    setPreview(null);
                  }}
                >
                  {name(current.note)}
                  <i aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
