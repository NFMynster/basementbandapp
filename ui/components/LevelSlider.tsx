import { useRef, type CSSProperties } from "react";
import { ValueEntry, useValueEntry } from "./ValueEntry";

/** One accessible gain control; its trough also displays the signal level. */
export function LevelSlider({
  label,
  value,
  peak,
  max = 1,
  onChange,
}: {
  label: string;
  value: number;
  peak: number;
  max?: number;
  onChange: (value: number, historyGroup?: string) => void;
}) {
  const gesture = useRef<{ id: string; released: boolean } | undefined>(
    undefined,
  );
  const entry = useValueEntry();
  return (
    <div
      className="level-slider"
      style={
        {
          "--signal": Math.min(100, Math.max(0, peak) * 100) + "%",
        } as CSSProperties
      }
    >
      <div className="level-slider-trough" aria-hidden="true">
        <i />
      </div>
      <input
        aria-label={label}
        title={`${label} - double-click to reset to 0 dB, right-click to type a value`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onChange(1);
        }}
        type="range"
        min="0"
        max={max}
        step="0.01"
        value={value}
        onPointerDown={() => {
          gesture.current = { id: crypto.randomUUID(), released: false };
        }}
        onPointerUp={() => {
          // Range inputs can dispatch their final change after pointerup.
          // Keep the group until that change has been sent.
          if (gesture.current) gesture.current.released = true;
        }}
        onPointerCancel={() => {
          gesture.current = undefined;
        }}
        onBlur={() => {
          gesture.current = undefined;
        }}
        onContextMenu={entry.open("value")}
        onKeyDown={(e) => {
          if (e.key === "0") {
            e.preventDefault();
            onChange(1);
          }
          // A keyboard adjustment after a pointer drag starts a new gesture.
          if (gesture.current?.released) gesture.current = undefined;
        }}
        onChange={(e) => {
          const current = gesture.current;
          onChange(+e.target.value, current?.id);
        }}
      />
      <ValueEntry
        label={label}
        value={value * 100}
        unit="%"
        min={0}
        max={max * 100}
        reset={100}
        describe={(percent) => formatDecibels(percent / 100)}
        anchor={entry.anchor("value")}
        onCommit={(percent) => onChange(percent / 100)}
        onClose={entry.close}
      />
    </div>
  );
}

function formatDecibels(gain: number) {
  if (gain <= 0) return "−∞ dB";
  const db = 20 * Math.log10(gain);
  return `${db >= 0.05 ? "+" : ""}${db.toFixed(1)} dB`;
}
