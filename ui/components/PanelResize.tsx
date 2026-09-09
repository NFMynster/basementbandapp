import { useRef } from "react";

export function PanelResize({
  axis,
  value,
  min,
  max,
  reset,
  onChange,
  label,
}: {
  axis: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  reset: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const drag = useRef<{ position: number; value: number } | null>(null);
  const change = (next: number) =>
    onChange(Math.round(Math.max(min, Math.min(max, next))));
  return (
    <div
      className={`panel-resize ${axis}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === "horizontal" ? "vertical" : "horizontal"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} pixels`}
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => change(reset)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.focus();
        drag.current = {
          position: axis === "horizontal" ? e.clientX : e.clientY,
          value,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const delta =
          axis === "horizontal"
            ? e.clientX - drag.current.position
            : drag.current.position - e.clientY;
        change(drag.current.value + delta);
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        if (drag.current) change(drag.current.value);
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => {
        const keys =
          axis === "horizontal"
            ? ["ArrowLeft", "ArrowRight"]
            : ["ArrowDown", "ArrowUp"];
        if (![...keys, "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        change(
          e.key === "Home"
            ? min
            : e.key === "End"
              ? max
              : value + (e.key === keys[0] ? -1 : 1) * (e.shiftKey ? 40 : 10),
        );
      }}
    >
      <span />
    </div>
  );
}
