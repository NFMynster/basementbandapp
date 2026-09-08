import { useState, useCallback } from "react";
import { TrackIcon, trackIcons } from "./TrackIcon";
import { ContextMenu } from "./ContextMenu";
import type { Track, TrackIconName, TrackPatch } from "../models";

export function TrackAppearance({
  track,
  update,
}: {
  track: Track;
  update: (track: Track, patch: TrackPatch) => unknown;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const icon = track.icon || (track.kind === "midi" ? "keys" : "guitar");
  return (
    <>
      <button
        className="appearance-button"
        aria-label="Track appearance"
        title="Change icon and color"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        style={{ color: track.color }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ x: r.left, y: r.bottom + 8 });
        }}
      >
        <TrackIcon icon={icon} size={24} />
        <span style={{ background: track.color }} />
      </button>
      {anchor && (
        <ContextMenu
          label="Track appearance"
          x={anchor.x}
          y={anchor.y}
          onClose={close}
        >
          <div className="appearance-icons">
            {(Object.keys(trackIcons) as TrackIconName[]).map((name) => (
              <button
                key={name}
                role="menuitemradio"
                aria-label={name + " icon"}
                aria-checked={icon === name}
                title={name}
                style={{ color: track.color }}
                onClick={() => {
                  update(track, { icon: name });
                  close();
                }}
              >
                <TrackIcon icon={name} size={24} />
              </button>
            ))}
          </div>
          <div className="appearance-colors">
            {[
              "#58a9e8",
              "#c093eb",
              "#b0c4a7",
              "#e0b968",
              "#ed8f94",
              "#69cabb",
            ].map((color) => (
              <button
                key={color}
                role="menuitemradio"
                aria-label={color + " color"}
                aria-checked={track.color === color}
                style={{ background: color }}
                onClick={() => {
                  update(track, { color });
                  close();
                }}
              />
            ))}
            <label title="Custom color" className="custom-color">
              <input
                aria-label="Track color"
                type="color"
                value={track.color}
                onChange={(e) => update(track, { color: e.target.value })}
              />
            </label>
          </div>
        </ContextMenu>
      )}
    </>
  );
}
