import {
  AudioLines,
  FolderOpen,
  Plus,
  Save,
  Download,
  Undo2,
  Redo2,
} from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { desktop as api } from "../services/desktop";
import { keyLabel } from "../hooks/useShortcuts";
export function TitleBar({ controller }: { controller: WorkspaceController }) {
  const { s, run, busy, dirty, setDirty, setClipId, setSelected, task } =
    controller;
  return (
    <>
      <header className="titlebar">
        <div className="brand">
          <span className="brand-icon">
            <AudioLines size={18} />
          </span>
          basement<span className="brand-light">band</span>
          <span className="preview-label">EARLY ACCESS</span>
        </div>
        <div className="file-actions">
          <button
            title={`Undo · ${keyLabel(controller.bindings.undo)}`}
            disabled={busy || s.playing || !s.canUndo}
            onClick={() => run({ op: "undo" })}
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            title={`Redo · ${keyLabel(controller.bindings.redo)}`}
            disabled={busy || s.playing || !s.canRedo}
            onClick={() => run({ op: "redo" })}
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
          <button
            disabled={busy || s.recording}
            title="New session"
            onClick={async () => {
              if (
                !dirty ||
                confirm("Start a new session? Unsaved edits will be lost.")
              ) {
                const result = await run({ op: "new" }, false);
                if (result) {
                  setDirty(false);
                  setClipId("");
                  setSelected("");
                }
              }
            }}
          >
            <Plus size={16} />
            New
          </button>
          <button
            title="Open session"
            disabled={busy || s.recording}
            onClick={() => {
              if (
                !dirty ||
                confirm("Open another session? Unsaved edits will be lost.")
              )
                task(() => api.open(), true);
            }}
          >
            <FolderOpen size={16} />
            Open
          </button>
          <button
            disabled={busy || s.recording}
            onClick={() => task(() => api.save(), true)}
          >
            <Save size={16} />
            Save{" "}
            <span className="key">{keyLabel(controller.bindings.save)}</span>
          </button>
          <button
            disabled={busy || s.playing || !controller.hasClips}
            onClick={() => controller.exportAudio()}
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </header>
    </>
  );
}
