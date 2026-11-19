import { useRef, type CSSProperties } from "react";
import { Volume2, GripVertical } from "lucide-react";
import type { Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { LevelSlider } from "./LevelSlider";
import { TrackIcon } from "./TrackIcon";

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

/**
 * The dragged header's own dragend/drop do not always arrive: switching
 * windows (Alt+Tab) mid-drag cancels the drag at the OS level. Clear the gap
 * on whichever ending comes first, including the first plain mouse move,
 * which only happens once no drag is in progress.
 */
function watchReorderEnd() {
  const end = (event: Event) => {
    if (event.type === "mousemove" && (event as MouseEvent).buttons) return;
    clearReorderMarks();
    window.removeEventListener("blur", end);
    for (const type of ["dragend", "drop", "mousemove"])
      document.removeEventListener(type, end, true);
  };
  window.addEventListener("blur", end);
  for (const type of ["dragend", "drop", "mousemove"])
    document.addEventListener(type, end, true);
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
  // Chromium reports the draggable header, not the control, as the dragstart
  // target, so remember where the press began (e.g. on the volume slider).
  const pressedControl = useRef(false);
  return (
    <div
      data-track-header={track.id}
      draggable={!s.playing && !controller.busy}
      onPointerDownCapture={(e) => {
        pressedControl.current = !!(e.target as HTMLElement).closest(NO_DRAG);
      }}
      onDragStart={(e) => {
        if (
          pressedControl.current ||
          (e.target as HTMLElement).closest(NO_DRAG)
        ) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        e.dataTransfer.setData("application/x-basement-track", track.id);
        e.dataTransfer.effectAllowed = "move";
        watchReorderEnd();
        const bounds = e.currentTarget.getBoundingClientRect();
        e.dataTransfer.setDragImage(
          e.currentTarget,
          e.clientX - bounds.left,
          e.clientY - bounds.top,
        );
      }}
      onDragEnd={clearReorderMarks}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes("application/x-basement-track") &&
          !s.playing
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          e.currentTarget.classList.add("reorder-target");
          const bounds = e.currentTarget.getBoundingClientRect();
          e.currentTarget.classList.toggle(
            "reorder-after",
            e.clientY > bounds.top + bounds.height / 2,
          );
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          e.currentTarget.classList.remove("reorder-target", "reorder-after");
      }}
      onDrop={(e) => {
        e.currentTarget.classList.remove("reorder-target");
        const id = e.dataTransfer.getData("application/x-basement-track");
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        const from = s.tracks.findIndex((t) => t.id === id);
        const bounds = e.currentTarget.getBoundingClientRect();
        const insertion =
          index + (e.clientY > bounds.top + bounds.height / 2 ? 1 : 0);
        const destination = insertion - (from < insertion ? 1 : 0);
        if (!s.playing && !controller.busy && from >= 0 && destination !== from)
          void controller.run({
            op: "reorderTrack",
            track: id,
            index: destination,
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
        draggable={!s.playing && !controller.busy}
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
