import type { CSSProperties } from "react";

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
  onChange: (value: number) => void;
}) {
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
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  );
}
