import { getCurrentWebview } from "@tauri-apps/api/webview";
import { inDesktopApp } from "./desktop";

/**
 * Files dragged in from the desktop arrive as one native drop event with real
 * paths, not as DOM drag events. Elements opt in with `data-file-drop`
 * ("audio" or "plugin") and an optional `data-file-drop-track`; the innermost
 * such element under the pointer receives the drop.
 */
export type FileDropTarget = { kind: "audio" | "plugin"; track?: string };

const HOVER_CLASS = "file-drop-over";

function zoneAt(x: number, y: number) {
  return (
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-file-drop]") ??
    null
  );
}

function clearHover() {
  document
    .querySelectorAll(`.${HOVER_CLASS}`)
    .forEach((node) => node.classList.remove(HOVER_CLASS));
}

/** Calls `onDrop` for files dropped on a drop zone; returns the unsubscribe. */
export function listenForFileDrops(
  onDrop: (paths: string[], target: FileDropTarget) => void,
): () => void {
  if (!inDesktopApp()) return () => {};
  let disposed = false;
  let unlisten: (() => void) | undefined;
  const point = (position: { x: number; y: number }) => {
    // Native positions are physical pixels; the DOM works in CSS pixels.
    const ratio = window.devicePixelRatio || 1;
    return zoneAt(position.x / ratio, position.y / ratio);
  };
  void getCurrentWebview()
    .onDragDropEvent(({ payload }) => {
      if (payload.type === "over" || payload.type === "enter") {
        const zone = point(payload.position);
        if (!zone?.classList.contains(HOVER_CLASS)) {
          clearHover();
          zone?.classList.add(HOVER_CLASS);
        }
        return;
      }
      clearHover();
      if (payload.type !== "drop" || !payload.paths.length) return;
      const zone = point(payload.position);
      if (!zone) return;
      onDrop(payload.paths, {
        kind: zone.dataset.fileDrop === "plugin" ? "plugin" : "audio",
        track: zone.dataset.fileDropTrack || undefined,
      });
    })
    .then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
  return () => {
    disposed = true;
    unlisten?.();
  };
}
