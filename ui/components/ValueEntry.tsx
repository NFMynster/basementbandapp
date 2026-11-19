import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";

/** Where a typed-value popover should open. */
export type ValueEntryAnchor = { x: number; y: number };

/** Selector for the popover layer, for menus that dismiss on outside clicks. */
export const VALUE_ENTRY_LAYER = ".value-entry-shield";

/**
 * Tracks which slider (by key) has its typed-value popover open. Pass
 * `open(key)` as the slider's onContextMenu and `anchor(key)` to ValueEntry.
 */
export function useValueEntry<K extends string = string>() {
  const [entry, setEntry] = useState<{
    key: K;
    anchor: ValueEntryAnchor;
  } | null>(null);
  return {
    open: (key: K) => (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      // Chromium still fires contextmenu on disabled inputs.
      if ((e.currentTarget as HTMLInputElement).disabled) return;
      setEntry({ key, anchor: valueEntryAnchor(e) });
    },
    anchor: (key: K) => (entry?.key === key ? entry.anchor : undefined),
    close: () => setEntry(null),
  };
}

/**
 * Anchors the popover at the pointer, or under the control when the context
 * menu came from the keyboard (Menu key / Shift+F10 report no pointer).
 */
function valueEntryAnchor(event: MouseEvent<HTMLElement>): ValueEntryAnchor {
  if (event.clientX || event.clientY)
    return { x: event.clientX, y: event.clientY };
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom + 4 };
}

type ValueEntryProps = {
  label: string;
  value: number;
  /** Shown after the field; leave empty when `format` carries the unit. */
  unit: string;
  min: number;
  max: number;
  decimals?: number;
  /** Arrow keys nudge by this much, Shift by ten times as much. */
  step?: number;
  /** Optional secondary readout for the typed value, e.g. its dB level. */
  describe?: (value: number) => string;
  /** Custom text for a value, e.g. "L30" for pan. */
  format?: (value: number) => string;
  /** Custom parser matching `format`; undefined means "not a value". */
  parse?: (text: string) => number | undefined;
  /** The slider's default; shows a "Reset to …" button when given. */
  reset?: number;
  /** Words for the reset button instead of the formatted value, e.g. "center". */
  resetLabel?: string;
  /** Closed when undefined, so callers can render it unconditionally. */
  anchor: ValueEntryAnchor | undefined;
  onCommit: (value: number) => void;
  onClose: () => void;
};

/**
 * A small popover with one number field, opened from a slider's context menu
 * so exact values (like 100 %) are easy to reach. Enter or clicking outside
 * applies the value, Escape cancels. Values are clamped to the slider range.
 */
export function ValueEntry({ anchor, ...props }: ValueEntryProps) {
  return anchor ? <Popover {...props} anchor={anchor} /> : null;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

function Popover({
  label,
  value,
  unit,
  min,
  max,
  decimals = 0,
  step = 1,
  describe,
  format,
  parse = parseNumber,
  reset,
  resetLabel,
  anchor,
  onCommit,
  onClose,
}: ValueEntryProps & { anchor: ValueEntryAnchor }) {
  const show = (v: number) => (format ? format(v) : v.toFixed(decimals));
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(() => show(value));
  const parsed = parse(draft);
  const valid = parsed !== undefined;
  const clamped =
    parsed === undefined
      ? undefined
      : Number(Math.min(max, Math.max(min, parsed)).toFixed(decimals));
  const suffix = unit ? ` ${unit}` : "";

  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    input.current?.select();
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    node.style.left =
      Math.max(
        8,
        Math.min(anchor.x, window.innerWidth - node.offsetWidth - 8),
      ) + "px";
    node.style.top =
      Math.max(
        8,
        Math.min(anchor.y, window.innerHeight - node.offsetHeight - 8),
      ) + "px";
  }, [anchor.x, anchor.y]);

  const apply = () => {
    if (clamped !== undefined && clamped !== value) onCommit(clamped);
    onClose();
  };

  return createPortal(
    <div
      className="value-entry-shield"
      // The popover is portalled, so React would bubble its events to the
      // slider's parents (track header menus, selection, drag) without this.
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={stop}
      onFocus={stop}
      onBlur={stop}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) apply();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === e.currentTarget) apply();
      }}
    >
      <div
        ref={box}
        className="value-entry"
        role="dialog"
        aria-label={`Type ${label.toLowerCase()}`}
        style={{ left: anchor.x, top: anchor.y }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Tab") {
            // Keep focus inside: Tab moves between the field and Reset.
            e.preventDefault();
            if (!resetButton.current) apply();
            else if (document.activeElement === input.current)
              resetButton.current.focus();
            else input.current?.focus();
          }
        }}
      >
        <label>
          <span>{label}</span>
          <span className={"value-entry-field " + (valid ? "" : "invalid")}>
            <input
              ref={input}
              type="text"
              inputMode="decimal"
              spellCheck={false}
              aria-invalid={!valid}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (valid) apply();
                } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  const delta =
                    step *
                    (e.shiftKey ? 10 : 1) *
                    (e.key === "ArrowUp" ? 1 : -1);
                  setDraft(
                    show(
                      Math.min(max, Math.max(min, (clamped ?? value) + delta)),
                    ),
                  );
                }
              }}
            />
            {unit && <small>{unit}</small>}
          </span>
        </label>
        <p>
          {clamped !== undefined &&
          clamped !== Number(parsed!.toFixed(decimals))
            ? `Limited to ${show(clamped)}${suffix}`
            : clamped !== undefined && describe
              ? describe(clamped)
              : `${show(min)} to ${show(max)}${suffix}`}
        </p>
        {reset !== undefined && (
          <button
            ref={resetButton}
            type="button"
            className="value-entry-reset"
            disabled={value === reset}
            onClick={() => {
              onCommit(reset);
              onClose();
            }}
          >
            Reset to {resetLabel ?? `${show(reset)}${suffix}`}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Accepts "100", "100%", "-3.5 dB", "-3,5", "1.2k" / "1.2 kHz", "250 ms"
 * and "-inf"; undefined if the text is not a number.
 */
function parseNumber(text: string): number | undefined {
  const cleaned = text.trim().replace("−", "-").replace(",", ".");
  if (/^-\s*(inf|∞)/i.test(cleaned)) return -Infinity;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))\s*(k)?\s*[a-z%]*$/i.exec(cleaned);
  if (!match) return undefined;
  return Number(match[1]) * (match[2] ? 1000 : 1);
}
