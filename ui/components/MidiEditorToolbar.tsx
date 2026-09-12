import {
  Magnet,
  Play,
  Square,
  Copy,
  Plus,
  Trash2,
  MousePointer2,
  ClipboardPaste,
  Pencil,
} from "lucide-react";
import type { MidiEditorController } from "../hooks/useMidiEditor";
export function MidiEditorToolbar({
  editor,
}: {
  editor: MidiEditorController;
}) {
  const {
    division,
    setDivision,
    snap,
    setSnap,
    zoom,
    setZoom,
    fullKeyboard,
    setFullKeyboard,
    unavailable,
    clip,
    notes,
    selected,
    draw,
    setDraw,
    velocity,
    setVelocity,
    playing,
    canCreateRegion,
    togglePlayback,
    alignToBeat,
    deleteSelected,
    applyVelocity,
    copy,
    paste,
    createRegion,
  } = editor;
  if (!clip) return null;
  return (
    <div className="midi-tools" role="group" aria-label="MIDI editor tools">
      <button
        aria-label={playing ? "Stop playback" : "Play region"}
        title={playing ? "Stop playback" : "Play from the start of this region"}
        disabled={unavailable}
        onClick={togglePlayback}
      >
        {playing ? <Square size={14} /> : <Play size={14} />}
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
          onClick={alignToBeat}
        >
          Align to beat
        </button>
      </div>
      <div className="midi-tool-group" role="group" aria-label="Note actions">
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
          onClick={deleteSelected}
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
            onPointerUp={applyVelocity}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow")) void applyVelocity();
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
        disabled={unavailable || !canCreateRegion}
        onClick={() => void createRegion()}
      >
        <Plus size={14} />
        New region
      </button>
    </div>
  );
}
