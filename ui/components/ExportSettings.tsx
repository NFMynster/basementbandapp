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
          <option value="separate">Separate tracks · one file per track</option>
          <option value="mix">Merged mix · one file</option>
        </select>
      </label>
      <label>
        Output format
        <select
          value={c.exportFormat}
          onChange={(e) => c.setExportFormat(e.target.value as "wav" | "flac")}
        >
          <option value="wav">WAV · 24-bit stereo</option>
          <option value="flac">FLAC · 24-bit stereo</option>
        </select>
      </label>
      <label>
        MIDI tracks
        <select
          value={c.exportMidi}
          onChange={(e) => c.setExportMidi(e.target.value as "audio" | "midi")}
        >
          <option value="audio">Instrument audio ? the sound you hear</option>
          <option value="midi">MIDI notes ? editable .mid files</option>
        </select>
      </label>
      <p>
        {c.exportMidi === "midi"
          ? "MIDI tracks become separate .mid files. A merged mix contains only the audio tracks."
          : "MIDI instruments are rendered with their effects. You can choose differently when exporting a single MIDI track."}
      </p>
      <label className="simple-switch">
        <span>
          <strong>Protect output peaks</strong>
          <small>Limit loud peaks in playback and audio exports.</small>
        </span>
        <input
          type="checkbox"
          checked={!!c.s.limiterEnabled}
          onChange={(e) =>
            void c.run({ op: "limiter", value: e.target.checked })
          }
        />
      </label>
      <p>
        Merged export follows mute, solo, plug-ins and master volume. Separate
        tracks include muted tracks and remain aligned.
      </p>
      <p>
        Loops are ignored and plug-in tails are included. Export asks for a
        folder and creates a new subfolder, preserving previous exports.
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
