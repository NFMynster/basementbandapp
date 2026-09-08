import { AudioLines } from "lucide-react";
import type { Devices } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { MidiRouting } from "./MidiRouting";

export function TrackRoutingPanel({
  controller,
  devices,
}: {
  controller: WorkspaceController;
  devices: Devices;
}) {
  const { s, settingsTab, update } = controller;
  const midi = settingsTab === "midi";
  const tracks = s.tracks.filter((track) => (track.kind === "midi") === midi);
  return (
    <div className="routing">
      <label>TRACK ROUTING</label>
      {tracks.map((track) => (
        <div key={track.id}>
          <span style={{ color: track.color }}>
            <AudioLines size={16} />
          </span>
          <strong>{track.name}</strong>
          {track.kind === "midi" ? (
            <MidiRouting
              track={track}
              devices={devices}
              disabled={s.recording}
              update={update}
            />
          ) : (
            <select
              disabled={s.recording}
              value={track.input}
              onChange={(event) =>
                update(track, { input: +event.target.value })
              }
            >
              {track.input >= devices.channels.length && (
                <option value={track.input}>
                  Input {track.input + 1} unavailable
                </option>
              )}
              {devices.channels.length ? (
                devices.channels.map((name, index) => (
                  <option key={index} value={index}>
                    {index + 1} · {name}
                  </option>
                ))
              ) : (
                <option value={0}>No inputs available</option>
              )}
            </select>
          )}
        </div>
      ))}
      {midi && !tracks.length && (
        <p>
          No MIDI tracks yet. Create one to choose your pad or keyboard and load
          a VST3 instrument.
        </p>
      )}
    </div>
  );
}
