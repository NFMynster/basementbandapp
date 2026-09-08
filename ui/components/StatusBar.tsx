import { ChevronDown } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { keyLabel } from "../hooks/useShortcuts";
export function StatusBar({ controller }: { controller: WorkspaceController }) {
  const { s, armed } = controller;
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
    </>
  );
}
