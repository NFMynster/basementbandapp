import type { WorkspaceController } from "../hooks/useWorkspace";
export function ExportSettings({
  controller: c,
}: {
  controller: WorkspaceController;
}) {
  return (
    <div className="export-settings">
      <label>
        Session export
        <select
          value={c.exportMode}
          onChange={(e) =>
            c.setExportMode(e.target.value as "mix" | "separate")
          }
        >
          <option value="separate">Separate tracks · WAV files</option>
          <option value="mix">Merged mix · one WAV file</option>
        </select>
      </label>
      <p>
        Remembered on this computer. Merged export follows mute, solo, plug-ins
        and master volume. Separate tracks include muted tracks and remain
        aligned.
      </p>
      <p>
        24-bit stereo WAV. Loops are ignored; plug-in tails are included. Export
        asks for a folder and creates a new subfolder, preserving previous
        exports.
      </p>
      {c.track && (
        <button
          disabled={c.busy || c.s.playing || !c.track.clips.length}
          onClick={() => c.exportAudio(c.track!.id)}
        >
          Export {c.track.name}…
        </button>
      )}
    </div>
  );
}
