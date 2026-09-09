import { useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  className = "",
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const node = dialog.current;
    return () => {
      // Restore before the next surface focuses itself. Never steal focus from
      // a control that already received it, including a native select popup.
      const active = document.activeElement;
      if (
        previous?.isConnected &&
        (active === document.body || (active && node?.contains(active)))
      )
        previous.focus({ preventScroll: true });
    };
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
        className={`modal ${footer ? "modal-with-footer" : ""} ${className}`}
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
        {footer ? (
          <>
            <div className="modal-scroll">{children}</div>
            <div className="modal-fixed-footer">{footer}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
