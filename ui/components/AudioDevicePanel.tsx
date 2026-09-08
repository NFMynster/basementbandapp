import type { Devices } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";

function sortedUnique(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function nearestPreset(values: number[], target: number) {
  return (values.length ? values : [256, 1024]).reduce((closest, value) =>
    Math.abs(value - target) < Math.abs(closest - target) ? value : closest,
  );
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
            value={devices.sampleRate}
            onChange={(event) =>
              editDevices({ ...devices, sampleRate: +event.target.value })
            }
          >
            {sortedUnique([44100, 48000, ...devices.rates]).map((rate) => (
              <option key={rate} value={rate}>
                {rate / 1000} kHz
              </option>
            ))}
          </select>
        </label>
        <label>
          Buffer size
          <select
            value={devices.bufferSize}
            onChange={(event) =>
              editDevices({ ...devices, bufferSize: +event.target.value })
            }
          >
            {sortedUnique([128, 256, 512, 1024, ...devices.buffers]).map(
              (buffer) => (
                <option key={buffer} value={buffer}>
                  {buffer} samples
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <div className="buffer-presets">
        {[
          { label: "Live playing", target: 256 },
          { label: "Stable mixing", target: 1024 },
        ].map(({ label, target }) => (
          <button
            key={label}
            disabled={s.playing || applying}
            onClick={() =>
              editDevices({
                ...devices,
                bufferSize: nearestPreset(devices.buffers, target),
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      <p className="subtle">
        Live playing favors fast response; Stable mixing gives heavy plug-ins
        more time. Apply or Done confirms the change. Driver and plug-in latency
        still apply.
      </p>
      <button
        className="apply-device"
        disabled={s.playing || applying}
        onClick={() => void apply(false)}
      >
        Apply & refresh inputs
      </button>
      {applyError && <p role="alert">{applyError}</p>}
    </div>
  );
}
