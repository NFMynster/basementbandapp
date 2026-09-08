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
  const gesture = useRef<string | undefined>(undefined);
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
        title={label}
        type="range"
        min="0"
        max={max}
        step="0.01"
        value={value}
        onPointerDown={() => {
          gesture.current = crypto.randomUUID();
        }}
        onPointerUp={() => {
          gesture.current = undefined;
        }}
        onPointerCancel={() => {
          gesture.current = undefined;
        }}
        onBlur={() => {
          gesture.current = undefined;
        }}
        onChange={(e) => onChange(+e.target.value, gesture.current)}
      />
    </div>
  );
}
