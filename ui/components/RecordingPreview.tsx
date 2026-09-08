import type { RecordingPreview as RecordingPreviewModel } from "../models";
import { MidiNotes } from "./MidiNotes";
import { Waveform } from "./Waveform";

export function RecordingPreview({
  preview,
}: {
  preview: RecordingPreviewModel;
}) {
  return (
    <div className="recording-preview" aria-hidden="true">
      {preview.kind === "midi" ? (
        <MidiNotes clip={preview} />
      ) : (
        <Waveform peaks={preview.peaks} />
      )}
    </div>
  );
}
