import { useState } from "react";
import { AudioLines } from "lucide-react";
import { Modal } from "./Modal";
import type { WorkspaceController } from "../hooks/useWorkspace";
export function WelcomeDialog({
  controller: c,
}: {
  controller: WorkspaceController;
}) {
  const [hide, setHide] = useState(false);
  const close = () => {
    if (hide) localStorage.setItem("basement.hideWelcome", "1");
    c.setWelcome(false);
  };
  return (
    <Modal
      title="Welcome to Basement Band"
      className="welcome-dialog"
      onClose={close}
    >
      <div className="welcome-icon">
        <AudioLines size={32} />
      </div>
      <span className="eyebrow">GOOD MUSIC STARTS WITH A MOMENT</span>
      <h2>
        Plug in. Press record.
        <br />
        See where it goes.
      </h2>
      <p>
        Give each instrument a track. Choose Audio for your interface, or MIDI
        for drum pads and keys. Mark the tracks you want to record together.
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={hide}
          onChange={(e) => setHide(e.target.checked)}
        />
        Don’t show again
      </label>
      <div className="modal-bottom">
        <button onClick={close}>Let me explore</button>
        <button
          className="primary"
          onClick={() => {
            close();
            c.openSetup();
          }}
        >
          Set up your inputs
        </button>
      </div>
    </Modal>
  );
}
