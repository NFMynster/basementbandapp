import type { CSSProperties } from "react";
import { Headphones } from "lucide-react";
import type { Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { LevelSlider } from "./LevelSlider";
import { TrackIcon } from "./TrackIcon";

export function TrackHeader({
  track,
  index,
  selected,
  controller,
  onMenu,
}: {
  track: Track;
  index: number;
  selected: boolean;
  controller: WorkspaceController;
  onMenu: (track: Track, anchor: { x: number; y: number }) => void;
}) {
  const { s, update, setSelected, openProperties, trackPing } = controller;
  return (
    <div
      data-track-header={track.id}
      className={"track-header " + (selected ? "selected" : "")}
      style={{ "--track-color": track.color } as CSSProperties}
      onClick={() => setSelected(track.id)}
      tabIndex={0}
      onDoubleClick={() => openProperties(track.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        setSelected(track.id);
        onMenu(track, { x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (
          event.key !== "ContextMenu" &&
          !(event.shiftKey && event.key === "F10")
        )
          return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onMenu(track, { x: bounds.left + 30, y: bounds.top + 30 });
      }}
    >
      {trackPing === track.id && (
        <span className="properties-ping" aria-hidden="true" />
      )}
      <span className="track-number">{String(index + 1).padStart(2, "0")}</span>
      <div className="instrument">
        <TrackIcon icon={track.icon} />
      </div>
      <div className="track-info">
        <div className="track-name">
          {track.name}
          <span>{track.kind === "midi" ? "MIDI" : "MONO"}</span>
        </div>
        <div className="track-buttons">
          <button
            aria-label={`Mark ${track.name} for recording`}
            title="Mark for recording"
            className={track.armed ? "armed" : ""}
            disabled={s.recording}
            onClick={() => update(track, { armed: !track.armed })}
          >
            R
          </button>
          <button
            title="Mute"
            className={track.mute ? "muted" : ""}
            onClick={() => update(track, { mute: !track.mute })}
          >
            M
          </button>
          <button
            title="Solo"
            className={track.solo ? "solo" : ""}
            onClick={() => update(track, { solo: !track.solo })}
          >
            S
          </button>
          <button
            title="Monitor live input · use headphones to avoid feedback"
            aria-label={`Monitor ${track.name}`}
            aria-pressed={!!track.monitor}
            className={track.monitor ? "solo" : ""}
            onClick={() => update(track, { monitor: !track.monitor })}
          >
            <Headphones size={12} />
          </button>
          <span className="input-label">
            {track.kind === "midi"
              ? track.midiChannel
                ? `Ch ${track.midiChannel}`
                : "All ch"
              : `In ${track.input + 1}`}
          </span>
        </div>
        <div className="track-volume">
          <LevelSlider
            label={`${track.name} volume`}
            value={track.gain}
            max={1.5}
            peak={track.peak}
            onChange={(gain, historyGroup) =>
              update(track, { gain, historyGroup })
            }
          />
        </div>
      </div>
    </div>
  );
}
