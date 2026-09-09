import { useAudioLoad } from "../hooks/useAudioLoad";
import { useState } from "react";
import { AudioDiagnostics } from "./AudioDiagnostics";
import { ChevronDown } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { keyLabel } from "../hooks/useShortcuts";
export function StatusBar({ controller }: { controller: WorkspaceController }) {
  const { s, armed } = controller;
  const [diagnostics, setDiagnostics] = useState(false);
  const audioLoad = useAudioLoad(s.audioCpu);
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
