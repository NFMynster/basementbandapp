import { useState } from "react";
import { Modal } from "./Modal";
import { errorMessage } from "../services/errors";
import type { WorkspaceController } from "../hooks/useWorkspace";

export function ExportDialog({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const [mode, setMode] = useState<"separate" | "mix">("separate");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const target = controller.exportTarget;
  const track = controller.s.tracks.find((t) => t.id === target);
  return (
    <Modal
      title="Export audio"
      onClose={() => {
        if (!exporting) controller.setExportTarget(null);
      }}
    >
      <span className="eyebrow">TAKE YOUR MUSIC WITH YOU</span>
      <h2>{track ? `Export ${track.name}` : "Export your session"}</h2>
      {!track && (
        <label>
          Export as
          <select
            value={mode}
            disabled={exporting}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="separate">Separate tracks (WAV files)</option>
            <option value="mix">One merged mix (WAV file)</option>
          </select>
        </label>
      )}
      <p>
        24-bit stereo WAV · {controller.s.sampleRate / 1000} kHz. Includes
        level, pan and active plug-ins. All files start at the beginning of the
        session; looping is ignored.
      </p>
      <p>
        {track || mode === "separate"
          ? "Exports tracks with audio, including muted tracks, aligned for use together."
          : "The mix follows your mute and solo settings."}{" "}
        Plug-in tails are included up to 10 seconds.
      </p>
      <p>A new subfolder keeps previous exports safe.</p>
      {error && (
        <p role="alert" className="export-error">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="export-result">
          {result}
        </p>
      )}
      <div className="modal-bottom">
        <span>
          {exporting
            ? "Rendering audio… This may take a little while."
            : "Stop playback before exporting."}
        </span>
        <button
          className="primary"
          disabled={exporting || controller.s.playing}
          onClick={async () => {
            setExporting(true);
            setError("");
            setResult("");
            try {
              const r = await controller.exportAudio({
                mode: track ? "separate" : mode,
                track: target || undefined,
              });
              if (r)
                setResult(
                  `Exported ${r.files.length} ${r.files.length === 1 ? "file" : "files"} to ${r.folder}`,
                );
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Exporting…" : "Choose folder & export"}
        </button>
      </div>
    </Modal>
  );
}
