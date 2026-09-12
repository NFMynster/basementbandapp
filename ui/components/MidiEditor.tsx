import { Plus, Pencil } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { useMidiEditor } from "../hooks/useMidiEditor";
import { MidiEditorToolbar } from "./MidiEditorToolbar";
import { MidiPianoRoll } from "./MidiPianoRoll";
export function MidiEditor({
  controller: w,
}: {
  controller: WorkspaceController;
}) {
  const editor = useMidiEditor(w);
  const { unavailable, clip, createRegion, editorKeyDown, canCreateRegion } =
    editor;
  return (
    <div className="midi-editor" onKeyDown={editorKeyDown}>
      {clip && <MidiEditorToolbar editor={editor} />}
      {!clip ? (
        <div className="notes-empty">
          <Pencil size={22} aria-hidden="true" />
          <strong>A place for your notes</strong>
          <button
            className="new-midi-region"
            disabled={unavailable || !canCreateRegion}
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
        <MidiPianoRoll editor={editor} />
      )}
    </div>
  );
}
