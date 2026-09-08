import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { MidiRouting } from "./MidiRouting";
import { ShortcutSettings } from "./ShortcutSettings";
import { ExportSettings } from "./ExportSettings";
import type { Devices } from "../models";
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
  const [deviceDirty, setDeviceDirty] = useState(false);
  useEffect(() => {
    if (!setup) setDeviceDirty(false);
  }, [setup]);
  function editDevices(devices: Devices) {
    setDevices(devices);
    setDeviceDirty(true);
  }
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  async function apply(close: boolean) {
    if (!devices || applying) return false;
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
        setDeviceDirty(false);
        setNotice("Audio settings applied.");
        if (close) setSetup(false);
        return true;
      } else
        setApplyError(
          "Could not apply audio settings. Check your device selections and try again.",
        );
      return false;
    } finally {
      setApplying(false);
    }
  }
  return (
    <>
      {setup && (
        <Modal
          title="Settings"
          footer={
            <div className="modal-bottom">
              <span>
                {applyError ||
                  (deviceDirty
                    ? "Changes apply when you press Done."
                    : "Your session. Your setup.")}
              </span>
              <button
                className="primary"
                disabled={applying || (s.playing && deviceDirty)}
                onClick={() =>
                  deviceDirty ||
                  (devices && controller.settingsTab === "audio" && !s.playing)
                    ? apply(true)
                    : setSetup(false)
                }
              >
                {applying ? "Applying…" : "Done"}
                <ChevronRight size={15} />
              </button>
            </div>
          }
          onClose={() => {
            if (!applying) setSetup(false);
          }}
        >
          <span className="eyebrow">AUDIO DEVICES & TRACK ROUTING</span>
          <h2>Settings</h2>
          <div
            className="settings-tabs"
            role="tablist"
            aria-label="Settings sections"
          >
            {(["audio", "midi", "shortcuts", "export"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={controller.settingsTab === tab}
                onClick={() => controller.setSettingsTab(tab)}
              >
                {tab === "audio"
                  ? "Audio inputs & output"
                  : tab === "midi"
                    ? "MIDI tracks"
                    : tab === "export"
                      ? "Export"
                      : "Keyboard shortcuts"}
              </button>
            ))}
          </div>
          {controller.settingsTab === "export" ? (
            <ExportSettings controller={controller} />
          ) : controller.settingsTab === "shortcuts" ? (
            <>
              <ShortcutSettings controller={controller} />
            </>
          ) : (
            <>
              <p>
                {controller.settingsTab === "audio"
                  ? "Choose your audio interface, then assign its channels to audio tracks."
                  : "MIDI pads and keyboards connect to individual MIDI tracks. They are separate from your audio driver; sound still plays through your audio output."}
              </p>
              {devices ? (
                <>
                  {controller.settingsTab === "midi" && (
                    <p className="midi-timing">
                      MIDI instruments share the audio output buffer:{" "}
                      {s.bufferSize} samples (
                      {((s.bufferSize / s.sampleRate) * 1000).toFixed(2)} ms).{" "}
                      Driver-reported output latency:{" "}
                      {(
                        ((s.outputLatencySamples ?? 0) / s.sampleRate) *
                        1000
                      ).toFixed(1)}{" "}
                      ms. VST delay for the selected track:{" "}
                      {(
                        ((controller.track?.latencySamples ?? 0) /
                          s.sampleRate) *
                        1000
                      ).toFixed(1)}{" "}
                      ms. These are reported values, not a measured
                      pad-to-speaker total. Change the shared buffer under Audio
                      inputs & output.
                    </p>
                  )}
                  <div hidden={controller.settingsTab !== "audio"}>
                    <label>
                      Audio driver
                      <select
                        value={devices.type}
                        onChange={(e) =>
                          editDevices({
                            ...devices,
                            type: e.target.value,
                            input:
                              devices.types.find(
                                (t) => t.name === e.target.value,
                              )?.inputs[0] ?? "",
                            output:
                              devices.types.find(
                                (t) => t.name === e.target.value,
                              )?.outputs[0] ?? "",
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
                            editDevices({ ...devices, input: e.target.value })
                          }
                        >
                          <option value="">None</option>
                          {devices.types
                            .find((t) => t.name === devices.type)
                            ?.inputs.map((n) => (
                              <option key={n}>{n}</option>
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
                          onChange={(e) =>
                            editDevices({ ...devices, output: e.target.value })
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
                            editDevices({
                              ...devices,
                              sampleRate: +e.target.value,
                            })
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
                            editDevices({
                              ...devices,
                              bufferSize: +e.target.value,
                            })
                          }
                        >
                          {[
                            ...new Set([
                              128,
                              256,
                              512,
                              1024,
                              ...devices.buffers,
                            ]),
                          ]
                            .sort((a, b) => a - b)
                            .map((n) => (
                              <option key={n} value={n}>
                                {n} samples
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className="buffer-presets">
                      <button
                        disabled={s.playing || applying}
                        onClick={() =>
                          editDevices({
                            ...devices,
                            bufferSize: (devices.buffers.length
                              ? devices.buffers
                              : [256, 1024]
                            ).reduce((a, b) =>
                              Math.abs(b - 256) < Math.abs(a - 256) ? b : a,
                            ),
                          })
                        }
                      >
                        Live playing
                      </button>
                      <button
                        disabled={s.playing || applying}
                        onClick={() =>
                          editDevices({
                            ...devices,
                            bufferSize: (devices.buffers.length
                              ? devices.buffers
                              : [256, 1024]
                            ).reduce((a, b) =>
                              Math.abs(b - 1024) < Math.abs(a - 1024) ? b : a,
                            ),
                          })
                        }
                      >
                        Stable mixing
                      </button>
                    </div>
                    <p className="subtle">
                      Live playing favors fast response; Stable mixing gives
                      heavy plug-ins more time. Apply or Done confirms the
                      change. Driver and plug-in latency still apply.
                    </p>
                    <button
                      className="apply-device"
                      disabled={s.playing || applying}
                      onClick={() => apply(false)}
                    >
                      Apply & refresh inputs
                    </button>
                    {applyError && <p role="alert">{applyError}</p>}
                  </div>
                  <div className="routing">
                    <label>TRACK ROUTING</label>
                    {s.tracks
                      .filter(
                        (t) =>
                          (t.kind === "midi") ===
                          (controller.settingsTab === "midi"),
                      )
                      .map((t) => (
                        <div key={t.id}>
                          <span style={{ color: t.color }}>
                            <AudioLines size={16} />
                          </span>
                          <strong>{t.name}</strong>
                          {t.kind === "midi" ? (
                            <MidiRouting
                              track={t}
                              devices={devices}
                              disabled={s.recording}
                              update={update}
                            />
                          ) : (
                            <select
                              disabled={s.recording}
                              value={t.input}
                              onChange={(e) =>
                                update(t, { input: +e.target.value })
                              }
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
                          )}
                        </div>
                      ))}
                  </div>
                  {controller.settingsTab === "midi" &&
                    !s.tracks.some((t) => t.kind === "midi") && (
                      <p>
                        No MIDI tracks yet. Create one to choose your pad or
                        keyboard and load a VST3 instrument.
                      </p>
                    )}
                  <button
                    className="text-button"
                    disabled={s.recording}
                    onClick={async () => {
                      if (deviceDirty && !(await apply(false))) return;
                      setSetup(false);
                      controller.openCreateTrack();
                    }}
                  >
                    + Add audio or MIDI track
                  </button>
                </>
              ) : (
                <div className="device-status">
                  {deviceLoading ? (
                    <p>Looking for audio devices…</p>
                  ) : (
                    <>
                      <p>
                        Audio devices could not be loaded. Check the error
                        message and try again.
                      </p>
                      <button className="primary" onClick={openSetup}>
                        Retry device setup
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
