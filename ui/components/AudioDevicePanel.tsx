import type { Devices } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";

function sortedUnique(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function AudioDevicePanel({
  controller,
  devices,
  applying,
  applyError,
  editDevices,
  apply,
}: {
  controller: WorkspaceController;
  devices: Devices;
  applying: boolean;
  applyError: string;
  editDevices: (devices: Devices) => void;
  apply: (close: boolean) => Promise<boolean>;
}) {
  const { s } = controller;
  const selectedType = devices.types.find((type) => type.name === devices.type);
  return (
    <div className="audio-device-panel">
      <label>
        Audio driver
        <select
          disabled={s.playing || applying}
          value={devices.type}
          onChange={(event) => {
            const type = devices.types.find(
              (candidate) => candidate.name === event.target.value,
            );
            editDevices({
              ...devices,
              type: event.target.value,
              input: type?.inputs[0] ?? "",
              output: type?.outputs[0] ?? "",
            });
          }}
        >
          {devices.types.map((type) => (
            <option key={type.name}>{type.name}</option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          Input device
          <select
            disabled={s.playing || applying}
            value={devices.input}
            onChange={(event) =>
              editDevices({ ...devices, input: event.target.value })
            }
          >
            <option value="">None</option>
            {selectedType?.inputs.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <small>
            {s.audioInputActive
              ? "Active for audio recording or monitoring."
              : "Idle · MIDI and playback use output only. Opens when an audio track needs input."}
          </small>
        </label>
        <label>
          Output device
          <select
            disabled={s.playing || applying}
            value={devices.output}
            onChange={(event) =>
              editDevices({ ...devices, output: event.target.value })
            }
          >
            <option value="">None</option>
            {selectedType?.outputs.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Sample rate
          <select
            disabled={s.playing || applying}
            value={devices.sampleRate}
            onChange={(event) =>
              editDevices({ ...devices, sampleRate: +event.target.value })
            }
          >
            {sortedUnique([devices.sampleRate, ...devices.rates]).map(
              (rate) => (
                <option key={rate} value={rate}>
                  {rate / 1000} kHz
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Buffer size
          <select
            disabled={s.playing || applying}
            value={devices.bufferSize}
            onChange={(event) =>
              editDevices({ ...devices, bufferSize: +event.target.value })
            }
          >
            {sortedUnique([devices.bufferSize, ...devices.buffers]).map(
              (buffer) => (
                <option key={buffer} value={buffer}>
                  {buffer} samples
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <p className="buffer-help">
        A smaller buffer reduces latency but gives your CPU less time to process
        audio. If you hear clicks or dropouts, increase it. Apply or Done
        confirms the change.
        <br />
        <strong>
          For much lower latency, use your USB audio interface for BOTH input
          and output, and plug headphones or speakers directly into the
          interface.
        </strong>
        <br />
        Built-in speakers can add substantial delay even at the smallest buffer.
      </p>
      {s.playing && (
        <p role="status">Stop playback to change audio device settings.</p>
      )}
      <button
        className="apply-device"
        disabled={s.playing || applying}
        onClick={() => void apply(false)}
      >
        Apply audio settings
      </button>
      {applyError && <p role="alert">{applyError}</p>}
    </div>
  );
}
