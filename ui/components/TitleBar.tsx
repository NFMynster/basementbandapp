import { AudioLines, FolderOpen, Plus, Save } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { desktop as api } from "../services/desktop";
export function TitleBar({ controller }: { controller: WorkspaceController }) {
  const { s, setS, run, busy, dirty, setDirty, setClipId, setSelected, task } =
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
        <div className="project-title">
          <input
            aria-label="Session name"
            value={s.title}
            onChange={(e) => {
              setS({ ...s, title: e.target.value });
              run({ op: "rename", title: e.target.value });
            }}
          />
          <span className={dirty ? "unsaved" : ""}>
            {dirty ? "Unsaved changes" : "Local session"}
          </span>
        </div>
        <div className="file-actions">
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
            Save
          </button>
        </div>
      </header>
    </>
  );
}
