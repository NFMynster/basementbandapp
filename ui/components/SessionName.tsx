import { useState } from "react";
import type { WorkspaceController } from "../hooks/useWorkspace";

export function SessionName({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label="Session name"
      className="session-name"
      maxLength={100}
      value={draft ?? controller.s.title}
      onFocus={() => setDraft(controller.s.title)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== controller.s.title)
          void controller.run({
            op: "rename",
            title: draft.trim() || "Untitled",
          });
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.preventDefault();
          setDraft(controller.s.title);
        }
      }}
    />
  );
}
