import { ChevronDown } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
export function StatusBar({ controller }: { controller: WorkspaceController }) {
  const { s, openSetup, armed } = controller;
  return (
    <>
      <footer>
        <button onClick={openSetup}>
          <span className={"live-dot " + (s.deviceError ? "warning" : "")} />
          {s.device}
          <ChevronDown size={12} />
        </button>
        <span>
          {(s.sampleRate / 1000).toFixed(1)} kHz
          <span className="footer-sep">/</span>
          {s.bufferSize} samples
        </span>
        <div className="footer-right">
          {s.recording ? (
            <>
              <span className="record-dot" />
              Recording {armed} tracks · cycle paused
            </>
          ) : s.playing ? (
            "Playing"
          ) : armed ? (
            `${armed} ${armed === 1 ? "track" : "tracks"} ready to record`
          ) : (
            "Arm a track to get started"
          )}
          <span className="key">R</span>record<span className="key">space</span>
          play
        </div>
      </footer>
    </>
  );
}
