import type { Devices, Track, TrackPatch } from "../models";
export function MidiRouting({
  track,
  devices,
  disabled,
  update,
}: {
  track: Track;
  devices: Devices;
  disabled: boolean;
  update: (track: Track, patch: TrackPatch) => unknown;
}) {
  return (
    <>
      <select
        aria-label={`${track.name} MIDI device`}
        disabled={disabled}
        value={track.midiDevice ?? ""}
        onChange={(e) => update(track, { midiDevice: e.target.value })}
      >
        <option value="">No external input · plug-in preview</option>
        {track.midiDevice &&
          !devices.midiInputs?.some((d) => d.id === track.midiDevice) && (
            <option value={track.midiDevice}>
              Saved MIDI input unavailable
            </option>
          )}
        {devices.midiInputs?.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        aria-label={`${track.name} MIDI channel`}
        disabled={disabled}
        value={track.midiChannel ?? 0}
        onChange={(e) => update(track, { midiChannel: +e.target.value })}
      >
        <option value={0}>All channels</option>
        {Array.from({ length: 16 }, (_, i) => (
          <option key={i} value={i + 1}>
            Channel {i + 1}
          </option>
        ))}
      </select>
    </>
  );
}
