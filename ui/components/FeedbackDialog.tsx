import { Mail, MessageCircle } from "lucide-react";
import { desktop as api } from "../services/desktop";
import { Modal } from "./Modal";

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Write to me" className="feedback-dialog" onClose={onClose}>
      <div className="welcome-icon feedback-icon">
        <MessageCircle size={30} />
      </div>
      <span className="eyebrow">BUGS, IDEAS &amp; EVERYTHING BETWEEN</span>
      <h2>Found something? Tell me.</h2>
      <p>
        Basement Band is a solo-developed project, so your note comes straight
        to me. Bug reports, feedback, odd little annoyances, and ideas for what
        would make it better are all genuinely welcome.
      </p>
      <div className="feedback-address">
        <span>You’ll be writing to</span>
        <strong>nfmynster@footstomp.studio</strong>
      </div>
      <p className="feedback-hint">
        I’ll open your usual mail app with a subject and a few useful prompts
        ready. Nothing is sent until you choose to send it.
      </p>
      <div className="modal-bottom">
        <button onClick={onClose}>Maybe later</button>
        <button className="primary" onClick={() => void api.openFeedback()}>
          Write to me
          <Mail size={15} />
        </button>
      </div>
    </Modal>
  );
}
