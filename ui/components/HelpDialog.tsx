import { desktop as api } from "../services/desktop";
import { Modal } from "./Modal";
import { Play } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { keyLabel } from "../hooks/useShortcuts";
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
                button records them together. Press{" "}
                {keyLabel(controller.bindings.play)} to stop.
              </p>
            </li>
            <li>
              <strong>Find the part. Play it again.</strong>
              <p>
                Drag the top half of the ruler to loop a range. Drag its bottom
                half to move the playhead. Double-click a region to loop its
                length. Press {keyLabel(controller.bindings.loop)} to toggle
                cycle. With looping enabled, recording starts at the loop’s
                beginning and keeps each pass as a selectable take.
              </p>
            </li>
          </ol>
          <p>
            Audio takes are WAV files; MIDI takes are saved as MIDI files when
            you stop. Save your session to keep them together. MIDI tracks need
            a VST3 instrument for sound. Enable its monitor button to monitor
            live input or audition plug-in pads, even while stopped. No MIDI
            hardware is required for preview. To record MIDI notes, use a MIDI
            input device; plug-in editor clicks are preview only.
          </p>
          <button className="text-button" onClick={() => void api.openLogs()}>
            Open diagnostic logs
          </button>
          <p className="legal-notice">
            © 2026 Basement Band contributors. AGPLv3 · no warranty. You may
            modify and redistribute under the license terms.
            <button
              className="text-button"
              onClick={() => void api.openLicenses()}
            >
              Licenses & third-party notices
            </button>
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
