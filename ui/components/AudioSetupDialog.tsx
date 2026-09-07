import { useState } from "react";
import { Modal } from "./Modal";
import { AudioLines, ChevronRight } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
export function AudioSetupDialog({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const {
    setup,
    setSetup,
    devices,
    setDevices,
    s,
    run,
    setNotice,
    update,
    deviceLoading,
    openSetup,
  } = controller;
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  async function apply(close: boolean) {
    if (!devices || applying) return;
    setApplying(true);
    setApplyError("");
    try {
      const d = await run(
        {
          op: "configure",
          type: devices.type,
          input: devices.input,
          output: devices.output,
          sampleRate: devices.sampleRate,
          bufferSize: devices.bufferSize,
        },
        false,
      );
      if (d) {
        setDevices(d);
        setNotice("Audio settings applied.");
        if (close) setSetup(false);
      } else
        setApplyError(
          "Could not apply audio settings. Check your device selections and try again.",
        );
    } finally {
      setApplying(false);
    }
  }
  return (
    <>
      {setup && (
        <Modal
          title="Input settings"
          onClose={() => {
            if (!applying) setSetup(false);
          }}
        >
          <span className="eyebrow">AUDIO DEVICES & TRACK ROUTING</span>
          <h2>Input settings</h2>
          <p>
            Choose your audio device, then give each instrument its own input.
          </p>
          {devices ? (
            <>
              <label>
                Audio driver
                <select
                  value={devices.type}
                  onChange={(e) =>
                    setDevices({
                      ...devices,
                      type: e.target.value,
                      input:
                        devices.types.find((t) => t.name === e.target.value)
                          ?.inputs[0] ?? "",
                      output:
                        devices.types.find((t) => t.name === e.target.value)
                          ?.outputs[0] ?? "",
                    })
                  }
                >
                  {devices.types.map((t) => (
                    <option key={t.name}>{t.name}</option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Input device
                  <select
                    value={devices.input}
                    onChange={(e) =>
                      setDevices({ ...devices, input: e.target.value })
                    }
                  >
                    <option value="">None</option>
                    {devices.types
                      .find((t) => t.name === devices.type)
                      ?.inputs.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Output device
                  <select
                    value={devices.output}
                    onChange={(e) =>
                      setDevices({ ...devices, output: e.target.value })
                    }
                  >
                    <option value="">None</option>
                    {devices.types
                      .find((t) => t.name === devices.type)
                      ?.outputs.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Sample rate
                  <select
                    value={devices.sampleRate}
                    onChange={(e) =>
                      setDevices({ ...devices, sampleRate: +e.target.value })
                    }
                  >
                    {[...new Set([44100, 48000, ...devices.rates])]
                      .sort((a, b) => a - b)
                      .map((n) => (
                        <option key={n} value={n}>
                          {n / 1000} kHz
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Buffer size
                  <select
                    value={devices.bufferSize}
                    onChange={(e) =>
                      setDevices({ ...devices, bufferSize: +e.target.value })
                    }
                  >
                    {[...new Set([128, 256, 512, 1024, ...devices.buffers])]
                      .sort((a, b) => a - b)
                      .map((n) => (
                        <option key={n} value={n}>
                          {n} samples
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <button
                className="apply-device"
                disabled={s.playing || applying}
                onClick={() => apply(false)}
              >
                Apply & refresh inputs
              </button>
              {applyError && <p role="alert">{applyError}</p>}
              <div className="routing">
                <label>TRACK ROUTING</label>
                {s.tracks.map((t) => (
                  <div key={t.id}>
                    <span style={{ color: t.color }}>
                      <AudioLines size={16} />
                    </span>
                    <strong>{t.name}</strong>
                    <select
                      disabled={s.recording}
                      value={t.input}
                      onChange={(e) => update(t, { input: +e.target.value })}
                    >
                      {t.input >= devices.channels.length && (
                        <option value={t.input}>
                          Input {t.input + 1} unavailable
                        </option>
                      )}
                      {devices.channels.length ? (
                        devices.channels.map((n, i) => (
                          <option key={i} value={i}>
                            {i + 1} · {n}
                          </option>
                        ))
                      ) : (
                        <option value={0}>No inputs available</option>
                      )}
                    </select>
                  </div>
                ))}
              </div>
              <div className="modal-bottom">
                <span>Use one interface for synchronized recording.</span>
                <button
                  className="primary"
                  disabled={s.playing || applying}
                  onClick={() => apply(true)}
                >
                  {applying ? "Applying…" : "Done"}
                  <ChevronRight size={15} />
                </button>
              </div>
            </>
          ) : (
            <div className="device-status">
              {deviceLoading ? (
                <p>Looking for audio devices…</p>
              ) : (
                <>
                  <p>
                    Audio devices could not be loaded. Check the error message
                    and try again.
                  </p>
                  <button className="primary" onClick={openSetup}>
                    Retry device setup
                  </button>
                </>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
