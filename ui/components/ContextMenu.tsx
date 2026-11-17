import { useEffectEvent, useRef, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ContextMenu({
  label,
  children,
  x,
  y,
  onClose,
}: {
  label: string;
  children: ReactNode;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const closeOnResize = useEffectEvent(onClose);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    menu.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const node = menu.current;
    const close = () => closeOnResize();
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("resize", close);
      const active = document.activeElement;
      if (
        previous?.isConnected &&
        (active === document.body || (active && node?.contains(active)))
      )
        previous.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    const node = menu.current;
    if (!node) return;
    node.style.left =
      Math.max(8, Math.min(x, window.innerWidth - node.offsetWidth - 8)) + "px";
    node.style.top =
      Math.max(8, Math.min(y, window.innerHeight - node.offsetHeight - 8)) +
      "px";
  }, [x, y]);
  return createPortal(
    <div
      className="menu-shield"
      onPointerDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menu}
        role="menu"
        aria-label={label}
        className="track-menu"
        style={{
          left: Math.min(x, window.innerWidth - 220),
          top: Math.min(y, window.innerHeight - 155),
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" || e.key === "Tab") {
            e.preventDefault();
            onClose();
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const items = [
              ...menu.current!.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            ];
            const i = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? items.length - 1
                  : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                    items.length;
            items[next]?.focus();
          }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
