import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Drag-to-reorder with pointer events, used for track headers and plug-in
 * slots. HTML5 drag-and-drop is not used inside the window: the desktop shell
 * gives that channel to native file drops (on Windows they cannot share it).
 *
 * The drag starts after a few pixels of movement, so clicks and double-clicks
 * keep working. A translucent copy of the source follows the pointer, the
 * nearest scrollable ancestor scrolls near its edges, and Escape, a lost
 * window focus or a cancelled pointer abandon the drag without a drop.
 */
export type ReorderOptions = {
  /** Elements that can receive the drop, matched with `closest`. */
  targets: string;
  /** While dragging over `target` (or nothing); show the drop position. */
  onMove(target: HTMLElement | null, event: PointerEvent): void;
  /** The pointer was released over `target`. */
  onDrop(target: HTMLElement | null, event: PointerEvent): void;
  /** Always called last, after a drop or a cancelled drag. */
  onEnd(): void;
};

const THRESHOLD = 4;
const EDGE = 36;

function scrollParent(element: HTMLElement | null) {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      node.scrollHeight > node.clientHeight
    )
      return node;
  }
  return null;
}

export function startPointerReorder(
  down: ReactPointerEvent<HTMLElement>,
  options: ReorderOptions,
) {
  if (down.button !== 0) return;
  const source = down.currentTarget;
  const startX = down.clientX;
  const startY = down.clientY;
  const scroller = scrollParent(source);
  let ghost: HTMLElement | null = null;
  let offsetX = 0;
  let offsetY = 0;
  let lastY = startY;
  let frame = 0;
  let last: PointerEvent | null = null;

  const targetAt = (event: PointerEvent) =>
    document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(options.targets) ?? null;

  const autoScroll = () => {
    frame = 0;
    if (!ghost || !scroller || !last) return;
    const bounds = scroller.getBoundingClientRect();
    const step =
      lastY < bounds.top + EDGE
        ? -Math.ceil((bounds.top + EDGE - lastY) / 3)
        : lastY > bounds.bottom - EDGE
          ? Math.ceil((lastY - (bounds.bottom - EDGE)) / 3)
          : 0;
    if (!step) return;
    scroller.scrollTop += step;
    options.onMove(targetAt(last), last);
    frame = requestAnimationFrame(autoScroll);
  };

  const begin = () => {
    const bounds = source.getBoundingClientRect();
    offsetX = startX - bounds.left;
    offsetY = startY - bounds.top;
    ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.classList.add("reorder-ghost");
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
    });
    document.body.append(ghost);
    source.classList.add("reorder-source");
    document.body.classList.add("reordering");
  };

  const move = (event: PointerEvent) => {
    if (!ghost) {
      if (
        Math.hypot(event.clientX - startX, event.clientY - startY) < THRESHOLD
      )
        return;
      begin();
    }
    last = event;
    lastY = event.clientY;
    ghost!.style.left = `${event.clientX - offsetX}px`;
    ghost!.style.top = `${event.clientY - offsetY}px`;
    options.onMove(targetAt(event), event);
    if (!frame) frame = requestAnimationFrame(autoScroll);
  };

  const finish = () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", escape, true);
    cancelAnimationFrame(frame);
    if (ghost) {
      ghost.remove();
      source.classList.remove("reorder-source");
      document.body.classList.remove("reordering");
      // The release after a drag must not also click the source.
      const swallow = (event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      // WebKit places a caret in the sidebar on the release and paints the
      // gaps around it as highlight lines; clear it once the release is done.
      const clearSelection = () =>
        setTimeout(() => window.getSelection()?.removeAllRanges(), 0);
      clearSelection();
      window.addEventListener("mouseup", clearSelection, {
        capture: true,
        once: true,
      });
    }
    options.onEnd();
  };

  function up(event: PointerEvent) {
    const dragged = !!ghost;
    const target = dragged ? targetAt(event) : null;
    finish();
    if (dragged) options.onDrop(target, event);
  }
  function cancel() {
    finish();
  }
  function escape(event: KeyboardEvent) {
    if (event.key !== "Escape" || !ghost) return;
    event.stopPropagation();
    event.preventDefault();
    finish();
  }

  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", escape, true);
}
