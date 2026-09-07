import { useEffect, useRef } from "react";
import type { Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";

export function TrackMenu({
  track,
  x,
  y,
  onClose,
  controller,
}: {
  track: Track;
  x: number;
  y: number;
  onClose: () => void;
  controller: WorkspaceController;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = () => onClose();
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("resize", close);
      previous?.focus();
    };
  }, [onClose]);
  function act(action: () => void) {
    onClose();
    action();
  }
  return (
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
        aria-label={`${track.name} actions`}
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
        <button
          role="menuitem"
          onClick={() =>
            act(() => {
              controller.openProperties(track.id);
            })
          }
        >
          Properties
        </button>
        <button
          role="menuitem"
          disabled={controller.s.playing || !track.clips.length}
          onClick={() => act(() => controller.setExportTarget(track.id))}
        >
          Export track…
        </button>
        <button
          role="menuitem"
          className="danger"
          disabled={controller.s.playing}
          onClick={() =>
            act(() => {
              if (
                confirm(
                  `Delete ${track.name} from this session? Recorded audio files will be kept.`,
                )
              )
                controller.run({ op: "removeTrack", track: track.id });
            })
          }
        >
          Delete track
        </button>
      </div>
    </div>
  );
}
