import { useEffect, useMemo, useRef, useState } from "react";
import {
  Magnet,
  Play,
  Square,
  Copy,
  Plus,
  Trash2,
  Pencil,
  MousePointer2,
  ClipboardPaste,
} from "lucide-react";
import { useAnimatedPlayhead } from "../hooks/useAnimatedPlayhead";
import type { WorkspaceController } from "../hooks/useWorkspace";
import type { Clip, SessionCommand } from "../models";
type Note = NonNullable<Clip["notes"]>[number];
type Edit = NonNullable<
  Extract<SessionCommand, { op: "editClip" }>["edits"]
>[number];
let clipboard: Note[] = [];
const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const name = (n: number) => `${names[n % 12]}${Math.floor(n / 12) - 1}`;
export function MidiEditor({
  controller: w,
}: {
  controller: WorkspaceController;
}) {
  const clip = w.track?.clips.find(
    (c) => c.id === w.clipId && c.kind === "midi" && c.active,
  );
  const notes = clip?.notes ?? [];
  const [division, setDivision] = useState(16),
    [snap, setSnap] = useState(true),
    [zoom, setZoom] = useState(0);
  const [selection, setSelection] = useState<number[]>([]),
    [preview, setPreview] = useState<Note[] | null>(null);
  const [pending, setPending] = useState(false),
    [draw, setDraw] = useState(false),
    [velocity, setVelocity] = useState(100),
    [pasteAt, setPasteAt] = useState(0);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    notes: Note[];
    resize: boolean;
  } | null>(null);
  const box = useRef<{ x: number; y: number; selected: number[] } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const selected = notes.filter(
    (n) => n.event !== undefined && selection.includes(n.event),
  );
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
  const step = 240 / w.s.tempo / division,
    px = Math.max(
      (viewportWidth - 60) / Math.max(0.001, clip?.duration ?? 1),
      zoom / (60 / w.s.tempo),
    ),
    row = 20;
  const playhead = useAnimatedPlayhead(
    w.s,
    px,
    null,
    clip?.start ?? 0,
    clip?.duration ?? 0,
    60,
  );
  const unavailable = w.s.recording || w.busy;
  const disabled = pending || unavailable;
  const quantize = (v: number) => (snap ? Math.round(v / step) * step : v);
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
        Math.min(640 / (60 / w.s.tempo), px * Math.exp(-event.deltaY * 0.008)),
      );
      setZoom(
        nextPx <=
          (viewportWidth - 60) / Math.max(0.001, clip?.duration ?? 1) + 0.001
          ? 0
          : Math.min(640, nextPx * (60 / w.s.tempo)),
      );
      requestAnimationFrame(() => {
        node.scrollLeft = time * nextPx + 60 - x;
      });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [px, viewportWidth, clip?.duration, w.s.tempo]);
  async function edit(edits: Edit[]) {
    if (!clip || disabled || !edits.length) return;
    setPending(true);
    const result = await w.run({
      op: "editClip",
      action: "notes",
      track: w.track.id,
      clip: clip.id,
      edits,
    });
    setPending(false);
    setPreview(null);
    const updated =
      result?.tracks
        .find((t) => t.id === w.track.id)
        ?.clips.find((c) => c.id === clip.id)?.notes ?? [];
    setSelection(
      updated
        .filter((n) =>
          edits.some(
            (e) =>
              !e.delete &&
              e.start !== undefined &&
              Math.abs(n.start - e.start) < 0.001 &&
              n.note === e.note,
          ),
        )
        .flatMap((n) => (n.event === undefined ? [] : [n.event])),
    );
  }
  const copy = () => {
    clipboard = selected.map((n) => ({ ...n }));
    if (clipboard.length)
      w.setNotice(
        `Copied ${clipboard.length} note${clipboard.length === 1 ? "" : "s"}.`,
      );
  };
  function paste() {
    if (!clip || !clipboard.length) return;
    const first = Math.min(...clipboard.map((n) => n.start));
    const span =
      Math.max(...clipboard.map((n) => n.start + n.duration)) - first;
    if (span > clip.duration) {
      w.setNotice("These notes need a longer region.", "warning");
      return;
    }
    const at = Math.max(0, Math.min(clip.duration - span, pasteAt));
    void edit(
      clipboard.map((n) => ({
        ...n,
        event: undefined,
        start: at + n.start - first,
      })),
    );
  }
  function add(x: number, y: number) {
    if (!clip || disabled) return;
    const start = Math.max(
      0,
      Math.min(clip.duration - 0.001, quantize((x - 60) / px)),
    );
    void edit([
      {
        start,
        duration: Math.min(step, clip.duration - start),
        note: Math.max(low, Math.min(high, high - Math.floor((y - 24) / row))),
        velocity,
        channel: w.track.midiChannel || 1,
      },
    ]);
  }
  async function createRegion() {
    if (disabled) return;
    const result = await w.run({
      op: "createMidi",
      track: w.track.id,
      position: w.s.position,
      length: 960 / w.s.tempo,
    });
    const created = result?.tracks
      .find((t) => t.id === w.track.id)
      ?.clips.at(-1);
    if (created) {
      w.setClipId(created.id);
      w.setPanel("notes");
    }
  }
  return (
    <div
      className="midi-editor"
      onKeyDown={(e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (
          mod &&
          ["a", "c", "v", "d"].includes(e.key.toLowerCase()) &&
          !(e.target instanceof HTMLInputElement)
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key.toLowerCase() === "a")
            setSelection(
              notes.flatMap((n) => (n.event === undefined ? [] : [n.event])),
            );
          if (e.key.toLowerCase() === "c") copy();
          if (e.key.toLowerCase() === "v") paste();
          if (e.key.toLowerCase() === "d") {
            copy();
            paste();
          }
        }
        if (
          ["Delete", "Backspace"].includes(e.key) &&
          !(e.target instanceof HTMLInputElement)
        ) {
          e.preventDefault();
          e.stopPropagation();
          void edit(selected.map((n) => ({ event: n.event, delete: true })));
        }
      }}
    >
      {clip && (
        <div className="midi-tools" role="group" aria-label="MIDI editor tools">
          <button
            aria-label={w.s.playing ? "Stop playback" : "Play region"}
            title={
              w.s.playing
                ? "Stop playback"
                : "Play from the start of this region"
            }
            disabled={unavailable}
            onClick={async () => {
              if (w.s.playing) {
                await w.run({ op: "stop" }, false);
                return;
              }
              if (await w.run({ op: "seek", position: clip.start }, false))
                await w.run({ op: "play" }, false);
            }}
          >
            {w.s.playing ? <Square size={14} /> : <Play size={14} />}
          </button>
          <div
            className="midi-tool-group midi-mode"
            role="group"
            aria-label="Editing mode"
          >
            <button
              title="Select notes; drag a box or Shift-click for multiple notes"
              aria-label="Select notes"
              aria-pressed={!draw}
              onClick={() => setDraw(false)}
            >
              <MousePointer2 size={14} /> Select
            </button>
            <button
              title="Draw notes by clicking the grid"
              aria-label="Draw notes"
              aria-pressed={draw}
              onClick={() => setDraw(true)}
            >
              <Pencil size={14} /> Draw
            </button>
          </div>
          <div className="midi-tool-group" role="group" aria-label="Beat grid">
            <button
              title={snap ? "Snap to grid: on" : "Snap to grid: off"}
              aria-label="Snap to grid"
              aria-pressed={snap}
              onClick={() => setSnap((value) => !value)}
            >
              <Magnet size={14} /> Snap
            </button>
            <select
              aria-label="Beat alignment grid"
              value={division}
              disabled={unavailable}
              onChange={(e) => setDivision(+e.target.value)}
            >
              {[4, 8, 16, 32].map((v) => (
                <option key={v} value={v}>
                  1/{v}
                </option>
              ))}
            </select>
            <button
              disabled={unavailable || !notes.length}
              className="align-notes"
              title="Quantize: align all notes in this region to the beat grid; keeps note lengths"
              onClick={async () => {
                if (!clip || disabled) return;
                setPending(true);
                const r = await w.run({
                  op: "editClip",
                  action: "quantize",
                  track: w.track.id,
                  clip: clip.id,
                  division,
                });
                setPending(false);
                setSelection([]);
                if (r) w.setNotice("Aligned MIDI notes to the beat grid.");
              }}
            >
              Align to beat
            </button>
          </div>
          <div
            className="midi-tool-group"
            role="group"
            aria-label="Note actions"
          >
            <button
              title="Copy selected notes (Ctrl/Cmd+C)"
              aria-label="Copy notes"
              disabled={!selected.length}
              onClick={copy}
            >
              <Copy size={14} />
            </button>
            <button
              title="Paste at the last clicked grid position (Ctrl/Cmd+V)"
              aria-label="Paste notes"
              disabled={unavailable || !clip}
              onClick={paste}
            >
              <ClipboardPaste size={14} />
            </button>
            <button
              title="Delete selected notes"
              aria-label="Delete notes"
              disabled={unavailable || !selected.length}
              onClick={() =>
                void edit(
                  selected.map((n) => ({ event: n.event, delete: true })),
                )
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="midi-tool-group midi-expression">
            <label>
              Velocity
              <input
                aria-label="Note velocity"
                type="range"
                min={1}
                max={127}
                value={velocity}
                disabled={unavailable}
                onChange={(e) => setVelocity(+e.target.value)}
                onPointerUp={() => {
                  if (selected.length)
                    void edit(selected.map((n) => ({ ...n, velocity })));
                }}
                onKeyUp={(e) => {
                  if (e.key.startsWith("Arrow") && selected.length)
                    void edit(selected.map((n) => ({ ...n, velocity })));
                }}
              />
              <output>{velocity}</output>
            </label>
            <button
              aria-label="Show full keyboard"
              aria-pressed={fullKeyboard}
              onClick={() => setFullKeyboard((v) => !v)}
              title="Show all pitches, or fit the notes in this region"
            >
              Keyboard
            </button>
            <label>
              Zoom
              <input
                aria-label="Note editor zoom"
                type="range"
                min={0}
                max={640}
                value={zoom}
                onChange={(e) => setZoom(+e.target.value)}
              />
            </label>
          </div>
          <button
            className="new-midi-region"
            disabled={unavailable || w.track.kind !== "midi"}
            onClick={() => void createRegion()}
          >
            <Plus size={14} />
            New region
          </button>
        </div>
      )}
      {!clip ? (
        <div className="notes-empty">
          <Pencil size={22} aria-hidden="true" />
          <strong>A place for your notes</strong>
          <button
            className="new-midi-region"
            disabled={unavailable || w.track.kind !== "midi"}
            onClick={() => void createRegion()}
          >
            <Plus size={14} />
            New region
          </button>
          <span>
            Select a MIDI region, or use New region to start at the playhead.
          </span>
        </div>
      ) : (
        <div className="piano-scroll" ref={scroll}>
          <div
            className={`piano-grid ${draw ? "drawing" : ""}`}
            tabIndex={0}
            aria-label="MIDI note grid"
            style={{
              width: Math.max(
                viewportWidth,
                Math.round(clip.duration * px + 60),
              ),
              height: (high - low + 1) * row + 24,
            }}
            onDoubleClick={(e) => {
              if (draw || (e.target as HTMLElement).closest(".piano-note"))
                return;
              const r = e.currentTarget.getBoundingClientRect();
              add(e.clientX - r.left, e.clientY - r.top);
            }}
            onPointerDown={(e) => {
              if (
                e.button !== 0 ||
                disabled ||
                (e.target as HTMLElement).closest(".piano-note")
              )
                return;
              const r = e.currentTarget.getBoundingClientRect(),
                x = e.clientX - r.left,
                y = e.clientY - r.top;
              if (x < 60 || y < 24) return;
              e.preventDefault();
              e.currentTarget.focus();
              setPasteAt(Math.max(0, quantize((x - 60) / px)));
              if (draw) {
                add(x, y);
                return;
              }
              box.current = { x, y, selected: e.shiftKey ? selection : [] };
              if (!e.shiftKey) setSelection([]);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!box.current) return;
              const r = e.currentTarget.getBoundingClientRect(),
                x = e.clientX - r.left,
                y = e.clientY - r.top;
              const b = {
                x: Math.min(x, box.current.x),
                y: Math.min(y, box.current.y),
                width: Math.abs(x - box.current.x),
                height: Math.abs(y - box.current.y),
              };
              setMarquee(b);
              setSelection([
                ...new Set([
                  ...box.current.selected,
                  ...notes
                    .filter(
                      (n) =>
                        60 + n.start * px <= b.x + b.width &&
                        60 + (n.start + n.duration) * px >= b.x &&
                        25 + (high - n.note) * row <= b.y + b.height &&
                        25 + (high - n.note + 1) * row >= b.y,
                    )
                    .flatMap((n) => (n.event === undefined ? [] : [n.event])),
                ]),
              ]);
            }}
            onPointerUp={(e) => {
              box.current = null;
              setMarquee(null);
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              box.current = null;
              setMarquee(null);
            }}
          >
            <div
              className="note-ruler"
              role="slider"
              tabIndex={0}
              aria-label="MIDI playhead"
              aria-valuemin={0}
              aria-valuemax={clip.duration}
              aria-valuenow={Math.max(
                0,
                Math.min(clip.duration, w.s.position - clip.start),
              )}
              aria-disabled={unavailable}
              title="Click to move the playhead"
              onDoubleClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.button !== 0 || unavailable) return;
                e.currentTarget.focus();
                const time = Math.max(
                  0,
                  Math.min(
                    clip.duration,
                    quantize(
                      (e.clientX -
                        e.currentTarget.getBoundingClientRect().left -
                        60) /
                        px,
                    ),
                  ),
                );
                void w.run({ op: "seek", position: clip.start + time }, false);
              }}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                e.stopPropagation();
                if (unavailable) return;
                const time =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? clip.duration
                      : w.s.position -
                        clip.start +
                        (e.key === "ArrowLeft" ? -step : step);
                void w.run(
                  {
                    op: "seek",
                    position:
                      clip.start + Math.max(0, Math.min(clip.duration, time)),
                  },
                  false,
                );
              }}
            >
              {Array.from(
                { length: Math.ceil(clip.duration / (60 / w.s.tempo)) },
                (_, i) =>
                  i % Math.max(1, Math.ceil(36 / (px * (60 / w.s.tempo)))) ===
                    0 && (
                    <span
                      key={i}
                      style={{ left: 60 + i * px * (60 / w.s.tempo) }}
                    >
                      {Math.floor(i / 4) + 1}.{(i % 4) + 1}
                    </span>
                  ),
              )}
            </div>
            {Array.from({ length: high - low + 1 }, (_, i) => (
              <div
                key={i}
                className={`piano-row ${[1, 3, 6, 8, 10].includes((high - i) % 12) ? "black-key" : ""}`}
                style={{
                  top: i * row + 24,
                  backgroundSize: `${px * (60 / w.s.tempo)}px 100%`,
                }}
              >
                <span>{name(high - i)}</span>
              </div>
            ))}
            <div ref={playhead} className="midi-playhead" aria-hidden="true" />
            {notes.map((n) => {
              const current = preview?.find((p) => p.event === n.event) ?? n;
              return (
                <button
                  key={n.event}
                  className={`piano-note ${n.event !== undefined && selection.includes(n.event) ? "selected" : ""}`}
                  disabled={unavailable || n.event === undefined}
                  aria-label={`${name(current.note)}, ${current.start.toFixed(2)} seconds, velocity ${current.velocity ?? 100}`}
                  style={{
                    left: 60 + current.start * px,
                    top: 25 + (high - current.note) * row,
                    width: Math.max(8, current.duration * px),
                    height: row - 2,
                    opacity: 0.55 + ((current.velocity ?? 100) / 127) * 0.45,
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (!e.key.startsWith("Arrow") || disabled) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const group = selected.length ? selected : [n];
                    let dt = 0,
                      dp = 0;
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight")
                      dt =
                        (e.key === "ArrowLeft" ? -1 : 1) * (snap ? step : 0.01);
                    else
                      dp =
                        (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 12 : 1);
                    dt = Math.max(
                      -Math.min(...group.map((p) => p.start)),
                      Math.min(
                        clip.duration -
                          Math.max(...group.map((p) => p.start + p.duration)),
                        dt,
                      ),
                    );
                    dp = Math.max(
                      -Math.min(...group.map((p) => p.note)),
                      Math.min(127 - Math.max(...group.map((p) => p.note)), dp),
                    );
                    void edit(
                      group.map((p) => ({
                        ...p,
                        start: p.start + dt,
                        note: p.note + dp,
                      })),
                    );
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || disabled || n.event === undefined)
                      return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.focus();
                    setVelocity(n.velocity ?? 100);
                    if (e.shiftKey) {
                      setSelection(
                        selection.includes(n.event)
                          ? selection.filter((id) => id !== n.event)
                          : [...selection, n.event],
                      );
                      return;
                    }
                    const group = selection.includes(n.event) ? selected : [n];
                    setSelection(group.map((p) => p.event!));
                    drag.current = {
                      x: e.clientX,
                      y: e.clientY,
                      notes: group,
                      resize:
                        e.currentTarget.getBoundingClientRect().right -
                          e.clientX <
                        9,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d) return;
                    e.stopPropagation();
                    let dt = (e.clientX - d.x) / px;
                    if (snap) dt = Math.round(dt / step) * step;
                    let dp = -Math.round((e.clientY - d.y) / row);
                    dp = Math.max(
                      low - Math.min(...d.notes.map((p) => p.note)),
                      Math.min(
                        high - Math.max(...d.notes.map((p) => p.note)),
                        dp,
                      ),
                    );
                    if (d.resize) {
                      dt = Math.max(
                        0.001 - Math.min(...d.notes.map((p) => p.duration)),
                        Math.min(
                          clip.duration -
                            Math.max(
                              ...d.notes.map((p) => p.start + p.duration),
                            ),
                          dt,
                        ),
                      );
                      setPreview(
                        d.notes.map((p) => ({
                          ...p,
                          duration: p.duration + dt,
                        })),
                      );
                    } else {
                      dt = Math.max(
                        -Math.min(...d.notes.map((p) => p.start)),
                        Math.min(
                          clip.duration -
                            Math.max(
                              ...d.notes.map((p) => p.start + p.duration),
                            ),
                          dt,
                        ),
                      );
                      setPreview(
                        d.notes.map((p) => ({
                          ...p,
                          start: p.start + dt,
                          note: p.note + dp,
                        })),
                      );
                    }
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (!drag.current) return;
                    const d = drag.current;
                    drag.current = null;
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    if (
                      preview &&
                      preview.some(
                        (p, i) =>
                          p.start !== d.notes[i].start ||
                          p.note !== d.notes[i].note ||
                          p.duration !== d.notes[i].duration,
                      )
                    )
                      void edit(preview);
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
            {marquee && (
              <div
                className="note-marquee"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.width,
                  height: marquee.height,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
