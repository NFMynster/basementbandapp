import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${className}`}
        onKeyDown={(e) => {
          e.stopPropagation(); // Transport shortcuts must not run underneath dialogs.
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key !== "Tab") return;
          const elements = [
            ...(dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
            ) ?? []),
          ];
          const first = elements[0],
            last = elements.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <button className="modal-close" onClick={onClose} title="Close">
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
