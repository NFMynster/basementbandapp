import { useEffect, useState } from "react";
import {
  defaultBindings,
  shortcutNames,
  keyBinding,
  keyLabel,
  type Shortcut,
} from "../hooks/useShortcuts";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { Modal } from "./Modal";
export function ShortcutSettings({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const [capture, setCapture] = useState<Shortcut | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!capture) return;
    const listener = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        setCapture(null);
        return;
      }
      if (/^(Control|Alt|Shift|Meta)/.test(event.code) || event.repeat) return;
      const binding = keyBinding(event);
      const conflict = (Object.keys(controller.bindings) as Shortcut[]).find(
        (key) =>
          key !== capture &&
          controller.bindings[key].replace("Backspace", "Delete") ===
            binding.replace("Backspace", "Delete"),
      );
      if (conflict) {
        setError(
          `Already used for ${shortcutNames[conflict].toLowerCase()}. Choose another key.`,
        );
        return;
      }
      controller.setBindings({ ...controller.bindings, [capture]: binding });
      setCapture(null);
      setError("");
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [capture, controller.bindings]);
  return (
    <div className="shortcut-settings">
      {capture && (
        <Modal
          title="Choose shortcut"
          onClose={() => setCapture(null)}
          className="key-capture-dialog"
        >
          <span className="eyebrow">{shortcutNames[capture]}</span>
          <h2>Press a key…</h2>
          <p>
            Use a single key or combine it with Ctrl / ⌘, Shift or Alt. Escape
            cancels.
          </p>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
      <p>
        Click a shortcut, then press a key or key combination. Escape cancels.
      </p>
      {(Object.keys(shortcutNames) as Shortcut[]).map((key) => (
        <div className="shortcut-row" key={key}>
          <span>{shortcutNames[key]}</span>
          <button
            className={capture === key ? "capturing" : ""}
            onClick={() => {
              setCapture(key);
              setError("");
            }}
          >
            {capture === key
              ? "Press a key…"
              : keyLabel(controller.bindings[key])}
          </button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
      <button
        className="text-button"
        onClick={() => {
          controller.setBindings(defaultBindings);
          setCapture(null);
        }}
      >
        Restore defaults
      </button>
    </div>
  );
}
