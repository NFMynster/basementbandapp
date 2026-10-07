import { useState } from "react";
import { ExternalLink, FileText, MessageCircle, Play } from "lucide-react";
import { desktop as api } from "../services/desktop";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { keyLabel } from "../hooks/useShortcuts";
import { FeedbackDialog } from "./FeedbackDialog";
import { Modal } from "./Modal";

export function HelpDialog({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const { showHelp, setHelp } = controller;
  const [showFeedback, setShowFeedback] = useState(false);
  const closeFeedback = () => {
    setShowFeedback(false);
    setHelp(false);
  };
  return (
    <>
      {showHelp && showFeedback && <FeedbackDialog onClose={closeFeedback} />}
      {showHelp && !showFeedback && (
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
              <strong>Mark tracks, then start recording.</strong>
              <p>
                Click the on-screen R control on each track you want to capture,
                then click the round Record button.{" "}
                {keyLabel(controller.bindings.play)} is the keyboard shortcut
                for stop or play.
              </p>
            </li>
            <li>
              <strong>Edit and save.</strong>
              <p>
                Double-click a region to edit it. Drag track handles to reorder.
                MIDI tracks need a VST3 instrument for sound.
              </p>
            </li>
          </ol>
          <div className="help-contact">
            <p>Solo developed by @nfmynster.</p>
            <div className="help-links">
              <button
                className="help-feedback"
                onClick={() => setShowFeedback(true)}
              >
                <MessageCircle size={15} />
                Feedback, bugs &amp; suggestions
              </button>
              <button onClick={() => void api.openWebsite()}>
                <ExternalLink size={15} />
                footstomp.studio
              </button>
              <button onClick={() => void api.openLogs()}>
                <FileText size={15} />
                Open diagnostic logs
              </button>
            </div>
          </div>
          <p className="legal-notice">
            © 2026 Basement Band contributors. AGPLv3 · no warranty. You may
            modify and redistribute under the license terms.{" "}
            <button
              className="legal-link"
              onClick={() => void api.openLicenses()}
            >
              Licenses &amp; third-party notices
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
