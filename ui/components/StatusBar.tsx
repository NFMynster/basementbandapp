import { useAudioLoad } from "../hooks/useAudioLoad";
import { useEffect, useState } from "react";
import { AudioDiagnostics } from "./AudioDiagnostics";
import { ChevronDown } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { keyLabel } from "../hooks/useShortcuts";
import { desktop as api } from "../services/desktop";
import type { UpdateStatus } from "../models";
export function StatusBar({ controller }: { controller: WorkspaceController }) {
  const { s, armed } = controller;
  const [diagnostics, setDiagnostics] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus>({ available: false });
  const audioLoad = useAudioLoad(s.audioCpu);
  // Self-updating builds download in the background; poll until the
  // download is ready or has failed.
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const poll = () =>
      void api
        .checkForUpdate()
        .then((next) => {
          if (!active) return;
          setUpdate(next);
          if (next.state !== "ready" && next.state !== "failed")
            timer = window.setTimeout(poll, 30000);
        })
        .catch(() => undefined);
    poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);
  const openSetup = () => {
    void controller.openSetup("audio");
  };
  return (
    <>
      <footer>
        <button onClick={openSetup}>
          <span className={"live-dot " + (s.deviceError ? "warning" : "")} />
          {s.device}
          <ChevronDown size={12} />
        </button>
        <button aria-label="Audio timing settings" onClick={openSetup}>
          {(s.sampleRate / 1000).toFixed(1)} kHz
          <span className="footer-sep">/</span>
          {s.bufferSize} samples
        </button>
        {s.audioCpu !== undefined && (
          <button
            className={`audio-cpu ${audioLoad >= 80 ? "needs-attention" : ""}`}
            aria-label="Audio status"
            title="Optional technical details: averaged audio load, monitoring delay and recorded interruptions"
            onClick={() => setDiagnostics(true)}
          >
            <span className="stats-label">Stats for nerds</span>
            <span>
              Audio <output>{audioLoad.toFixed(1)}%</output>
            </span>
          </button>
        )}
        {update.available &&
          (update.state === "ready" ? (
            <button
              className="update-available"
              title={`Basement Band ${update.version} is downloaded. Restart to install it; your session is kept. It also installs when you close the app.`}
              disabled={s.recording}
              onClick={() => void api.installUpdate()}
            >
              restart to update
            </button>
          ) : update.state === "downloading" ? (
            <span
              className="update-available"
              title={`Downloading Basement Band ${update.version}`}
            >
              downloading update
            </span>
          ) : (
            <button
              className="update-available"
              title={`Basement Band ${update.version} is available on GitHub`}
              onClick={() => void api.openRelease()}
            >
              update available
            </button>
          ))}
        <div className="footer-right">
          {s.recording ? (
            <>
              <span className="record-dot" />
              Recording {armed} tracks {s.looping ? "· loop takes" : ""}
            </>
          ) : s.playing ? (
            "Playing"
          ) : armed ? (
            `${armed} ${armed === 1 ? "track" : "tracks"} ready to record`
          ) : (
            "Mark a track to get started"
          )}
          <span className="key">{keyLabel(controller.bindings.record)}</span>
          record / stop
          <span className="key">{keyLabel(controller.bindings.play)}</span>
          play / stop
          <span className="key">{keyLabel(controller.bindings.start)}</span>
          back to start
        </div>
      </footer>
      {diagnostics && (
        <AudioDiagnostics
          controller={controller}
          onClose={() => setDiagnostics(false)}
        />
      )}
    </>
  );
}
