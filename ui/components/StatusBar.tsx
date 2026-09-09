import { useState } from "react";
import { AudioDiagnostics } from "./AudioDiagnostics";
import { ChevronDown } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { keyLabel } from "../hooks/useShortcuts";
export function StatusBar({ controller }: { controller: WorkspaceController }) {
  const { s, armed } = controller;
  const [diagnostics, setDiagnostics] = useState(false);
  const dropouts =
    (s.processingDropouts ?? 0) +
    (s.recordingDropouts ?? 0) +
    Math.max(0, s.deviceDropouts ?? 0);
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
            className={`audio-cpu ${dropouts || s.outputClipped ? "needs-attention" : ""}`}
            aria-label="Audio status"
            title="Audio load, monitoring delay and output protection"
            onClick={() => setDiagnostics(true)}
          >
            Audio {s.audioCpu.toFixed(1)}%
            {!!dropouts && (
              <span aria-label="Audio interruptions detected"> ? !</span>
            )}
            {s.outputClipped && (
              <span>{s.limiterEnabled ? " ? Protected" : " ? Clipped"}</span>
            )}
          </button>
        )}
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
