import { useState } from "react";
import { Guitar, Piano } from "lucide-react";
import { Modal } from "./Modal";
import type { WorkspaceController } from "../hooks/useWorkspace";
export function CreateTrackDialog({
  controller: c,
}: {
  controller: WorkspaceController;
}) {
  const [kind, setKind] = useState<"audio" | "midi">("audio");
  const [input, setInput] = useState(0),
    [device, setDevice] = useState("");
  const [creating, setCreating] = useState(false);
  return (
    <Modal
      title="New track"
      className="create-track-dialog"
      onClose={() => {
        if (!creating) c.setCreatingTrack(false);
      }}
    >
      <span className="eyebrow">MAKE ROOM FOR ANOTHER INSTRUMENT</span>
      <h2>What are you playing?</h2>
      <div className="track-types">
        <button
          aria-pressed={kind === "audio"}
          onClick={() => setKind("audio")}
        >
          <Guitar size={30} />
          <strong>Audio</strong>
          <span>
            Guitar, bass or microphone
            <br />
            Record your interface’s input.
          </span>
        </button>
        <button aria-pressed={kind === "midi"} onClick={() => setKind("midi")}>
          <Piano size={30} />
          <strong>MIDI instrument</strong>
          <span>
            Drum pads or keyboard
            <br />
            Play a VST3 instrument.
          </span>
        </button>
      </div>
      {kind === "audio" ? (
        <label>
          Audio input
          <select value={input} onChange={(e) => setInput(+e.target.value)}>
            {c.devices?.channels.length ? (
              c.devices.channels.map((name, i) => (
                <option key={i} value={i}>
                  {i + 1} · {name}
                </option>
              ))
            ) : (
              <option value={0}>Input 1 · configure in Settings</option>
            )}
          </select>
        </label>
      ) : (
        <label>
          MIDI device (optional)
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            <option value="">No external input · plug-in preview</option>
            {c.devices?.midiInputs?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p>
        {kind === "midi"
          ? "MIDI devices belong to individual tracks—not the audio driver. Add your instrument in Plug-ins after creating the track."
          : "Your audio interface is shared by audio tracks. Assign a different channel to each instrument."}
      </p>
      <div className="modal-bottom">
        <button
          onClick={() => {
            c.setCreatingTrack(false);
            c.openSetup();
          }}
        >
          Input settings
        </button>
        <button
          className="primary"
          disabled={creating || c.s.recording}
          onClick={async () => {
            setCreating(true);
            const result = await c.run({
              op: "addTrack",
              kind,
              ...(kind === "audio" ? { input } : { midiDevice: device }),
            });
            if (result) {
              const track = result.tracks.at(-1)!;
              c.openProperties(track.id);
              c.setPanel(kind === "midi" ? "plugins" : "input");
              c.setCreatingTrack(false);
            }
            setCreating(false);
          }}
        >
          {creating ? "Creating…" : "Create track"}
        </button>
      </div>
    </Modal>
  );
}
