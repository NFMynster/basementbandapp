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
          <h2>Make your first take</h2>
          <ol>
            <li>
              <strong>Choose your input.</strong>
              <p>
                Open Audio settings and assign an input to each audio track.
              </p>
            </li>
            <li>
              <strong>Mark tracks with R, then record.</strong>
              <p>Press {keyLabel(controller.bindings.play)} to stop or play.</p>
            </li>
            <li>
              <strong>Edit and save.</strong>
              <p>
                Double-click a region to edit it. Drag track handles to reorder.
                MIDI tracks need a VST3 instrument for sound.
              </p>
            </li>
          </ol>
          <p>
            Solo developed by @nfmynster.{" "}
            <a
              href="https://footstomp.studio/"
              onClick={(e) => {
                e.preventDefault();
                void api.openWebsite();
              }}
            >
              footstomp.studio
            </a>
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
