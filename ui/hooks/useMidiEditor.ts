import { moveNotes, resizeNotes } from "../services/midi-note-edits";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { WorkspaceController } from "./useWorkspace";
import type { Clip, SessionCommand } from "../models";
import { useMidiViewport } from "./useMidiViewport";
type Note = NonNullable<Clip["notes"]>[number];
type Edit = NonNullable<
  Extract<SessionCommand, { op: "editClip" }>["edits"]
>[number];
// Note copies survive switching between regions; they never retain engine handles.
let clipboard: Note[] = [];
type Options = Pick<
  WorkspaceController,
  | "track"
  | "clipId"
  | "s"
  | "busy"
  | "run"
  | "setNotice"
  | "setClipId"
  | "setPanel"
  | "dragPosition"
  | "setDragPosition"
>;
export function useMidiEditor(w: Options) {
  const clip = w.track?.clips.find(
    (c) => c.id === w.clipId && c.kind === "midi" && c.active,
  );
  const notes = clip?.notes ?? [];

  const viewport = useMidiViewport({
    clip,
    session: w.s,
    busy: w.busy,
    dragPosition: w.dragPosition,
    setDragPosition: w.setDragPosition,
    run: w.run,
  });
  const { step, px, row, high, low, snap, quantize, unavailable } = viewport;
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
  const selected = notes.filter(
    (n) => n.event !== undefined && selection.includes(n.event),
  );

  const disabled = pending || unavailable;
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
    return !!result;
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
  async function add(x: number, y: number) {
    if (!clip || disabled) return;
    const start = Math.max(
      0,
      Math.min(clip.duration - 0.001, quantize((x - 60) / px)),
    );
    const note = Math.max(
      low,
      Math.min(high, high - Math.floor((y - 24) / row)),
    );
    const channel = w.track.midiChannel || 1;
    if (
      await edit([
        {
          start,
          duration: Math.min(step, clip.duration - start),
          note,
          velocity,
          channel,
        },
      ])
    ) {
      if (!w.s.playing)
        await w.run(
          { op: "audition", track: w.track.id, note, velocity, channel },
          false,
        );
    }
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

  async function togglePlayback() {
    if (!clip || unavailable) return;
    if (w.s.playing) {
      await w.run({ op: "stop" }, false);
      return;
    }
    if (await w.run({ op: "seek", position: clip.start }, false))
      await w.run({ op: "play" }, false);
  }
  async function alignToBeat() {
    if (!clip || disabled) return;
    setPending(true);
    try {
      const result = await w.run({
        op: "editClip",
        action: "quantize",
        track: w.track.id,
        clip: clip.id,
        division: viewport.division,
      });
      if (result) {
        setSelection([]);
        w.setNotice("Aligned MIDI notes to the beat grid.");
      }
    } finally {
      setPending(false);
    }
  }
  function deleteSelected() {
    return edit(selected.map((note) => ({ event: note.event, delete: true })));
  }
  /** Applies the toolbar velocity (or a typed one) to the selected notes. */
  function applyVelocity(value = velocity) {
    if (selected.length)
      return edit(selected.map((note) => ({ ...note, velocity: value })));
  }
  function editorKeyDown(e: KeyboardEvent<HTMLDivElement>) {
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
  }
  function gridDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (draw || (e.target as HTMLElement).closest(".piano-note")) return;
    const r = e.currentTarget.getBoundingClientRect();
    add(e.clientX - r.left, e.clientY - r.top);
  }
  function gridPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!clip) return;
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
  }
  function gridPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!clip) return;
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
  }
  function gridPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!clip) return;
    box.current = null;
    setMarquee(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function gridPointerCancel() {
    if (!clip) return;
    box.current = null;
    setMarquee(null);
  }
  function noteKeyDown(n: Note, e: KeyboardEvent<HTMLButtonElement>) {
    if (!clip) return;
    if (!e.key.startsWith("Arrow") || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const group = selected.length ? selected : [n];
    let dt = 0,
      dp = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight")
      dt = (e.key === "ArrowLeft" ? -1 : 1) * (snap ? step : 0.01);
    else dp = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 12 : 1);
    void edit(moveNotes(group, dt, dp, clip.duration));
  }
  function notePointerDown(n: Note, e: PointerEvent<HTMLButtonElement>) {
    if (!clip) return;
    if (e.button !== 0 || disabled || n.event === undefined) return;
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
      resize: e.currentTarget.getBoundingClientRect().right - e.clientX < 9,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function notePointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!clip) return;
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    let dt = (e.clientX - d.x) / px;
    if (snap) dt = Math.round(dt / step) * step;
    const dp = -Math.round((e.clientY - d.y) / row);
    setPreview(
      d.resize
        ? resizeNotes(d.notes, dt, clip.duration)
        : moveNotes(d.notes, dt, dp, clip.duration, low, high),
    );
  }
  function notePointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (!clip) return;
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
  }
  function notePointerCancel() {
    if (!clip) return;
    drag.current = null;
    setPreview(null);
  }
  return {
    ...viewport,
    clip,
    notes,
    selection,
    preview,
    selected,
    draw,
    setDraw,
    velocity,
    setVelocity,
    marquee,
    playing: w.s.playing,
    canCreateRegion: w.track.kind === "midi",
    togglePlayback,
    alignToBeat,
    deleteSelected,
    applyVelocity,
    copy,
    paste,
    createRegion,
    gridDoubleClick,
    editorKeyDown,
    gridPointerDown,
    gridPointerMove,
    gridPointerUp,
    gridPointerCancel,
    noteKeyDown,
    notePointerDown,
    notePointerMove,
    notePointerUp,
    notePointerCancel,
  };
}
export type MidiEditorController = ReturnType<typeof useMidiEditor>;
