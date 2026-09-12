import { useRef, type CSSProperties } from "react";

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
        title={`${label} - double-click to reset to 0 dB`}
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
    </div>
  );
}
