import { useState } from "react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { Modal } from "./Modal";

export function MidiExportDialog({
  controller: c,
}: {
  controller: WorkspaceController;
}) {
  const [choice, setChoice] = useState(c.exportMidi);
  const track = c.s.tracks.find((t) => t.id === c.midiExportTrack);
  if (!track) return null;
  const close = () => {
    if (!c.busy) c.setMidiExportTrack(null);
  };
  const noInstrument = !track.pluginName || track.bypass;
  return (
    <Modal
      title="Export MIDI track"
      className="midi-export-dialog"
      onClose={close}
    >
      <span className="eyebrow">EXPORT TRACK</span>
      <h2>{track.name}</h2>
      <p>Choose what to take with you.</p>
      <div
        className="export-choices"
        role="group"
        aria-label="MIDI export type"
      >
        <button
          aria-pressed={choice === "audio"}
          onClick={() => setChoice("audio")}
          disabled={c.busy}
        >
          <strong>Instrument audio</strong>
          <span>
            The sound you hear, with effects · {c.exportFormat.toUpperCase()}
          </span>
        </button>
        <button
          aria-pressed={choice === "midi"}
          onClick={() => setChoice("midi")}
          disabled={c.busy}
        >
          <strong>MIDI notes</strong>
          <span>Editable notes and performance · .mid</span>
        </button>
      </div>
      <p className="export-choice-help">
        {choice === "audio" && noInstrument
          ? "Load an active instrument, or choose MIDI notes."
          : "Keeps region timing and your selected takes. Change the default in Settings → Export."}
      </p>
      {c.error && <p role="alert">{c.error}</p>}
      <div className="modal-bottom">
        <button disabled={c.busy} onClick={close}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={
            c.busy || c.s.playing || (choice === "audio" && noInstrument)
          }
          onClick={async () => {
            const result = await c.exportAudio(track.id, choice);
            if (result) c.setMidiExportTrack(null);
          }}
        >
          Choose folder…
        </button>
      </div>
    </Modal>
  );
}
