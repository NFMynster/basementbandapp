import { useEffect, useRef, useState } from "react";
export const defaultBindings = {
  play: "Space",
  record: "KeyR",
  loop: "KeyL",
  metronome: "KeyM",
  start: "Enter",
  save: "Mod+KeyS",
  split: "Mod+KeyT",
  copy: "Mod+KeyC",
  paste: "Mod+KeyV",
  delete: "Delete",
  deleteTrack: "Mod+Delete",
  undo: "Mod+KeyZ",
  redo: "Mod+Shift+KeyZ",
};
export type Shortcut = keyof typeof defaultBindings;
export const shortcutNames: Record<Shortcut, string> = {
  play: "Play / stop",
  record: "Record / stop",
  loop: "Toggle loop",
  metronome: "Toggle metronome",
  start: "Back to start",
  save: "Save session",
  split: "Split region at playhead",
  copy: "Copy region",
  paste: "Paste region at playhead",
  delete: "Delete region",
  deleteTrack: "Delete track",
  undo: "Undo",
  redo: "Redo",
};
export const keyBinding = (
  e: Pick<
    KeyboardEvent,
    "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
) =>
  [
    (e.ctrlKey || e.metaKey) && "Mod",
    e.altKey && "Alt",
    e.shiftKey && "Shift",
    e.code,
  ]
    .filter(Boolean)
    .join("+");
export const keyLabel = (key: string) =>
  key
    .replace("Mod", navigator.platform.includes("Mac") ? "⌘" : "Ctrl")
    .replace(/Key|Digit/g, "");
export function useShortcuts(actions: Record<Shortcut, () => void>) {
  const current = useRef(actions);
  current.current = actions;
  const [bindings, setBindings] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("basement.shortcuts") || "{}",
      );
      return Object.fromEntries(
        Object.entries(defaultBindings).map(([key, value]) => [
          key,
          typeof saved[key] === "string" ? saved[key] : value,
        ]),
      ) as typeof defaultBindings;
    } catch {
      return defaultBindings;
    }
  });
  useEffect(() => {
    localStorage.setItem("basement.shortcuts", JSON.stringify(bindings));
  }, [bindings]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.defaultPrevented ||
        document.querySelector(
          '[role="dialog"], [role="menu"], [data-startup]',
        ) ||
        (e.target as HTMLElement).closest(
          'input:not([type="range"]):not([type="checkbox"]):not([type="button"]),select,textarea,[contenteditable]',
        )
      )
        return;
      const pressed = keyBinding(e).replace("Backspace", "Delete");
      const action =
        (Object.keys(bindings) as Shortcut[]).find(
          (key) => bindings[key].replace("Backspace", "Delete") === pressed,
        ) ||
        (pressed === "Mod+KeyY" && bindings.redo === defaultBindings.redo
          ? "redo"
          : undefined);
      if (action) {
        e.preventDefault();
        current.current[action]();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [bindings]);
  return { bindings, setBindings };
}
