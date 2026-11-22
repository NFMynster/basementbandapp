import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { desktop as api } from "../services/desktop";
import type { Devices } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { AudioDevicePanel } from "./AudioDevicePanel";
import { ExportSettings } from "./ExportSettings";
import { Modal } from "./Modal";
import { SettingsTabs } from "./SettingsTabs";
import { ShortcutSettings } from "./ShortcutSettings";
import { TrackRoutingPanel } from "./TrackRoutingPanel";

export function SettingsDialog({
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
    deviceLoading,
    openSetup,
  } = controller;
  const pending = useRef(false);
  const [deviceDirty, setDeviceDirty] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  // Closing setup discards unsaved device edits (adjusted during render).
  const [setupWasOpen, setSetupWasOpen] = useState(setup);
  if (setupWasOpen !== setup) {
    setSetupWasOpen(setup);
    if (!setup) setDeviceDirty(false);
  }

  // Refresh the choices when the OS reports a device plugged in or removed,
  // or the engine changes device.
  const deviceListVersion = s.deviceListVersion,
    device = s.device;
  const shownDevices = useRef({ deviceListVersion, device });
  useEffect(() => {
    const shown = shownDevices.current;
    if (
      shown.deviceListVersion === deviceListVersion &&
      shown.device === device
    )
      return;
    if (!setup || deviceDirty || applying || s.playing) return;
    let cancelled = false;
    void api
      .command({ op: "devices" })
      .then((next) => {
        if (cancelled || pending.current) return;
        shownDevices.current = { deviceListVersion, device };
        setDevices(next);
      })
      .catch(() => {
        /* Keep the current selections when a device is temporarily absent. */
      });
    return () => {
      cancelled = true;
    };
  }, [
    deviceListVersion,
    device,
    setup,
    deviceDirty,
    applying,
    s.playing,
    setDevices,
  ]);

  function editDevices(next: Devices) {
    if (pending.current || s.playing) return;
    setDevices(next);
    setDeviceDirty(true);
    void apply(false, next);
  }

  async function apply(close: boolean, selected = devices) {
    if (!selected || pending.current || s.playing) return false;
    pending.current = true;
    setApplying(true);
    setApplyError("");
    try {
      const result = await run(
        {
          op: "configure",
          type: selected.type,
          input: selected.input,
          output: selected.output,
          sampleRate: selected.sampleRate,
          bufferSize: selected.bufferSize,
        },
        false,
      );
      if (!result) {
        setApplyError(
          "Could not apply audio settings. Check your device selections and try again.",
        );
        return false;
      }
      setDevices(result);
      setDeviceDirty(false);
      if (
        result.sampleRate !== selected.sampleRate ||
        result.bufferSize !== selected.bufferSize
      ) {
        setApplyError(
          `The driver selected ${result.sampleRate / 1000} kHz and ${result.bufferSize} samples. These are the active settings.`,
        );
        return false;
      }
      setNotice("Audio settings applied.");
      if (close) setSetup(false);
      return true;
    } finally {
      pending.current = false;
      setApplying(false);
    }
  }

  return (
    setup && (
      <Modal
        title="Settings"
        className="settings-dialog"
        footer={
          <div className="modal-bottom">
            <span>
              {(s.playing && deviceDirty
                ? "Stop playback to apply audio settings."
                : "") ||
                applyError ||
                (deviceDirty
                  ? "Could not apply changes. Retry or choose another device."
                  : "Audio changes apply automatically.")}
            </span>
            <button
              className="primary"
              disabled={applying || (s.playing && deviceDirty)}
              onClick={() =>
                deviceDirty && !s.playing ? void apply(true) : setSetup(false)
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
        <SettingsTabs
          selected={controller.settingsTab}
          onChange={controller.setSettingsTab}
        />
        {controller.settingsTab === "export" ? (
          <ExportSettings controller={controller} />
        ) : controller.settingsTab === "shortcuts" ? (
          <ShortcutSettings controller={controller} />
        ) : (
          <SettingsContent
            controller={controller}
            devices={devices}
            deviceLoading={deviceLoading}
            applying={applying}
            applyError={applyError}
            deviceDirty={deviceDirty}
            editDevices={editDevices}
            apply={apply}
            openSetup={openSetup}
            close={() => setSetup(false)}
          />
        )}
      </Modal>
    )
  );
}

function SettingsContent({
  controller,
  devices,
  deviceLoading,
  applying,
  applyError,
  deviceDirty,
  editDevices,
  apply,
  openSetup,
  close,
}: {
  controller: WorkspaceController;
  devices: Devices | null;
  deviceLoading: boolean;
  applying: boolean;
  applyError: string;
  deviceDirty: boolean;
  editDevices: (devices: Devices) => void;
  apply: (close: boolean) => Promise<boolean>;
  openSetup: () => void;
  close: () => void;
}) {
  const { s } = controller;
  const midi = controller.settingsTab === "midi";
  return (
    <>
      <p>
        {midi
          ? "MIDI pads and keyboards connect to individual MIDI tracks. They are separate from your audio driver; sound still plays through your audio output."
          : "Choose your audio interface, then assign its channels to audio tracks."}
      </p>
      {devices ? (
        <>
          {!midi && (
            <AudioDevicePanel
              controller={controller}
              devices={devices}
              applying={applying}
              applyError={applyError}
              editDevices={editDevices}
              apply={apply}
            />
          )}
          <TrackRoutingPanel controller={controller} devices={devices} />
          <button
            className="text-button"
            disabled={s.recording}
            onClick={async () => {
              if (deviceDirty && !(await apply(false))) return;
              close();
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
                Audio devices could not be loaded. Check the error message and
                try again.
              </p>
              <button className="primary" onClick={openSetup}>
                Retry device setup
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
