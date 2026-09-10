import type { RecordingPreview as RecordingPreviewModel } from "../models";
import { MidiNotes } from "./MidiNotes";
import { Waveform } from "./Waveform";

export function RecordingPreview({
  preview,
}: {
  preview: RecordingPreviewModel;
}) {
  return (
    <div className={`recording-preview ${preview.kind}`} aria-hidden="true">
      {preview.kind === "midi" ? (
        <MidiNotes clip={preview} />
      ) : (
        <Waveform
          peaks={preview.peaks}
          peakInterval={preview.peakInterval}
          duration={preview.duration}
        />
      )}
    </div>
  );
}
