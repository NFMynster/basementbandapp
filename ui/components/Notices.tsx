import { X } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
export function Notices({ controller }: { controller: WorkspaceController }) {
  const { s, error, setError, notice, run, openSetup } = controller;
  return (
    <>
      {(error || s.deviceError || s.diskOverrun) && (
        <div className="toast error" role="alert">
          <span>
            {error ||
              s.deviceError ||
              (s.diskOverrun
                ? "The audio engine reported a dropout. If you were recording, check the take for gaps. Try a larger audio buffer."
                : "")}
          </span>
          {!error && s.deviceError ? (
            <button onClick={openSetup}>Audio setup</button>
          ) : (
            <button
              onClick={() => {
                setError("");
                if (s.diskOverrun) run({ op: "clearWarning" }, false);
              }}
              title="Dismiss"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </>
  );
}
