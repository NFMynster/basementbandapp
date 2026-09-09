import type { WorkspaceController } from "../hooks/useWorkspace";
import { Modal } from "./Modal";

export function AudioDiagnostics({
  controller: c,
  onClose,
}: {
  controller: WorkspaceController;
  onClose: () => void;
}) {
  const { s, track } = c;
  const midi = track?.kind === "midi";
  const device =
    (midi ? 0 : (s.inputLatencySamples ?? 0)) + (s.outputLatencySamples ?? 0);
  const plugin = track?.latencySamples ?? 0;
  const ms = (samples: number) =>
    `${((samples * 1000) / s.sampleRate).toFixed(1)} ms`;
  return (
    <Modal title="Audio status" className="audio-diagnostics" onClose={onClose}>
      <span className="eyebrow">STATS FOR NERDS</span>
      <h2>Audio status</h2>
      <p>
        Optional details for troubleshooting. If everything sounds good, you can
        leave these alone.
      </p>
      <div className="diagnostic-summary">
        <div>
          <strong>{ms(device + plugin)}</strong>
          <span>Estimated monitoring delay</span>
        </div>
        <div>
          <strong>{(s.audioCpu ?? 0).toFixed(1)}%</strong>
          <span>Audio processing load</span>
        </div>
      </div>
      <p>
        For {track?.name ?? "your selected track"}: {ms(device)} from the audio
        device + {ms(plugin)} from plug-ins. This is a driver-reported estimate;
        hardware and MIDI timing may add delay.
      </p>
      <dl className="diagnostic-details">
        <div>
          <dt>Device underruns</dt>
          <dd>
            {s.deviceDropouts === undefined || s.deviceDropouts < 0
              ? "Not reported"
              : s.deviceDropouts}
          </dd>
        </div>
        <div>
          <dt>Missed processing blocks</dt>
          <dd>{s.processingDropouts ?? 0}</dd>
        </div>
        <div>
          <dt>Recording buffer overruns</dt>
          <dd>{s.recordingDropouts ?? 0}</dd>
        </div>
        <div>
          <dt>Output peaks</dt>
          <dd>
            {s.outputClipped
              ? s.limiterEnabled
                ? "Peaks protected"
                : "Clipping detected"
              : "Within range"}
          </dd>
        </div>
      </dl>
      <label className="simple-switch">
        <span>
          <strong>Protect output peaks</strong>
          <small>Gentle peak limiting for playback and audio exports.</small>
        </span>
        <input
          type="checkbox"
          checked={!!s.limiterEnabled}
          onChange={(e) =>
            void c.run({ op: "limiter", value: e.target.checked })
          }
        />
      </label>
      <p>
        For less delay, try a smaller buffer. If audio breaks up, use a larger
        one. Direct monitoring on your interface avoids software monitoring
        delay.
      </p>
      <div className="modal-bottom">
        <button onClick={() => void c.run({ op: "clearDiagnostics" }, false)}>
          Reset readings
        </button>
        <button
          onClick={() => {
            onClose();
            void c.openSetup("audio");
          }}
        >
          Audio settings…
        </button>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
