import { type CSSProperties } from "react";
import { Volume2, GripVertical } from "lucide-react";
import type { Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { LevelSlider } from "./LevelSlider";
import { TrackIcon } from "./TrackIcon";
import { startPointerReorder } from "../services/pointerReorder";

/** Controls inside a header that must not start a track drag. */
const NO_DRAG = "button:not(.track-reorder), input, select, textarea";

/** Removes the drop-position gap shown while a track is dragged. */
function clearReorderMarks() {
  document
    .querySelectorAll(".reorder-target")
    .forEach((node) =>
      node.classList.remove("reorder-target", "reorder-after"),
    );
}

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
      data-reorderable={!s.playing && !controller.busy ? "" : undefined}
      onPointerDown={(e) => {
        if (
          s.playing ||
          controller.busy ||
          (e.target as HTMLElement).closest(NO_DRAG)
        )
          return;
        const after = (target: HTMLElement, y: number) => {
          const bounds = target.getBoundingClientRect();
          return y > bounds.top + bounds.height / 2;
        };
        startPointerReorder(e, {
          targets: "[data-track-header]",
          onMove(target, event) {
            clearReorderMarks();
            if (!target) return;
            target.classList.add("reorder-target");
            target.classList.toggle(
              "reorder-after",
              after(target, event.clientY),
            );
          },
          onDrop(target, event) {
            if (!target) return;
            const from = s.tracks.findIndex((t) => t.id === track.id);
            const onto = s.tracks.findIndex(
              (t) => t.id === target.dataset.trackHeader,
            );
            if (from < 0 || onto < 0) return;
            const insertion = onto + (after(target, event.clientY) ? 1 : 0);
            const destination = insertion - (from < insertion ? 1 : 0);
            if (destination !== from)
              void controller.run({
                op: "reorderTrack",
                track: track.id,
                index: destination,
              });
          },
          onEnd: clearReorderMarks,
        });
      }}
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
      <button
        className="track-reorder"
        disabled={s.playing || controller.busy}
        aria-label={`Reorder ${track.name}`}
        title="Drag to reorder; use arrow keys to move"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          e.stopPropagation();
          const next = index + (e.key === "ArrowUp" ? -1 : 1);
          if (next >= 0 && next < s.tracks.length)
            void controller.run({
              op: "reorderTrack",
              track: track.id,
              index: next,
            });
        }}
      >
        <GripVertical size={14} />
      </button>
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
          {/* MIDI tracks are always live; mute one to stop hearing it. */}
          {track.kind === "audio" && (
            <button
              title="Monitor live input · use headphones to avoid feedback"
              aria-label={`Monitor ${track.name}`}
              aria-pressed={!!track.monitor}
              className={track.monitor ? "solo" : ""}
              onClick={() => update(track, { monitor: !track.monitor })}
            >
              <Volume2 size={12} />
            </button>
          )}
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
            peak={track.armed ? track.peak : 0}
            onChange={(gain, historyGroup) =>
              update(track, { gain, historyGroup })
            }
          />
        </div>
      </div>
    </div>
  );
}
