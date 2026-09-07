import { Modal } from "./Modal";
import { Play } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
export function HelpDialog({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const { showHelp, setHelp } = controller;
  return (
    <>
      {showHelp && (
        <Modal
          title="Quick guide"
          onClose={() => setHelp(false)}
          className="help-modal"
        >
          <span className="eyebrow">LESS SETUP. MORE PLAYING.</span>
          <h2>Your first take, in three steps.</h2>
          <ol>
            <li>
              <strong>Connect your interface.</strong>
              <p>
                Open Input settings, choose a device, and assign a different
                input to each track.
              </p>
            </li>
            <li>
              <strong>Mark your tracks. Hit record.</strong>
              <p>
                Click R on every track you want to capture. The red transport
                button records them together. Press Space to stop.
              </p>
            </li>
            <li>
              <strong>Find the part. Play it again.</strong>
              <p>
                Drag the top half of the ruler to loop a range. Drag its bottom
                half to move the playhead. Double-click a region to loop its
                length. Press L to toggle cycle.
              </p>
            </li>
          </ol>
          <p>
            Recordings are written locally as WAV files. Save your session to
            keep the arrangement and audio together. MIDI, live plugin
            monitoring, and overdub latency compensation are still to come.
          </p>
          <button className="primary" onClick={() => setHelp(false)}>
            Let’s play
            <Play size={15} />
          </button>
        </Modal>
      )}
    </>
  );
}
